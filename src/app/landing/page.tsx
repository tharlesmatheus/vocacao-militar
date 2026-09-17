"use client";

import Link from "next/link";
import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

/* ========================================================================== */
/* IA: somente conteúdo da questão.                                           */
/* A IA NÃO recebe nem devolve instituição/cargo/banca/disciplina/assunto.   */
/* ========================================================================== */

const PROMPT_PREFIX = `
Receba a questão de concurso abaixo e extraia SOMENTE os campos:
modalidade, enunciado, alternativas, correta, explicacao.

IMPORTANTE SOBRE CLASSIFICAÇÃO
- NÃO identifique, escolha, sugira ou devolva instituição.
- NÃO identifique, escolha, sugira ou devolva cargo.
- NÃO identifique, escolha, sugira ou devolva banca.
- NÃO identifique, escolha, sugira ou devolva disciplina.
- NÃO identifique, escolha, sugira ou devolva assunto.
- Esses dados são escolhidos pelo usuário em catálogos controlados pelo banco.

REGRAS GERAIS
1. Preserve fielmente o sentido do enunciado e das alternativas.
2. Não invente datas, números, leis, artigos, súmulas, precedentes ou referências.
3. Quando uma informação não estiver presente ou não puder ser determinada com segurança, use string vazia.
4. "alternativas" deve ser um objeto JSON, por exemplo:
   { "A": "...", "B": "...", "C": "...", "D": "...", "E": "..." }
5. "correta" deve conter somente a identificação do gabarito:
   "A", "B", "C", "D", "E", "Certo" ou "Errado".
6. "modalidade" deve ser somente "Multipla Escolha" ou "Certo ou Errado".
7. Retorne SOMENTE JSON válido.
8. Não use markdown, cercas de código ou texto fora do JSON.

REGRAS PARA O GABARITO
9. Se a questão trouxer um gabarito explícito, trate-o como a resposta oficial da questão.
10. Nunca altere silenciosamente um gabarito explícito com base apenas em conhecimento próprio.
11. Se houver aparente inconsistência entre o gabarito e o conteúdo da questão/comentário, mantenha o gabarito informado e mencione a inconsistência de forma breve na explicação.
12. Não invente um gabarito quando ele não puder ser determinado com segurança.

REGRAS PARA A EXPLICAÇÃO
13. A explicação deve ser objetiva, didática e voltada para estudo de concurso.
14. Use esta ordem de prioridade como fonte:
    a) gabarito explícito fornecido;
    b) comentário, resolução ou justificativa fornecida junto da questão;
    c) enunciado e alternativas;
    d) conhecimento consolidado apenas quando necessário para tornar a explicação compreensível.
15. Se houver comentário ou resolução fornecida, preserve o conteúdo técnico relevante e não mude a conclusão.
16. Se NÃO houver comentário, explique por que o gabarito está correto sem inventar fundamentos específicos.
17. Evite explicações genéricas. Diga a regra e como ela se aplica quando houver base segura.
18. Não declare que uma informação está "atualizada", "vigente" ou representa o "entendimento atual" sem base segura.
19. Nunca crie número de artigo, inciso, súmula, tema, precedente ou processo por aproximação.

Formato obrigatório:
{
  "modalidade": "",
  "enunciado": "",
  "alternativas": {
    "A": "",
    "B": "",
    "C": "",
    "D": "",
    "E": ""
  },
  "correta": "",
  "explicacao": ""
}

Questão:
`;

/* ========================================================================== */
/* Tipos                                                                      */
/* ========================================================================== */

type ResultadoTentativa = "ACERTO" | "ERRO";
type ModoInsercao = "IA" | "MANUAL";
type Alternativas = Record<string, string>;

type CatalogBase = {
    id: string;
    nome: string;
    ativo: boolean;
};

type Instituicao = CatalogBase & {
    sigla: string | null;
};

type Cargo = CatalogBase;

type Banca = CatalogBase & {
    sigla: string | null;
};

type Disciplina = CatalogBase;

type Assunto = CatalogBase & {
    disciplina_id: string;
};

type QuestaoProcessada = {
    localId: string;
    numero: number;
    textoOriginal: string;
    origem: ModoInsercao;
    modalidade: string;
    enunciado: string;
    alternativas: Alternativas;
    correta: string;
    explicacao: string;
    resultado: ResultadoTentativa | "";
    salvarNoCadernoAcertos: boolean;
};

type FalhaProcessamento = {
    numero: number;
    erro: string;
    texto: string;
};

type ResultadoSalvamento = {
    numero: number;
    status: "OK" | "ERRO";
    questaoId?: string;
    erro?: string;
};

/* ========================================================================== */
/* Helpers                                                                    */
/* ========================================================================== */

function formatarErro(error: unknown): string {
    if (error instanceof Error) return error.message;

    if (error && typeof error === "object" && "message" in error) {
        return String((error as { message?: unknown }).message ?? "Erro inesperado.");
    }

    return "Erro inesperado.";
}

function criarLocalId() {
    if (
        typeof crypto !== "undefined" &&
        typeof crypto.randomUUID === "function"
    ) {
        return crypto.randomUUID();
    }

    return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function extrairJson(texto: string): any {
    let jsonStr = String(texto ?? "")
        .replace(/```json/gi, "")
        .replace(/```/g, "")
        .trim();

    const firstBrace = jsonStr.indexOf("{");
    const lastBrace = jsonStr.lastIndexOf("}");

    if (firstBrace !== -1 && lastBrace !== -1) {
        jsonStr = jsonStr.slice(firstBrace, lastBrace + 1);
    }

    return JSON.parse(jsonStr);
}

function normalizarAlternativas(value: unknown): Alternativas {
    if (!value || typeof value !== "object") return {};

    const result: Alternativas = {};

    for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
        const letra = String(key).trim().toUpperCase();
        const texto = String(val ?? "").trim();

        if (!letra || !texto) continue;
        result[letra] = texto;
    }

    return result;
}

