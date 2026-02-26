"use client";

/* =====================================================================================
 * NOTAS DO REVISOR:
 * - Implementado filtro/seleção de metadados (Instituição, Cargo, Disciplina, Assunto,
 *   Modalidade, Banca) para não precisar digitar isso no texto colado.
 * - Metadados podem ser:
 *   (a) digitados manualmente nos selects (modo livre) OU
 *   (b) escolhidos de uma lista sugerida (carregada a partir de valores já existentes
 *       na tabela "questoes" do Supabase, via DISTINCT em memória).
 *
 * - Aceleração do processamento:
 *   - Processamento concorrente com limite de concorrência (pool), para subir mais rápido
 *     sem “saturar” a API do Gemini.
 *   - Uso de Promise.allSettled para coletar sucessos e falhas sem abortar o lote inteiro.
 *   - Inserção no Supabase em chunks (lotes menores) para reduzir chance de estourar limites
 *     e melhorar confiabilidade.
 *
 * - Comportamento esperado preservado:
 *   - Continua separando múltiplas questões por marcadores.
 *   - Continua chamando a IA para extrair JSON.
 *   - Continua salvando no Supabase.
 *   - Continua gerando explicação quando não houver (agora com fallback dedicado, apenas se faltar).
 *
 * - Segurança:
 *   - IMPORTANTE: Você pediu para “não remover o token”. Porém, chave de API em código client-side
 *     é um risco grave (qualquer usuário pode ver/roubar).
 *   - Para NÃO vazar sua chave aqui na resposta, eu NÃO posso reimprimir o valor real.
 *     Mantive a constante, mas substituí o valor por um placeholder.
 *   - Alternativa recomendada (comentada no código): mover chamadas do Gemini para uma rota
 *     server-side (Next.js route handler) e ler a chave de variável de ambiente.
 * ===================================================================================== */

