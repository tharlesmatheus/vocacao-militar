"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

/*
 * A chave do Gemini não fica mais no client.
 * Toda chamada de IA passa pelo endpoint server-side /api/gemini.
 */

const PROMPT_PREFIX = `
Receba a questão de concurso abaixo e extraia SOMENTE os campos:
modalidade, enunciado, alternativas, correta, explicacao.

IMPORTANTE SOBRE CLASSIFICAÇÃO
- NÃO identifique, escolha, sugira ou devolva instituição.
- NÃO identifique, escolha, sugira ou devolva cargo.
- NÃO identifique, escolha, sugira ou devolva banca.
- NÃO identifique, escolha, sugira ou devolva disciplina.
- NÃO identifique, escolha, sugira ou devolva assunto.
- A classificação é definida exclusivamente pelo usuário por meio dos catálogos do banco.

REGRAS GERAIS
1. Preserve fielmente o sentido do enunciado e das alternativas.
2. Não invente datas, números, leis, artigos, súmulas, precedentes ou referências.
3. Quando uma informação não estiver presente ou não puder ser determinada com segurança, use string vazia.
4. "alternativas" deve ser um objeto JSON:
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
13. A explicação deve ser tecnicamente correta, objetiva, didática e voltada para estudo de concurso.
14. Use esta ordem de prioridade como fonte:
    a) gabarito explícito fornecido;
    b) comentário, resolução ou justificativa fornecida junto da questão;
    c) enunciado e alternativas;
    d) conhecimento consolidado necessário apenas para tornar a explicação compreensível.
15. Se houver comentário ou resolução fornecida:
    - preserve o conteúdo técnico relevante;
    - reescreva em linguagem clara, organizada e didática;
    - não mude a conclusão;
    - não acrescente fundamentos específicos que não possam ser sustentados com segurança;
    - corrija somente erros materiais ou de redação evidentes que não alterem o sentido.
16. Se NÃO houver comentário:
    - explique por que o gabarito está correto;
    - destaque a regra, conceito ou raciocínio central cobrado;
    - explique alternativas incorretas somente quando isso for útil;
    - não invente justificativas específicas.
17. Não declare que uma informação está "atualizada", "vigente" ou representa o "entendimento atual" sem base segura.
18. Nunca crie número de artigo, inciso, súmula, tema, precedente ou processo por aproximação.

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

type ResultadoTentativa = "ACERTO" | "ERRO";
type ModoInsercao = "IA" | "MANUAL";
type ModoFlashcard = "IA" | "MANUAL" | null;

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

type CatalogBase = {
    id: string;
    nome: string;
    ativo: boolean;
};

type QuestaoInstituicao = CatalogBase & {
    sigla: string | null;
};

type QuestaoCargo = CatalogBase;

type QuestaoBanca = CatalogBase & {
    sigla: string | null;
};

type QuestaoDisciplina = CatalogBase;

type QuestaoAssunto = CatalogBase & {
    disciplina_id: string;
};

type OpenStudySession = {
    id: string;
    started_at: string;
    materia_id: string | null;
    assunto_id: string | null;
    mode: "cronometro" | "manual";
};

type Alternativas = Record<string, string>;

type QuestaoProcessada = {
    localId: string;
    numero: number;
    textoOriginal: string;
    origem: ModoInsercao;

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
    flashcardModo: ModoFlashcard;
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
    enunciado: string,
    modalidadeIa?: string
): string {
    const ia = String(modalidadeIa ?? "").trim().toLowerCase();

    if (ia.includes("certo") || ia.includes("errado")) {
        return "Certo ou Errado";
    }

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


function chavePreferencia(userId: string, nome: string) {
    return `questoes:${userId}:${nome}`;
}

function formatarDuracao(totalSeconds: number) {
    const total = Math.max(0, Math.floor(totalSeconds));
    const horas = Math.floor(total / 3600);
    const minutos = Math.floor((total % 3600) / 60);
    const segundos = total % 60;

    return [horas, minutos, segundos]
        .map((valor) => String(valor).padStart(2, "0"))
        .join(":");
}

export default function NovaQuestaoGeminiLote() {
    const [userId, setUserId] = useState<string | null>(null);

    const [editais, setEditais] = useState<Edital[]>([]);
    const [materias, setMaterias] = useState<Materia[]>([]);
    const [assuntos, setAssuntos] = useState<Assunto[]>([]);

    const [editalId, setEditalId] = useState("");
    const [materiaId, setMateriaId] = useState("");
    const [assuntoId, setAssuntoId] = useState("");

    /*
     * Classificação canônica das questões.
     * Estes valores vêm SOMENTE das tabelas de catálogo e nunca são criados
     * nesta página nem inferidos pela IA.
     */
    const [instituicoes, setInstituicoes] = useState<QuestaoInstituicao[]>([]);
    const [cargos, setCargos] = useState<QuestaoCargo[]>([]);
    const [bancas, setBancas] = useState<QuestaoBanca[]>([]);
    const [disciplinasCatalogo, setDisciplinasCatalogo] =
        useState<QuestaoDisciplina[]>([]);
    const [assuntosCatalogo, setAssuntosCatalogo] =
        useState<QuestaoAssunto[]>([]);

    const [instituicaoId, setInstituicaoId] = useState("");
    const [cargoId, setCargoId] = useState("");
    const [bancaId, setBancaId] = useState("");
    const [questaoDisciplinaId, setQuestaoDisciplinaId] = useState("");
    const [questaoAssuntoId, setQuestaoAssuntoId] = useState("");
    const [anoQuestao, setAnoQuestao] = useState("");

    const [input, setInput] = useState("");
    const [modoInsercao, setModoInsercao] =
        useState<ModoInsercao>("IA");

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

    /*
     * Tempo de estudo:
     * a duração real é calculada a partir de started_at salvo no banco.
     * O setInterval abaixo serve apenas para atualizar a exibição.
     */
    const [openStudySession, setOpenStudySession] =
        useState<OpenStudySession | null>(null);
    const [studyElapsedSec, setStudyElapsedSec] = useState(0);
    const [studyActionLoading, setStudyActionLoading] = useState(false);
    const [studyError, setStudyError] = useState("");
    const [studyMessage, setStudyMessage] = useState("");
    const [studyMateriaNome, setStudyMateriaNome] = useState("");
    const [studyAssuntoNome, setStudyAssuntoNome] = useState("");
    const [studyEditalId, setStudyEditalId] = useState("");
    const studyTimerRef = useRef<number | null>(null);

    /*
     * Edital/Matéria/Assunto abaixo continuam existindo apenas para o
     * cronômetro / tempo de estudo, que ainda usa as tabelas
     * editais/materias/assuntos. Eles NÃO classificam a questão e não são
     * necessários para criar flashcards.
     */
    const editalSelecionado = useMemo(
        () => editais.find((e) => e.id === editalId) ?? null,
        [editais, editalId]
    );

    const materiaSelecionada = useMemo(
        () => materias.find((m) => m.id === materiaId) ?? null,
        [materias, materiaId]
    );

    const assuntoSelecionado = useMemo(
        () => assuntos.find((a) => a.id === assuntoId) ?? null,
        [assuntos, assuntoId]
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

    const disciplinaCatalogoSelecionada = useMemo(
        () =>
            disciplinasCatalogo.find(
                (item) => item.id === questaoDisciplinaId
            ) ?? null,
        [disciplinasCatalogo, questaoDisciplinaId]
    );

    const assuntosCatalogoDaDisciplina = useMemo(
        () =>
            assuntosCatalogo.filter(
                (item) =>
                    item.ativo &&
                    item.disciplina_id === questaoDisciplinaId
            ),
        [assuntosCatalogo, questaoDisciplinaId]
    );

    const assuntoCatalogoSelecionado = useMemo(
        () =>
            assuntosCatalogo.find(
                (item) =>
                    item.id === questaoAssuntoId &&
                    item.disciplina_id === questaoDisciplinaId
            ) ?? null,
        [assuntosCatalogo, questaoAssuntoId, questaoDisciplinaId]
    );

    const classificacaoQuestaoCompleta = !!(
        instituicaoSelecionada &&
        cargoSelecionado &&
        bancaSelecionada &&
        disciplinaCatalogoSelecionada &&
        assuntoCatalogoSelecionado
    );

    const sessaoCorrespondeClassificacao =
        !openStudySession ||
        (openStudySession.materia_id === materiaId &&
            openStudySession.assunto_id === assuntoId);

    const podeProcessar =
        !!userId &&
        classificacaoQuestaoCompleta &&
        !!input.trim() &&
        !processando &&
        !salvando;

    const podeAdicionarManual =
        !!userId &&
        classificacaoQuestaoCompleta &&
        !processando &&
        !salvando;

    const podeSalvar =
        classificacaoQuestaoCompleta &&
        questoesProcessadas.length > 0 &&
        questoesProcessadas.every((q) => {
            const alternativasPreenchidas = Object.values(
                q.alternativas
            ).filter((valor) => String(valor ?? "").trim()).length;

            const conteudoBasicoValido =
                q.enunciado.trim() &&
                q.correta.trim() &&
                alternativasPreenchidas >= 2;

            const flashcardValido =
                !q.criarFlashcard ||
                (!q.flashcardGerando &&
                    q.flashcardFrente.trim() &&
                    q.flashcardVerso.trim() &&
                    q.flashcardConfirmado);

            return !!(
                conteudoBasicoValido &&
                q.resultado &&
                flashcardValido
            );
        }) &&
        !processando &&
        !salvando;

    useEffect(() => {
        if (studyTimerRef.current) {
            window.clearInterval(studyTimerRef.current);
            studyTimerRef.current = null;
        }

        if (!openStudySession?.started_at) {
            setStudyElapsedSec(0);
            return;
        }

        const atualizar = () => {
            const inicio = new Date(openStudySession.started_at).getTime();
            const agora = Date.now();

            setStudyElapsedSec(
                Number.isFinite(inicio)
                    ? Math.max(0, Math.floor((agora - inicio) / 1000))
                    : 0
            );
        };

        atualizar();

        studyTimerRef.current = window.setInterval(
            atualizar,
            1000
        );

        return () => {
            if (studyTimerRef.current) {
                window.clearInterval(studyTimerRef.current);
                studyTimerRef.current = null;
            }
        };
    }, [
        openStudySession?.id,
        openStudySession?.started_at,
    ]);

    async function getStudyAccessToken() {
        const {
            data,
            error,
        } = await supabase.auth.getSession();

        const token = data?.session?.access_token;

        if (error || !token) {
            throw new Error(
                "Sua sessão expirou. Entre novamente para controlar o tempo de estudo."
            );
        }

        return token;
    }

    async function carregarNomesDaSessao(
        session: OpenStudySession,
        uid: string
    ) {
        const [materiaReq, assuntoReq] = await Promise.all([
            session.materia_id
                ? supabase
                    .from("materias")
                    .select("nome,edital_id")
                    .eq("user_id", uid)
                    .eq("id", session.materia_id)
                    .maybeSingle()
                : Promise.resolve({
                    data: null,
                    error: null,
                }),
            session.assunto_id
                ? supabase
                    .from("assuntos")
                    .select("nome")
                    .eq("user_id", uid)
                    .eq("id", session.assunto_id)
                    .maybeSingle()
                : Promise.resolve({
                    data: null,
                    error: null,
                }),
        ]);

        const materiaSessao =
            materiaReq.data as
            | {
                nome?: string;
                edital_id?: string | null;
            }
            | null;

        setStudyMateriaNome(
            String(
                materiaSessao?.nome ?? ""
            ).trim()
        );

        setStudyEditalId(
            String(
                materiaSessao?.edital_id ?? ""
            )
        );

        setStudyAssuntoNome(
            String(
                (assuntoReq.data as { nome?: string } | null)
                    ?.nome ?? ""
            ).trim()
        );
    }

    async function carregarSessaoAberta(uid: string) {
        const {
            data,
            error,
        } = await supabase
            .from("study_sessions")
            .select(
                "id,started_at,materia_id,assunto_id,mode"
            )
            .eq("user_id", uid)
            .is("ended_at", null)
            .order("started_at", {
                ascending: false,
            })
            .limit(1)
            .maybeSingle();

        if (error) {
            throw new Error(
                `Não foi possível verificar o cronômetro: ${error.message}`
            );
        }

        if (!data) {
            setOpenStudySession(null);
            setStudyElapsedSec(0);
            setStudyMateriaNome("");
            setStudyAssuntoNome("");
            setStudyEditalId("");
            return;
        }

        const session = data as OpenStudySession;

        setOpenStudySession(session);

        await carregarNomesDaSessao(
            session,
            uid
        );
    }

    async function iniciarEstudo() {
        setStudyError("");
        setStudyMessage("");

        if (!userId) {
            setStudyError("Usuário não autenticado.");
            return;
        }

        if (!materiaId || !assuntoId) {
            setStudyError(
                "Selecione a Disciplina e o Assunto antes de iniciar o estudo."
            );
            return;
        }

        if (openStudySession) {
            setStudyError(
                "Já existe uma sessão de estudo em andamento. Finalize-a antes de iniciar outra."
            );
            return;
        }

        setStudyActionLoading(true);

        try {
            const access_token =
                await getStudyAccessToken();

            const res = await fetch(
                "/api/study-sessions",
                {
                    method: "POST",
                    headers: {
                        "Content-Type":
                            "application/json",
                    },
                    body: JSON.stringify({
                        action: "start",
                        access_token,
                        materia_id: materiaId,
                        assunto_id: assuntoId,
                    }),
                }
            );

            const out = await res
                .json()
                .catch(() => null);

            if (!res.ok) {
                throw new Error(
                    out?.error ||
                    "Falha ao iniciar o tempo de estudo."
                );
            }

            const session =
                out?.session as
                | OpenStudySession
                | undefined;

            if (!session?.id) {
                throw new Error(
                    "A sessão foi iniciada, mas o servidor não retornou seus dados."
                );
            }

            setOpenStudySession(session);

            if (
                session.materia_id === materiaId &&
                session.assunto_id === assuntoId
            ) {
                setStudyMateriaNome(
                    materiaSelecionada?.nome ?? ""
                );
                setStudyAssuntoNome(
                    assuntoSelecionado?.nome ?? ""
                );
                setStudyEditalId(editalId);
            } else {
                await carregarNomesDaSessao(
                    session,
                    userId
                );
            }

            setStudyMessage(
                "Cronômetro iniciado. Você pode estudar em outra plataforma e voltar depois; o tempo continuará sendo calculado pelo horário salvo no banco."
            );
        } catch (e) {
            setStudyError(formatarErro(e));
        } finally {
            setStudyActionLoading(false);
        }
    }

    async function encerrarEstudo(
        silencioso = false
    ): Promise<boolean> {
        setStudyError("");

        if (!openStudySession?.id) {
            return true;
        }

        setStudyActionLoading(true);

        try {
            const access_token =
                await getStudyAccessToken();

            const res = await fetch(
                "/api/study-sessions",
                {
                    method: "POST",
                    headers: {
                        "Content-Type":
                            "application/json",
                    },
                    body: JSON.stringify({
                        action: "stop",
                        access_token,
                        session_id:
                            openStudySession.id,
                    }),
                }
            );

            const out = await res
                .json()
                .catch(() => null);

            if (!res.ok) {
                throw new Error(
                    out?.error ||
                    "Falha ao finalizar o tempo de estudo."
                );
            }

            const duracaoFinal =
                studyElapsedSec;

            setOpenStudySession(null);
            setStudyElapsedSec(0);
            setStudyMateriaNome("");
            setStudyAssuntoNome("");
            setStudyEditalId("");

            if (!silencioso) {
                setStudyMessage(
                    `Sessão finalizada. Tempo contabilizado: ${formatarDuracao(
                        duracaoFinal
                    )}.`
                );
            }

            return true;
        } catch (e) {
            setStudyError(formatarErro(e));
            return false;
        } finally {
            setStudyActionLoading(false);
        }
    }

    async function confirmarTrocaDeClassificacao(
        descricaoDestino: string
    ) {
        if (!openStudySession) {
            return true;
        }

        const confirmou = window.confirm(
            `Existe um estudo em andamento em ${studyMateriaNome || "outra disciplina"} / ${studyAssuntoNome || "outro assunto"} (${formatarDuracao(
                studyElapsedSec
            )}).\n\nPara alterar ${descricaoDestino}, a sessão atual precisa ser finalizada. Deseja finalizar agora?`
        );

        if (!confirmou) {
            return false;
        }

        return encerrarEstudo(true);
    }

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

                try {
                    await carregarSessaoAberta(user.id);
                } catch (e) {
                    setStudyError(formatarErro(e));
                }

                const [
                    editaisReq,
                    instituicoesReq,
                    cargosReq,
                    bancasReq,
                    disciplinasReq,
                    assuntosCatalogoReq,
                ] = await Promise.all([
                    supabase
                        .from("editais")
                        .select("id,nome")
                        .eq("user_id", user.id)
                        .order("nome"),

                    supabase
                        .from("questao_instituicoes")
                        .select("id,nome,sigla,ativo")
                        .eq("user_id", user.id)
                        .eq("ativo", true)
                        .order("nome"),

                    supabase
                        .from("questao_cargos")
                        .select("id,nome,ativo")
                        .eq("user_id", user.id)
                        .eq("ativo", true)
                        .order("nome"),

                    supabase
                        .from("questao_bancas")
                        .select("id,nome,sigla,ativo")
                        .eq("user_id", user.id)
                        .eq("ativo", true)
                        .order("nome"),

                    supabase
                        .from("questao_disciplinas")
                        .select("id,nome,ativo")
                        .eq("user_id", user.id)
                        .eq("ativo", true)
                        .order("nome"),

                    supabase
                        .from("questao_assuntos")
                        .select("id,nome,disciplina_id,ativo")
                        .eq("user_id", user.id)
                        .eq("ativo", true)
                        .order("nome"),
                ]);

                const firstError =
                    editaisReq.error ||
                    instituicoesReq.error ||
                    cargosReq.error ||
                    bancasReq.error ||
                    disciplinasReq.error ||
                    assuntosCatalogoReq.error;

                if (firstError) throw firstError;
                if (cancelled) return;

                const listaEditais =
                    (editaisReq.data ?? []) as Edital[];
                const listaInstituicoes =
                    (instituicoesReq.data ?? []) as QuestaoInstituicao[];
                const listaCargos =
                    (cargosReq.data ?? []) as QuestaoCargo[];
                const listaBancas =
                    (bancasReq.data ?? []) as QuestaoBanca[];
                const listaDisciplinas =
                    (disciplinasReq.data ?? []) as QuestaoDisciplina[];
                const listaAssuntosCatalogo =
                    (assuntosCatalogoReq.data ?? []) as QuestaoAssunto[];

                setEditais(listaEditais);
                setInstituicoes(listaInstituicoes);
                setCargos(listaCargos);
                setBancas(listaBancas);
                setDisciplinasCatalogo(listaDisciplinas);
                setAssuntosCatalogo(listaAssuntosCatalogo);

                const savedInstituicaoId =
                    window.localStorage.getItem(
                        chavePreferencia(user.id, "catalogo_instituicao_id")
                    ) ?? "";
                const savedCargoId =
                    window.localStorage.getItem(
                        chavePreferencia(user.id, "catalogo_cargo_id")
                    ) ?? "";
                const savedBancaId =
                    window.localStorage.getItem(
                        chavePreferencia(user.id, "catalogo_banca_id")
                    ) ?? "";
                const savedDisciplinaId =
                    window.localStorage.getItem(
                        chavePreferencia(user.id, "catalogo_disciplina_id")
                    ) ?? "";
                const savedQuestaoAssuntoId =
                    window.localStorage.getItem(
                        chavePreferencia(user.id, "catalogo_assunto_id")
                    ) ?? "";
                const savedAno =
                    window.localStorage.getItem(
                        chavePreferencia(user.id, "catalogo_ano")
                    ) ?? "";

                if (
                    listaInstituicoes.some(
                        (item) => item.id === savedInstituicaoId
                    )
                ) {
                    setInstituicaoId(savedInstituicaoId);
                }

                if (
                    listaCargos.some(
                        (item) => item.id === savedCargoId
                    )
                ) {
                    setCargoId(savedCargoId);
                }

                if (
                    listaBancas.some(
                        (item) => item.id === savedBancaId
                    )
                ) {
                    setBancaId(savedBancaId);
                }

                if (
                    listaDisciplinas.some(
                        (item) => item.id === savedDisciplinaId
                    )
                ) {
                    setQuestaoDisciplinaId(savedDisciplinaId);
                }

                if (
                    listaAssuntosCatalogo.some(
                        (item) =>
                            item.id === savedQuestaoAssuntoId &&
                            item.disciplina_id === savedDisciplinaId
                    )
                ) {
                    setQuestaoAssuntoId(savedQuestaoAssuntoId);
                }

                if (/^\d{4}$/.test(savedAno)) {
                    setAnoQuestao(savedAno);
                }

                /*
                 * O bloco a seguir restaura SOMENTE o vínculo antigo de estudo
                 * usado pelo cronômetro / tempo de estudo. Ele não classifica a
                 * questão e não interfere na classificação dos flashcards.
                 */
                const savedEdital =
                    window.localStorage.getItem(
                        chavePreferencia(user.id, "last_edital_id")
                    ) ??
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
                    window.localStorage.getItem(
                        chavePreferencia(user.id, "last_materia_id")
                    ) ??
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
                    window.localStorage.getItem(
                        chavePreferencia(user.id, "last_assunto_id")
                    ) ??
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

        void iniciar();

        return () => {
            cancelled = true;
        };
    }, []);

    async function handleEditalChange(
        novoEditalId: string
    ) {
        if (
            openStudySession &&
            novoEditalId !== studyEditalId
        ) {
            const podeTrocar =
                await confirmarTrocaDeClassificacao(
                    "o Edital"
                );

            if (!podeTrocar) return;
        }

        setEditalId(novoEditalId);
        setMateriaId("");
        setAssuntoId("");
        setMaterias([]);
        setAssuntos([]);
        setErro("");
        setMsg("");

        window.sessionStorage.setItem(
            "questoes:last_edital_id",
            novoEditalId
        );

        if (userId) {
            window.localStorage.setItem(
                chavePreferencia(userId, "last_edital_id"),
                novoEditalId
            );
            window.localStorage.removeItem(
                chavePreferencia(userId, "last_materia_id")
            );
            window.localStorage.removeItem(
                chavePreferencia(userId, "last_assunto_id")
            );
        }

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
        if (
            openStudySession &&
            openStudySession.materia_id !== novaMateriaId
        ) {
            const podeTrocar =
                await confirmarTrocaDeClassificacao(
                    "a Disciplina"
                );

            if (!podeTrocar) return;
        }

        setMateriaId(novaMateriaId);
        setAssuntoId("");
        setAssuntos([]);
        setErro("");
        setMsg("");

        window.sessionStorage.setItem(
            "questoes:last_materia_id",
            novaMateriaId
        );

        if (userId) {
            window.localStorage.setItem(
                chavePreferencia(userId, "last_materia_id"),
                novaMateriaId
            );
            window.localStorage.removeItem(
                chavePreferencia(userId, "last_assunto_id")
            );
        }

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

    async function handleAssuntoChange(
        novoAssuntoId: string
    ) {
        if (
            openStudySession &&
            openStudySession.assunto_id !== novoAssuntoId
        ) {
            const podeTrocar =
                await confirmarTrocaDeClassificacao(
                    "o Assunto"
                );

            if (!podeTrocar) return;
        }

        setAssuntoId(novoAssuntoId);
        setErro("");
        setMsg("");

        window.sessionStorage.setItem(
            "questoes:last_assunto_id",
            novoAssuntoId
        );

        if (userId) {
            window.localStorage.setItem(
                chavePreferencia(userId, "last_assunto_id"),
                novoAssuntoId
            );
        }
    }

    function textoCanonicoComSigla(
        item: { nome: string; sigla?: string | null } | null
    ) {
        if (!item) return "";
        return String(item.sigla ?? "").trim() || item.nome.trim();
    }

    function nomeExibicaoComSigla(
        item: { nome: string; sigla?: string | null }
    ) {
        const sigla = String(item.sigla ?? "").trim();
        if (!sigla) return item.nome;
        if (
            sigla.toLocaleLowerCase("pt-BR") ===
            item.nome.toLocaleLowerCase("pt-BR")
        ) {
            return item.nome;
        }
        return `${sigla} — ${item.nome}`;
    }

    function aplicarMetadadoNasQuestoes(
        campo: "instituicao" | "cargo" | "banca",
        valor: string
    ) {
        setQuestoesProcessadas((prev) =>
            prev.map((q) => ({
                ...q,
                [campo]: valor,
            }))
        );
    }

    function salvarPreferenciaCatalogo(
        nome: string,
        valor: string
    ) {
        if (!userId) return;

        window.localStorage.setItem(
            chavePreferencia(userId, nome),
            valor
        );
    }

    function handleInstituicaoChange(id: string) {
        setInstituicaoId(id);
        salvarPreferenciaCatalogo(
            "catalogo_instituicao_id",
            id
        );

        const item =
            instituicoes.find((x) => x.id === id) ?? null;
        aplicarMetadadoNasQuestoes(
            "instituicao",
            textoCanonicoComSigla(item)
        );
    }

    function handleCargoChange(id: string) {
        setCargoId(id);
        salvarPreferenciaCatalogo(
            "catalogo_cargo_id",
            id
        );

        const item =
            cargos.find((x) => x.id === id) ?? null;
        aplicarMetadadoNasQuestoes(
            "cargo",
            item?.nome ?? ""
        );
    }

    function handleBancaChange(id: string) {
        setBancaId(id);
        salvarPreferenciaCatalogo(
            "catalogo_banca_id",
            id
        );

        const item =
            bancas.find((x) => x.id === id) ?? null;
        aplicarMetadadoNasQuestoes(
            "banca",
            textoCanonicoComSigla(item)
        );
    }

    function handleQuestaoDisciplinaChange(id: string) {
        setQuestaoDisciplinaId(id);
        setQuestaoAssuntoId("");
        salvarPreferenciaCatalogo(
            "catalogo_disciplina_id",
            id
        );
        salvarPreferenciaCatalogo(
            "catalogo_assunto_id",
            ""
        );

        setQuestõesLimparDepoisDaClassificacao();
    }

    function handleQuestaoAssuntoChange(id: string) {
        setQuestaoAssuntoId(id);
        salvarPreferenciaCatalogo(
            "catalogo_assunto_id",
            id
        );

        setQuestõesLimparDepoisDaClassificacao();
    }

    function handleAnoQuestaoChange(valor: string) {
        const limpo = valor.replace(/\D/g, "").slice(0, 4);
        setAnoQuestao(limpo);
        salvarPreferenciaCatalogo(
            "catalogo_ano",
            limpo
        );
    }

    function setQuestõesLimparDepoisDaClassificacao() {
        setQuestoesProcessadas([]);
        setFalhasProcessamento([]);
        setResultadoSalvamento([]);
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

        if (!podeAdicionarManual) {
            setErro(
                "Selecione Instituição, Cargo, Banca, Disciplina e Assunto nos catálogos antes de inserir manualmente."
            );
            return;
        }

        const novaQuestao: QuestaoProcessada = {
            localId: criarLocalId(),
            numero: proximoNumeroQuestao(),
            textoOriginal: "",
            origem: "MANUAL",

            instituicao:
                textoCanonicoComSigla(
                    instituicaoSelecionada
                ),
            cargo:
                cargoSelecionado?.nome ?? "",
            modalidade: "Multipla Escolha",
            banca:
                textoCanonicoComSigla(
                    bancaSelecionada
                ),
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

            criarFlashcard: false,
            flashcardFrente: "",
            flashcardVerso: "",
            flashcardGerando: false,
            flashcardErro: "",
            flashcardVersao: 0,
            flashcardConfirmado: false,
            flashcardModo: null,
        };

        setQuestoesProcessadas((prev) => [
            ...prev,
            novaQuestao,
        ]);

        setMsg(
            "Questão manual adicionada. Preencha enunciado, alternativas, gabarito, comentário e informe o resultado."
        );
    }

    function prepararFlashcardManual(localId: string) {
        atualizarQuestao(localId, {
            criarFlashcard: true,
            flashcardModo: "MANUAL",
            flashcardGerando: false,
            flashcardErro: "",
            flashcardConfirmado: false,
        });
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
            flashcardModo: "IA",
            flashcardGerando: true,
            flashcardErro: "",
            flashcardConfirmado: false,
        });

        const prompt = `