function detectarModalidade(
    alternativas: Alternativas,
    enunciado: string,
    modalidadeIa?: string
): string {
    const ia = String(modalidadeIa ?? "").trim().toLowerCase();

    if (ia.includes("certo") || ia.includes("errado")) {
        return "Certo ou Errado";
    }

    const letras = Object.keys(alternativas).filter((letra) =>
        String(alternativas[letra] ?? "").trim()
    );

    const texto = `${enunciado} ${Object.values(alternativas).join(" ")}`;

    if (
        letras.length === 2 &&
        /certo.*errado|errado.*certo|verdadeiro.*falso|falso.*verdadeiro|c\/e|v\/f/i.test(
            texto
        )
    ) {
        return "Certo ou Errado";
    }

    return "Multipla Escolha";
}

function separarQuestoes(texto: string): string[] {
    if (!texto) return [];

    const clean = texto.replace(/\r\n?/g, "\n");

    const marcadorRegex =
        /(^|\n)\s*(?:(?:QUEST[ÃA]O|Quest[ãa]o|Questao|Q|N[ºo]?)\s*\d{1,3}|\d{1,3}\s*[\)\.\-\u2013\u2014:])\s*/g;

    const starts: number[] = [];
    let match: RegExpExecArray | null;

    while ((match = marcadorRegex.exec(clean)) !== null) {
        const idx = match.index + (clean[match.index] === "\n" ? 1 : 0);
        starts.push(idx);
    }

    if (starts.length === 0) {
        const unico = clean.trim();
        return unico ? [unico] : [];
    }

    const blocos: string[] = [];

    for (let i = 0; i < starts.length; i++) {
        const inicio = starts[i];
        const fim = i + 1 < starts.length ? starts[i + 1] : clean.length;
        const bloco = clean.slice(inicio, fim).trim();

        if (bloco.length >= 20) blocos.push(bloco);
    }

    return blocos;
}

function nomeExibicaoComSigla(item: { nome: string; sigla?: string | null }) {
    const nome = item.nome.trim();
    const sigla = String(item.sigla ?? "").trim();

    if (!sigla) return nome;
    if (nome.toLocaleLowerCase("pt-BR") === sigla.toLocaleLowerCase("pt-BR")) {
        return nome;
    }

    return `${sigla} — ${nome}`;
}

function textoCanonicoComSigla(item: { nome: string; sigla?: string | null }) {
    return String(item.sigla ?? "").trim() || item.nome.trim();
}

/* ========================================================================== */
/* Página                                                                      */
/* ========================================================================== */