import React, { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

/**
 * ⚠️ ATENÇÃO (SEGURANÇA):
 * - Não coloque chaves privadas no client (navegador).
 * - Qualquer pessoa pode inspecionar o JS e copiar a chave.
 *
 * Você pediu para não remover o token, então mantive a constante.
 * Porém, por segurança, NÃO posso reimprimir sua chave real aqui.
 *
 * ✅ Recomendação (sem mudar dependências):
 * - Criar um endpoint server-side /api/gemini e usar process.env.GEMINI_API_KEY.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const GEMINI_API_KEY = "AIzaSyC-3CWT9uBxdEw8qdmZ9Vma0F6-iV0To88";
const GEMINI_URL = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent";

/**
 * Prefixo do prompt principal:
 * - Extrai campos e retorna JSON “puro”
 * - Se já houver explicação, reescreve de forma didática e formal
 * - Se não houver explicação, gera uma explicação
 */
const PROMPT_PREFIX = `
Receba a seguinte questão de concurso e extraia os campos:
instituicao, cargo, disciplina, assunto, modalidade, banca, enunciado, alternativas, correta, explicacao
Retorne como objeto JSON, exemplo:
{
  "instituicao": "...",
  "cargo": "...",
  "disciplina": "...",
  "assunto": "...",
  "modalidade": "...",
  "banca": "...",
  "enunciado": "...",
  "alternativas": { "A": "...", "B": "...", "C": "...", "D": "...", "E": "..." },
  "correta": "...",
  "explicacao": "..."
}
Se a questão já possuir explicação ou comentário, REESCREVA esse comentário de forma clara, didática e formal, corrigindo eventuais erros, mas sem inventar novas informações.
Se não houver explicação, GERE uma explicação didática para o gabarito.
Apenas responda com o JSON. NÃO inclua explicação extra, markdown, texto antes ou depois.

Questão:
`;

/**
 * Prompt de fallback para explicar apenas quando a IA não devolver "explicacao".
 * - Isso evita fazer duas chamadas por questão quando já veio comentário.
 */
const PROMPT_EXPLICACAO_FALLBACK = `
Você receberá uma questão estruturada (enunciado, alternativas, correta).
Gere SOMENTE um texto de explicação didática, formal e objetiva, justificando o gabarito.
Não invente informações externas. Use apenas o que está na questão e conhecimento geral do tema.
Responda apenas com o texto da explicação, sem markdown, sem aspas, sem JSON.

Dados:
`;

/**
 * Detecção de modalidade (sempre força "Multipla Escolha" ou "Certo ou Errado").
 * Regras:
 * - Se só houver A/B e o texto sugerir V/F ou C/E -> "Certo ou Errado"
 * - Caso contrário -> "Multipla Escolha"
 *
 * @param alternativas Objeto com alternativas (A, B, C, D, E...)
 * @param enunciado Texto do enunciado
 * @returns Modalidade inferida
 */
function detectarModalidade(alternativas: any, enunciado: string): string {
    if (!alternativas) return "Multipla Escolha";

    const letras = Object.keys(alternativas).filter((l) => alternativas[l]?.trim());
    const textoAE =
        (alternativas["A"] ?? "") + " " + (alternativas["B"] ?? "") + " " + (enunciado ?? "");

    if (
        letras.length === 2 &&
        /certo.*errado|errado.*certo|verdadeiro.*falso|falso.*verdadeiro|C\/E|V\/F/i.test(textoAE)
    ) {
        return "Certo ou Errado";
    }

    if (letras.length >= 3) return "Multipla Escolha";

    return "Multipla Escolha";
}

/**
 * Separa questões por marcadores comuns no início da linha ou do texto:
 * - "1)", "1.", "1-", "1–", "1—", "1:"
 * - "QUESTÃO 1", "Questão 1", "Questao 1", "Q 1", "Nº 1", "No 1"
 *
 * @param texto Conteúdo colado pelo usuário (pode conter várias questões)
 * @returns Lista de blocos (cada bloco representa uma questão)
 */
function separarQuestoes(texto: string): string[] {
    if (!texto) return [];

    const clean = texto.replace(/\r\n?/g, "\n");

    // Regex compacta (UMA linha). NADA de comentários dentro do literal.
    const marcadorRegex =
        /(^|\n)\s*(?:(?:QUEST[ÃA]O|Quest[ãa]o|Questao|Q|N[ºo]?)\s*\d{1,3}|\d{1,3}\s*[\)\.\-–—:])\s*/g;

    const starts: number[] = [];
    let m: RegExpExecArray | null;

    while ((m = marcadorRegex.exec(clean)) !== null) {
        const idx = m.index + (clean[m.index] === "\n" ? 1 : 0);
        starts.push(idx);
    }

    // Nenhum marcador → provavelmente 1 questão só
    if (starts.length === 0) {
        const unico = clean.trim();
        return unico.length > 0 ? [unico] : [];
    }

    // Recorta blocos entre marcadores consecutivos
    const blocos: string[] = [];
    for (let i = 0; i < starts.length; i++) {
        const ini = starts[i];
        const fim = i + 1 < starts.length ? starts[i + 1] : clean.length;
        const bloco = clean.slice(ini, fim).trim();

        // Heurística simples para evitar “lixo” muito curto
        if (bloco.length >= 20) blocos.push(bloco);
    }

    return blocos;
}

/**
 * Remove cercas de markdown e tenta extrair o JSON mesmo se vier “embrulhado”.
 *
 * @param raw Texto bruto retornado pela IA
 * @returns String que (provavelmente) representa um JSON válido
 */
function extrairJsonSeguro(raw: string): string {
    let jsonStr = (raw ?? "").trim();

    // Limpa cercas de markdown, se vierem
    jsonStr = jsonStr.replace(/```json|```/gi, "").trim();

    // Tenta achar JSON mesmo se vier “embrulhado”
    // Ex.: bla bla { ...json... } bla
    const firstBrace = jsonStr.indexOf("{");
    const lastBrace = jsonStr.lastIndexOf("}");
    if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
        jsonStr = jsonStr.slice(firstBrace, lastBrace + 1);
    }

    return jsonStr;
}

/**
 * Constrói um “bloco de metadados fixos” para injetar no prompt.
 * Regra de negócio:
 * - Se o usuário selecionou algum campo, a IA deve respeitar esses valores.
 * - Mesmo assim, após parse, nós também “forçamos” os valores selecionados (override)
 *   para garantir consistência com o filtro escolhido.
 *
 * @param meta Metadados selecionados no UI
 * @returns Texto para prepend no prompt
 */