Crie UM flashcard de estudo para concurso a partir da questão abaixo.

OBJETIVO
O flashcard deve ajudar o estudante a recuperar ativamente da memória
UMA informação realmente importante cobrada pela questão.

PRINCÍPIOS
1. Crie apenas UM flashcard.
2. Teste apenas UMA ideia principal.
3. A frente deve permitir uma resposta objetiva e não ambígua.
4. O verso deve ser curto, preciso e suficiente para revisar.
5. Não copie a questão inteira.
6. Não transforme todas as alternativas em uma pergunta.
7. Não crie perguntas excessivamente longas.
8. Não use informações irrelevantes apenas para preencher o cartão.

FONTES E CONFIABILIDADE
9. Use esta ordem de prioridade:
   a) gabarito explícito da questão;
   b) comentário/explicação fornecido;
   c) enunciado e alternativas;
   d) conhecimento consolidado apenas quando necessário para compreender
      aquilo que já está sustentado pelo material.

10. O conteúdo do flashcard deve ser coerente com o gabarito e com a
    explicação fornecida.

11. NÃO altere silenciosamente o gabarito da questão.

12. NÃO invente:
    - artigos;
    - incisos;
    - parágrafos;
    - súmulas;
    - temas;
    - precedentes;
    - números;
    - prazos;
    - exceções;
    - conceitos;
    - requisitos;
    quando essas informações não puderem ser sustentadas com segurança.

