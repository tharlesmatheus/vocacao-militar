"use client";

import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

/*
 * A chave do Gemini não fica mais no client.
 * Toda chamada de IA passa pelo endpoint server-side /api/gemini.
 */

const PROMPT_PREFIX = `
Receba a seguinte questão de concurso e extraia SOMENTE os campos:
instituicao, cargo, modalidade, banca, enunciado, alternativas, correta, explicacao.

Regras:
1. NÃO escolha disciplina nem assunto. Esses campos serão definidos pelo usuário no sistema.
2. Não invente instituição, cargo ou banca. Quando a informação não aparecer, retorne string vazia.
3. "alternativas" deve ser um objeto JSON, por exemplo:
   { "A": "...", "B": "...", "C": "...", "D": "...", "E": "..." }
4. "correta" deve conter apenas a identificação da resposta correta, por exemplo "A", "B", "C", "D", "E", "Certo" ou "Errado".
5. Se a questão já possuir explicação ou comentário, reescreva de forma clara, didática e formal, corrigindo apenas erros evidentes e sem inventar novas informações.
6. Se não houver explicação, gere uma explicação didática para o gabarito.
7. Retorne somente JSON válido. Não use markdown, cercas de código, texto antes ou depois.

Formato:
{
  "instituicao": "",
  "cargo": "",
  "modalidade": "",
  "banca": "",
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

type ResultadoTentativa = "ACERTO" | "ERRO";

type Edital = {
    id: string;
    nome: string;
};

type Materia = {
    id: string;
    nome: string;
    edital_id?: string | null;
};

type Assunto = {
    id: string;
    nome: string;
    materia_id?: string | null;
};

type Alternativas = Record<string, string>;

type QuestaoProcessada = {
    localId: string;
    numero: number;
    textoOriginal: string;

    instituicao: string;
    cargo: string;
    modalidade: string;
    banca: string;
    enunciado: string;
    alternativas: Alternativas;
    correta: string;
    explicacao: string;

    resultado: ResultadoTentativa | "";
    salvarNoCadernoAcertos: boolean;

    criarFlashcard: boolean;
    flashcardFrente: string;
    flashcardVerso: string;
    flashcardGerando: boolean;
    flashcardErro: string;
    flashcardVersao: number;
    flashcardConfirmado: boolean;
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

function detectarModalidade(
    alternativas: Alternativas,
    enunciado: string
): string {
    if (!alternativas) return "Multipla Escolha";

    const letras = Object.keys(alternativas).filter(
        (letra) => String(alternativas[letra] ?? "").trim()
    );

    const textoAE =
        `${alternativas["A"] ?? ""} ${alternativas["B"] ?? ""} ${enunciado ?? ""}`;

    if (
        letras.length === 2 &&
        /certo.*errado|errado.*certo|verdadeiro.*falso|falso.*verdadeiro|C\/E|V\/F/i.test(
            textoAE
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
        const idx =
            match.index + (clean[match.index] === "\n" ? 1 : 0);

        starts.push(idx);
    }

    if (starts.length === 0) {
        const unico = clean.trim();
        return unico ? [unico] : [];
    }

    const blocos: string[] = [];

    for (let i = 0; i < starts.length; i++) {
        const inicio = starts[i];
        const fim =
            i + 1 < starts.length
                ? starts[i + 1]
                : clean.length;

        const bloco = clean.slice(inicio, fim).trim();

        if (bloco.length >= 20) {
            blocos.push(bloco);
        }
    }

    return blocos;
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
    if (!value || typeof value !== "object") {
        return {};
    }

    const result: Alternativas = {};

    for (const [key, val] of Object.entries(
        value as Record<string, unknown>
    )) {
        const letra = String(key).trim().toUpperCase();

        if (!letra) continue;

        result[letra] = String(val ?? "").trim();
    }

    return result;
}

function formatarErro(error: unknown): string {
    if (error instanceof Error) return error.message;

    if (
        error &&
        typeof error === "object" &&
        "message" in error
    ) {
        return String((error as any).message);
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

    return `${Date.now()}-${Math.random()
        .toString(36)
        .slice(2)}`;
}

export default function NovaQuestaoGeminiLote() {
    const [userId, setUserId] = useState<string | null>(null);

    const [editais, setEditais] = useState<Edital[]>([]);
    const [materias, setMaterias] = useState<Materia[]>([]);
    const [assuntos, setAssuntos] = useState<Assunto[]>([]);

    const [editalId, setEditalId] = useState("");
    const [materiaId, setMateriaId] = useState("");
    const [assuntoId, setAssuntoId] = useState("");

    const [input, setInput] = useState("");

    const [loadingInicial, setLoadingInicial] =
        useState(true);

    const [processando, setProcessando] = useState(false);
    const [salvando, setSalvando] = useState(false);

    const [erro, setErro] = useState("");
    const [msg, setMsg] = useState("");

    const [questoesProcessadas, setQuestoesProcessadas] =
        useState<QuestaoProcessada[]>([]);

    const [falhasProcessamento, setFalhasProcessamento] =
        useState<FalhaProcessamento[]>([]);

    const [resultadoSalvamento, setResultadoSalvamento] =
        useState<ResultadoSalvamento[]>([]);

    const editalSelecionado = useMemo(
        () => editais.find((e) => e.id === editalId) ?? null,
        [editais, editalId]
    );

    const materiaSelecionada = useMemo(
        () =>
            materias.find((m) => m.id === materiaId) ?? null,
        [materias, materiaId]
    );

    const assuntoSelecionado = useMemo(
        () =>
            assuntos.find((a) => a.id === assuntoId) ?? null,
        [assuntos, assuntoId]
    );

    const podeProcessar =
        !!userId &&
        !!editalId &&
        !!materiaId &&
        !!assuntoId &&
        !!input.trim() &&
        !processando &&
        !salvando;

    const podeSalvar =
        questoesProcessadas.length > 0 &&
        questoesProcessadas.every(
            (q) =>
                q.resultado &&
                (!q.criarFlashcard ||
                    (!q.flashcardGerando &&
                        q.flashcardFrente.trim() &&
                        q.flashcardVerso.trim() &&
                        q.flashcardConfirmado))
        ) &&
        !processando &&
        !salvando;

    useEffect(() => {
        let cancelled = false;

        async function iniciar() {
            setLoadingInicial(true);
            setErro("");

            try {
                const {
                    data: auth,
                    error: authError,
                } = await supabase.auth.getUser();

                const user = auth?.user;

                if (authError || !user?.id) {
                    throw new Error(
                        "Usuário não autenticado."
                    );
                }

                if (cancelled) return;

                setUserId(user.id);

                const {
                    data: editaisData,
                    error: editaisError,
                } = await supabase
                    .from("editais")
                    .select("id,nome")
                    .eq("user_id", user.id)
                    .order("nome");

                if (editaisError) throw editaisError;

                if (cancelled) return;

                const listaEditais =
                    (editaisData ?? []) as Edital[];

                setEditais(listaEditais);

                const savedEdital =
                    window.sessionStorage.getItem(
                        "questoes:last_edital_id"
                    );

                const editalInicial =
                    listaEditais.some(
                        (e) => e.id === savedEdital
                    )
                        ? savedEdital ?? ""
                        : "";

                if (!editalInicial) {
                    setLoadingInicial(false);
                    return;
                }

                setEditalId(editalInicial);

                const {
                    data: materiasData,
                    error: materiasError,
                } = await supabase
                    .from("materias")
                    .select("id,nome,edital_id")
                    .eq("user_id", user.id)
                    .eq("edital_id", editalInicial)
                    .order("nome");

                if (materiasError) throw materiasError;

                if (cancelled) return;

                const listaMaterias =
                    (materiasData ?? []) as Materia[];

                setMaterias(listaMaterias);

                const savedMateria =
                    window.sessionStorage.getItem(
                        "questoes:last_materia_id"
                    );

                const materiaInicial =
                    listaMaterias.some(
                        (m) => m.id === savedMateria
                    )
                        ? savedMateria ?? ""
                        : "";

                if (!materiaInicial) {
                    setLoadingInicial(false);
                    return;
                }

                setMateriaId(materiaInicial);

                const {
                    data: assuntosData,
                    error: assuntosError,
                } = await supabase
                    .from("assuntos")
                    .select("id,nome,materia_id")
                    .eq("user_id", user.id)
                    .eq("materia_id", materiaInicial)
                    .order("nome");

                if (assuntosError) throw assuntosError;

                if (cancelled) return;

                const listaAssuntos =
                    (assuntosData ?? []) as Assunto[];

                setAssuntos(listaAssuntos);

                const savedAssunto =
                    window.sessionStorage.getItem(
                        "questoes:last_assunto_id"
                    );

                const assuntoInicial =
                    listaAssuntos.some(
                        (a) => a.id === savedAssunto
                    )
                        ? savedAssunto ?? ""
                        : "";

                if (assuntoInicial) {
                    setAssuntoId(assuntoInicial);
                }
            } catch (e) {
                if (!cancelled) {
                    setErro(formatarErro(e));
                }
            } finally {
                if (!cancelled) {
                    setLoadingInicial(false);
                }
            }
        }

        iniciar();

        return () => {
            cancelled = true;
        };
    }, []);

    async function handleEditalChange(
        novoEditalId: string
    ) {
        setEditalId(novoEditalId);
        setMateriaId("");
        setAssuntoId("");
        setMaterias([]);
        setAssuntos([]);
        setQuestõesLimparDepoisDaClassificacao();
        setErro("");
        setMsg("");

        window.sessionStorage.setItem(
            "questoes:last_edital_id",
            novoEditalId
        );

        window.sessionStorage.removeItem(
            "questoes:last_materia_id"
        );

        window.sessionStorage.removeItem(
            "questoes:last_assunto_id"
        );

        if (!novoEditalId || !userId) return;

        const { data, error } = await supabase
            .from("materias")
            .select("id,nome,edital_id")
            .eq("user_id", userId)
            .eq("edital_id", novoEditalId)
            .order("nome");

        if (error) {
            setErro(error.message);
            return;
        }

        setMaterias((data ?? []) as Materia[]);
    }

    async function handleMateriaChange(
        novaMateriaId: string
    ) {
        setMateriaId(novaMateriaId);
        setAssuntoId("");
        setAssuntos([]);
        setQuestõesLimparDepoisDaClassificacao();
        setErro("");
        setMsg("");

        window.sessionStorage.setItem(
            "questoes:last_materia_id",
            novaMateriaId
        );

        window.sessionStorage.removeItem(
            "questoes:last_assunto_id"
        );

        if (!novaMateriaId || !userId) return;

        const { data, error } = await supabase
            .from("assuntos")
            .select("id,nome,materia_id")
            .eq("user_id", userId)
            .eq("materia_id", novaMateriaId)
            .order("nome");

        if (error) {
            setErro(error.message);
            return;
        }

        setAssuntos((data ?? []) as Assunto[]);
    }

    function handleAssuntoChange(
        novoAssuntoId: string
    ) {
        setAssuntoId(novoAssuntoId);
        setQuestõesLimparDepoisDaClassificacao();
        setErro("");
        setMsg("");

        window.sessionStorage.setItem(
            "questoes:last_assunto_id",
            novoAssuntoId
        );
    }

    function setQuestõesLimparDepoisDaClassificacao() {
        setQuestoesProcessadas([]);
        setFalhasProcessamento([]);
        setResultadoSalvamento([]);
    }

    async function chamarGeminiJson(
        prompt: string
    ): Promise<any> {
        const {
            data: sessionData,
            error: sessionError,
        } = await supabase.auth.getSession();

        const accessToken =
            sessionData?.session?.access_token;

        if (sessionError || !accessToken) {
            throw new Error(
                "Sua sessão expirou. Entre novamente para usar a IA."
            );
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

        const data = (await res
            .json()
            .catch(() => null)) as
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
            throw new Error(
                "A IA retornou uma resposta vazia."
            );
        }

        return extrairJson(texto);
    }

    async function chamarGemini(
        questaoTxt: string
    ): Promise<any> {
        return chamarGeminiJson(
            PROMPT_PREFIX + questaoTxt
        );
    }

    async function gerarFlashcardComIA(
        localId: string,
        forcarNovaVersao = false
    ) {
        const questao = questoesProcessadas.find(
            (q) => q.localId === localId
        );

        if (!questao) return;

        atualizarQuestao(localId, {
            criarFlashcard: true,
            flashcardGerando: true,
            flashcardErro: "",
            flashcardConfirmado: false,
        });

        const prompt = `