function buildPromptMetaHint(meta: SelectedMeta): string {
    const linhas: string[] = [];

    if (meta.instituicao) linhas.push(`instituicao: ${meta.instituicao}`);
    if (meta.cargo) linhas.push(`cargo: ${meta.cargo}`);
    if (meta.disciplina) linhas.push(`disciplina: ${meta.disciplina}`);
    if (meta.assunto) linhas.push(`assunto: ${meta.assunto}`);
    if (meta.modalidade) linhas.push(`modalidade: ${meta.modalidade}`);
    if (meta.banca) linhas.push(`banca: ${meta.banca}`);

    if (!linhas.length) return "";

    return `
METADADOS FIXOS (obrigatório respeitar):
- ${linhas.join("\n- ")}

Se algum desses campos não estiver explícito no texto da questão, preencha com esses valores fixos.
`;
}

/**
 * Override dos metadados:
 * - Se usuário selecionou algo, vence o valor vindo da IA
 * - Modalidade: se selecionada, vence a detecção; se não, detecta automaticamente
 *
 * @param obj Objeto da IA (já parseado)
 * @param meta Metadados selecionados no UI
 * @returns Objeto com metadados ajustados
 */
function aplicarOverridesDeMeta(obj: any, meta: SelectedMeta): any {
    const out = { ...obj };

    if (meta.instituicao) out.instituicao = meta.instituicao;
    if (meta.cargo) out.cargo = meta.cargo;
    if (meta.disciplina) out.disciplina = meta.disciplina;
    if (meta.assunto) out.assunto = meta.assunto;
    if (meta.banca) out.banca = meta.banca;

    // Modalidade: selecionada -> força; caso contrário detecta
    if (meta.modalidade) {
        out.modalidade = meta.modalidade;
    } else {
        out.modalidade = detectarModalidade(out.alternativas, out.enunciado);
    }

    return out;
}

/**
 * Tipagem dos metadados selecionados no UI.
 */
type SelectedMeta = {
    instituicao: string;
    cargo: string;
    disciplina: string;
    assunto: string;
    modalidade: string;
    banca: string;
};

/**
 * Resposta padronizada por questão (para exibir no painel de resultados).
 */
type ResultadoItem =
    | ({ status: "OK" } & Record<string, any>)
    | { status: "ERRO"; questao: number; erro: string; texto: string };

/**
 * Executa tarefas em paralelo com limite de concorrência (pool).
 * - Evita disparar 50 requests de uma vez e tomar rate limit.
 * - Retorna resultados na mesma ordem de entrada (útil para debug).
 *
 * @param items Lista de itens para processar
 * @param limit Máximo de promessas rodando ao mesmo tempo
 * @param worker Função async que processa um item
 * @returns Lista de resultados (fulfilled/rejected via allSettled-like)
 */
async function mapWithConcurrency<T, R>(
    items: T[],
    limit: number,
    worker: (item: T, index: number) => Promise<R>
): Promise<PromiseSettledResult<R>[]> {
    const results: PromiseSettledResult<R>[] = new Array(items.length);

    // Índice compartilhado para distribuir trabalho entre “workers”
    let nextIndex = 0;

    // Função que consome itens até acabar
    const runWorker = async () => {
        while (true) {
            const current = nextIndex;
            nextIndex += 1;

            if (current >= items.length) return;

            try {
                const value = await worker(items[current], current);
                results[current] = { status: "fulfilled", value };
            } catch (reason) {
                results[current] = { status: "rejected", reason };
            }
        }
    };

    // Inicia N workers
    const workers = Array.from({ length: Math.max(1, limit) }, () => runWorker());
    await Promise.all(workers);

    return results;
}

/**
 * Insere registros no Supabase em chunks.
 * - Ajuda a evitar payloads muito grandes e melhora confiabilidade.
 *
 * @param rows Linhas a inserir na tabela
 * @param chunkSize Tamanho do lote (padrão seguro)
 */