13. Nunca cite um dispositivo legal por aproximação.
    Se tiver segurança sobre a regra, mas não sobre o número do dispositivo,
    apresente a regra sem inventar a referência.

ATUALIZAÇÃO
14. Não diga que uma regra é "atual", "vigente" ou representa o
    "entendimento atual" se isso não puder ser confirmado pelo material fornecido.

15. Se a questão tratar de legislação, jurisprudência ou regra sujeita a mudança
    e houver indicação de possível desatualização na explicação, NÃO transforme
    uma regra histórica em verdade atual.

16. Quando necessário, preserve o contexto temporal no próprio cartão.
    Exemplo:
    "Segundo o entendimento considerado nesta questão..."
    ou
    "De acordo com a regra cobrada pela banca nesta questão..."

ESCOLHA DO CONTEÚDO
17. Dê preferência ao ponto com maior valor de memorização, como:
    - regra;
    - conceito;
    - requisito;
    - exceção;
    - prazo;
    - competência;
    - vedação;
    - distinção entre institutos;
    - fórmula;
    - hipótese de cabimento;
    - consequência jurídica;
    - erro conceitual explorado pela banca.

18. Quando a questão explorar uma confusão clássica entre dois conceitos,
    prefira criar um cartão que teste essa distinção.

19. Se o estudante ERROU a questão, priorize o conhecimento que impediria
    a repetição daquele erro.