Crie UM flashcard de estudo a partir da questão de concurso abaixo.

Objetivo:
- testar uma única informação importante;
- priorizar conceito, regra, requisito, exceção, prazo, distinção ou fórmula;
- evitar copiar a questão inteira;
- evitar pergunta longa;
- manter a frente curta e clara;
- manter o verso objetivo, suficiente para revisão;
- não inventar informação que não esteja sustentada pela questão, gabarito ou explicação.

${forcarNovaVersao || questao.flashcardVersao > 0
                ? `Gere uma NOVA versão, diferente da sugestão anterior.
Sugestão anterior:
Frente: ${questao.flashcardFrente || "(vazia)"}
Verso: ${questao.flashcardVerso || "(vazio)"}`
                : ""}

Disciplina: ${materiaSelecionada?.nome ?? ""}
Assunto: ${assuntoSelecionado?.nome ?? ""}

Enunciado:
${questao.enunciado}

Alternativas:
${Object.entries(questao.alternativas)
                .map(([letra, valor]) => `${letra}) ${valor}`)
                .join("\n")}

Gabarito:
${questao.correta}

Explicação:
${questao.explicacao}

Retorne somente JSON válido:
{
  "frente": "...",
  "verso": "..."
}
`;

        try {
            const obj = await chamarGeminiJson(prompt);

            const frente = String(
                obj?.frente ?? ""
            ).trim();

            const verso = String(
                obj?.verso ?? ""
            ).trim();

            if (!frente || !verso) {
                throw new Error(
                    "A IA não retornou frente e verso válidos."
                );
            }

            atualizarQuestao(localId, {
                flashcardFrente: frente,
                flashcardVerso: verso,
                flashcardGerando: false,
                flashcardErro: "",
                flashcardVersao:
                    questao.flashcardVersao + 1,
                flashcardConfirmado: false,
            });
        } catch (e) {
            atualizarQuestao(localId, {
                flashcardGerando: false,
                flashcardErro: formatarErro(e),
            });
        }
    }

    async function handleToggleFlashcard(
        questao: QuestaoProcessada,
        checked: boolean
    ) {
        if (!checked) {
            atualizarQuestao(questao.localId, {
                criarFlashcard: false,
                flashcardFrente: "",
                flashcardVerso: "",
                flashcardGerando: false,
                flashcardErro: "",
                flashcardVersao: 0,
                flashcardConfirmado: false,
            });
            return;
        }

        atualizarQuestao(questao.localId, {
            criarFlashcard: true,
            flashcardErro: "",
            flashcardConfirmado: false,
        });

        if (
            !questao.flashcardFrente.trim() ||
            !questao.flashcardVerso.trim()
        ) {
            await gerarFlashcardComIA(
                questao.localId
            );
        }
    }

    async function handleProcessarLote() {
        if (!editalId || !materiaId || !assuntoId) {
            setErro(
                "Selecione Edital, Disciplina e Assunto antes de processar."
            );
            return;
        }

        const questoesSeparadas = separarQuestoes(input);

        if (!questoesSeparadas.length) {
            setErro(
                "Não foi possível identificar nenhuma questão no texto."
            );
            return;
        }

        setProcessando(true);
        setErro("");
        setMsg("");
        setQuestoesProcessadas([]);
        setFalhasProcessamento([]);
        setResultadoSalvamento([]);

        const prontas: QuestaoProcessada[] = [];
        const falhas: FalhaProcessamento[] = [];

        try {
            for (
                let i = 0;
                i < questoesSeparadas.length;
                i++
            ) {
                const questaoTxt = questoesSeparadas[i];

                try {
                    const obj = await chamarGemini(
                        questaoTxt
                    );

                    const alternativas =
                        normalizarAlternativas(
                            obj?.alternativas
                        );

                    const enunciado = String(
                        obj?.enunciado ?? ""
                    ).trim();

                    const correta = String(
                        obj?.correta ?? ""
                    ).trim();

                    if (!enunciado) {
                        throw new Error(
                            "A IA não retornou o enunciado."
                        );
                    }

                    if (!correta) {
                        throw new Error(
                            "A IA não retornou o gabarito."
                        );
                    }

                    if (
                        Object.keys(alternativas).length ===
                        0
                    ) {
                        throw new Error(
                            "A IA não retornou as alternativas."
                        );
                    }

                    const modalidade =
                        detectarModalidade(
                            alternativas,
                            enunciado
                        );

                    prontas.push({
                        localId: criarLocalId(),
                        numero: i + 1,
                        textoOriginal: questaoTxt,

                        instituicao: String(
                            obj?.instituicao ?? ""
                        ).trim(),

                        cargo: String(
                            obj?.cargo ?? ""
                        ).trim(),

                        modalidade,

                        banca: String(
                            obj?.banca ?? ""
                        ).trim(),

                        enunciado,
                        alternativas,
                        correta,

                        explicacao: String(
                            obj?.explicacao ?? ""
                        ).trim(),

                        resultado: "",
                        salvarNoCadernoAcertos: false,

                        criarFlashcard: false,
                        flashcardFrente: "",
                        flashcardVerso: "",
                        flashcardGerando: false,
                        flashcardErro: "",
                        flashcardVersao: 0,
                        flashcardConfirmado: false,
                    });
                } catch (e) {
                    falhas.push({
                        numero: i + 1,
                        erro: formatarErro(e),
                        texto: questaoTxt,
                    });
                }
            }

            setQuestoesProcessadas(prontas);
            setFalhasProcessamento(falhas);

            if (prontas.length) {
                setMsg(
                    `${prontas.length} questão(ões) processada(s). Revise os dados, marque Acertei ou Errei em cada uma e depois salve.`
                );
            }

            if (!prontas.length) {
                setErro(
                    "Nenhuma questão foi processada com sucesso."
                );
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
            prev.map((q) => {
                if (q.localId !== localId) return q;

                const alteraConteudoBase =
                    "enunciado" in patch ||
                    "correta" in patch ||
                    "explicacao" in patch;

                const alteraConteudoFlashcard =
                    "flashcardFrente" in patch ||
                    "flashcardVerso" in patch;

                const deveInvalidarConfirmacao =
                    q.criarFlashcard &&
                    (alteraConteudoBase ||
                        alteraConteudoFlashcard);

                return {
                    ...q,
                    ...patch,
                    ...(deveInvalidarConfirmacao
                        ? { flashcardConfirmado: false }
                        : {}),
                };
            })
        );
    }

    function atualizarAlternativa(
        localId: string,
        letra: string,
        valor: string
    ) {
        setQuestoesProcessadas((prev) =>
            prev.map((q) => {
                if (q.localId !== localId) {
                    return q;
                }

                return {
                    ...q,
                    alternativas: {
                        ...q.alternativas,
                        [letra]: valor,
                    },
                    ...(q.criarFlashcard
                        ? { flashcardConfirmado: false }
                        : {}),
                };
            })
        );
    }

    function removerQuestao(localId: string) {
        setQuestoesProcessadas((prev) =>
            prev.filter(
                (q) => q.localId !== localId
            )
        );
    }

    async function inserirCaderno(
        questaoId: string,
        tipo: "ERROS" | "ACERTOS"
    ) {
        if (!userId) return;

        const { error } = await supabase
            .from("caderno_itens")
            .insert({
                user_id: userId,
                questao_id: questaoId,
                tipo,
                anotacao: null,
            });

        if (error) {
            throw new Error(
                `Falha ao inserir no Caderno de ${tipo === "ERROS" ? "Erros" : "Acertos"}: ${error.message}`
            );
        }
    }

    async function inserirFlashcard(
        questaoId: string,
        q: QuestaoProcessada
    ) {
        if (!userId) return;

        const { error } = await supabase
            .from("flashcards")
            .insert({
                user_id: userId,
                edital_id: editalId,
                materia_id: materiaId,
                assunto_id: assuntoId,
                questao_origem_id: questaoId,
                frente: q.flashcardFrente.trim(),
                verso: q.flashcardVerso.trim(),
                active: true,
            });

        if (error) {
            throw new Error(
                `Falha ao criar flashcard: ${error.message}`
            );
        }
    }

    async function inserirTentativa(
        questaoId: string,
        resultado: ResultadoTentativa
    ) {
        if (!userId) return;

        const { error } = await supabase
            .from("question_attempts")
            .insert({
                user_id: userId,
                questao_id: questaoId,
                resultado,
                is_revisao: false,
            });

        if (error) {
            throw new Error(
                `Falha ao criar tentativa: ${error.message}`
            );
        }
    }

    async function sincronizarEstatisticasDoUsuario() {
        if (!userId) return;

        const {
            data: tentativasData,
            error: tentativasError,
        } = await supabase
            .from("question_attempts")
            .select(
                "questao_id,resultado,created_at"
            )
            .eq("user_id", userId)
            .order("created_at", {
                ascending: true,
            });

        if (tentativasError) {
            throw new Error(
                `Falha ao ler tentativas para as estatísticas: ${tentativasError.message}`
            );
        }

        const tentativas =
            (tentativasData ?? []) as Array<{
                questao_id: string;
                resultado: ResultadoTentativa;
                created_at: string;
            }>;

        const questaoIds = Array.from(
            new Set(
                tentativas
                    .map((t) => t.questao_id)
                    .filter(Boolean)
            )
        );

        const questoesMap = new Map<
            string,
            {
                materia_id: string | null;
                assunto_id: string | null;
            }
        >();

        for (
            let i = 0;
            i < questaoIds.length;
            i += 500
        ) {
            const lote = questaoIds.slice(
                i,
                i + 500
            );

            const {
                data: questoesData,
                error: questoesError,
            } = await supabase
                .from("questoes")
                .select(
                    "id,materia_id,assunto_id"
                )
                .eq("user_id", userId)
                .in("id", lote);

            if (questoesError) {
                throw new Error(
                    `Falha ao ler questões para as estatísticas: ${questoesError.message}`
                );
            }

            for (const row of questoesData ?? []) {
                questoesMap.set(
                    String(row.id),
                    {
                        materia_id:
                            row.materia_id ?? null,
                        assunto_id:
                            row.assunto_id ?? null,
                    }
                );
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
            const acertou =
                tentativa.resultado === "ACERTO";

            if (acertou) corretas += 1;

            const questaoMeta = questoesMap.get(
                tentativa.questao_id
            );

            if (questaoMeta?.materia_id) {
                const atual =
                    accPorMateria[
                    questaoMeta.materia_id
                    ] ?? {
                        total: 0,
                        corretas: 0,
                    };

                atual.total += 1;

                if (acertou) {
                    atual.corretas += 1;
                }

                accPorMateria[
                    questaoMeta.materia_id
                ] = atual;
            }

            if (questaoMeta?.assunto_id) {
                const atual =
                    accPorAssunto[
                    questaoMeta.assunto_id
                    ] ?? {
                        total: 0,
                        corretas: 0,
                    };

                atual.total += 1;

                if (acertou) {
                    atual.corretas += 1;
                }

                accPorAssunto[
                    questaoMeta.assunto_id
                ] = atual;
            }

            const d = new Date(
                tentativa.created_at
            );

            const dia = d.toLocaleDateString(
                "pt-BR",
                {
                    day: "2-digit",
                    month: "2-digit",
                    year: "numeric",
                }
            );

            porDia.set(
                dia,
                (porDia.get(dia) ?? 0) + 1
            );
        }

        const total = tentativas.length;

        const taxaAcerto = total
            ? (corretas / total) * 100
            : 0;

        const progressoSemanal = Array.from(
            porDia.entries()
        ).map(([dia, questoes]) => ({
            dia,
            questoes,
        }));

        const payloadEstatisticas = {
            questoes_respondidas: total,
            taxa_acerto: taxaAcerto,
            progresso_semanal:
                progressoSemanal,
            acc_por_materia: accPorMateria,
            acc_por_assunto: accPorAssunto,
        };

        const {
            data: existente,
            error: existenteError,
        } = await supabase
            .from("estatisticas")
            .select("user_id")
            .eq("user_id", userId)
            .maybeSingle();

        if (existenteError) {
            throw new Error(
                `Falha ao consultar estatísticas: ${existenteError.message}`
            );
        }

        if (existente) {
            const { error } = await supabase
                .from("estatisticas")
                .update(payloadEstatisticas)
                .eq("user_id", userId);

            if (error) {
                throw new Error(
                    `Falha ao atualizar estatísticas: ${error.message}`
                );
            }
        } else {
            const { error } = await supabase
                .from("estatisticas")
                .insert({
                    user_id: userId,
                    ...payloadEstatisticas,
                });

            if (error) {
                throw new Error(
                    `Falha ao criar estatísticas: ${error.message}`
                );
            }
        }
    }

    async function handleSalvarTodas() {
        if (!userId) {
            setErro("Usuário não autenticado.");
            return;
        }

        if (!editalSelecionado) {
            setErro("Edital inválido.");
            return;
        }

        if (!materiaSelecionada) {
            setErro("Disciplina inválida.");
            return;
        }

        if (!assuntoSelecionado) {
            setErro("Assunto inválido.");
            return;
        }

        if (!questoesProcessadas.length) {
            setErro(
                "Não existem questões processadas para salvar."
            );
            return;
        }

        const semResultado =
            questoesProcessadas.filter(
                (q) => !q.resultado
            );

        if (semResultado.length) {
            setErro(
                "Marque Acertei ou Errei em todas as questões antes de salvar."
            );
            return;
        }

        const flashcardsInvalidos =
            questoesProcessadas.filter(
                (q) =>
                    q.criarFlashcard &&
                    (!q.flashcardFrente.trim() ||
                        !q.flashcardVerso.trim())
            );

        if (flashcardsInvalidos.length) {
            setErro(
                "Gere e revise Frente e Verso de todos os flashcards marcados."
            );
            return;
        }

        const flashcardsNaoConfirmados =
            questoesProcessadas.filter(
                (q) =>
                    q.criarFlashcard &&
                    !q.flashcardConfirmado
            );

        if (flashcardsNaoConfirmados.length) {
            setErro(
                "Confirme a prévia de todos os flashcards antes de salvar."
            );
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
                    const payload = {
                        user_id: userId,
                        edital_id: editalId,
                        materia_id: materiaId,
                        assunto_id: assuntoId,

                        /*
                         * Mantém também os nomes em texto para
                         * compatibilidade com as telas antigas.
                         */
                        disciplina: materiaSelecionada.nome,
                        assunto: assuntoSelecionado.nome,

                        instituicao: q.instituicao,
                        cargo: q.cargo,
                        modalidade: q.modalidade,
                        banca: q.banca,
                        enunciado: q.enunciado,
                        alternativas: q.alternativas,
                        correta: q.correta,
                        explicacao: q.explicacao,
                    };

                    const {
                        data: questaoCriada,
                        error: questaoError,
                    } = await supabase
                        .from("questoes")
                        .insert(payload)
                        .select("id")
                        .single();

                    if (questaoError) {
                        throw new Error(
                            `Falha ao salvar a questão: ${questaoError.message}`
                        );
                    }

                    questaoId = String(
                        questaoCriada.id
                    );

                    await inserirTentativa(
                        questaoId,
                        q.resultado as ResultadoTentativa
                    );

                    if (q.resultado === "ERRO") {
                        await inserirCaderno(
                            questaoId,
                            "ERROS"
                        );
                    }

                    if (
                        q.resultado === "ACERTO" &&
                        q.salvarNoCadernoAcertos
                    ) {
                        await inserirCaderno(
                            questaoId,
                            "ACERTOS"
                        );
                    }

                    if (
                        q.criarFlashcard &&
                        q.flashcardConfirmado
                    ) {
                        await inserirFlashcard(
                            questaoId,
                            q
                        );
                    }

                    resultados.push({
                        numero: q.numero,
                        status: "OK",
                        questaoId,
                    });
                } catch (e) {
                    /*
                     * Compensação simples:
                     * se a questão foi criada, mas alguma operação
                     * dependente falhou, removemos a questão.
                     *
                     * Com FK ON DELETE CASCADE nas tentativas,
                     * flashcards/cadernos relacionados também podem
                     * ser limpos conforme seu schema.
                     */
                    if (questaoId) {
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

            let avisoEstatisticas = "";

            try {
                await sincronizarEstatisticasDoUsuario();
            } catch (e) {
                avisoEstatisticas =
                    formatarErro(e);
            }

            setResultadoSalvamento(resultados);

            const ok = resultados.filter(
                (r) => r.status === "OK"
            ).length;

            const falhas = resultados.filter(
                (r) => r.status === "ERRO"
            ).length;

            if (ok) {
                setMsg(
                    `${ok} questão(ões) cadastrada(s) com sucesso.${falhas ? ` ${falhas} falharam.` : ""}${avisoEstatisticas
                        ? ` As questões foram salvas, mas houve falha ao sincronizar as estatísticas: ${avisoEstatisticas}`
                        : " Estatísticas atualizadas."
                    }`
                );
            }

            if (!ok) {
                setErro(
                    "Nenhuma questão pôde ser cadastrada. Veja os erros abaixo."
                );
            }

            if (ok === questoesProcessadas.length) {
                setInput("");
                setQuestoesProcessadas([]);
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
                    Carregando...
                </span>
            </main>
        );
    }

    return (
        <main className="w-full px-4 sm:px-6 lg:px-8 py-6 md:py-10">
            <div className="mx-auto max-w-5xl space-y-6">
                <header>
                    <h1 className="text-2xl font-bold text-foreground">
                        Lançar Questões
                    </h1>

                    <p className="mt-1 text-sm text-muted-foreground">
                        Classifique pelo Edital, processe o
                        texto com IA e registre o resultado de
                        cada questão.
                    </p>
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

                <section className="rounded-2xl border border-border bg-card p-5 sm:p-6 shadow-sm">
                    <h2 className="text-base font-semibold">
                        1. Classificação
                    </h2>

                    <p className="mt-1 text-xs text-muted-foreground">
                        A classificação vem do seu Edital. A IA
                        não escolhe disciplina nem assunto.
                    </p>

                    <div className="mt-5 grid grid-cols-1 md:grid-cols-3 gap-4">
                        <label className="space-y-2">
                            <span className="text-sm font-medium">
                                Edital
                            </span>

                            <select
                                value={editalId}
                                onChange={(e) =>
                                    handleEditalChange(
                                        e.target.value
                                    )
                                }
                                className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-primary/30"
                            >
                                <option value="">
                                    Selecione o Edital
                                </option>

                                {editais.map((edital) => (
                                    <option
                                        key={edital.id}
                                        value={edital.id}
                                    >
                                        {edital.nome}
                                    </option>
                                ))}
                            </select>
                        </label>

                        <label className="space-y-2">
                            <span className="text-sm font-medium">
                                Disciplina
                            </span>

                            <select
                                value={materiaId}
                                disabled={!editalId}
                                onChange={(e) =>
                                    handleMateriaChange(
                                        e.target.value
                                    )
                                }
                                className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none disabled:opacity-50 focus:ring-2 focus:ring-primary/30"
                            >
                                <option value="">
                                    Selecione a Disciplina
                                </option>

                                {materias.map((materia) => (
                                    <option
                                        key={materia.id}
                                        value={materia.id}
                                    >
                                        {materia.nome}
                                    </option>
                                ))}
                            </select>
                        </label>

                        <label className="space-y-2">
                            <span className="text-sm font-medium">
                                Assunto
                            </span>

                            <select
                                value={assuntoId}
                                disabled={!materiaId}
                                onChange={(e) =>
                                    handleAssuntoChange(
                                        e.target.value
                                    )
                                }
                                className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none disabled:opacity-50 focus:ring-2 focus:ring-primary/30"
                            >
                                <option value="">
                                    Selecione o Assunto
                                </option>

                                {assuntos.map((assunto) => (
                                    <option
                                        key={assunto.id}
                                        value={assunto.id}
                                    >
                                        {assunto.nome}
                                    </option>
                                ))}
                            </select>
                        </label>
                    </div>

                    {editalSelecionado &&
                        materiaSelecionada &&
                        assuntoSelecionado && (
                            <div className="mt-4 rounded-xl bg-muted px-4 py-3 text-sm">
                                <span className="font-medium">
                                    Classificação:
                                </span>{" "}
                                {editalSelecionado.nome} /{" "}
                                {materiaSelecionada.nome} /{" "}
                                {assuntoSelecionado.nome}
                            </div>
                        )}
                </section>

                <section className="rounded-2xl border border-border bg-card p-5 sm:p-6 shadow-sm">
                    <h2 className="text-base font-semibold">
                        2. Cole as questões
                    </h2>

                    <p className="mt-1 text-xs text-muted-foreground">
                        Você pode colar uma questão ou várias
                        numeradas em sequência.
                    </p>

                    <textarea
                        className="mt-4 w-full min-h-[240px] resize-y rounded-xl border border-border bg-background p-4 text-sm outline-none focus:ring-2 focus:ring-primary/30"
                        placeholder={`Exemplos de separação:
1) ...
2) ...

QUESTÃO 3 ...
QUESTÃO 4 ...

1. ...
2. ...`}
                        value={input}
                        onChange={(e) =>
                            setInput(e.target.value)
                        }
                    />

                    <div className="mt-4 flex flex-col sm:flex-row sm:items-center gap-3">
                        <button
                            type="button"
                            onClick={handleProcessarLote}
                            disabled={!podeProcessar}
                            className="rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                            {processando
                                ? "Processando com IA..."
                                : "Processar questões"}
                        </button>

                        <span className="text-xs text-muted-foreground">
                            A seleção de Edital, Disciplina e
                            Assunto fica memorizada nesta sessão.
                        </span>
                    </div>
                </section>

                {falhasProcessamento.length > 0 && (
                    <section className="rounded-2xl border border-amber-200 bg-amber-50 p-5">
                        <h2 className="font-semibold text-amber-900">
                            Falhas no processamento
                        </h2>

                        <div className="mt-3 space-y-3">
                            {falhasProcessamento.map(
                                (falha) => (
                                    <div
                                        key={`${falha.numero}-${falha.erro}`}
                                        className="rounded-xl bg-white/70 p-3 text-sm"
                                    >
                                        <div className="font-medium text-amber-900">
                                            Questão{" "}
                                            {falha.numero}
                                        </div>

                                        <div className="mt-1 text-amber-800">
                                            {falha.erro}
                                        </div>
                                    </div>
                                )
                            )}
                        </div>
                    </section>
                )}

                {questoesProcessadas.length > 0 && (
                    <section className="space-y-5">
                        <div>
                            <h2 className="text-lg font-semibold">
                                3. Revise e informe o resultado
                            </h2>

                            <p className="mt-1 text-sm text-muted-foreground">
                                Cada questão precisa ser marcada
                                como Acertei ou Errei antes do
                                salvamento.
                            </p>
                        </div>

                        {questoesProcessadas.map(
                            (q, index) => {
                                const letras =
                                    Object.keys(
                                        q.alternativas
                                    ).sort();

                                return (
                                    <article
                                        key={q.localId}
                                        className="rounded-2xl border border-border bg-card p-5 sm:p-6 shadow-sm"
                                    >
                                        <div className="flex items-start justify-between gap-4">
                                            <div>
                                                <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                                                    Questão{" "}
                                                    {q.numero}
                                                </div>

                                                <h3 className="mt-1 font-semibold">
                                                    {q.instituicao ||
                                                        q.banca ||
                                                        `Item ${index + 1}`}
                                                </h3>
                                            </div>

                                            <button
                                                type="button"
                                                onClick={() =>
                                                    removerQuestao(
                                                        q.localId
                                                    )
                                                }
                                                className="rounded-lg border border-border px-3 py-1.5 text-xs text-muted-foreground hover:bg-muted"
                                            >
                                                Remover
                                            </button>
                                        </div>

                                        <div className="mt-5 grid grid-cols-1 sm:grid-cols-3 gap-3">
                                            <label className="space-y-1">
                                                <span className="text-xs text-muted-foreground">
                                                    Instituição
                                                </span>

                                                <input
                                                    value={
                                                        q.instituicao
                                                    }
                                                    onChange={(
                                                        e
                                                    ) =>
                                                        atualizarQuestao(
                                                            q.localId,
                                                            {
                                                                instituicao:
                                                                    e
                                                                        .target
                                                                        .value,
                                                            }
                                                        )
                                                    }
                                                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                                                />
                                            </label>

                                            <label className="space-y-1">
                                                <span className="text-xs text-muted-foreground">
                                                    Cargo
                                                </span>

                                                <input
                                                    value={
                                                        q.cargo
                                                    }
                                                    onChange={(
                                                        e
                                                    ) =>
                                                        atualizarQuestao(
                                                            q.localId,
                                                            {
                                                                cargo: e
                                                                    .target
                                                                    .value,
                                                            }
                                                        )
                                                    }
                                                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                                                />
                                            </label>

                                            <label className="space-y-1">
                                                <span className="text-xs text-muted-foreground">
                                                    Banca
                                                </span>

                                                <input
                                                    value={
                                                        q.banca
                                                    }
                                                    onChange={(
                                                        e
                                                    ) =>
                                                        atualizarQuestao(
                                                            q.localId,
                                                            {
                                                                banca: e
                                                                    .target
                                                                    .value,
                                                            }
                                                        )
                                                    }
                                                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                                                />
                                            </label>
                                        </div>

                                        <label className="mt-4 block space-y-1">
                                            <span className="text-xs text-muted-foreground">
                                                Enunciado
                                            </span>

                                            <textarea
                                                value={
                                                    q.enunciado
                                                }
                                                onChange={(
                                                    e
                                                ) =>
                                                    atualizarQuestao(
                                                        q.localId,
                                                        {
                                                            enunciado:
                                                                e
                                                                    .target
                                                                    .value,
                                                        }
                                                    )
                                                }
                                                className="w-full min-h-[120px] rounded-xl border border-border bg-background p-3 text-sm"
                                            />
                                        </label>

                                        <div className="mt-4 space-y-2">
                                            <div className="text-xs text-muted-foreground">
                                                Alternativas
                                            </div>

                                            {letras.map(
                                                (letra) => (
                                                    <div
                                                        key={
                                                            letra
                                                        }
                                                        className="flex gap-2"
                                                    >
                                                        <div className="w-10 shrink-0 rounded-lg bg-muted px-2 py-2 text-center text-sm font-semibold">
                                                            {
                                                                letra
                                                            }
                                                        </div>

                                                        <textarea
                                                            value={
                                                                q
                                                                    .alternativas[
                                                                letra
                                                                ] ??
                                                                ""
                                                            }
                                                            onChange={(
                                                                e
                                                            ) =>
                                                                atualizarAlternativa(
                                                                    q.localId,
                                                                    letra,
                                                                    e
                                                                        .target
                                                                        .value
                                                                )
                                                            }
                                                            className="min-h-[44px] flex-1 resize-y rounded-lg border border-border bg-background px-3 py-2 text-sm"
                                                        />
                                                    </div>
                                                )
                                            )}
                                        </div>

                                        <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
                                            <label className="space-y-1">
                                                <span className="text-xs text-muted-foreground">
                                                    Gabarito
                                                </span>

                                                <input
                                                    value={
                                                        q.correta
                                                    }
                                                    onChange={(
                                                        e
                                                    ) =>
                                                        atualizarQuestao(
                                                            q.localId,
                                                            {
                                                                correta:
                                                                    e
                                                                        .target
                                                                        .value,
                                                            }
                                                        )
                                                    }
                                                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                                                />
                                            </label>

                                            <label className="space-y-1">
                                                <span className="text-xs text-muted-foreground">
                                                    Modalidade
                                                </span>

                                                <input
                                                    value={
                                                        q.modalidade
                                                    }
                                                    onChange={(
                                                        e
                                                    ) =>
                                                        atualizarQuestao(
                                                            q.localId,
                                                            {
                                                                modalidade:
                                                                    e
                                                                        .target
                                                                        .value,
                                                            }
                                                        )
                                                    }
                                                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                                                />
                                            </label>
                                        </div>

                                        <label className="mt-4 block space-y-1">
                                            <span className="text-xs text-muted-foreground">
                                                Comentário /
                                                explicação
                                            </span>

                                            <textarea
                                                value={
                                                    q.explicacao
                                                }
                                                onChange={(
                                                    e
                                                ) =>
                                                    atualizarQuestao(
                                                        q.localId,
                                                        {
                                                            explicacao:
                                                                e
                                                                    .target
                                                                    .value,
                                                        }
                                                    )
                                                }
                                                className="w-full min-h-[140px] rounded-xl border border-border bg-background p-3 text-sm"
                                            />
                                        </label>

                                        <div className="mt-6">
                                            <div className="text-sm font-semibold">
                                                Resultado
                                            </div>

                                            <div className="mt-2 grid grid-cols-2 gap-3">
                                                <button
                                                    type="button"
                                                    onClick={() =>
                                                        atualizarQuestao(
                                                            q.localId,
                                                            {
                                                                resultado:
                                                                    "ERRO",
                                                                salvarNoCadernoAcertos: false,
                                                            }
                                                        )
                                                    }
                                                    className={`rounded-xl border px-4 py-3 text-sm font-semibold transition ${q.resultado ===
                                                        "ERRO"
                                                        ? "border-red-500 bg-red-50 text-red-700"
                                                        : "border-border hover:bg-muted"
                                                        }`}
                                                >
                                                    Errei
                                                </button>

                                                <button
                                                    type="button"
                                                    onClick={() =>
                                                        atualizarQuestao(
                                                            q.localId,
                                                            {
                                                                resultado:
                                                                    "ACERTO",
                                                            }
                                                        )
                                                    }
                                                    className={`rounded-xl border px-4 py-3 text-sm font-semibold transition ${q.resultado ===
                                                        "ACERTO"
                                                        ? "border-green-500 bg-green-50 text-green-700"
                                                        : "border-border hover:bg-muted"
                                                        }`}
                                                >
                                                    Acertei
                                                </button>
                                            </div>
                                        </div>

                                        {q.resultado ===
                                            "ERRO" && (
                                                <div className="mt-3 rounded-xl bg-red-50 px-4 py-3 text-xs text-red-700">
                                                    Esta tentativa entrará nas estatísticas e a questão será enviada automaticamente para o Caderno de Erros de{" "}
                                                    <strong>
                                                        {materiaSelecionada?.nome ?? "Disciplina"}
                                                    </strong>
                                                    {" / "}
                                                    <strong>
                                                        {assuntoSelecionado?.nome ?? "Assunto"}
                                                    </strong>
                                                    .
                                                </div>
                                            )}

                                        {q.resultado ===
                                            "ACERTO" && (
                                                <div className="mt-3 rounded-xl bg-green-50 px-4 py-3 text-xs text-green-700">
                                                    Esta tentativa será registrada como acerto nas estatísticas de{" "}
                                                    <strong>
                                                        {materiaSelecionada?.nome ?? "Disciplina"}
                                                    </strong>
                                                    {" / "}
                                                    <strong>
                                                        {assuntoSelecionado?.nome ?? "Assunto"}
                                                    </strong>
                                                    .
                                                </div>
                                            )}

                                        {q.resultado ===
                                            "ACERTO" && (
                                                <label className="mt-4 flex items-start gap-3 rounded-xl border border-border p-4">
                                                    <input
                                                        type="checkbox"
                                                        checked={
                                                            q.salvarNoCadernoAcertos
                                                        }
                                                        onChange={(
                                                            e
                                                        ) =>
                                                            atualizarQuestao(
                                                                q.localId,
                                                                {
                                                                    salvarNoCadernoAcertos:
                                                                        e
                                                                            .target
                                                                            .checked,
                                                                }
                                                            )
                                                        }
                                                        className="mt-0.5"
                                                    />

                                                    <span>
                                                        <span className="block text-sm font-medium">
                                                            Salvar
                                                            também no
                                                            Caderno
                                                            de Acertos
                                                        </span>

                                                        <span className="block text-xs text-muted-foreground mt-1">
                                                            Use para
                                                            questões
                                                            boas,
                                                            clássicas,
                                                            difíceis
                                                            ou
                                                            importantes.
                                                        </span>
                                                    </span>
                                                </label>
                                            )}

                                        <label className="mt-4 flex items-start gap-3 rounded-xl border border-border p-4">
                                            <input
                                                type="checkbox"
                                                checked={
                                                    q.criarFlashcard
                                                }
                                                onChange={(
                                                    e
                                                ) =>
                                                    handleToggleFlashcard(
                                                        q,
                                                        e.target.checked
                                                    )
                                                }
                                                className="mt-0.5"
                                            />

                                            <span>
                                                <span className="block text-sm font-medium">
                                                    Criar
                                                    flashcard
                                                    desta
                                                    questão
                                                </span>

                                                <span className="block text-xs text-muted-foreground mt-1">
                                                    A IA gera Frente e Verso usando esta questão. Você verá a prévia, poderá editar ou gerar outra versão e só depois confirmar.
                                                </span>
                                            </span>
                                        </label>

                                        {q.criarFlashcard && (
                                            <div className="mt-4 rounded-2xl border border-primary/20 bg-primary/5 p-4 sm:p-5">
                                                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                                                    <div>
                                                        <div className="text-sm font-semibold text-foreground">
                                                            Pré-visualização do flashcard
                                                        </div>

                                                        <div className="mt-1 text-xs text-muted-foreground">
                                                            Revise Frente e Verso. Se gostar, confirme a prévia. Qualquer edição ou nova geração exige uma nova confirmação.
                                                        </div>
                                                    </div>

                                                    <button
                                                        type="button"
                                                        onClick={() =>
                                                            gerarFlashcardComIA(
                                                                q.localId,
                                                                true
                                                            )
                                                        }
                                                        disabled={
                                                            q.flashcardGerando
                                                        }
                                                        className="shrink-0 rounded-xl border border-border bg-background px-4 py-2 text-sm font-medium hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
                                                    >
                                                        {q.flashcardGerando
                                                            ? "Gerando..."
                                                            : q.flashcardVersao > 0
                                                                ? "Gerar nova versão"
                                                                : "Gerar flashcard"}
                                                    </button>
                                                </div>

                                                {q.flashcardErro && (
                                                    <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                                                        {q.flashcardErro}
                                                    </div>
                                                )}

                                                {q.flashcardGerando && (
                                                    <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
                                                        <div className="min-h-[180px] animate-pulse rounded-2xl border border-border bg-card p-5">
                                                            <div className="h-3 w-16 rounded bg-muted" />
                                                            <div className="mt-6 h-4 w-full rounded bg-muted" />
                                                            <div className="mt-2 h-4 w-4/5 rounded bg-muted" />
                                                        </div>

                                                        <div className="min-h-[180px] animate-pulse rounded-2xl border border-border bg-card p-5">
                                                            <div className="h-3 w-16 rounded bg-muted" />
                                                            <div className="mt-6 h-4 w-full rounded bg-muted" />
                                                            <div className="mt-2 h-4 w-3/4 rounded bg-muted" />
                                                        </div>
                                                    </div>
                                                )}

                                                {!q.flashcardGerando &&
                                                    q.flashcardFrente.trim() &&
                                                    q.flashcardVerso.trim() && (
                                                        <>
                                                            <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
                                                                <div className="min-h-[190px] rounded-2xl border border-border bg-card p-5 shadow-sm">
                                                                    <div className="text-[11px] font-semibold uppercase tracking-wider text-primary">
                                                                        Frente
                                                                    </div>

                                                                    <div className="mt-6 whitespace-pre-wrap text-base font-semibold leading-relaxed text-foreground">
                                                                        {q.flashcardFrente}
                                                                    </div>
                                                                </div>

                                                                <div className="min-h-[190px] rounded-2xl border border-border bg-card p-5 shadow-sm">
                                                                    <div className="text-[11px] font-semibold uppercase tracking-wider text-primary">
                                                                        Verso
                                                                    </div>

                                                                    <div className="mt-6 whitespace-pre-wrap text-sm leading-relaxed text-foreground">
                                                                        {q.flashcardVerso}
                                                                    </div>
                                                                </div>
                                                            </div>

                                                            <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3">
                                                                <label className="space-y-1">
                                                                    <span className="text-xs text-muted-foreground">
                                                                        Editar frente
                                                                    </span>

                                                                    <textarea
                                                                        value={
                                                                            q.flashcardFrente
                                                                        }
                                                                        onChange={(
                                                                            e
                                                                        ) =>
                                                                            atualizarQuestao(
                                                                                q.localId,
                                                                                {
                                                                                    flashcardFrente:
                                                                                        e.target.value,
                                                                                }
                                                                            )
                                                                        }
                                                                        className="w-full min-h-[100px] rounded-xl border border-border bg-background p-3 text-sm"
                                                                    />
                                                                </label>

                                                                <label className="space-y-1">
                                                                    <span className="text-xs text-muted-foreground">
                                                                        Editar verso
                                                                    </span>

                                                                    <textarea
                                                                        value={
                                                                            q.flashcardVerso
                                                                        }
                                                                        onChange={(
                                                                            e
                                                                        ) =>
                                                                            atualizarQuestao(
                                                                                q.localId,
                                                                                {
                                                                                    flashcardVerso:
                                                                                        e.target.value,
                                                                                }
                                                                            )
                                                                        }
                                                                        className="w-full min-h-[100px] rounded-xl border border-border bg-background p-3 text-sm"
                                                                    />
                                                                </label>
                                                            </div>

                                                            <div className="mt-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 rounded-xl border border-border bg-background p-4">
                                                                <div>
                                                                    <div className="text-sm font-medium">
                                                                        {q.flashcardConfirmado
                                                                            ? "Flashcard confirmado"
                                                                            : "Confirme esta prévia antes de salvar"}
                                                                    </div>
                                                                    <div className="mt-1 text-xs text-muted-foreground">
                                                                        {q.flashcardConfirmado
                                                                            ? "Esta versão será salva junto com a questão."
                                                                            : "O botão Salvar todas só será liberado depois da confirmação."}
                                                                    </div>
                                                                </div>

                                                                <button
                                                                    type="button"
                                                                    onClick={() =>
                                                                        atualizarQuestao(
                                                                            q.localId,
                                                                            {
                                                                                flashcardConfirmado: true,
                                                                            }
                                                                        )
                                                                    }
                                                                    disabled={
                                                                        q.flashcardGerando ||
                                                                        !q.flashcardFrente.trim() ||
                                                                        !q.flashcardVerso.trim()
                                                                    }
                                                                    className={`shrink-0 rounded-xl px-4 py-2.5 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 ${q.flashcardConfirmado
                                                                            ? "border border-green-300 bg-green-50 text-green-700"
                                                                            : "bg-primary text-primary-foreground hover:opacity-90"
                                                                        }`}
                                                                >
                                                                    {q.flashcardConfirmado
                                                                        ? "Prévia confirmada"
                                                                        : "Confirmar flashcard"}
                                                                </button>
                                                            </div>
                                                        </>
                                                    )}

                                                {!q.flashcardGerando &&
                                                    !q.flashcardFrente.trim() &&
                                                    !q.flashcardErro && (
                                                        <div className="mt-4 rounded-xl border border-dashed border-border bg-card px-4 py-8 text-center text-sm text-muted-foreground">
                                                            Aguardando geração da pré-visualização.
                                                        </div>
                                                    )}
                                            </div>
                                        )}
                                    </article>
                                );
                            }
                        )}

                        <div className="sticky bottom-4 z-20 rounded-2xl border border-border bg-card/95 p-4 shadow-xl backdrop-blur">
                            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                                <div className="text-sm">
                                    <span className="font-semibold">
                                        {
                                            questoesProcessadas.length
                                        }
                                    </span>{" "}
                                    questão(ões) pronta(s)
                                    para cadastro
                                </div>

                                <button
                                    type="button"
                                    onClick={
                                        handleSalvarTodas
                                    }
                                    disabled={!podeSalvar}
                                    className="rounded-xl bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
                                >
                                    {salvando
                                        ? "Salvando..."
                                        : "Salvar todas"}
                                </button>
                            </div>

                            {!podeSalvar &&
                                !salvando && (
                                    <p className="mt-2 text-xs text-muted-foreground">
                                        Marque Acertei ou
                                        Errei em todas as
                                        questões. Se criar
                                        flashcard, revise a
                                        pré-visualização e
                                        clique em Confirmar flashcard.
                                    </p>
                                )}
                        </div>
                    </section>
                )}

                {resultadoSalvamento.length > 0 && (
                    <section className="rounded-2xl border border-border bg-card p-5 sm:p-6">
                        <h2 className="font-semibold">
                            Resultado do salvamento
                        </h2>

                        <div className="mt-4 space-y-2">
                            {resultadoSalvamento.map(
                                (r) => (
                                    <div
                                        key={`${r.numero}-${r.status}`}
                                        className={`rounded-xl border px-4 py-3 text-sm ${r.status ===
                                            "OK"
                                            ? "border-green-200 bg-green-50 text-green-700"
                                            : "border-red-200 bg-red-50 text-red-700"
                                            }`}
                                    >
                                        <strong>
                                            Questão{" "}
                                            {r.numero}:
                                        </strong>{" "}
                                        {r.status ===
                                            "OK"
                                            ? "salva com sucesso."
                                            : r.erro}
                                    </div>
                                )
                            )}
                        </div>
                    </section>
                )}

                <footer className="pb-6 text-center text-xs text-muted-foreground">
                    Gemini API + Supabase
                </footer>
            </div>
        </main>
    );
}