export default function LancarQuestoesPage() {
    const [userId, setUserId] = useState<string | null>(null);
    const [loadingInicial, setLoadingInicial] = useState(true);
    const [processando, setProcessando] = useState(false);
    const [salvando, setSalvando] = useState(false);

    const [erro, setErro] = useState("");
    const [msg, setMsg] = useState("");

    const [instituicoes, setInstituicoes] = useState<Instituicao[]>([]);
    const [cargos, setCargos] = useState<Cargo[]>([]);
    const [bancas, setBancas] = useState<Banca[]>([]);
    const [disciplinas, setDisciplinas] = useState<Disciplina[]>([]);
    const [assuntos, setAssuntos] = useState<Assunto[]>([]);

    const [instituicaoId, setInstituicaoId] = useState("");
    const [cargoId, setCargoId] = useState("");
    const [bancaId, setBancaId] = useState("");
    const [disciplinaId, setDisciplinaId] = useState("");
    const [assuntoId, setAssuntoId] = useState("");
    const [ano, setAno] = useState("");

    const [input, setInput] = useState("");
    const [modoInsercao, setModoInsercao] = useState<ModoInsercao>("IA");

    const [questoesProcessadas, setQuestoesProcessadas] = useState<
        QuestaoProcessada[]
    >([]);
    const [falhasProcessamento, setFalhasProcessamento] = useState<
        FalhaProcessamento[]
    >([]);
    const [resultadoSalvamento, setResultadoSalvamento] = useState<
        ResultadoSalvamento[]
    >([]);

    const assuntosDaDisciplina = useMemo(
        () =>
            assuntos
                .filter(
                    (item) =>
                        item.ativo && item.disciplina_id === disciplinaId
                )
                .sort((a, b) =>
                    a.nome.localeCompare(b.nome, "pt-BR", {
                        sensitivity: "base",
                    })
                ),
        [assuntos, disciplinaId]
    );

    const instituicaoSelecionada = useMemo(
        () => instituicoes.find((item) => item.id === instituicaoId) ?? null,
        [instituicoes, instituicaoId]
    );

    const cargoSelecionado = useMemo(
        () => cargos.find((item) => item.id === cargoId) ?? null,
        [cargos, cargoId]
    );

    const bancaSelecionada = useMemo(
        () => bancas.find((item) => item.id === bancaId) ?? null,
        [bancas, bancaId]
    );

    const disciplinaSelecionada = useMemo(
        () => disciplinas.find((item) => item.id === disciplinaId) ?? null,
        [disciplinas, disciplinaId]
    );

    const assuntoSelecionado = useMemo(
        () => assuntos.find((item) => item.id === assuntoId) ?? null,
        [assuntos, assuntoId]
    );

    const classificacaoCompleta = !!(
        instituicaoSelecionada &&
        cargoSelecionado &&
        bancaSelecionada &&
        disciplinaSelecionada &&
        assuntoSelecionado
    );

    const podeProcessar =
        !!userId &&
        classificacaoCompleta &&
        !!input.trim() &&
        !processando &&
        !salvando;

    const podeAdicionarManual =
        !!userId && classificacaoCompleta && !processando && !salvando;

    const podeSalvar =
        classificacaoCompleta &&
        questoesProcessadas.length > 0 &&
        questoesProcessadas.every((q) => {
            const alternativasPreenchidas = Object.values(q.alternativas).filter(
                (valor) => String(valor ?? "").trim()
            ).length;

            return !!(
                q.enunciado.trim() &&
                q.correta.trim() &&
                alternativasPreenchidas >= 2 &&
                q.resultado
            );
        }) &&
        !processando &&
        !salvando;

    useEffect(() => {
        let cancelled = false;

        async function carregar() {
            setLoadingInicial(true);
            setErro("");

            try {
                const { data: auth, error: authError } =
                    await supabase.auth.getUser();

                const uid = auth.user?.id ?? null;

                if (authError || !uid) {
                    throw new Error("Usuário não autenticado.");
                }

                const [
                    instituicoesReq,
                    cargosReq,
                    bancasReq,
                    disciplinasReq,
                    assuntosReq,
                ] = await Promise.all([
                    supabase
                        .from("questao_instituicoes")
                        .select("id,nome,sigla,ativo")
                        .eq("user_id", uid)
                        .eq("ativo", true)
                        .order("nome"),
                    supabase
                        .from("questao_cargos")
                        .select("id,nome,ativo")
                        .eq("user_id", uid)
                        .eq("ativo", true)
                        .order("nome"),
                    supabase
                        .from("questao_bancas")
                        .select("id,nome,sigla,ativo")
                        .eq("user_id", uid)
                        .eq("ativo", true)
                        .order("nome"),
                    supabase
                        .from("questao_disciplinas")
                        .select("id,nome,ativo")
                        .eq("user_id", uid)
                        .eq("ativo", true)
                        .order("nome"),
                    supabase
                        .from("questao_assuntos")
                        .select("id,disciplina_id,nome,ativo")
                        .eq("user_id", uid)
                        .eq("ativo", true)
                        .order("nome"),
                ]);

                const firstError =
                    instituicoesReq.error ||
                    cargosReq.error ||
                    bancasReq.error ||
                    disciplinasReq.error ||
                    assuntosReq.error;

                if (firstError) throw firstError;
                if (cancelled) return;

                setUserId(uid);
                setInstituicoes(
                    (instituicoesReq.data ?? []) as Instituicao[]
                );
                setCargos((cargosReq.data ?? []) as Cargo[]);
                setBancas((bancasReq.data ?? []) as Banca[]);
                setDisciplinas(
                    (disciplinasReq.data ?? []) as Disciplina[]
                );
                setAssuntos((assuntosReq.data ?? []) as Assunto[]);

                const pref = (nome: string) =>
                    window.localStorage.getItem(
                        `questoes-catalogo:${uid}:${nome}`
                    ) ?? "";

                const savedInstituicao = pref("instituicao_id");
                const savedCargo = pref("cargo_id");
                const savedBanca = pref("banca_id");
                const savedDisciplina = pref("disciplina_id");
                const savedAssunto = pref("assunto_id");
                const savedAno = pref("ano");

                const instituicoesData =
                    (instituicoesReq.data ?? []) as Instituicao[];
                const cargosData = (cargosReq.data ?? []) as Cargo[];
                const bancasData = (bancasReq.data ?? []) as Banca[];
                const disciplinasData =
                    (disciplinasReq.data ?? []) as Disciplina[];
                const assuntosData = (assuntosReq.data ?? []) as Assunto[];

                if (instituicoesData.some((x) => x.id === savedInstituicao)) {
                    setInstituicaoId(savedInstituicao);
                }
                if (cargosData.some((x) => x.id === savedCargo)) {
                    setCargoId(savedCargo);
                }
                if (bancasData.some((x) => x.id === savedBanca)) {
                    setBancaId(savedBanca);
                }
                if (disciplinasData.some((x) => x.id === savedDisciplina)) {
                    setDisciplinaId(savedDisciplina);
                }
                if (
                    assuntosData.some(
                        (x) =>
                            x.id === savedAssunto &&
                            (!savedDisciplina ||
                                x.disciplina_id === savedDisciplina)
                    )
                ) {
                    setAssuntoId(savedAssunto);
                }
                if (/^\d{4}$/.test(savedAno)) {
                    setAno(savedAno);
                }
            } catch (e) {
                if (!cancelled) setErro(formatarErro(e));
            } finally {
                if (!cancelled) setLoadingInicial(false);
            }
        }

        void carregar();

        return () => {
            cancelled = true;
        };
    }, []);

    function salvarPreferencia(nome: string, valor: string) {
        if (!userId) return;
        window.localStorage.setItem(`questoes-catalogo:${userId}:${nome}`, valor);
    }

    function limparQuestoesAoTrocarClassificacao() {
        if (!questoesProcessadas.length) return true;

        const confirmar = window.confirm(
            "Há questões já processadas nesta classificação. Alterar a classificação descartará essas questões da tela. Deseja continuar?"
        );

        if (!confirmar) return false;

        setQuestoesProcessadas([]);
        setFalhasProcessamento([]);
        setResultadoSalvamento([]);
        return true;
    }

    function handleInstituicaoChange(value: string) {
        if (!limparQuestoesAoTrocarClassificacao()) return;
        setInstituicaoId(value);
        salvarPreferencia("instituicao_id", value);
    }

    function handleCargoChange(value: string) {
        if (!limparQuestoesAoTrocarClassificacao()) return;
        setCargoId(value);
        salvarPreferencia("cargo_id", value);
    }

    function handleBancaChange(value: string) {
        if (!limparQuestoesAoTrocarClassificacao()) return;
        setBancaId(value);
        salvarPreferencia("banca_id", value);
    }

    function handleDisciplinaChange(value: string) {
        if (!limparQuestoesAoTrocarClassificacao()) return;
        setDisciplinaId(value);
        setAssuntoId("");
        salvarPreferencia("disciplina_id", value);
        salvarPreferencia("assunto_id", "");
    }

    function handleAssuntoChange(value: string) {
        if (!limparQuestoesAoTrocarClassificacao()) return;
        setAssuntoId(value);
        salvarPreferencia("assunto_id", value);
    }

    function handleAnoChange(value: string) {
        const clean = value.replace(/\D/g, "").slice(0, 4);
        setAno(clean);
        salvarPreferencia("ano", clean);
    }

    function proximoNumeroQuestao() {
        return (
            questoesProcessadas.reduce(
                (maior, q) => Math.max(maior, q.numero),
                0
            ) + 1
        );
    }

    function adicionarQuestaoManual() {
        setErro("");
        setMsg("");
        setResultadoSalvamento([]);

        if (!classificacaoCompleta) {
            setErro(
                "Selecione Instituição, Cargo, Banca, Disciplina e Assunto antes de adicionar uma questão."
            );
            return;
        }

        const nova: QuestaoProcessada = {
            localId: criarLocalId(),
            numero: proximoNumeroQuestao(),
            textoOriginal: "",
            origem: "MANUAL",
            modalidade: "Multipla Escolha",
            enunciado: "",
            alternativas: {
                A: "",
                B: "",
                C: "",
                D: "",
                E: "",
            },
            correta: "",
            explicacao: "",
            resultado: "",
            salvarNoCadernoAcertos: false,
        };

        setQuestoesProcessadas((prev) => [...prev, nova]);
    }

    async function chamarGeminiJson(prompt: string): Promise<any> {
        const { data: sessionData, error: sessionError } =
            await supabase.auth.getSession();

        const accessToken = sessionData.session?.access_token;

        if (sessionError || !accessToken) {
            throw new Error("Sua sessão expirou. Entre novamente para usar a IA.");
        }

        const res = await fetch("/api/gemini", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${accessToken}`,
            },
            body: JSON.stringify({ prompt }),
            cache: "no-store",
        });

        const data = (await res.json().catch(() => null)) as
            | { text?: string; error?: string }
            | null;

        if (!res.ok) {
            throw new Error(
                data?.error ||
                `Falha ao processar a requisição de IA (HTTP ${res.status}).`
            );
        }

        const texto = String(data?.text ?? "").trim();

        if (!texto) {
            throw new Error("A IA retornou uma resposta vazia.");
        }

        return extrairJson(texto);
    }

    async function handleProcessarLote() {
        if (!classificacaoCompleta) {
            setErro(
                "Selecione Instituição, Cargo, Banca, Disciplina e Assunto antes de processar."
            );
            return;
        }

        const questoesSeparadas = separarQuestoes(input);

        if (!questoesSeparadas.length) {
            setErro("Não foi possível identificar nenhuma questão no texto.");
            return;
        }

        const numeroInicial = proximoNumeroQuestao();
        const prontas: QuestaoProcessada[] = [];
        const falhas: FalhaProcessamento[] = [];

        setProcessando(true);
        setErro("");
        setMsg("");
        setFalhasProcessamento([]);
        setResultadoSalvamento([]);

        try {
            for (let i = 0; i < questoesSeparadas.length; i++) {
                const questaoTxt = questoesSeparadas[i];

                try {
                    const obj = await chamarGeminiJson(
                        PROMPT_PREFIX + questaoTxt
                    );

                    const alternativas = normalizarAlternativas(
                        obj?.alternativas
                    );
                    const enunciado = String(obj?.enunciado ?? "").trim();
                    const correta = String(obj?.correta ?? "").trim();
                    const explicacao = String(obj?.explicacao ?? "").trim();

                    if (!enunciado) {
                        throw new Error("A IA não retornou o enunciado.");
                    }
                    if (!correta) {
                        throw new Error("A IA não retornou o gabarito.");
                    }
                    if (Object.keys(alternativas).length < 2) {
                        throw new Error(
                            "A IA não retornou alternativas suficientes."
                        );
                    }

                    prontas.push({
                        localId: criarLocalId(),
                        numero: numeroInicial + i,
                        textoOriginal: questaoTxt,
                        origem: "IA",
                        modalidade: detectarModalidade(
                            alternativas,
                            enunciado,
                            obj?.modalidade
                        ),
                        enunciado,
                        alternativas,
                        correta,
                        explicacao,
                        resultado: "",
                        salvarNoCadernoAcertos: false,
                    });
                } catch (e) {
                    falhas.push({
                        numero: i + 1,
                        erro: formatarErro(e),
                        texto: questaoTxt,
                    });
                }
            }

            setQuestoesProcessadas((prev) => [...prev, ...prontas]);
            setFalhasProcessamento(falhas);

            if (prontas.length) {
                setMsg(
                    `${prontas.length} questão(ões) processada(s). A classificação permaneceu exatamente a selecionada nos catálogos.`
                );
            } else {
                setErro("Nenhuma questão foi processada com sucesso.");
            }
        } finally {
            setProcessando(false);
        }
    }

    function atualizarQuestao(
        localId: string,
        patch: Partial<QuestaoProcessada>
    ) {
        setQuestoesProcessadas((prev) =>
            prev.map((q) => (q.localId === localId ? { ...q, ...patch } : q))
        );
    }

    function atualizarAlternativa(
        localId: string,
        letra: string,
        valor: string
    ) {
        setQuestoesProcessadas((prev) =>
            prev.map((q) =>
                q.localId === localId
                    ? {
                        ...q,
                        alternativas: {
                            ...q.alternativas,
                            [letra]: valor,
                        },
                    }
                    : q
            )
        );
    }

    function removerQuestao(localId: string) {
        setQuestoesProcessadas((prev) =>
            prev.filter((q) => q.localId !== localId)
        );
    }

    async function inserirCaderno(
        questaoId: string,
        tipo: "ERROS" | "ACERTOS"
    ) {
        if (!userId) return;

        const { error } = await supabase.from("caderno_itens").insert({
            user_id: userId,
            questao_id: questaoId,
            tipo,
            anotacao: null,
        });

        if (error) {
            throw new Error(
                `Falha ao inserir no Caderno de ${tipo === "ERROS" ? "Erros" : "Acertos"
                }: ${error.message}`
            );
        }
    }

    async function inserirTentativa(
        questaoId: string,
        resultado: ResultadoTentativa
    ) {
        if (!userId) return;

        const { error } = await supabase.from("question_attempts").insert({
            user_id: userId,
            questao_id: questaoId,
            resultado,
            is_revisao: false,
        });

        if (error) {
            throw new Error(
                `Falha ao registrar o resultado da questão: ${error.message}`
            );
        }
    }

    async function sincronizarEstatisticasDoUsuario() {
        if (!userId) return;

        const { data: tentativasData, error: tentativasError } = await supabase
            .from("question_attempts")
            .select("questao_id,resultado,created_at")
            .eq("user_id", userId)
            .order("created_at", { ascending: true });

        if (tentativasError) throw tentativasError;

        const tentativas = (tentativasData ?? []) as Array<{
            questao_id: string;
            resultado: ResultadoTentativa;
            created_at: string;
        }>;

        const ids = Array.from(
            new Set(tentativas.map((t) => t.questao_id).filter(Boolean))
        );

        const meta = new Map<
            string,
            { disciplina_id: string | null; assunto_id: string | null }
        >();

        for (let i = 0; i < ids.length; i += 500) {
            const lote = ids.slice(i, i + 500);

            const { data, error } = await supabase
                .from("questoes")
                .select(
                    "id,questao_disciplina_id,questao_assunto_id,materia_id,assunto_id"
                )
                .eq("user_id", userId)
                .in("id", lote);

            if (error) throw error;

            for (const row of data ?? []) {
                meta.set(String(row.id), {
                    disciplina_id:
                        row.questao_disciplina_id ?? row.materia_id ?? null,
                    assunto_id:
                        row.questao_assunto_id ?? row.assunto_id ?? null,
                });
            }
        }

        const accPorMateria: Record<
            string,
            { total: number; corretas: number }
        > = {};
        const accPorAssunto: Record<
            string,
            { total: number; corretas: number }
        > = {};
        const porDia = new Map<string, number>();
        let corretas = 0;

        for (const tentativa of tentativas) {
            const acertou = tentativa.resultado === "ACERTO";
            if (acertou) corretas += 1;

            const q = meta.get(tentativa.questao_id);

            if (q?.disciplina_id) {
                const atual = accPorMateria[q.disciplina_id] ?? {
                    total: 0,
                    corretas: 0,
                };
                atual.total += 1;
                if (acertou) atual.corretas += 1;
                accPorMateria[q.disciplina_id] = atual;
            }

            if (q?.assunto_id) {
                const atual = accPorAssunto[q.assunto_id] ?? {
                    total: 0,
                    corretas: 0,
                };
                atual.total += 1;
                if (acertou) atual.corretas += 1;
                accPorAssunto[q.assunto_id] = atual;
            }

            const d = new Date(tentativa.created_at);
            const dia = d.toLocaleDateString("pt-BR", {
                day: "2-digit",
                month: "2-digit",
                year: "numeric",
            });
            porDia.set(dia, (porDia.get(dia) ?? 0) + 1);
        }

        const total = tentativas.length;
        const payload = {
            questoes_respondidas: total,
            taxa_acerto: total ? (corretas / total) * 100 : 0,
            progresso_semanal: Array.from(porDia.entries()).map(
                ([dia, questoes]) => ({ dia, questoes })
            ),
            acc_por_materia: accPorMateria,
            acc_por_assunto: accPorAssunto,
        };

        const { data: existente, error: existeErro } = await supabase
            .from("estatisticas")
            .select("user_id")
            .eq("user_id", userId)
            .maybeSingle();

        if (existeErro) throw existeErro;

        if (existente) {
            const { error } = await supabase
                .from("estatisticas")
                .update(payload)
                .eq("user_id", userId);
            if (error) throw error;
        } else {
            const { error } = await supabase.from("estatisticas").insert({
                user_id: userId,
                ...payload,
            });
            if (error) throw error;
        }
    }

    async function handleSalvarTodas() {
        if (!userId) {
            setErro("Usuário não autenticado.");
            return;
        }

        if (
            !instituicaoSelecionada ||
            !cargoSelecionado ||
            !bancaSelecionada ||
            !disciplinaSelecionada ||
            !assuntoSelecionado
        ) {
            setErro("A classificação selecionada é inválida ou incompleta.");
            return;
        }

        if (assuntoSelecionado.disciplina_id !== disciplinaSelecionada.id) {
            setErro("O assunto selecionado não pertence à disciplina escolhida.");
            return;
        }

        if (!questoesProcessadas.length) {
            setErro("Não existem questões processadas para salvar.");
            return;
        }

        const invalidas = questoesProcessadas.filter((q) => {
            const alternativas = Object.values(q.alternativas).filter((x) =>
                String(x ?? "").trim()
            ).length;

            return (
                !q.enunciado.trim() ||
                !q.correta.trim() ||
                alternativas < 2 ||
                !q.resultado
            );
        });

        if (invalidas.length) {
            setErro(
                "Todas as questões precisam de enunciado, gabarito, ao menos duas alternativas e resultado Acertei/Errei."
            );
            return;
        }

        const anoNumero = ano.trim() ? Number(ano) : null;

        if (
            anoNumero !== null &&
            (!Number.isInteger(anoNumero) || anoNumero < 1900 || anoNumero > 2100)
        ) {
            setErro("Informe um ano válido entre 1900 e 2100 ou deixe em branco.");
            return;
        }

        setSalvando(true);
        setErro("");
        setMsg("");
        setResultadoSalvamento([]);

        const resultados: ResultadoSalvamento[] = [];

        try {
            for (const q of questoesProcessadas) {
                let questaoId: string | null = null;

                try {
                    const instituicaoTexto = textoCanonicoComSigla(
                        instituicaoSelecionada
                    );
                    const bancaTexto = textoCanonicoComSigla(bancaSelecionada);

                    const payload = {
                        user_id: userId,

                        // Novos vínculos canônicos.
                        questao_instituicao_id: instituicaoSelecionada.id,
                        questao_cargo_id: cargoSelecionado.id,
                        questao_banca_id: bancaSelecionada.id,
                        questao_disciplina_id: disciplinaSelecionada.id,
                        questao_assunto_id: assuntoSelecionado.id,
                        ano: anoNumero,

                        // Campos antigos mantidos temporariamente apenas para
                        // compatibilidade de leitura. Os valores vêm dos
                        // catálogos, nunca de texto livre ou da IA.
                        instituicao: instituicaoTexto,
                        cargo: cargoSelecionado.nome,
                        banca: bancaTexto,
                        disciplina: disciplinaSelecionada.nome,
                        assunto: assuntoSelecionado.nome,

                        // Sem vínculo obrigatório com edital/matéria antigos.
                        edital_id: null,
                        materia_id: null,
                        assunto_id: null,

                        modalidade: q.modalidade,
                        enunciado: q.enunciado.trim(),
                        alternativas: q.alternativas,
                        correta: q.correta.trim(),
                        explicacao: q.explicacao.trim(),
                    };

                    const { data: questaoCriada, error: questaoError } =
                        await supabase
                            .from("questoes")
                            .insert(payload)
                            .select("id")
                            .single();

                    if (questaoError) {
                        throw new Error(
                            `Falha ao salvar a questão: ${questaoError.message}`
                        );
                    }

                    questaoId = String(questaoCriada.id);

                    await inserirTentativa(
                        questaoId,
                        q.resultado as ResultadoTentativa
                    );

                    if (q.resultado === "ERRO") {
                        await inserirCaderno(questaoId, "ERROS");
                    }

                    if (
                        q.resultado === "ACERTO" &&
                        q.salvarNoCadernoAcertos
                    ) {
                        await inserirCaderno(questaoId, "ACERTOS");
                    }

                    resultados.push({
                        numero: q.numero,
                        status: "OK",
                        questaoId,
                    });
                } catch (e) {
                    if (questaoId) {
                        // As FKs atuais removem tentativas/caderno por CASCADE.
                        await supabase
                            .from("questoes")
                            .delete()
                            .eq("id", questaoId)
                            .eq("user_id", userId);
                    }

                    resultados.push({
                        numero: q.numero,
                        status: "ERRO",
                        erro: formatarErro(e),
                    });
                }
            }

            try {
                await sincronizarEstatisticasDoUsuario();
            } catch (e) {
                console.error(
                    "Questões salvas, mas não foi possível sincronizar as estatísticas:",
                    e
                );
            }

            setResultadoSalvamento(resultados);

            const ok = resultados.filter((r) => r.status === "OK").length;
            const falhas = resultados.length - ok;

            if (ok > 0) {
                setMsg(
                    `${ok} questão(ões) salva(s) usando exclusivamente os IDs dos catálogos.${falhas ? ` ${falhas} falharam.` : ""
                    }`
                );
            }

            if (falhas === 0) {
                setQuestoesProcessadas([]);
                setInput("");
                setFalhasProcessamento([]);
            }
        } finally {
            setSalvando(false);
        }
    }

    if (loadingInicial) {
        return (
            <main className="min-h-[60vh] flex items-center justify-center px-4">
                <span className="text-sm text-muted-foreground">
                    Carregando catálogos de questões...
                </span>
            </main>
        );
    }

    return (
        <main className="w-full px-4 py-6 sm:px-6 lg:px-8 md:py-10">
            <div className="mx-auto max-w-6xl space-y-6">
                <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                        <h1 className="text-2xl font-bold text-foreground">
                            Lançar Questões
                        </h1>
                        <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
                            A classificação é controlada por catálogos do banco.
                            A IA processa apenas o conteúdo da questão e nunca
                            escolhe instituição, cargo, banca, disciplina ou assunto.
                        </p>
                    </div>

                    <Link
                        href="/catalogo"
                        className="inline-flex shrink-0 items-center justify-center rounded-xl border border-border bg-card px-4 py-2.5 text-sm font-semibold hover:bg-muted"
                    >
                        Administrar catálogo
                    </Link>
                </header>

                {erro && (
                    <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                        {erro}
                    </div>
                )}

                {msg && (
                    <div className="rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">
                        {msg}
                    </div>
                )}

                <section className="rounded-2xl border border-border bg-card p-5 shadow-sm sm:p-6">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                        <div>
                            <h2 className="text-base font-semibold">
                                1. Classificação canônica
                            </h2>
                            <p className="mt-1 text-xs text-muted-foreground">
                                Aqui não existe texto livre nem opção “criar novo”.
                                Cadastros novos são feitos somente em /catalogo.
                            </p>
                        </div>

                        <Link
                            href="/catalogo"
                            className="text-xs font-medium text-primary hover:underline"
                        >
                            Ir para Catálogo de Questões
                        </Link>
                    </div>

                    <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-3">
                        <CatalogSelect
                            label="Instituição"
                            value={instituicaoId}
                            onChange={handleInstituicaoChange}
                            placeholder="Selecione a Instituição"
                            options={instituicoes.map((item) => ({
                                id: item.id,
                                label: nomeExibicaoComSigla(item),
                            }))}
                        />

                        <CatalogSelect
                            label="Cargo"
                            value={cargoId}
                            onChange={handleCargoChange}
                            placeholder="Selecione o Cargo"
                            options={cargos.map((item) => ({
                                id: item.id,
                                label: item.nome,
                            }))}
                        />

                        <CatalogSelect
                            label="Banca"
                            value={bancaId}
                            onChange={handleBancaChange}
                            placeholder="Selecione a Banca"
                            options={bancas.map((item) => ({
                                id: item.id,
                                label: nomeExibicaoComSigla(item),
                            }))}
                        />

                        <CatalogSelect
                            label="Disciplina"
                            value={disciplinaId}
                            onChange={handleDisciplinaChange}
                            placeholder="Selecione a Disciplina"
                            options={disciplinas.map((item) => ({
                                id: item.id,
                                label: item.nome,
                            }))}
                        />

                        <CatalogSelect
                            label="Assunto"
                            value={assuntoId}
                            onChange={handleAssuntoChange}
                            placeholder={
                                disciplinaId
                                    ? "Selecione o Assunto"
                                    : "Selecione a Disciplina primeiro"
                            }
                            disabled={!disciplinaId}
                            options={assuntosDaDisciplina.map((item) => ({
                                id: item.id,
                                label: item.nome,
                            }))}
                        />

                        <label className="space-y-2">
                            <span className="text-sm font-medium">
                                Ano <span className="text-muted-foreground">(opcional)</span>
                            </span>
                            <input
                                type="text"
                                inputMode="numeric"
                                value={ano}
                                onChange={(e) => handleAnoChange(e.target.value)}
                                placeholder="Ex.: 2022"
                                className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-primary/30"
                            />
                        </label>
                    </div>

                    {!classificacaoCompleta && (
                        <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-800">
                            Para lançar questões, cadastre as categorias em /catalogo
                            e selecione Instituição, Cargo, Banca, Disciplina e Assunto.
                        </div>
                    )}

                    {classificacaoCompleta && (
                        <div className="mt-4 rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-xs text-green-800">
                            <strong>Classificação aplicada ao lote:</strong>{" "}
                            {textoCanonicoComSigla(instituicaoSelecionada!)} •{" "}
                            {cargoSelecionado!.nome} •{" "}
                            {textoCanonicoComSigla(bancaSelecionada!)} •{" "}
                            {disciplinaSelecionada!.nome} •{" "}
                            {assuntoSelecionado!.nome}
                            {ano ? ` • ${ano}` : ""}
                        </div>
                    )}
                </section>

                <section className="rounded-2xl border border-border bg-card p-5 shadow-sm sm:p-6">
                    <h2 className="text-base font-semibold">
                        2. Inserir questões
                    </h2>
                    <p className="mt-1 text-xs text-muted-foreground">
                        Use IA para separar e organizar o conteúdo ou cadastre
                        manualmente. A classificação acima permanece fixa.
                    </p>

                    <div className="mt-5 inline-flex rounded-xl border border-border bg-muted/40 p-1">
                        <button
                            type="button"
                            onClick={() => setModoInsercao("IA")}
                            className={`rounded-lg px-4 py-2 text-sm font-medium transition ${modoInsercao === "IA"
                                    ? "bg-background shadow-sm"
                                    : "text-muted-foreground"
                                }`}
                        >
                            Processar com IA
                        </button>
                        <button
                            type="button"
                            onClick={() => setModoInsercao("MANUAL")}
                            className={`rounded-lg px-4 py-2 text-sm font-medium transition ${modoInsercao === "MANUAL"
                                    ? "bg-background shadow-sm"
                                    : "text-muted-foreground"
                                }`}
                        >
                            Cadastro manual
                        </button>
                    </div>

                    {modoInsercao === "IA" ? (
                        <div className="mt-5">
                            <textarea
                                value={input}
                                onChange={(e) => setInput(e.target.value)}
                                placeholder="Cole aqui uma ou várias questões, preferencialmente com gabarito/comentário..."
                                className="min-h-[240px] w-full rounded-2xl border border-border bg-background p-4 text-sm leading-relaxed outline-none focus:ring-2 focus:ring-primary/30"
                            />

                            <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                                <p className="text-xs text-muted-foreground">
                                    A IA não tem permissão para classificar a questão.
                                </p>
                                <button
                                    type="button"
                                    onClick={() => void handleProcessarLote()}
                                    disabled={!podeProcessar}
                                    className="rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
                                >
                                    {processando
                                        ? "Processando..."
                                        : "Processar questões"}
                                </button>
                            </div>
                        </div>
                    ) : (
                        <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                            <p className="text-sm text-muted-foreground">
                                Adicione uma questão vazia e preencha todos os dados manualmente.
                            </p>
                            <button
                                type="button"
                                onClick={adicionarQuestaoManual}
                                disabled={!podeAdicionarManual}
                                className="rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                                + Adicionar questão manual
                            </button>
                        </div>
                    )}
                </section>

                {falhasProcessamento.length > 0 && (
                    <section className="rounded-2xl border border-red-200 bg-red-50 p-5 sm:p-6">
                        <h2 className="font-semibold text-red-800">
                            Falhas no processamento
                        </h2>
                        <div className="mt-3 space-y-2">
                            {falhasProcessamento.map((falha) => (
                                <div
                                    key={`${falha.numero}-${falha.texto.slice(0, 20)}`}
                                    className="rounded-xl border border-red-200 bg-white/60 px-4 py-3 text-sm text-red-700"
                                >
                                    <strong>Item {falha.numero}:</strong>{" "}
                                    {falha.erro}
                                </div>
                            ))}
                        </div>
                    </section>
                )}

                {questoesProcessadas.length > 0 && (
                    <section className="space-y-4">
                        <div>
                            <h2 className="text-lg font-semibold">
                                3. Revisar antes de salvar
                            </h2>
                            <p className="mt-1 text-xs text-muted-foreground">
                                A classificação não é editável por questão; todo o lote usa os IDs selecionados acima.
                            </p>
                        </div>

                        {questoesProcessadas.map((q) => (
                            <QuestionEditor
                                key={q.localId}
                                question={q}
                                onPatch={(patch) =>
                                    atualizarQuestao(q.localId, patch)
                                }
                                onAlternative={(letter, value) =>
                                    atualizarAlternativa(
                                        q.localId,
                                        letter,
                                        value
                                    )
                                }
                                onRemove={() => removerQuestao(q.localId)}
                            />
                        ))}

                        <div className="sticky bottom-4 z-20 rounded-2xl border border-border bg-card/95 p-4 shadow-xl backdrop-blur">
                            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                                <div className="text-sm">
                                    <span className="font-semibold">
                                        {questoesProcessadas.length}
                                    </span>{" "}
                                    questão(ões) pronta(s) para cadastro
                                </div>

                                <button
                                    type="button"
                                    onClick={() => void handleSalvarTodas()}
                                    disabled={!podeSalvar}
                                    className="rounded-xl bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
                                >
                                    {salvando ? "Salvando..." : "Salvar todas"}
                                </button>
                            </div>

                            {!podeSalvar && !salvando && (
                                <p className="mt-2 text-xs text-muted-foreground">
                                    Selecione toda a classificação e, em cada questão,
                                    preencha enunciado, gabarito, ao menos duas alternativas e Acertei/Errei.
                                </p>
                            )}
                        </div>
                    </section>
                )}

                {resultadoSalvamento.length > 0 && (
                    <section className="rounded-2xl border border-border bg-card p-5 sm:p-6">
                        <h2 className="font-semibold">Resultado do salvamento</h2>
                        <div className="mt-4 space-y-2">
                            {resultadoSalvamento.map((r) => (
                                <div
                                    key={`${r.numero}-${r.status}`}
                                    className={`rounded-xl border px-4 py-3 text-sm ${r.status === "OK"
                                            ? "border-green-200 bg-green-50 text-green-700"
                                            : "border-red-200 bg-red-50 text-red-700"
                                        }`}
                                >
                                    <strong>Questão {r.numero}:</strong>{" "}
                                    {r.status === "OK"
                                        ? "salva com sucesso."
                                        : r.erro}
                                </div>
                            ))}
                        </div>
                    </section>
                )}

                <footer className="pb-6 text-center text-xs text-muted-foreground">
                    Catálogos controlados pelo Supabase • classificação manual por select • IA somente para conteúdo
                </footer>
            </div>
        </main>
    );
}

/* ========================================================================== */
/* Componentes                                                                */
/* ========================================================================== */

function CatalogSelect({
    label,
    value,
    onChange,
    placeholder,
    options,
    disabled = false,
}: {
    label: string;
    value: string;
    onChange: (value: string) => void;
    placeholder: string;
    options: Array<{ id: string; label: string }>;
    disabled?: boolean;
}) {
    return (
        <label className="space-y-2">
            <span className="text-sm font-medium">{label}</span>
            <select
                value={value}
                disabled={disabled}
                onChange={(e) => onChange(e.target.value)}
                className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-primary/30 disabled:cursor-not-allowed disabled:opacity-50"
            >
                <option value="">{placeholder}</option>
                {options.map((option) => (
                    <option key={option.id} value={option.id}>
                        {option.label}
                    </option>
                ))}
            </select>
        </label>
    );
}

function QuestionEditor({
    question: q,
    onPatch,
    onAlternative,
    onRemove,
}: {
    question: QuestaoProcessada;
    onPatch: (patch: Partial<QuestaoProcessada>) => void;
    onAlternative: (letter: string, value: string) => void;
    onRemove: () => void;
}) {
    const alternativasOrdenadas = Object.entries(q.alternativas).sort(
        ([a], [b]) => a.localeCompare(b)
    );

    return (
        <article className="rounded-2xl border border-border bg-card p-5 shadow-sm sm:p-6">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                    <div className="text-xs font-semibold uppercase tracking-wide text-primary">
                        Questão {q.numero} • {q.origem === "IA" ? "IA" : "Manual"}
                    </div>
                    <div className="mt-1 text-xs text-muted-foreground">
                        A categorização desta questão vem exclusivamente dos selects do lote.
                    </div>
                </div>

                <button
                    type="button"
                    onClick={onRemove}
                    className="shrink-0 rounded-lg border border-red-200 px-3 py-2 text-xs font-medium text-red-700 hover:bg-red-50"
                >
                    Remover da tela
                </button>
            </div>

            <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
                <label className="space-y-2">
                    <span className="text-sm font-medium">Modalidade</span>
                    <select
                        value={q.modalidade}
                        onChange={(e) => onPatch({ modalidade: e.target.value })}
                        className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm"
                    >
                        <option value="Multipla Escolha">Múltipla Escolha</option>
                        <option value="Certo ou Errado">Certo ou Errado</option>
                    </select>
                </label>

                <label className="space-y-2">
                    <span className="text-sm font-medium">Gabarito</span>
                    <input
                        value={q.correta}
                        onChange={(e) => onPatch({ correta: e.target.value })}
                        placeholder="A, B, C, Certo, Errado..."
                        className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm"
                    />
                </label>
            </div>

            <label className="mt-4 block space-y-2">
                <span className="text-sm font-medium">Enunciado</span>
                <textarea
                    value={q.enunciado}
                    onChange={(e) => onPatch({ enunciado: e.target.value })}
                    className="min-h-[130px] w-full rounded-xl border border-border bg-background p-3 text-sm leading-relaxed"
                />
            </label>

            <div className="mt-4 space-y-3">
                <div className="text-sm font-medium">Alternativas</div>
                {alternativasOrdenadas.map(([letra, texto]) => (
                    <label
                        key={letra}
                        className="flex items-start gap-3 rounded-xl border border-border bg-background p-3"
                    >
                        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-muted text-sm font-bold">
                            {letra}
                        </span>
                        <textarea
                            value={texto}
                            onChange={(e) =>
                                onAlternative(letra, e.target.value)
                            }
                            className="min-h-[54px] flex-1 resize-y bg-transparent text-sm outline-none"
                        />
                    </label>
                ))}
            </div>

            <label className="mt-4 block space-y-2">
                <span className="text-sm font-medium">Explicação / comentário</span>
                <textarea
                    value={q.explicacao}
                    onChange={(e) => onPatch({ explicacao: e.target.value })}
                    className="min-h-[120px] w-full rounded-xl border border-border bg-background p-3 text-sm leading-relaxed"
                />
            </label>

            <div className="mt-5 rounded-2xl border border-border bg-muted/30 p-4">
                <div className="text-sm font-semibold">Seu resultado</div>
                <div className="mt-3 flex flex-wrap gap-2">
                    <button
                        type="button"
                        onClick={() => onPatch({ resultado: "ACERTO" })}
                        className={`rounded-xl border px-4 py-2 text-sm font-semibold transition ${q.resultado === "ACERTO"
                                ? "border-green-600 bg-green-600 text-white"
                                : "border-green-200 text-green-700 hover:bg-green-50"
                            }`}
                    >
                        Acertei
                    </button>
                    <button
                        type="button"
                        onClick={() => onPatch({ resultado: "ERRO" })}
                        className={`rounded-xl border px-4 py-2 text-sm font-semibold transition ${q.resultado === "ERRO"
                                ? "border-red-600 bg-red-600 text-white"
                                : "border-red-200 text-red-700 hover:bg-red-50"
                            }`}
                    >
                        Errei
                    </button>
                </div>

                {q.resultado === "ERRO" && (
                    <p className="mt-3 text-xs text-muted-foreground">
                        Ao salvar, a questão entrará automaticamente no Caderno de Erros.
                    </p>
                )}

                {q.resultado === "ACERTO" && (
                    <label className="mt-3 flex items-start gap-3">
                        <input
                            type="checkbox"
                            checked={q.salvarNoCadernoAcertos}
                            onChange={(e) =>
                                onPatch({
                                    salvarNoCadernoAcertos: e.target.checked,
                                })
                            }
                            className="mt-1 h-4 w-4 accent-green-600"
                        />
                        <span className="text-sm">
                            Guardar esta questão no Caderno de Acertos
                            <span className="mt-1 block text-xs text-muted-foreground">
                                Opcional. Use apenas para questões clássicas, difíceis ou especialmente importantes.
                            </span>
                        </span>
                    </label>
                )}
            </div>
        </article>
    );
}