20. Se o estudante ACERTOU a questão, priorize a regra central ou uma
    pegadinha realmente relevante, evitando criar cartão trivial.

QUALIDADE DA FRENTE
21. A frente deve:
    - ser curta;
    - ser específica;
    - exigir recuperação ativa;
    - ter resposta identificável;
    - evitar pistas óbvias da resposta.

22. Evite perguntas como:
    "O que você sabe sobre..."
    "Explique tudo sobre..."
    "Fale sobre..."

23. Prefira formatos como:
    "Qual é...?"
    "Quando...?"
    "Em que hipótese...?"
    "Qual a diferença entre X e Y?"
    "X pode ocorrer quando...?"
    "Qual é a consequência de...?"

QUALIDADE DO VERSO
24. Comece pela resposta direta.

25. Depois, se necessário, acrescente uma explicação curta que ajude
    a evitar confusão futura.

26. Não transforme o verso em um resumo ou aula extensa.

27. Quando houver uma exceção essencial para não memorizar a regra de forma
    errada, inclua-a de maneira curta.

28. Se houver uma pegadinha importante da banca sustentada pela questão,
    ela pode aparecer no final do verso em uma frase curta.

${forcarNovaVersao || questao.flashcardVersao > 0
                ? `
Gere uma NOVA versão, pedagogicamente diferente da anterior.

Não faça apenas uma paráfrase.

Sugestão anterior:
Frente: ${questao.flashcardFrente || "(vazia)"}
Verso: ${questao.flashcardVerso || "(vazio)"}
`
                : ""
            }