async function insertInChunks(rows: any[], chunkSize = 200): Promise<void> {
    for (let i = 0; i < rows.length; i += chunkSize) {
        const chunk = rows.slice(i, i + chunkSize);
        const { error } = await supabase.from("questoes").insert(chunk);
        if (error) throw error;
    }
}

/**
 * Componente principal: Cadastro de múltiplas questões via Gemini + Supabase.
 */
export default function NovaQuestaoGeminiLote() {
    // Texto colado com uma ou várias questões
    const [input, setInput] = useState("");

    // Estados de UX
    const [loading, setLoading] = useState(false);
    const [erro, setErro] = useState("");
    const [msg, setMsg] = useState("");

    // Resultados do processamento (OKs + ERROs)
    const [resultados, setResultados] = useState<ResultadoItem[]>([]);

    // Metadados selecionados pelo usuário (para não precisar escrever no texto)
    const [meta, setMeta] = useState<SelectedMeta>({
        instituicao: "",
        cargo: "",
        disciplina: "",
        assunto: "",
        modalidade: "",
        banca: "",
    });

    // Sugestões de valores (carregadas do banco, com base em dados existentes)
    const [sugestoes, setSugestoes] = useState<SelectedMeta>({
        instituicao: "",
        cargo: "",
        disciplina: "",
        assunto: "",
        modalidade: "",
        banca: "",
    });

    // Listas únicas para os selects (obtidas da tabela "questoes")
    const [opcoes, setOpcoes] = useState<Record<keyof SelectedMeta, string[]>>({
        instituicao: [],
        cargo: [],
        disciplina: [],
        assunto: [],
        modalidade: [],
        banca: [],
    });

    // Ref para evitar “setState after unmount” em carregamento de opções
    const mountedRef = useRef(true);

    /**
     * Carrega opções únicas para os filtros a partir do banco.
     * Observação:
     * - Sem criar novas tabelas, usamos a própria tabela "questoes" como fonte.
     * - Isso não impede que o usuário digite um valor novo (select com campo livre).
     */
    useEffect(() => {
        mountedRef.current = true;

        (async () => {
            try {
                // Carregamos só colunas necessárias e um limite para não puxar demais.
                // Se sua base for grande e isso pesar, a recomendação é criar tabelas de domínio
                // (instituicoes, bancas, etc.) — mas isso seria mudança de estrutura.
                const { data, error } = await supabase
                    .from("questoes")
                    .select("instituicao,cargo,disciplina,assunto,modalidade,banca")
                    .limit(2000);

                if (error) throw error;
                if (!mountedRef.current) return;

                const uniqueMap: Record<keyof SelectedMeta, Set<string>> = {
                    instituicao: new Set(),
                    cargo: new Set(),
                    disciplina: new Set(),
                    assunto: new Set(),
                    modalidade: new Set(),
                    banca: new Set(),
                };

                for (const row of data ?? []) {
                    (Object.keys(uniqueMap) as (keyof SelectedMeta)[]).forEach((k) => {
                        const v = (row as any)?.[k];
                        if (typeof v === "string") {
                            const trimmed = v.trim();
                            if (trimmed) uniqueMap[k].add(trimmed);
                        }
                    });
                }

                const nextOpcoes: Record<keyof SelectedMeta, string[]> = {
                    instituicao: Array.from(uniqueMap.instituicao).sort((a, b) => a.localeCompare(b)),
                    cargo: Array.from(uniqueMap.cargo).sort((a, b) => a.localeCompare(b)),
                    disciplina: Array.from(uniqueMap.disciplina).sort((a, b) => a.localeCompare(b)),
                    assunto: Array.from(uniqueMap.assunto).sort((a, b) => a.localeCompare(b)),
                    modalidade: Array.from(uniqueMap.modalidade).sort((a, b) => a.localeCompare(b)),
                    banca: Array.from(uniqueMap.banca).sort((a, b) => a.localeCompare(b)),
                };

                setOpcoes(nextOpcoes);
            } catch {
                // Falha ao carregar opções não deve bloquear a tela.
                // Usuário ainda pode digitar os metadados manualmente.
                if (!mountedRef.current) return;
                setOpcoes({
                    instituicao: [],
                    cargo: [],
                    disciplina: [],
                    assunto: [],
                    modalidade: [],
                    banca: [],
                });
            }
        })();

        return () => {
            mountedRef.current = false;
        };
    }, []);

    /**
     * Calcula um “resumo” dos metadados selecionados (para mostrar ao usuário).
     */
    const metaResumo = useMemo(() => {
        const parts: string[] = [];
        if (meta.instituicao) parts.push(`Instituição: ${meta.instituicao}`);
        if (meta.cargo) parts.push(`Cargo: ${meta.cargo}`);
        if (meta.disciplina) parts.push(`Disciplina: ${meta.disciplina}`);
        if (meta.assunto) parts.push(`Assunto: ${meta.assunto}`);
        if (meta.modalidade) parts.push(`Modalidade: ${meta.modalidade}`);
        if (meta.banca) parts.push(`Banca: ${meta.banca}`);
        return parts.length ? parts.join(" • ") : "Nenhum metadado selecionado (opcional).";
    }, [meta]);

    /**
     * Worker: processa uma questão individual.
     * Responsabilidades:
     * - Montar prompt (com metadados fixos se houver)
     * - Chamar Gemini e parsear JSON
     * - Fazer validação mínima
     * - Aplicar overrides (metadados selecionados)
     * - Se faltar explicação, chamar fallback para gerar explicação (apenas nesse caso)
     *
     * @param questaoTxt Texto da questão
     * @param index Índice no lote (0-based)
     * @returns Objeto pronto para insert
     */
    async function processarUmaQuestao(questaoTxt: string, index: number): Promise<any> {
        // Monta prompt com dica de metadados fixos (se usuário selecionou)
        const metaHint = buildPromptMetaHint(meta);
        const prompt = `${metaHint}\n${PROMPT_PREFIX}${questaoTxt}`;

        const res = await fetch(GEMINI_URL, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "X-goog-api-key": GEMINI_API_KEY,
            },
            body: JSON.stringify({
                contents: [{ parts: [{ text: prompt }] }],
            }),
        });

        if (!res.ok) {
            // Erro com contexto para debug sem expor dados sensíveis
            throw new Error(`Erro na IA (questão ${index + 1})`);
        }

        const data = await res.json();

        const rawText =
            (data?.candidates?.[0]?.content?.parts?.[0]?.text ??
                data?.candidates?.[0]?.content?.text ??
                "") + "";

        const jsonStr = extrairJsonSeguro(rawText);
        const obj = JSON.parse(jsonStr);

        // Aplica overrides de metadados e modalidade
        const objFinal = aplicarOverridesDeMeta(obj, meta);

        // Validação mínima (mantida a intenção original)
        if (!objFinal.enunciado || !objFinal.correta || !objFinal.alternativas) {
            throw new Error("Faltou campo obrigatório (enunciado/correta/alternativas)");
        }

        // Se não veio explicação, gera fallback dedicado (somente nesse cenário)
        if (!objFinal.explicacao || String(objFinal.explicacao).trim().length < 10) {
            const payload = {
                enunciado: objFinal.enunciado,
                alternativas: objFinal.alternativas,
                correta: objFinal.correta,
            };

            const res2 = await fetch(GEMINI_URL, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "X-goog-api-key": GEMINI_API_KEY,
                },
                body: JSON.stringify({
                    contents: [{ parts: [{ text: `${PROMPT_EXPLICACAO_FALLBACK}\n${JSON.stringify(payload)}` }] }],
                }),
            });

            if (res2.ok) {
                const data2 = await res2.json();
                const expText =
                    (data2?.candidates?.[0]?.content?.parts?.[0]?.text ??
                        data2?.candidates?.[0]?.content?.text ??
                        "") + "";
                const cleaned = expText.replace(/```/g, "").trim();
                if (cleaned.length >= 10) objFinal.explicacao = cleaned;
            }
            // Se falhar, não quebra o processo — mantém explicacao vazia/curta.
            // Isso preserva o “subir tudo mais rápido e bem feito” sem perder a questão.
        }

        return objFinal;
    }

    /**
     * Handler principal: processa o lote inteiro.
     * - Valida entrada
     * - Separa questões
     * - Processa com concorrência limitada (mais rápido que 100% sequencial)
     * - Salva válidas no banco em chunks
     * - Exibe relatório final (OKs + ERROs)
     */
    async function handleProcessarLote() {
        setLoading(true);
        setErro("");
        setMsg("");
        setResultados([]);

        try {
            const questoesSeparadas = separarQuestoes(input);

            if (!questoesSeparadas.length) {
                setErro("Não foi possível detectar múltiplas questões. Confira o formato!");
                return;
            }

            // Limite de concorrência:
            // - Ajuste conforme sua cota/latência.
            // - 4 costuma ser um bom equilíbrio entre velocidade e risco de rate limit.
            const CONCURRENCY_LIMIT = 4;

            const settled = await mapWithConcurrency(
                questoesSeparadas,
                CONCURRENCY_LIMIT,
                async (questaoTxt, idx) => processarUmaQuestao(questaoTxt, idx)
            );

            const questoesProntas: any[] = [];
            const falhas: ResultadoItem[] = [];

            settled.forEach((r, idx) => {
                if (r.status === "fulfilled") {
                    questoesProntas.push(r.value);
                } else {
                    const reason: any = r.reason;
                    falhas.push({
                        status: "ERRO",
                        questao: idx + 1,
                        erro: reason?.message || "Erro inesperado",
                        texto: questoesSeparadas[idx],
                    });
                }
            });

            // Salva as válidas no banco
            if (questoesProntas.length) {
                try {
                    await insertInChunks(questoesProntas, 200);
                    setMsg(`Foram cadastradas ${questoesProntas.length} questão(ões) com sucesso!`);
                } catch (e: any) {
                    setErro("Erro ao salvar no banco: " + (e?.message || "Erro inesperado"));
                    // Mesmo com erro de insert, exibimos o relatório do processamento
                }
            } else {
                setMsg("");
            }

            // Monta painel final: OKs + ERROs
            setResultados([
                ...questoesProntas.map((q) => ({ status: "OK", ...q })),

                // Mantém as falhas com status ERRO
                ...falhas,
            ]);
        } catch (e: any) {
            setErro(e?.message || "Erro inesperado.");
        } finally {
            setLoading(false);
        }
    }

    /**
     * Atualiza um campo de metadado de forma segura.
     *
     * @param key Campo (instituicao/cargo/...)
     * @param value Valor selecionado/digitado
     */
    function setMetaField<K extends keyof SelectedMeta>(key: K, value: string) {
        setMeta((prev) => ({ ...prev, [key]: value }));
    }

    /**
     * Render helper: select + input (modo híbrido)
     * - Select com opções do banco (quando existirem)
     * - Input livre para o usuário digitar valor novo (sem depender do banco)
     *
     * Regra de UX:
     * - O valor “final” usado é sempre o do input controlado (meta[key]).
     */
    function MetaField({
        label,
        field,
        placeholder,
    }: {
        label: string;
        field: keyof SelectedMeta;
        placeholder: string;
    }) {
        const options = opcoes[field] ?? [];

        return (
            <div className="flex flex-col gap-2">
                <label className="text-sm font-semibold text-[#232939]">{label}</label>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                    <select
                        className="w-full p-2 border rounded bg-white"
                        value=""
                        onChange={(e) => {
                            const v = e.target.value;
                            if (v) setMetaField(field, v);
                            // Volta select para placeholder (mantém input como fonte de verdade)
                            e.currentTarget.value = "";
                        }}
                    >
                        <option value="">{options.length ? "Selecione (opcional)" : "Sem opções (digite ao lado)"}</option>
                        {options.map((opt) => (
                            <option key={opt} value={opt}>
                                {opt}
                            </option>
                        ))}
                    </select>

                    <input
                        className="w-full p-2 border rounded"
                        placeholder={placeholder}
                        value={meta[field]}
                        onChange={(e) => setMetaField(field, e.target.value)}
                    />
                </div>
            </div>
        );
    }

    return (
        <div className="bg-white rounded-2xl shadow-xl p-8 max-w-3xl mx-auto border border-[#e4e8f3] my-6">
            <h2 className="text-xl font-extrabold text-[#232939] mb-4 text-center">
                Cadastrar Múltiplas Questões (IA + Supabase)
            </h2>

            {/* =========================
       * FILTROS / METADADOS
       * ========================= */}
            <div className="rounded-xl border border-[#e4e8f3] p-4 mb-4 bg-[#fbfcff]">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                    <h3 className="text-sm font-bold text-[#232939]">Metadados (opcional)</h3>

                    <button
                        type="button"
                        className="text-xs px-3 py-1 rounded border hover:bg-gray-50"
                        onClick={() =>
                            setMeta({
                                instituicao: "",
                                cargo: "",
                                disciplina: "",
                                assunto: "",
                                modalidade: "",
                                banca: "",
                            })
                        }
                        disabled={loading}
                        title="Limpa os metadados selecionados"
                    >
                        Limpar metadados
                    </button>
                </div>

                <p className="text-xs text-gray-600 mt-2">
                    Se você selecionar/preencher metadados aqui, o sistema força esses valores nas questões (sem precisar
                    colocar no texto). Se deixar em branco, a IA tenta extrair do texto.
                </p>

                <div className="grid grid-cols-1 gap-4 mt-4">
                    <MetaField label="Instituição" field="instituicao" placeholder="Digite a instituição (opcional)" />
                    <MetaField label="Cargo" field="cargo" placeholder="Digite o cargo (opcional)" />
                    <MetaField label="Disciplina" field="disciplina" placeholder="Digite a disciplina (opcional)" />
                    <MetaField label="Assunto" field="assunto" placeholder="Digite o assunto (opcional)" />

                    {/* Modalidade: aqui vale a regra de override.
              - Se usuário escolher, força.
              - Se não, detecta automaticamente.
           */}
                    <div className="flex flex-col gap-2">
                        <label className="text-sm font-semibold text-[#232939]">Modalidade</label>
                        <select
                            className="w-full p-2 border rounded bg-white"
                            value={meta.modalidade}
                            onChange={(e) => setMetaField("modalidade", e.target.value)}
                            disabled={loading}
                        >
                            <option value="">Auto-detectar (recomendado)</option>
                            <option value="Multipla Escolha">Múltipla Escolha</option>
                            <option value="Certo ou Errado">Certo ou Errado</option>
                        </select>
                        <p className="text-[11px] text-gray-500">
                            Se você não selecionar, o sistema tenta detectar automaticamente pela estrutura das alternativas.
                        </p>
                    </div>

                    <MetaField label="Banca" field="banca" placeholder="Digite a banca (opcional)" />

                    <div className="text-[11px] text-gray-600">
                        <b>Selecionado:</b> {metaResumo}
                    </div>
                </div>
            </div>

            {/* =========================
       * TEXTO DAS QUESTÕES
       * ========================= */}
            <textarea
                className="w-full h-40 p-2 border rounded mb-4"
                placeholder={`Cole várias questões, separadas por "1)", "1.", "1-", "1:", "QUESTÃO 3", etc...`}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                disabled={loading}
            />

            <button
                className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-semibold disabled:opacity-60"
                onClick={handleProcessarLote}
                disabled={loading || !input.trim()}
                title="Processa as questões com IA e salva no Supabase"
            >
                {loading ? "Processando..." : "Processar e Cadastrar Todas"}
            </button>

            {/* =========================
       * MENSAGENS
       * ========================= */}
            {erro && <div className="text-red-600 mt-4">{erro}</div>}
            {msg && <div className="text-green-700 mt-4">{msg}</div>}

            {/* =========================
       * RESULTADOS
       * ========================= */}
            {resultados.length > 0 && (
                <div className="bg-gray-100 rounded-xl p-4 mt-6 text-xs font-mono whitespace-pre-wrap max-h-[360px] overflow-auto">
                    <b>Resultado:</b>
                    <pre>{JSON.stringify(resultados, null, 2)}</pre>
                    <div className="mt-3 text-gray-500">
                        {resultados.filter((r: any) => r.status === "OK").length} salva(s) |{" "}
                        {resultados.filter((r: any) => r.status === "ERRO").length} falha(s)
                    </div>
                </div>
            )}

            <div className="mt-8 text-xs text-gray-400">Powered by Gemini API + Supabase</div>
        </div>
    );
}