Disciplina:
${disciplinaCatalogoSelecionada?.nome ?? ""}

Assunto:
${assuntoCatalogoSelecionado?.nome ?? ""}

Resultado do estudante:
${questao.resultado || "não informado"}

Enunciado:
${questao.enunciado}

Alternativas:
${Object.entries(questao.alternativas)
                .map(([letra, valor]) => `${letra}) ${valor}`)
                .join("\n")}

Gabarito:
${questao.correta}

Explicação / comentário:
${questao.explicacao}

Retorne SOMENTE JSON válido:
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
                flashcardModo: "IA",
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
                flashcardModo: null,
            });
            return;
        }

        atualizarQuestao(questao.localId, {
            criarFlashcard: true,
            flashcardErro: "",
            flashcardConfirmado: false,
            flashcardModo: null,
        });
    }

    async function handleProcessarLote() {
        if (!classificacaoQuestaoCompleta) {
            setErro(
                "Selecione Instituição, Cargo, Banca, Disciplina e Assunto nos catálogos antes de processar."
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

        const numeroInicial = proximoNumeroQuestao();

        setProcessando(true);
        setErro("");
        setMsg("");
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
                            enunciado,
                            obj?.modalidade
                        );

                    prontas.push({
                        localId: criarLocalId(),
                        numero: numeroInicial + i,
                        textoOriginal: questaoTxt,
                        origem: "IA",

                        instituicao:
                            textoCanonicoComSigla(
                                instituicaoSelecionada
                            ),

                        cargo:
                            cargoSelecionado?.nome ?? "",

                        modalidade,

                        banca:
                            textoCanonicoComSigla(
                                bancaSelecionada
                            ),

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
                        flashcardModo: null,
                    });
                } catch (e) {
                    falhas.push({
                        numero: i + 1,
                        erro: formatarErro(e),
                        texto: questaoTxt,
                    });
                }
            }

            setQuestoesProcessadas((prev) => [
                ...prev,
                ...prontas,
            ]);
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

        if (
            !disciplinaCatalogoSelecionada ||
            !assuntoCatalogoSelecionado
        ) {
            throw new Error(
                "A classificação canônica da questão está incompleta para criar o flashcard."
            );
        }

        const { error } = await supabase
            .from("flashcards")
            .insert({
                user_id: userId,

                /*
                 * O flashcard herda diretamente a MESMA classificação canônica
                 * da questão. Não depende de edital, matéria ou assunto antigos.
                 */
                disciplina_catalogo_id:
                    disciplinaCatalogoSelecionada.id,
                assunto_catalogo_id:
                    assuntoCatalogoSelecionado.id,

                /*
                 * Campos legados preservados apenas quando o usuário também
                 * estiver usando o cronômetro com um vínculo de estudo antigo.
                 * Após o SQL de transição, eles podem ficar NULL.
                 */
                edital_id: editalId || null,
                materia_id: materiaId || null,
                assunto_id: assuntoId || null,

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
                `Falha ao registrar o resultado da questão: ${error.message}`
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
            .select("questao_id,resultado,created_at")
            .eq("user_id", userId)
            .order("created_at", { ascending: true });

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
            const lote = questaoIds.slice(i, i + 500);

            const {
                data: questoesData,
                error: questoesError,
            } = await supabase
                .from("questoes")
                .select("id,questao_disciplina_id,questao_assunto_id,materia_id,assunto_id")
                .eq("user_id", userId)
                .in("id", lote);

            if (questoesError) {
                throw new Error(
                    `Falha ao ler questões para as estatísticas: ${questoesError.message}`
                );
            }

            for (const row of questoesData ?? []) {
                questoesMap.set(String(row.id), {
                    materia_id:
                        row.questao_disciplina_id ??
                        row.materia_id ??
                        null,
                    assunto_id:
                        row.questao_assunto_id ??
                        row.assunto_id ??
                        null,
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
            progresso_semanal: progressoSemanal,
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

            return;
        }

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


    async function handleSalvarTodas() {
        if (!userId) {
            setErro("Usuário não autenticado.");
            return;
        }

        if (!classificacaoQuestaoCompleta) {
            setErro(
                "Selecione Instituição, Cargo, Banca, Disciplina e Assunto nos catálogos."
            );
            return;
        }

        if (!questoesProcessadas.length) {
            setErro(
                "Não existem questões processadas para salvar."
            );
            return;
        }

        const questoesIncompletas =
            questoesProcessadas.filter((q) => {
                const alternativasPreenchidas = Object.values(
                    q.alternativas
                ).filter((valor) =>
                    String(valor ?? "").trim()
                ).length;

                return (
                    !q.enunciado.trim() ||
                    !q.correta.trim() ||
                    alternativasPreenchidas < 2
                );
            });

        if (questoesIncompletas.length) {
            setErro(
                "Preencha o enunciado, o gabarito e pelo menos duas alternativas em todas as questões antes de salvar."
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
                "Preencha Frente e Verso de todos os flashcards marcados, manualmente ou com IA."
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

                        /*
                         * Classificação canônica da questão.
                         * Não vinculamos a questão ao edital/matéria/assunto
                         * do plano de estudos.
                         */
                        questao_instituicao_id:
                            instituicaoSelecionada!.id,
                        questao_cargo_id:
                            cargoSelecionado!.id,
                        questao_banca_id:
                            bancaSelecionada!.id,
                        questao_disciplina_id:
                            disciplinaCatalogoSelecionada!.id,
                        questao_assunto_id:
                            assuntoCatalogoSelecionado!.id,
                        ano:
                            /^\d{4}$/.test(anoQuestao)
                                ? Number(anoQuestao)
                                : null,

                        /*
                         * Campos textuais legados são preenchidos SOMENTE
                         * com o valor canônico selecionado, nunca pela IA.
                         * Eles podem ser removidos em uma migração futura.
                         */
                        disciplina:
                            disciplinaCatalogoSelecionada!.nome,
                        assunto:
                            assuntoCatalogoSelecionado!.nome,
                        instituicao:
                            textoCanonicoComSigla(
                                instituicaoSelecionada
                            ),
                        cargo:
                            cargoSelecionado!.nome,
                        modalidade: q.modalidade,
                        banca:
                            textoCanonicoComSigla(
                                bancaSelecionada
                            ),
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

                    // Toda questão acertada já foi salva em `questoes` e em
                    // `question_attempts`. O Caderno de Acertos é opcional: só
                    // recebe a questão quando o usuário marcar explicitamente.
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
                     * Compensação:
                     * se a questão foi criada mas o caderno ou o
                     * flashcard falhar, tentamos remover registros
                     * dependentes antes de remover a própria questão.
                     */
                    if (questaoId) {
                        await Promise.allSettled([
                            supabase
                                .from("flashcards")
                                .delete()
                                .eq(
                                    "questao_origem_id",
                                    questaoId
                                )
                                .eq("user_id", userId),

                            supabase
                                .from("caderno_itens")
                                .delete()
                                .eq("questao_id", questaoId)
                                .eq("user_id", userId),
                        ]);

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
                        Classifique a questão somente pelos catálogos do banco,
                        processe o conteúdo com IA e registre o resultado.
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
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div>
                            <h2 className="text-base font-semibold">
                                1. Classificação da questão
                            </h2>

                            <p className="mt-1 text-xs text-muted-foreground">
                                Instituição, cargo, banca, disciplina e assunto vêm exclusivamente
                                dos catálogos. A IA não cria nem escolhe nenhuma categoria.
                            </p>
                        </div>

                        <a
                            href="/catalogo"
                            className="shrink-0 rounded-xl border border-border bg-background px-3 py-2 text-xs font-semibold text-primary hover:bg-muted"
                        >
                            Administrar catálogos
                        </a>
                    </div>

                    <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-3">
                        <label className="space-y-2">
                            <span className="text-sm font-medium">
                                Instituição
                            </span>

                            <select
                                value={instituicaoId}
                                onChange={(e) =>
                                    handleInstituicaoChange(
                                        e.target.value
                                    )
                                }
                                className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-primary/30"
                            >
                                <option value="">
                                    Selecione a Instituição
                                </option>

                                {instituicoes.map((item) => (
                                    <option
                                        key={item.id}
                                        value={item.id}
                                    >
                                        {nomeExibicaoComSigla(item)}
                                    </option>
                                ))}
                            </select>
                        </label>

                        <label className="space-y-2">
                            <span className="text-sm font-medium">
                                Cargo
                            </span>

                            <select
                                value={cargoId}
                                onChange={(e) =>
                                    handleCargoChange(
                                        e.target.value
                                    )
                                }
                                className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-primary/30"
                            >
                                <option value="">
                                    Selecione o Cargo
                                </option>

                                {cargos.map((item) => (
                                    <option
                                        key={item.id}
                                        value={item.id}
                                    >
                                        {item.nome}
                                    </option>
                                ))}
                            </select>
                        </label>

                        <label className="space-y-2">
                            <span className="text-sm font-medium">
                                Banca
                            </span>

                            <select
                                value={bancaId}
                                onChange={(e) =>
                                    handleBancaChange(
                                        e.target.value
                                    )
                                }
                                className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-primary/30"
                            >
                                <option value="">
                                    Selecione a Banca
                                </option>

                                {bancas.map((item) => (
                                    <option
                                        key={item.id}
                                        value={item.id}
                                    >
                                        {nomeExibicaoComSigla(item)}
                                    </option>
                                ))}
                            </select>
                        </label>

                        <label className="space-y-2">
                            <span className="text-sm font-medium">
                                Disciplina
                            </span>

                            <select
                                value={questaoDisciplinaId}
                                onChange={(e) =>
                                    handleQuestaoDisciplinaChange(
                                        e.target.value
                                    )
                                }
                                className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-primary/30"
                            >
                                <option value="">
                                    Selecione a Disciplina
                                </option>

                                {disciplinasCatalogo.map((item) => (
                                    <option
                                        key={item.id}
                                        value={item.id}
                                    >
                                        {item.nome}
                                    </option>
                                ))}
                            </select>
                        </label>

                        <label className="space-y-2">
                            <span className="text-sm font-medium">
                                Assunto
                            </span>

                            <select
                                value={questaoAssuntoId}
                                disabled={!questaoDisciplinaId}
                                onChange={(e) =>
                                    handleQuestaoAssuntoChange(
                                        e.target.value
                                    )
                                }
                                className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none disabled:opacity-50 focus:ring-2 focus:ring-primary/30"
                            >
                                <option value="">
                                    Selecione o Assunto
                                </option>

                                {assuntosCatalogoDaDisciplina.map(
                                    (item) => (
                                        <option
                                            key={item.id}
                                            value={item.id}
                                        >
                                            {item.nome}
                                        </option>
                                    )
                                )}
                            </select>
                        </label>

                        <label className="space-y-2">
                            <span className="text-sm font-medium">
                                Ano da questão
                                <span className="ml-1 font-normal text-muted-foreground">
                                    (opcional)
                                </span>
                            </span>

                            <input
                                type="text"
                                inputMode="numeric"
                                maxLength={4}
                                value={anoQuestao}
                                onChange={(e) =>
                                    handleAnoQuestaoChange(
                                        e.target.value
                                    )
                                }
                                placeholder="Ex.: 2024"
                                className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-primary/30"
                            />
                        </label>
                    </div>

                    {!instituicoes.length ||
                        !cargos.length ||
                        !bancas.length ||
                        !disciplinasCatalogo.length ? (
                        <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-800">
                            Há um catálogo vazio. Cadastre as categorias em{" "}
                            <a
                                href="/catalogo"
                                className="font-semibold underline"
                            >
                                /catalogo
                            </a>{" "}
                            antes de lançar questões.
                        </div>
                    ) : null}

                    {classificacaoQuestaoCompleta && (
                        <div className="mt-4 rounded-xl bg-muted px-4 py-3 text-sm">
                            <span className="font-medium">
                                Classificação selecionada:
                            </span>{" "}
                            {textoCanonicoComSigla(
                                instituicaoSelecionada
                            )}{" "}
                            / {cargoSelecionado?.nome} /{" "}
                            {textoCanonicoComSigla(
                                bancaSelecionada
                            )}{" "}
                            / {disciplinaCatalogoSelecionada?.nome} /{" "}
                            {assuntoCatalogoSelecionado?.nome}
                            {anoQuestao ? ` / ${anoQuestao}` : ""}
                        </div>
                    )}
                </section>

                <section className="rounded-2xl border border-border bg-card p-5 sm:p-6 shadow-sm">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                        <div>
                            <h2 className="text-base font-semibold">
                                2. Tempo de estudo
                            </h2>

                            <p className="mt-1 text-xs text-muted-foreground">
                                Este vínculo é separado da classificação da questão.
                                Ele existe apenas para o cronômetro / tempo de estudo.
                                Os flashcards já herdam automaticamente a disciplina e
                                o assunto do catálogo canônico da questão.
                            </p>
                        </div>

                        <a
                            href="/tempo-de-estudo"
                            className="text-xs font-medium text-primary hover:underline"
                        >
                            Ver histórico de tempo
                        </a>
                    </div>

                    <div className="mt-5 rounded-2xl border border-border bg-background p-4">
                        <div className="mb-3">
                            <div className="text-sm font-semibold">
                                Vínculo do cronômetro
                            </div>
                            <p className="mt-1 text-xs text-muted-foreground">
                                Opcional para salvar questões e flashcards. Selecione
                                Edital, Disciplina e Assunto aqui somente quando quiser
                                registrar o tempo de estudo nessa estrutura.
                            </p>
                        </div>

                        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                            <label className="space-y-2">
                                <span className="text-xs font-medium">
                                    Edital de estudo
                                </span>

                                <select
                                    value={editalId}
                                    onChange={(e) =>
                                        handleEditalChange(
                                            e.target.value
                                        )
                                    }
                                    className="w-full rounded-xl border border-border bg-card px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-primary/30"
                                >
                                    <option value="">
                                        Selecione
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
                                <span className="text-xs font-medium">
                                    Disciplina do plano
                                </span>

                                <select
                                    value={materiaId}
                                    disabled={!editalId}
                                    onChange={(e) =>
                                        handleMateriaChange(
                                            e.target.value
                                        )
                                    }
                                    className="w-full rounded-xl border border-border bg-card px-3 py-2.5 text-sm outline-none disabled:opacity-50 focus:ring-2 focus:ring-primary/30"
                                >
                                    <option value="">
                                        Selecione
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
                                <span className="text-xs font-medium">
                                    Assunto do plano
                                </span>

                                <select
                                    value={assuntoId}
                                    disabled={!materiaId}
                                    onChange={(e) =>
                                        handleAssuntoChange(
                                            e.target.value
                                        )
                                    }
                                    className="w-full rounded-xl border border-border bg-card px-3 py-2.5 text-sm outline-none disabled:opacity-50 focus:ring-2 focus:ring-primary/30"
                                >
                                    <option value="">
                                        Selecione
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
                    </div>

                    {studyError && (
                        <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                            {studyError}
                        </div>
                    )}

                    {studyMessage && (
                        <div className="mt-4 rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">
                            {studyMessage}
                        </div>
                    )}

                    {openStudySession ? (
                        <div className="mt-5 rounded-2xl border border-green-300 bg-green-50/70 p-5">
                            <div className="flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
                                <div className="min-w-0">
                                    <div className="flex items-center gap-2">
                                        <span className="relative flex h-3 w-3">
                                            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-500 opacity-50" />
                                            <span className="relative inline-flex h-3 w-3 rounded-full bg-green-600" />
                                        </span>

                                        <span className="text-xs font-semibold uppercase tracking-wider text-green-700">
                                            Estudo em andamento
                                        </span>
                                    </div>

                                    <div className="mt-3 text-lg font-semibold text-foreground">
                                        {studyMateriaNome ||
                                            "Disciplina da sessão"}
                                    </div>

                                    <div className="mt-1 text-sm text-muted-foreground">
                                        {studyAssuntoNome ||
                                            "Assunto da sessão"}
                                    </div>

                                    <div className="mt-2 text-xs text-muted-foreground">
                                        Iniciado em{" "}
                                        {new Date(
                                            openStudySession.started_at
                                        ).toLocaleString("pt-BR")}
                                    </div>
                                </div>

                                <div className="flex flex-col items-stretch gap-3 sm:items-end">
                                    <div className="font-mono text-4xl font-bold tabular-nums text-foreground">
                                        {formatarDuracao(
                                            studyElapsedSec
                                        )}
                                    </div>

                                    <button
                                        type="button"
                                        onClick={() =>
                                            encerrarEstudo(false)
                                        }
                                        disabled={studyActionLoading}
                                        className="rounded-xl bg-red-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
                                    >
                                        {studyActionLoading
                                            ? "Finalizando..."
                                            : "Finalizar estudo"}
                                    </button>
                                </div>
                            </div>

                            <div className="mt-4 rounded-xl border border-green-200 bg-white/60 px-4 py-3 text-xs text-green-800">
                                Você pode sair desta página, trocar de aba
                                ou estudar em outro site. O tempo real é
                                calculado pelo horário de início salvo no
                                banco, e não pelo contador visual desta
                                página.
                            </div>

                            {!sessaoCorrespondeClassificacao && (
                                <div className="mt-3 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-xs text-amber-800">
                                    O vínculo de estudo selecionado é
                                    diferente da sessão em andamento.
                                    Isso não altera a classificação nem
                                    bloqueia o processamento das questões,
                                    mas você deve manter o cronômetro na
                                    matéria correta.
                                </div>
                            )}
                        </div>
                    ) : (
                        <div className="mt-5 rounded-2xl border border-border bg-background p-5">
                            <div className="flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
                                <div>
                                    <div className="text-sm font-semibold">
                                        {materiaSelecionada?.nome ||
                                            "Selecione uma Disciplina"}
                                    </div>

                                    <div className="mt-1 text-sm text-muted-foreground">
                                        {assuntoSelecionado?.nome ||
                                            "Selecione um Assunto"}
                                    </div>

                                    <p className="mt-3 max-w-2xl text-xs leading-relaxed text-muted-foreground">
                                        Ao iniciar, uma sessão é criada
                                        em <code>study_sessions</code>.
                                        Ela continua aberta enquanto você
                                        resolve as questões externamente
                                        e só termina quando você clicar
                                        em Finalizar estudo.
                                    </p>
                                </div>

                                <button
                                    type="button"
                                    onClick={iniciarEstudo}
                                    disabled={
                                        studyActionLoading ||
                                        !materiaId ||
                                        !assuntoId
                                    }
                                    className="shrink-0 rounded-xl bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
                                >
                                    {studyActionLoading
                                        ? "Iniciando..."
                                        : "Iniciar estudo"}
                                </button>
                            </div>
                        </div>
                    )}
                </section>

                <section className="rounded-2xl border border-border bg-card p-5 sm:p-6 shadow-sm">
                    <h2 className="text-base font-semibold">
                        3. Adicione as questões
                    </h2>

                    <p className="mt-1 text-xs text-muted-foreground">
                        Escolha se deseja estruturar a questão com IA ou cadastrar tudo manualmente. Os dois caminhos salvam no mesmo banco e usam o mesmo fluxo de estatísticas, cadernos e flashcards canônicos.
                    </p>

                    <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <button
                            type="button"
                            onClick={() => setModoInsercao("IA")}
                            className={`rounded-xl border px-4 py-3 text-left transition ${modoInsercao === "IA"
                                ? "border-primary bg-primary/10 text-foreground"
                                : "border-border bg-background hover:bg-muted"
                                }`}
                        >
                            <span className="block text-sm font-semibold">
                                Inserir com IA
                            </span>
                            <span className="mt-1 block text-xs text-muted-foreground">
                                Cole uma ou várias questões. A IA organiza enunciado, alternativas, gabarito e comentário para você revisar.
                            </span>
                        </button>

                        <button
                            type="button"
                            onClick={() => setModoInsercao("MANUAL")}
                            className={`rounded-xl border px-4 py-3 text-left transition ${modoInsercao === "MANUAL"
                                ? "border-primary bg-primary/10 text-foreground"
                                : "border-border bg-background hover:bg-muted"
                                }`}
                        >
                            <span className="block text-sm font-semibold">
                                Inserir manualmente
                            </span>
                            <span className="mt-1 block text-xs text-muted-foreground">
                                Não depende da IA. Você preenche enunciado, alternativas, gabarito, comentário e, se quiser, o flashcard.
                            </span>
                        </button>
                    </div>

                    {modoInsercao === "IA" ? (
                        <>
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
                                        : "Processar com IA"}
                                </button>

                                <span className="text-xs text-muted-foreground">
                                    Se a IA estiver indisponível, troque para Inserir manualmente sem perder a classificação selecionada.
                                </span>
                            </div>
                        </>
                    ) : (
                        <div className="mt-4 rounded-2xl border border-border bg-background p-4 sm:p-5">
                            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                                <div>
                                    <div className="text-sm font-semibold text-foreground">
                                        Cadastro manual
                                    </div>
                                    <p className="mt-1 max-w-2xl text-xs leading-relaxed text-muted-foreground">
                                        Crie uma ficha vazia e preencha os dados abaixo. Você pode adicionar várias questões manuais ao mesmo lote. Nenhuma chamada à IA é necessária.
                                    </p>
                                </div>

                                <button
                                    type="button"
                                    onClick={adicionarQuestaoManual}
                                    disabled={!podeAdicionarManual}
                                    className="shrink-0 rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
                                >
                                    + Adicionar questão manual
                                </button>
                            </div>

                            {!podeAdicionarManual && (
                                <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-800">
                                    Selecione Instituição, Cargo, Banca, Disciplina e Assunto no catálogo para liberar o cadastro manual.
                                </div>
                            )}
                        </div>
                    )}
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
                                4. Preencha, revise e informe o resultado
                            </h2>

                            <p className="mt-1 text-sm text-muted-foreground">
                                Complete os campos obrigatórios e marque cada questão como Acertei ou Errei antes do salvamento.
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
                                                <div className="flex flex-wrap items-center gap-2">
                                                    <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                                                        Questão{" "}
                                                        {q.numero}
                                                    </div>
                                                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${q.origem === "MANUAL"
                                                        ? "bg-slate-100 text-slate-700"
                                                        : "bg-primary/10 text-primary"
                                                        }`}>
                                                        {q.origem === "MANUAL" ? "Manual" : "IA"}
                                                    </span>
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

                                        <div className="mt-5 grid grid-cols-1 sm:grid-cols-3 gap-3 rounded-xl border border-border bg-muted/40 p-4">
                                            <div>
                                                <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
                                                    Instituição
                                                </div>
                                                <div className="mt-1 text-sm font-medium">
                                                    {q.instituicao || "Não informada"}
                                                </div>
                                            </div>

                                            <div>
                                                <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
                                                    Cargo
                                                </div>
                                                <div className="mt-1 text-sm font-medium">
                                                    {q.cargo || "Não informado"}
                                                </div>
                                            </div>

                                            <div>
                                                <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
                                                    Banca
                                                </div>
                                                <div className="mt-1 text-sm font-medium">
                                                    {q.banca || "Não informada"}
                                                </div>
                                            </div>

                                            <div className="sm:col-span-3 text-xs text-muted-foreground">
                                                Estes valores vêm exclusivamente dos catálogos selecionados na seção 1. Para criar ou editar categorias, use a página /catalogo.
                                            </div>
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
                                                        {disciplinaCatalogoSelecionada?.nome ?? "Disciplina"}
                                                    </strong>
                                                    {" / "}
                                                    <strong>
                                                        {assuntoCatalogoSelecionado?.nome ?? "Assunto"}
                                                    </strong>
                                                    .
                                                </div>
                                            )}

                                        {q.resultado ===
                                            "ACERTO" && (
                                                <div className="mt-3 rounded-xl bg-green-50 px-4 py-3 text-xs text-green-700">
                                                    Esta tentativa será registrada como acerto nas estatísticas de{" "}
                                                    <strong>
                                                        {disciplinaCatalogoSelecionada?.nome ?? "Disciplina"}
                                                    </strong>
                                                    {" / "}
                                                    <strong>
                                                        {assuntoCatalogoSelecionado?.nome ?? "Assunto"}
                                                    </strong>
                                                    .
                                                </div>
                                            )}

                                        {q.resultado ===
                                            "ACERTO" && (
                                                <label
                                                    className={`mt-4 flex cursor-pointer items-start gap-3 rounded-xl border p-4 transition ${q.salvarNoCadernoAcertos
                                                        ? "border-green-300 bg-green-50/70"
                                                        : "border-border bg-background hover:bg-muted/40"
                                                        }`}
                                                >
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
                                                        className="mt-1 h-4 w-4 accent-green-600"
                                                    />

                                                    <span className="min-w-0">
                                                        <span className="block text-sm font-semibold text-foreground">
                                                            Guardar esta questão no Caderno de Acertos
                                                        </span>

                                                        <span className="mt-1 block text-xs leading-relaxed text-muted-foreground">
                                                            Opcional. O acerto já será salvo no banco de questões e contabilizado nas estatísticas mesmo se você não marcar esta opção. Marque somente as questões boas, clássicas, difíceis ou importantes que deseja revisar novamente no futuro.
                                                        </span>

                                                        {q.salvarNoCadernoAcertos && (
                                                            <span className="mt-2 block text-xs font-semibold text-green-700">
                                                                ✓ Esta questão também será adicionada ao Caderno de Acertos.
                                                            </span>
                                                        )}
                                                    </span>
                                                </label>
                                            )}

                                        <label className="mt-4 flex items-start gap-3 rounded-xl border border-border p-4">
                                            <input
                                                type="checkbox"
                                                checked={q.criarFlashcard}
                                                onChange={(e) =>
                                                    handleToggleFlashcard(
                                                        q,
                                                        e.target.checked
                                                    )
                                                }
                                                className="mt-0.5"
                                            />

                                            <span>
                                                <span className="block text-sm font-medium">
                                                    Criar flashcard desta questão
                                                </span>

                                                <span className="block text-xs text-muted-foreground mt-1">
                                                    O flashcard pode ser gerado com IA ou preenchido totalmente à mão. Se a IA estiver indisponível, o cadastro manual continua funcionando normalmente.
                                                </span>
                                            </span>
                                        </label>

                                        {q.criarFlashcard && (
                                            <div className="mt-4 rounded-2xl border border-primary/20 bg-primary/5 p-4 sm:p-5">
                                                <div>
                                                    <div className="text-sm font-semibold text-foreground">
                                                        Flashcard
                                                    </div>
                                                    <div className="mt-1 text-xs text-muted-foreground">
                                                        Escolha como deseja criar Frente e Verso. Em ambos os casos você poderá editar e deverá confirmar antes de salvar.
                                                    </div>
                                                </div>

                                                <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
                                                    <button
                                                        type="button"
                                                        onClick={() =>
                                                            gerarFlashcardComIA(
                                                                q.localId,
                                                                q.flashcardVersao > 0
                                                            )
                                                        }
                                                        disabled={q.flashcardGerando}
                                                        className={`rounded-xl border px-4 py-3 text-left transition disabled:cursor-not-allowed disabled:opacity-50 ${q.flashcardModo === "IA"
                                                            ? "border-primary bg-primary/10"
                                                            : "border-border bg-background hover:bg-muted"
                                                            }`}
                                                    >
                                                        <span className="block text-sm font-semibold">
                                                            {q.flashcardGerando
                                                                ? "Gerando com IA..."
                                                                : q.flashcardVersao > 0
                                                                    ? "Gerar nova versão com IA"
                                                                    : "Gerar com IA"}
                                                        </span>
                                                        <span className="mt-1 block text-xs text-muted-foreground">
                                                            Usa enunciado, alternativas, gabarito, comentário e seu resultado para sugerir um cartão.
                                                        </span>
                                                    </button>

                                                    <button
                                                        type="button"
                                                        onClick={() =>
                                                            prepararFlashcardManual(
                                                                q.localId
                                                            )
                                                        }
                                                        disabled={q.flashcardGerando}
                                                        className={`rounded-xl border px-4 py-3 text-left transition disabled:cursor-not-allowed disabled:opacity-50 ${q.flashcardModo === "MANUAL"
                                                            ? "border-primary bg-primary/10"
                                                            : "border-border bg-background hover:bg-muted"
                                                            }`}
                                                    >
                                                        <span className="block text-sm font-semibold">
                                                            Preencher manualmente
                                                        </span>
                                                        <span className="mt-1 block text-xs text-muted-foreground">
                                                            Não faz chamada à IA. Digite a Frente e o Verso diretamente.
                                                        </span>
                                                    </button>
                                                </div>

                                                {q.flashcardErro && (
                                                    <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                                                        <div className="font-medium">
                                                            Não foi possível gerar o flashcard com IA.
                                                        </div>
                                                        <div className="mt-1 text-xs">
                                                            {q.flashcardErro}
                                                        </div>
                                                        <button
                                                            type="button"
                                                            onClick={() =>
                                                                prepararFlashcardManual(
                                                                    q.localId
                                                                )
                                                            }
                                                            className="mt-3 rounded-lg border border-red-200 bg-white px-3 py-2 text-xs font-semibold text-red-700 hover:bg-red-50"
                                                        >
                                                            Preencher manualmente agora
                                                        </button>
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
                                                    q.flashcardModo === null &&
                                                    !q.flashcardFrente.trim() &&
                                                    !q.flashcardVerso.trim() &&
                                                    !q.flashcardErro && (
                                                        <div className="mt-4 rounded-xl border border-dashed border-border bg-card px-4 py-8 text-center text-sm text-muted-foreground">
                                                            Escolha Gerar com IA ou Preencher manualmente.
                                                        </div>
                                                    )}

                                                {!q.flashcardGerando &&
                                                    (q.flashcardModo === "MANUAL" ||
                                                        q.flashcardFrente.trim() ||
                                                        q.flashcardVerso.trim()) && (
                                                        <>
                                                            {q.flashcardFrente.trim() &&
                                                                q.flashcardVerso.trim() && (
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
                                                                )}

                                                            <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3">
                                                                <label className="space-y-1">
                                                                    <span className="text-xs text-muted-foreground">
                                                                        Frente
                                                                    </span>
                                                                    <textarea
                                                                        value={q.flashcardFrente}
                                                                        onChange={(e) =>
                                                                            atualizarQuestao(
                                                                                q.localId,
                                                                                {
                                                                                    flashcardFrente:
                                                                                        e.target.value,
                                                                                }
                                                                            )
                                                                        }
                                                                        placeholder="Digite a pergunta curta que deseja recuperar da memória."
                                                                        className="w-full min-h-[110px] rounded-xl border border-border bg-background p-3 text-sm"
                                                                    />
                                                                </label>

                                                                <label className="space-y-1">
                                                                    <span className="text-xs text-muted-foreground">
                                                                        Verso
                                                                    </span>
                                                                    <textarea
                                                                        value={q.flashcardVerso}
                                                                        onChange={(e) =>
                                                                            atualizarQuestao(
                                                                                q.localId,
                                                                                {
                                                                                    flashcardVerso:
                                                                                        e.target.value,
                                                                                }
                                                                            )
                                                                        }
                                                                        placeholder="Digite a resposta objetiva e suficiente para revisão."
                                                                        className="w-full min-h-[110px] rounded-xl border border-border bg-background p-3 text-sm"
                                                                    />
                                                                </label>
                                                            </div>

                                                            <div className="mt-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 rounded-xl border border-border bg-background p-4">
                                                                <div>
                                                                    <div className="text-sm font-medium">
                                                                        {q.flashcardConfirmado
                                                                            ? "Flashcard confirmado"
                                                                            : "Confirme o flashcard antes de salvar"}
                                                                    </div>
                                                                    <div className="mt-1 text-xs text-muted-foreground">
                                                                        {q.flashcardConfirmado
                                                                            ? `Esta versão ${q.flashcardModo === "MANUAL" ? "manual" : "gerada com IA"} será salva junto com a questão.`
                                                                            : "Qualquer edição invalida a confirmação e exige confirmar novamente."}
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
                                                                        ? "Flashcard confirmado"
                                                                        : "Confirmar flashcard"}
                                                                </button>
                                                            </div>
                                                        </>
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
                                        Preencha enunciado, gabarito e pelo menos duas alternativas em cada questão, marque Acertei ou Errei e, se criar flashcard, preencha Frente e Verso e confirme o cartão.
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
                    Supabase • cadastro manual disponível • IA opcional via Gemini
                </footer>
            </div>
        </main>
    );
}