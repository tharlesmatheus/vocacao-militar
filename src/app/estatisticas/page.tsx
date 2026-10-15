"use client";

import { useEffect, useMemo, useState } from "react";
import {
    Activity,
    BookOpenText,
    CheckCircle2,
    Clock3,
    FileText,
    Layers3,
    RotateCcw,
    Target,
    XCircle,
    Percent,
    ChevronRight,
} from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { todasAsLinhas } from "@/lib/todasAsLinhas";
import { DesempenhoMeta } from "@/components/painel/DesempenhoMeta";
import { SeletorSegmentado } from "@/components/app/Pagina";
import {
    ResponsiveContainer,
    AreaChart,
    Area,
    XAxis,
    YAxis,
    Tooltip,
    CartesianGrid,
} from "recharts";

/* ========================================================================== */
/* Tipos                                                                      */
/* ========================================================================== */

type Daily = {
    dia: string;
    minutos: number;
    questoes: number;
    revisoes: number;
};

/** Uma linha da tabela "Desempenho por disciplina" (ou de um assunto dentro dela). */
type LinhaDesempenho = {
    id: string;
    nome: string;
    seg: number;
    total: number;
    corretas: number;
    assuntos: LinhaDesempenho[];
};
type PeriodMode = "7" | "30" | "90" | "custom" | "all";
type ReviewMethod = "CADERNO" | "FLASHCARD" | "RESUMO";

type SessionRow = {
    duration_seconds: number | null;
    started_at: string;
    disciplina_catalogo_id?: string | null;
    assunto_catalogo_id?: string | null;
    materia_id?: string | null;
    assunto_id?: string | null;
};

type AttemptRow = {
    questao_id: string;
    resultado: "ACERTO" | "ERRO";
    created_at: string;
};

type QuestaoMeta = {
    id: string;
    questao_disciplina_id: string | null;
    questao_assunto_id: string | null;
    materia_id?: string | null;
    assunto_id?: string | null;
};

type ReviewProgressMeta = {
    item_id: string;
    method: ReviewMethod;
    materia_id: string | null;
    assunto_id: string | null;
};

type ReviewEventRow = {
    event_type: "REVIEW_COMPLETED" | "LEGACY_REVIEW_COUNT" | string;
    source_id: string | null;
    metadata: unknown;
    occurred_at: string;
};

type PeriodBounds = {
    start: Date | null;
    endExclusive: Date | null;
};

type ReviewTotals = {
    total: number;
    caderno: number;
    flashcards: number;
    resumos: number;
};

type MetricCard = {
    label: string;
    value: string | number;
    icon: React.ReactNode;
    tone: string;
    helper?: string;
};

/* ========================================================================== */
/* Constantes / helpers                                                       */
/* ========================================================================== */

const WEAK_THRESHOLD = 70;
const MIN_QTD_FRACO = 5;

function startOfLocalDay(t = Date.now()) {
    const d = new Date(t);
    d.setHours(0, 0, 0, 0);
    return d;
}

function addLocalDays(date: Date, days: number) {
    const d = new Date(date);
    d.setDate(d.getDate() + days);
    d.setHours(0, 0, 0, 0);
    return d;
}

function localDateKey(date: Date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const d = String(date.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
}

function parseInputDate(value: string) {
    const [y, m, d] = value.split("-").map(Number);
    if (!y || !m || !d) return null;

    const date = new Date(y, m - 1, d);
    date.setHours(0, 0, 0, 0);
    return Number.isNaN(date.getTime()) ? null : date;
}

function fmtHMS(seconds: number) {
    const s = Math.max(0, Math.floor(seconds));
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    return h ? `${h}h ${m}m` : `${m}m`;
}

function fmtDatePtBr(date: Date) {
    return date.toLocaleDateString("pt-BR", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
    });
}

function resolveBounds(
    mode: PeriodMode,
    customStart: string,
    customEnd: string
): PeriodBounds {
    if (mode === "all") {
        return { start: null, endExclusive: null };
    }

    if (mode === "custom") {
        const start = parseInputDate(customStart);
        const end = parseInputDate(customEnd);

        if (!start || !end) {
            throw new Error("Informe a data de início e a data de fim.");
        }

        if (start.getTime() > end.getTime()) {
            throw new Error("A data de início não pode ser posterior à data de fim.");
        }

        return {
            start,
            endExclusive: addLocalDays(end, 1),
        };
    }

    const days = Number(mode);
    const today = startOfLocalDay();
    const start = addLocalDays(today, -(days - 1));

    return {
        start,
        endExclusive: addLocalDays(today, 1),
    };
}

function rangeLabel(mode: PeriodMode, customStart: string, customEnd: string) {
    if (mode === "all") return "Todo o período";
    if (mode === "7" || mode === "30" || mode === "90") {
        return `Últimos ${mode} dias`;
    }

    const start = parseInputDate(customStart);
    const end = parseInputDate(customEnd);

    if (!start || !end) return "Período personalizado";
    return `${fmtDatePtBr(start)} até ${fmtDatePtBr(end)}`;
}

function safePct(corretas: number, total: number) {
    return total > 0 ? Math.round((corretas / total) * 100) : 0;
}

function normalizeCatalogName(value: string | null | undefined) {
    return String(value ?? "")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLocaleLowerCase("pt-BR")
        .replace(/[^a-z0-9]+/g, "");
}

function buildSeries(
    start: Date,
    endInclusive: Date,
    byDayMin: Record<string, number>,
    byDayQ: Record<string, number>,
    byDayReview: Record<string, number>
): Daily[] {
    const out: Daily[] = [];
    let cursor = new Date(start);
    cursor.setHours(0, 0, 0, 0);

    const end = new Date(endInclusive);
    end.setHours(0, 0, 0, 0);

    while (cursor.getTime() <= end.getTime()) {
        const key = localDateKey(cursor);
        out.push({
            dia: cursor.toLocaleDateString("pt-BR", {
                day: "2-digit",
                month: "2-digit",
            }),
            minutos: byDayMin[key] ?? 0,
            questoes: byDayQ[key] ?? 0,
            revisoes: byDayReview[key] ?? 0,
        });
        cursor = addLocalDays(cursor, 1);
    }

    return out;
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return !!value && typeof value === "object" && !Array.isArray(value);
}

function metaString(metadata: unknown, key: string): string | null {
    if (!isRecord(metadata)) return null;
    const value = metadata[key];
    return typeof value === "string" ? value : null;
}

function metaNumber(metadata: unknown, key: string): number | null {
    if (!isRecord(metadata)) return null;
    const value = Number(metadata[key]);
    return Number.isFinite(value) ? value : null;
}

function normalizeReviewMethod(value: unknown): ReviewMethod | null {
    const method = String(value ?? "").toUpperCase();
    if (method === "CADERNO" || method === "FLASHCARD" || method === "RESUMO") {
        return method;
    }
    return null;
}

function reviewMapKey(method: ReviewMethod, itemId: string) {
    return `${method}:${itemId}`;
}

/* ========================================================================== */
/* Página                                                                      */
/* ========================================================================== */

export default function EstatisticasPage() {
    const [periodMode, setPeriodMode] = useState<PeriodMode>("30");
    const [customStartInput, setCustomStartInput] = useState("");
    const [customEndInput, setCustomEndInput] = useState("");
    const [customStartApplied, setCustomStartApplied] = useState("");
    const [customEndApplied, setCustomEndApplied] = useState("");
    const [periodError, setPeriodError] = useState<string | null>(null);

    const [loading, setLoading] = useState(true);
    const [erro, setErro] = useState<string | null>(null);
    const [reviewWarning, setReviewWarning] = useState<string | null>(null);

    const [materias, setMaterias] = useState<Array<{ id: string; nome: string }>>([]);
    const [assuntos, setAssuntos] = useState<
        Array<{ id: string; nome: string; disciplina_id: string }>
    >([]);
    const [materiaId, setMateriaId] = useState("");
    const [assuntoId, setAssuntoId] = useState("");

    const [matName, setMatName] = useState<Record<string, string>>({});
    const [assName, setAssName] = useState<Record<string, string>>({});

    const [tempoTotalSeg, setTempoTotalSeg] = useState(0);
    const [sessoes, setSessoes] = useState(0);
    const [questoesTotal, setQuestoesTotal] = useState(0);
    const [questoesCertas, setQuestoesCertas] = useState(0);
    const [questoesErradas, setQuestoesErradas] = useState(0);
    const [acertoTotal, setAcertoTotal] = useState(0);
    const [reviewTotals, setReviewTotals] = useState<ReviewTotals>({
        total: 0,
        caderno: 0,
        flashcards: 0,
        resumos: 0,
    });

    const [serie, setSerie] = useState<Daily[]>([]);
    const [tabela, setTabela] = useState<LinhaDesempenho[]>([]);

    const periodoAtual = useMemo(
        () => rangeLabel(periodMode, customStartApplied, customEndApplied),
        [periodMode, customStartApplied, customEndApplied]
    );

    /*
     * Catálogo global/canônico.
     * A UI inteira usa questao_disciplinas + questao_assuntos.
     */
    useEffect(() => {
        let cancelled = false;

        (async () => {
            const { data: auth } = await supabase.auth.getUser();
            const user = auth?.user;
            if (!user?.id || cancelled) return;

            const [disciplinasReq, assuntosReq] = await Promise.all([
                supabase
                    .from("questao_disciplinas")
                    .select("id,nome")
                    .eq("user_id", user.id)
                    .eq("ativo", true)
                    .order("nome"),
                supabase
                    .from("questao_assuntos")
                    .select("id,nome,disciplina_id")
                    .eq("user_id", user.id)
                    .eq("ativo", true)
                    .order("nome"),
            ]);

            if (cancelled) return;

            if (disciplinasReq.error) {
                setErro(disciplinasReq.error.message);
                return;
            }

            if (assuntosReq.error) {
                setErro(assuntosReq.error.message);
                return;
            }

            const dList = (disciplinasReq.data ?? []) as Array<{
                id: string;
                nome: string;
            }>;

            const aList = (assuntosReq.data ?? []) as Array<{
                id: string;
                nome: string;
                disciplina_id: string;
            }>;

            setMaterias(dList);
            setAssuntos(aList);

            const dMap: Record<string, string> = {};
            dList.forEach((d) => (dMap[d.id] = d.nome));
            setMatName(dMap);

            const aMap: Record<string, string> = {};
            aList.forEach((a) => (aMap[a.id] = a.nome));
            setAssName(aMap);
        })();

        return () => {
            cancelled = true;
        };
    }, []);

    useEffect(() => {
        let cancelled = false;

        (async () => {
            setLoading(true);
            setErro(null);
            setReviewWarning(null);

            try {
                const { data: auth } = await supabase.auth.getUser();
                const user = auth?.user;

                if (!user?.id) {
                    throw new Error("Sem usuário autenticado.");
                }

                // Capture o ID após o guard. Isso evita o TS18047 dentro
                // das funções assíncronas internas, onde o TypeScript não
                // mantém o narrowing do objeto `user`.
                const userId = user.id;

                const bounds = resolveBounds(
                    periodMode,
                    customStartApplied,
                    customEndApplied
                );

                const applyDateBounds = <T,>(query: T, column: string): T => {
                    let q: any = query;

                    if (bounds.start) {
                        q = q.gte(column, bounds.start.toISOString());
                    }

                    if (bounds.endExclusive) {
                        q = q.lt(column, bounds.endExclusive.toISOString());
                    }

                    return q as T;
                };

                /*
                 * Mapas canônicos por nome.
                 * Servem apenas para compatibilidade com registros antigos de
                 * materias/assuntos e pomodoro. Dados novos usam IDs canônicos.
                 */
                const canonicalDiscByNorm = new Map<string, string>();
                for (const d of materias) {
                    canonicalDiscByNorm.set(
                        normalizeCatalogName(d.nome),
                        d.id
                    );
                }

                const canonicalAssByKey = new Map<string, string>();
                for (const a of assuntos) {
                    canonicalAssByKey.set(
                        `${a.disciplina_id}:${normalizeCatalogName(a.nome)}`,
                        a.id
                    );
                }

                const [legacyMateriasReq, legacyAssuntosReq] =
                    await Promise.all([
                        supabase
                            .from("materias")
                            .select("id,nome")
                            .eq("user_id", userId),
                        supabase
                            .from("assuntos")
                            .select("id,nome,materia_id")
                            .eq("user_id", userId),
                    ]);

                const legacyMateriaToCanonical: Record<string, string> = {};
                const legacyMateriaName: Record<string, string> = {};

                for (const row of legacyMateriasReq.data ?? []) {
                    const id = String(row.id);
                    const nome = String(row.nome ?? "");
                    legacyMateriaName[id] = nome;

                    const canonicalId =
                        canonicalDiscByNorm.get(
                            normalizeCatalogName(nome)
                        ) ?? "";

                    if (canonicalId) {
                        legacyMateriaToCanonical[id] = canonicalId;
                    }
                }

                const legacyAssuntoToCanonical: Record<string, string> = {};

                for (const row of legacyAssuntosReq.data ?? []) {
                    const legacyMateriaId = String(
                        row.materia_id ?? ""
                    );

                    const canonicalDiscId =
                        legacyMateriaToCanonical[legacyMateriaId];

                    if (!canonicalDiscId) continue;

                    const key =
                        `${canonicalDiscId}:${normalizeCatalogName(
                            String(row.nome ?? "")
                        )}`;

                    const canonicalAssId =
                        canonicalAssByKey.get(key) ?? "";

                    if (canonicalAssId) {
                        legacyAssuntoToCanonical[String(row.id)] =
                            canonicalAssId;
                    }
                }

                const resolvePair = (
                    canonicalDisciplinaId?: string | null,
                    canonicalAssuntoId?: string | null,
                    legacyMateriaId?: string | null,
                    legacyAssuntoId?: string | null
                ) => {
                    const disciplinaId =
                        canonicalDisciplinaId ||
                        (legacyMateriaId
                            ? legacyMateriaToCanonical[
                            legacyMateriaId
                            ]
                            : "") ||
                        null;

                    let assuntoId =
                        canonicalAssuntoId ||
                        (legacyAssuntoId
                            ? legacyAssuntoToCanonical[
                            legacyAssuntoId
                            ]
                            : "") ||
                        null;

                    if (assuntoId) {
                        const assunto = assuntos.find(
                            (a) => a.id === assuntoId
                        );

                        if (
                            disciplinaId &&
                            assunto &&
                            assunto.disciplina_id !== disciplinaId
                        ) {
                            assuntoId = null;
                        }
                    }

                    return {
                        disciplinaId,
                        assuntoId,
                    };
                };

                /* -------------------------------------------------------------- */
                /* Tempo de estudo                                                */
                /* -------------------------------------------------------------- */

                let pomodoroQuery = supabase
                    .from("pomodoro_sessions")
                    .select(
                        "duration_seconds,started_at,materia_id,assunto_id"
                    )
                    .eq("user_id", userId)
                    .eq("phase", "study")
                    .not("duration_seconds", "is", null)
                    .order("started_at", { ascending: true });

                let studyQuery = supabase
                    .from("study_sessions")
                    .select(
                        "duration_seconds,started_at,disciplina_catalogo_id,assunto_catalogo_id,materia_id,assunto_id"
                    )
                    .eq("user_id", userId)
                    .not("duration_seconds", "is", null)
                    .order("started_at", { ascending: true });

                pomodoroQuery = applyDateBounds(
                    pomodoroQuery,
                    "started_at"
                );

                studyQuery = applyDateBounds(
                    studyQuery,
                    "started_at"
                );

                /* -------------------------------------------------------------- */
                /* Questões                                                       */
                /* -------------------------------------------------------------- */

                let attemptQuery = supabase
                    .from("question_attempts")
                    .select("questao_id,resultado,created_at")
                    .eq("user_id", userId)
                    .order("created_at", { ascending: true });

                attemptQuery = applyDateBounds(
                    attemptQuery,
                    "created_at"
                );

                /* -------------------------------------------------------------- */
                /* Revisões                                                       */
                /* -------------------------------------------------------------- */

                let reviewEventQuery = supabase
                    .from("gamification_events")
                    .select(
                        "event_type,source_id,metadata,occurred_at"
                    )
                    .eq("user_id", userId)
                    .order("occurred_at", { ascending: true });

                if (periodMode === "all") {
                    reviewEventQuery = reviewEventQuery.in(
                        "event_type",
                        ["REVIEW_COMPLETED", "LEGACY_REVIEW_COUNT"]
                    );
                } else {
                    reviewEventQuery = reviewEventQuery.eq(
                        "event_type",
                        "REVIEW_COMPLETED"
                    );

                    reviewEventQuery = applyDateBounds(
                        reviewEventQuery,
                        "occurred_at"
                    );
                }

                const [
                    pomodoroRes,
                    studyRes,
                    attemptRes,
                    reviewEventsRes,
                ] = await Promise.all([
                    todasAsLinhas<any>(pomodoroQuery),
                    todasAsLinhas<any>(studyQuery),
                    todasAsLinhas<any>(attemptQuery),
                    todasAsLinhas<any>(reviewEventQuery),
                ]);

                if (pomodoroRes.error && studyRes.error) {
                    throw new Error(
                        `Falha ao carregar tempo de estudo: ${studyRes.error?.message ||
                        pomodoroRes.error?.message ||
                        "erro desconhecido"
                        }`
                    );
                }

                if (attemptRes.error) {
                    throw new Error(
                        `Falha ao carregar tentativas de questões: ${attemptRes.error.message}`
                    );
                }

                const rawSessionRows: SessionRow[] = [
                    ...((pomodoroRes.error
                        ? []
                        : pomodoroRes.data ?? []) as SessionRow[]),
                    ...((studyRes.error
                        ? []
                        : studyRes.data ?? []) as SessionRow[]),
                ];

                const sessionRows = rawSessionRows
                    .map((session) => {
                        const pair = resolvePair(
                            session.disciplina_catalogo_id,
                            session.assunto_catalogo_id,
                            session.materia_id,
                            session.assunto_id
                        );

                        return {
                            ...session,
                            canonicalDisciplinaId:
                                pair.disciplinaId,
                            canonicalAssuntoId: pair.assuntoId,
                        };
                    })
                    .filter((session) => {
                        if (
                            materiaId &&
                            session.canonicalDisciplinaId !==
                            materiaId
                        ) {
                            return false;
                        }

                        if (
                            assuntoId &&
                            session.canonicalAssuntoId !== assuntoId
                        ) {
                            return false;
                        }

                        return true;
                    });

                const byDayMin: Record<string, number> = {};
                const byMatSec: Record<string, number> = {};
                const byAssSec: Record<string, number> = {};
                // De qual disciplina é cada assunto (para agrupar na tabela).
                const discDoAssunto: Record<string, string> = {};
                let totalSec = 0;

                for (const session of sessionRows) {
                    const dur = Math.max(
                        0,
                        Number(session.duration_seconds ?? 0)
                    );

                    totalSec += dur;

                    const d = new Date(session.started_at);
                    if (!Number.isNaN(d.getTime())) {
                        const key = localDateKey(d);
                        byDayMin[key] =
                            (byDayMin[key] ?? 0) +
                            Math.round(dur / 60);
                    }

                    if (session.canonicalDisciplinaId) {
                        byMatSec[
                            session.canonicalDisciplinaId
                        ] =
                            (byMatSec[
                                session.canonicalDisciplinaId
                            ] ?? 0) + dur;
                    }

                    if (session.canonicalAssuntoId && session.canonicalDisciplinaId) {
                        discDoAssunto[session.canonicalAssuntoId] ??= session.canonicalDisciplinaId;
                    }

                    if (session.canonicalAssuntoId) {
                        byAssSec[
                            session.canonicalAssuntoId
                        ] =
                            (byAssSec[
                                session.canonicalAssuntoId
                            ] ?? 0) + dur;
                    }
                }

                /* -------------------------------------------------------------- */
                /* Desempenho das questões                                        */
                /* -------------------------------------------------------------- */

                const attempts =
                    (attemptRes.data ?? []) as AttemptRow[];

                const questaoIds = Array.from(
                    new Set(
                        attempts
                            .map((a) => a.questao_id)
                            .filter(Boolean)
                    )
                );

                const questaoMap = new Map<
                    string,
                    {
                        id: string;
                        disciplinaId: string | null;
                        assuntoId: string | null;
                    }
                >();

                for (
                    let i = 0;
                    i < questaoIds.length;
                    i += 500
                ) {
                    const lote = questaoIds.slice(i, i + 500);
                    if (!lote.length) continue;

                    const { data: qs, error: qsError } =
                        await supabase
                            .rpc("questoes_por_ids", { p_ids: lote })
                            .select(
                                "id,questao_disciplina_id,questao_assunto_id,materia_id,assunto_id"
                            );

                    if (qsError) {
                        throw new Error(
                            `Falha ao carregar classificação das questões: ${qsError.message}`
                        );
                    }

                    for (const q of (qs ?? []) as QuestaoMeta[]) {
                        const pair = resolvePair(
                            q.questao_disciplina_id,
                            q.questao_assunto_id,
                            q.materia_id,
                            q.assunto_id
                        );

                        questaoMap.set(String(q.id), {
                            id: String(q.id),
                            disciplinaId: pair.disciplinaId,
                            assuntoId: pair.assuntoId,
                        });
                    }
                }

                const attemptsFiltered = attempts.filter(
                    (attempt) => {
                        const meta = questaoMap.get(
                            attempt.questao_id
                        );

                        if (!meta) return false;

                        if (
                            materiaId &&
                            meta.disciplinaId !== materiaId
                        ) {
                            return false;
                        }

                        if (
                            assuntoId &&
                            meta.assuntoId !== assuntoId
                        ) {
                            return false;
                        }

                        return true;
                    }
                );

                const matAgg: Record<
                    string,
                    { total: number; corretas: number }
                > = {};

                const assAgg: Record<
                    string,
                    { total: number; corretas: number }
                > = {};

                const byDayQ: Record<string, number> = {};
                let corretasTotal = 0;

                for (const attempt of attemptsFiltered) {
                    const meta = questaoMap.get(
                        attempt.questao_id
                    );

                    if (!meta) continue;

                    const acertou =
                        attempt.resultado === "ACERTO";

                    if (acertou) corretasTotal += 1;

                    if (meta.disciplinaId) {
                        const row =
                            matAgg[meta.disciplinaId] ?? {
                                total: 0,
                                corretas: 0,
                            };

                        row.total += 1;
                        if (acertou) row.corretas += 1;
                        matAgg[meta.disciplinaId] = row;
                    }

                    if (meta.assuntoId && meta.disciplinaId) {
                        discDoAssunto[meta.assuntoId] ??= meta.disciplinaId;
                    }

                    if (meta.assuntoId) {
                        const row =
                            assAgg[meta.assuntoId] ?? {
                                total: 0,
                                corretas: 0,
                            };

                        row.total += 1;
                        if (acertou) row.corretas += 1;
                        assAgg[meta.assuntoId] = row;
                    }

                    const attemptDate = new Date(
                        attempt.created_at
                    );

                    if (!Number.isNaN(attemptDate.getTime())) {
                        const key = localDateKey(attemptDate);
                        byDayQ[key] = (byDayQ[key] ?? 0) + 1;
                    }
                }

                /* -------------------------------------------------------------- */
                /* Revisões: classificação resolvida pelo item-fonte canônico     */
                /* -------------------------------------------------------------- */

                const nextReviewTotals: ReviewTotals = {
                    total: 0,
                    caderno: 0,
                    flashcards: 0,
                    resumos: 0,
                };

                const byDayReview: Record<string, number> = {};
                const exactReviewTimestamps: number[] = [];

                if (reviewEventsRes.error) {
                    setReviewWarning(
                        "Não foi possível carregar as estatísticas de revisão."
                    );
                } else {
                    const events =
                        (reviewEventsRes.data ??
                            []) as ReviewEventRow[];

                    const idsByMethod: Record<
                        ReviewMethod,
                        string[]
                    > = {
                        CADERNO: [],
                        FLASHCARD: [],
                        RESUMO: [],
                    };

                    for (const event of events) {
                        const sourceId = event.source_id
                            ? String(event.source_id)
                            : "";

                        const method = normalizeReviewMethod(
                            metaString(
                                event.metadata,
                                "method"
                            )
                        );

                        if (!sourceId || !method) continue;
                        idsByMethod[method].push(sourceId);
                    }

                    for (const method of Object.keys(
                        idsByMethod
                    ) as ReviewMethod[]) {
                        idsByMethod[method] = Array.from(
                            new Set(idsByMethod[method])
                        );
                    }

                    const reviewMetaMap = new Map<
                        string,
                        {
                            disciplinaId: string | null;
                            assuntoId: string | null;
                        }
                    >();

                    async function carregarMetaEmLotes(
                        method: ReviewMethod,
                        ids: string[]
                    ) {
                        for (
                            let i = 0;
                            i < ids.length;
                            i += 500
                        ) {
                            const lote = ids.slice(i, i + 500);
                            if (!lote.length) continue;

                            if (method === "CADERNO") {
                                const { data, error } =
                                    await supabase
                                        .rpc("questoes_por_ids", { p_ids: lote })
                                        .select(
                                            "id,questao_disciplina_id,questao_assunto_id,materia_id,assunto_id"
                                        );

                                if (error) throw error;

                                for (const row of data ?? []) {
                                    const pair = resolvePair(
                                        row.questao_disciplina_id,
                                        row.questao_assunto_id,
                                        row.materia_id,
                                        row.assunto_id
                                    );

                                    reviewMetaMap.set(
                                        reviewMapKey(
                                            method,
                                            String(row.id)
                                        ),
                                        pair
                                    );
                                }

                                continue;
                            }

                            const table =
                                method === "FLASHCARD"
                                    ? "flashcards"
                                    : "resumos";

                            const { data, error } =
                                await supabase
                                    .from(table)
                                    .select(
                                        "id,disciplina_catalogo_id,assunto_catalogo_id,materia_id,assunto_id"
                                    )
                                    .eq("user_id", userId)
                                    .in("id", lote);

                            if (error) throw error;

                            for (const row of data ?? []) {
                                const pair = resolvePair(
                                    row.disciplina_catalogo_id,
                                    row.assunto_catalogo_id,
                                    row.materia_id,
                                    row.assunto_id
                                );

                                reviewMetaMap.set(
                                    reviewMapKey(
                                        method,
                                        String(row.id)
                                    ),
                                    pair
                                );
                            }
                        }
                    }

                    try {
                        await Promise.all([
                            carregarMetaEmLotes(
                                "CADERNO",
                                idsByMethod.CADERNO
                            ),
                            carregarMetaEmLotes(
                                "FLASHCARD",
                                idsByMethod.FLASHCARD
                            ),
                            carregarMetaEmLotes(
                                "RESUMO",
                                idsByMethod.RESUMO
                            ),
                        ]);
                    } catch {
                        if (materiaId || assuntoId) {
                            setReviewWarning(
                                "Algumas revisões não têm disciplina definida e aparecem fora dos filtros."
                            );
                        }
                    }

                    for (const event of events) {
                        const sourceId = event.source_id
                            ? String(event.source_id)
                            : "";

                        const method = normalizeReviewMethod(
                            metaString(
                                event.metadata,
                                "method"
                            )
                        );

                        if (!sourceId || !method) continue;

                        if (materiaId || assuntoId) {
                            const meta = reviewMetaMap.get(
                                reviewMapKey(
                                    method,
                                    sourceId
                                )
                            );

                            if (!meta) continue;

                            if (
                                materiaId &&
                                meta.disciplinaId !== materiaId
                            ) {
                                continue;
                            }

                            if (
                                assuntoId &&
                                meta.assuntoId !== assuntoId
                            ) {
                                continue;
                            }
                        }

                        const weight =
                            event.event_type ===
                                "LEGACY_REVIEW_COUNT"
                                ? Math.max(
                                    0,
                                    Math.floor(
                                        metaNumber(
                                            event.metadata,
                                            "count"
                                        ) ?? 0
                                    )
                                )
                                : 1;

                        if (weight <= 0) continue;

                        nextReviewTotals.total += weight;

                        if (method === "CADERNO") {
                            nextReviewTotals.caderno += weight;
                        }

                        if (method === "FLASHCARD") {
                            nextReviewTotals.flashcards +=
                                weight;
                        }

                        if (method === "RESUMO") {
                            nextReviewTotals.resumos += weight;
                        }

                        if (
                            event.event_type ===
                            "REVIEW_COMPLETED"
                        ) {
                            const d = new Date(
                                event.occurred_at
                            );

                            if (!Number.isNaN(d.getTime())) {
                                const key = localDateKey(d);
                                byDayReview[key] =
                                    (byDayReview[key] ?? 0) + 1;
                                exactReviewTimestamps.push(
                                    d.getTime()
                                );
                            }
                        }
                    }
                }

                if (cancelled) return;

                setTempoTotalSeg(totalSec);
                setSessoes(sessionRows.length);

                const erradasTotal = Math.max(
                    0,
                    attemptsFiltered.length - corretasTotal
                );

                setQuestoesTotal(attemptsFiltered.length);
                setQuestoesCertas(corretasTotal);
                setQuestoesErradas(erradasTotal);
                setAcertoTotal(
                    safePct(
                        corretasTotal,
                        attemptsFiltered.length
                    )
                );

                setReviewTotals(nextReviewTotals);

                {
                    const linha = (id: string, nome: string): LinhaDesempenho => ({
                        id,
                        nome,
                        seg: 0,
                        total: 0,
                        corretas: 0,
                        assuntos: [],
                    });
                    const discs: Record<string, LinhaDesempenho> = {};
                    const pegarDisc = (id: string) =>
                        (discs[id] ??= linha(id, matName[id] || "Disciplina sem nome"));

                    for (const [id, seg] of Object.entries(byMatSec)) pegarDisc(id).seg += seg;
                    for (const [id, v] of Object.entries(matAgg)) {
                        const d = pegarDisc(id);
                        d.total += v.total;
                        d.corretas += v.corretas;
                    }

                    const assLinhas: Record<string, LinhaDesempenho> = {};
                    const pegarAss = (id: string) =>
                        (assLinhas[id] ??= linha(id, assName[id] || "Assunto sem nome"));
                    for (const [id, seg] of Object.entries(byAssSec)) pegarAss(id).seg += seg;
                    for (const [id, v] of Object.entries(assAgg)) {
                        const a = pegarAss(id);
                        a.total += v.total;
                        a.corretas += v.corretas;
                    }
                    for (const a of Object.values(assLinhas)) {
                        const discId = discDoAssunto[a.id];
                        if (discId) pegarDisc(discId).assuntos.push(a);
                    }

                    setTabela(
                        Object.values(discs).filter(
                            (d) => d.seg > 0 || d.total > 0
                        )
                    );
                }

                let seriesStart: Date;
                let seriesEnd: Date;

                if (
                    bounds.start &&
                    bounds.endExclusive
                ) {
                    seriesStart = bounds.start;
                    seriesEnd = addLocalDays(
                        bounds.endExclusive,
                        -1
                    );
                } else {
                    const timestamps: number[] = [];

                    for (const s of sessionRows) {
                        const t = new Date(
                            s.started_at
                        ).getTime();

                        if (Number.isFinite(t)) {
                            timestamps.push(t);
                        }
                    }

                    for (const a of attemptsFiltered) {
                        const t = new Date(
                            a.created_at
                        ).getTime();

                        if (Number.isFinite(t)) {
                            timestamps.push(t);
                        }
                    }

                    timestamps.push(
                        ...exactReviewTimestamps
                    );

                    if (timestamps.length) {
                        seriesStart = startOfLocalDay(
                            Math.min(...timestamps)
                        );

                        seriesEnd = startOfLocalDay(
                            Math.max(...timestamps)
                        );
                    } else {
                        seriesStart = startOfLocalDay();
                        seriesEnd = startOfLocalDay();
                    }
                }

                setSerie(
                    buildSeries(
                        seriesStart,
                        seriesEnd,
                        byDayMin,
                        byDayQ,
                        byDayReview
                    )
                );
            } catch (e: any) {
                if (!cancelled) {
                    setErro(
                        e?.message ||
                        "Falha ao carregar estatísticas."
                    );

                    setTempoTotalSeg(0);
                    setSessoes(0);
                    setQuestoesTotal(0);
                    setQuestoesCertas(0);
                    setQuestoesErradas(0);
                    setAcertoTotal(0);
                    setReviewTotals({
                        total: 0,
                        caderno: 0,
                        flashcards: 0,
                        resumos: 0,
                    });
                    setSerie([]);
                    setTabela([]);
                }
            } finally {
                if (!cancelled) {
                    setLoading(false);
                }
            }
        })();

        return () => {
            cancelled = true;
        };
    }, [
        periodMode,
        customStartApplied,
        customEndApplied,
        materiaId,
        assuntoId,
        matName,
        assName,
        materias,
        assuntos,
    ]);

    const cards = useMemo<MetricCard[]>(
        () => [
            {
                label: "Tempo total",
                value: fmtHMS(tempoTotalSeg),
                icon: <Clock3 size={20} />,
                tone: "text-primary",
            },
            {
                label: "Sessões",
                value: sessoes,
                icon: <Activity size={20} />,
                tone: "text-primary",
            },
            {
                label: "Questões",
                value: questoesTotal,
                icon: <Target size={20} />,
                tone: "text-primary",
                helper:
                    questoesTotal > 0
                        ? `${questoesCertas} certas • ${questoesErradas} erradas`
                        : "Nenhuma questão no período",
            },
            {
                label: "Acertos",
                value: questoesCertas,
                icon: <CheckCircle2 size={20} />,
                tone: "text-primary",
                helper:
                    questoesTotal > 0
                        ? `${acertoTotal}% das questões`
                        : "0% das questões",
            },
            {
                label: "Erros",
                value: questoesErradas,
                icon: <XCircle size={20} />,
                tone: "text-primary",
                helper:
                    questoesTotal > 0
                        ? `${100 - acertoTotal}% das questões`
                        : "0% das questões",
            },
            {
                label: "Aproveitamento",
                value: `${acertoTotal}%`,
                icon: <Percent size={20} />,
                tone: "text-primary",
                helper:
                    questoesTotal > 0
                        ? `${questoesCertas}/${questoesTotal} acertos`
                        : "Sem questões no período",
            },
            {
                label: "Revisões feitas",
                value: reviewTotals.total,
                icon: <RotateCcw size={20} />,
                tone: "text-primary",
                helper: "Caderno + flashcards + resumos",
            },
            {
                label: "Caderno revisado",
                value: reviewTotals.caderno,
                icon: <BookOpenText size={20} />,
                tone: "text-primary",
            },
            {
                label: "Flashcards revisados",
                value: reviewTotals.flashcards,
                icon: <Layers3 size={20} />,
                tone: "text-primary",
            },
            {
                label: "Resumos revisados",
                value: reviewTotals.resumos,
                icon: <FileText size={20} />,
                tone: "text-primary",
            },
        ],
        [
            tempoTotalSeg,
            sessoes,
            questoesTotal,
            questoesCertas,
            questoesErradas,
            acertoTotal,
            reviewTotals,
        ]
    );

    const assuntosFiltrados = useMemo(
        () =>
            materiaId
                ? assuntos.filter((a) => a.disciplina_id === materiaId)
                : assuntos,
        [assuntos, materiaId]
    );

    const reviewDistribution = useMemo(
        () => [
            {
                label: "Caderno de Erros",
                value: reviewTotals.caderno,
                pct: reviewTotals.total
                    ? Math.round((reviewTotals.caderno / reviewTotals.total) * 100)
                    : 0,
            },
            {
                label: "Flashcards",
                value: reviewTotals.flashcards,
                pct: reviewTotals.total
                    ? Math.round((reviewTotals.flashcards / reviewTotals.total) * 100)
                    : 0,
            },
            {
                label: "Resumos",
                value: reviewTotals.resumos,
                pct: reviewTotals.total
                    ? Math.round((reviewTotals.resumos / reviewTotals.total) * 100)
                    : 0,
            },
        ],
        [reviewTotals]
    );

    function aplicarPeriodoPersonalizado() {
        setPeriodError(null);

        const start = parseInputDate(customStartInput);
        const end = parseInputDate(customEndInput);

        if (!start || !end) {
            setPeriodError("Informe a data de início e a data de fim.");
            return;
        }

        if (start.getTime() > end.getTime()) {
            setPeriodError("A data de início não pode ser posterior à data de fim.");
            return;
        }

        setCustomStartApplied(customStartInput);
        setCustomEndApplied(customEndInput);
        setPeriodMode("custom");
    }

    function selecionarPreset(mode: "7" | "30" | "90" | "all") {
        setPeriodError(null);
        setPeriodMode(mode);
    }

    return (
        <div className="flex w-full flex-col gap-6">
            <div className="flex flex-col gap-4">
                <div className="flex flex-col gap-4 border-b border-border pb-5 md:flex-row md:items-end md:justify-between">
                    <div>
                        <h1 className="text-3xl font-extrabold text-foreground">Estatísticas</h1>
                        <p className="mt-1.5 text-sm text-muted-foreground">
                            Período: {periodoAtual}
                        </p>
                    </div>

                    <SeletorSegmentado
                        rotulo="Período"
                        opcoes={[
                            { id: "7", nome: "7 dias" },
                            { id: "30", nome: "30 dias" },
                            { id: "90", nome: "90 dias" },
                            { id: "all", nome: "Tudo" },
                        ]}
                        valor={periodMode as string}
                        aoMudar={(id) => selecionarPreset(id as "7" | "30" | "90" | "all")}
                    />
                </div>

                <DesempenhoMeta />

                <div className="rounded-xl border border-border bg-card p-4">
                    <div className="flex flex-wrap items-end gap-3">
                        <label className="flex flex-col gap-1">
                            <span className="text-xs text-muted-foreground">
                                Data de início
                            </span>
                            <input
                                type="date"
                                value={customStartInput}
                                onChange={(e) => {
                                    setCustomStartInput(e.target.value);
                                    setPeriodError(null);
                                }}
                                className="rounded-lg border border-border bg-muted px-3 py-2 text-sm text-foreground"
                            />
                        </label>

                        <label className="flex flex-col gap-1">
                            <span className="text-xs text-muted-foreground">
                                Data de fim
                            </span>
                            <input
                                type="date"
                                value={customEndInput}
                                min={customStartInput || undefined}
                                onChange={(e) => {
                                    setCustomEndInput(e.target.value);
                                    setPeriodError(null);
                                }}
                                className="rounded-lg border border-border bg-muted px-3 py-2 text-sm text-foreground"
                            />
                        </label>

                        <button
                            type="button"
                            onClick={aplicarPeriodoPersonalizado}
                            className={`rounded-lg border px-4 py-2 text-sm font-medium transition ${periodMode === "custom"
                                ? "border-primary bg-primary text-primary-foreground"
                                : "border-border bg-muted hover:bg-muted/80"
                                }`}
                        >
                            Aplicar período
                        </button>
                    </div>

                    {periodError && (
                        <p className="mt-3 text-sm text-destructive">
                            {periodError}
                        </p>
                    )}
                </div>
            </div>

            <div className="flex flex-wrap gap-3 rounded-xl border border-border bg-card p-4">
                <div className="flex flex-col gap-1">
                    <span className="text-xs text-muted-foreground">Disciplina</span>
                    <select
                        className="rounded-lg border border-border bg-muted px-3 py-2 text-sm"
                        value={materiaId}
                        onChange={(e) => {
                            setMateriaId(e.target.value);
                            setAssuntoId("");
                        }}
                    >
                        <option value="">Todas</option>
                        {materias.map((m) => (
                            <option key={m.id} value={m.id}>
                                {m.nome}
                            </option>
                        ))}
                    </select>
                </div>

                <div className="flex flex-col gap-1">
                    <span className="text-xs text-muted-foreground">Assunto</span>
                    <select
                        className="rounded-lg border border-border bg-muted px-3 py-2 text-sm"
                        value={assuntoId}
                        onChange={(e) => setAssuntoId(e.target.value)}
                        disabled={!assuntosFiltrados.length}
                    >
                        <option value="">Todos</option>
                        {assuntosFiltrados.map((a) => (
                            <option key={a.id} value={a.id}>
                                {a.nome}
                            </option>
                        ))}
                    </select>
                </div>

                {(materiaId || assuntoId) && (
                    <button
                        type="button"
                        className="ml-auto rounded-lg border border-border bg-muted px-3 py-2 text-sm"
                        onClick={() => {
                            setMateriaId("");
                            setAssuntoId("");
                        }}
                    >
                        Limpar filtro
                    </button>
                )}
            </div>

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
                {cards.map((c) => (
                    <div
                        key={c.label}
                        className="relative overflow-hidden rounded-lg border border-border bg-card p-4 shadow-sm"
                    >
                        <span aria-hidden className="absolute inset-x-0 top-0 h-[2px] bg-primary/50" />
                        <div className="font-titulo text-sm font-semibold uppercase tracking-wider text-muted-foreground">{c.label}</div>
                        <div className="mt-1 flex items-end justify-between gap-3">
                            <div className="text-2xl font-extrabold tracking-tight text-foreground">
                                {c.value}
                            </div>
                            <div className={c.tone}>{c.icon}</div>
                        </div>
                        {c.helper && (
                            <div className="mt-1 text-[11px] text-muted-foreground">{c.helper}</div>
                        )}
                    </div>
                ))}
            </div>

            {reviewWarning && (
                <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-800 dark:text-amber-300">
                    {reviewWarning}
                </div>
            )}

            {periodMode === "all" && reviewTotals.total > 0 && (
                <div className="rounded-xl border border-border bg-muted/40 px-4 py-3 text-xs text-muted-foreground">
                    Em “Tudo”, revisões muito antigas entram no total, mas não aparecem no
                    gráfico diário porque não temos a data exata de cada uma.
                </div>
            )}

            <div className="rounded-xl border border-border bg-card p-4">
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                    <h2 className="font-semibold">
                        Evolução diária {materiaId || assuntoId ? "(filtrado)" : "(geral)"}
                    </h2>
                    <span className="text-xs text-muted-foreground">
                        Minutos × Questões × Revisões • {periodoAtual}
                    </span>
                </div>

                <div className="h-72">
                    <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={serie} margin={{ left: 6, right: 6 }}>
                            <defs>
                                <linearGradient id="gMin" x1="0" y1="0" x2="0" y2="1">
                                    <stop
                                        offset="5%"
                                        stopColor="var(--primary)"
                                        stopOpacity={0.45}
                                    />
                                    <stop
                                        offset="95%"
                                        stopColor="var(--primary)"
                                        stopOpacity={0}
                                    />
                                </linearGradient>
                                <linearGradient id="gQst" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor="#22d3ee" stopOpacity={0.4} />
                                    <stop offset="95%" stopColor="#22d3ee" stopOpacity={0} />
                                </linearGradient>
                                <linearGradient id="gRev" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor="#818cf8" stopOpacity={0.35} />
                                    <stop offset="95%" stopColor="#818cf8" stopOpacity={0} />
                                </linearGradient>
                            </defs>

                            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                            <XAxis
                                dataKey="dia"
                                stroke="var(--muted-foreground)"
                                minTickGap={24}
                            />
                            <YAxis
                                stroke="var(--muted-foreground)"
                                allowDecimals={false}
                            />
                            <Tooltip
                                contentStyle={{
                                    background: "var(--popover)",
                                    border: "1px solid var(--border)",
                                    color: "var(--foreground)",
                                    borderRadius: 8,
                                }}
                            />
                            <Area
                                type="monotone"
                                dataKey="minutos"
                                name="Minutos"
                                stroke="var(--primary)"
                                fill="url(#gMin)"
                                strokeWidth={2}
                            />
                            <Area
                                type="monotone"
                                dataKey="questoes"
                                name="Questões"
                                stroke="#22d3ee"
                                fill="url(#gQst)"
                                strokeWidth={2}
                            />
                            <Area
                                type="monotone"
                                dataKey="revisoes"
                                name="Revisões"
                                stroke="#818cf8"
                                fill="url(#gRev)"
                                strokeWidth={2}
                            />
                        </AreaChart>
                    </ResponsiveContainer>
                </div>
            </div>

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                <Panel title="Distribuição das revisões">
                    <div className="space-y-4 py-1">
                        {reviewDistribution.map((item) => (
                            <div key={item.label}>
                                <div className="mb-1.5 flex items-center justify-between gap-3 text-sm">
                                    <span className="font-medium">{item.label}</span>
                                    <span className="text-muted-foreground">
                                        {item.value} • {item.pct}%
                                    </span>
                                </div>
                                <div className="h-2 overflow-hidden rounded-full bg-muted">
                                    <div
                                        className="h-full rounded-full bg-primary transition-all"
                                        style={{ width: `${Math.min(100, item.pct)}%` }}
                                    />
                                </div>
                            </div>
                        ))}

                        {reviewTotals.total === 0 && (
                            <div className="py-4 text-sm text-muted-foreground">
                                Nenhuma revisão registrada no período selecionado.
                            </div>
                        )}
                    </div>
                </Panel>

                <Panel title="Resumo de revisão">
                    <div className="grid grid-cols-2 gap-3">
                        <MiniStat label="Total" value={reviewTotals.total} />
                        <MiniStat label="Caderno" value={reviewTotals.caderno} />
                        <MiniStat label="Flashcards" value={reviewTotals.flashcards} />
                        <MiniStat label="Resumos" value={reviewTotals.resumos} />
                    </div>
                </Panel>
            </div>

            <TabelaDesempenho linhas={tabela} carregando={loading} />

            {erro && <p className="text-destructive">{erro}</p>}
            {loading && <p className="text-muted-foreground">Carregando…</p>}
        </div>
    );
}

/* ========================================================================== */
/* Componentes auxiliares                                                     */
/* ========================================================================== */

function Panel({
    title,
    children,
}: {
    title: string;
    children: React.ReactNode;
}) {
    return (
        <div className="rounded-xl border border-border bg-card p-4">
            <h3 className="mb-2 font-semibold">{title}</h3>
            {children}
        </div>
    );
}

function MiniStat({ label, value }: { label: string; value: number }) {
    return (
        <div className="rounded-xl border border-border bg-muted/50 p-4">
            <div className="text-xs text-muted-foreground">{label}</div>
            <div className="mt-1 text-2xl font-bold">{value}</div>
        </div>
    );
}

/* -------------------------------------------------------------------------- */
/* Desempenho por disciplina (tabela; clique abre os assuntos)                 */
/* -------------------------------------------------------------------------- */

type OrdemTabela = "estudo" | "acerto";

function fmtTempoCurto(seg: number) {
    const min = Math.round(seg / 60);
    if (min <= 0) return seg > 0 ? "< 1 min" : "—";
    if (min < 60) return `${min} min`;
    const h = Math.floor(min / 60);
    const m = min % 60;
    return m ? `${h}h ${String(m).padStart(2, "0")}min` : `${h}h`;
}

/** Com menos de MIN_QTD_FRACO questões a porcentagem ainda não diz muita coisa. */
function SeloAcerto({ total, corretas }: { total: number; corretas: number }) {
    if (!total) return <span className="text-muted-foreground">—</span>;
    const pct = safePct(corretas, total);
    const poucas = total < MIN_QTD_FRACO;
    const cor = poucas
        ? "bg-muted text-muted-foreground"
        : pct >= WEAK_THRESHOLD
            ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
            : pct >= 50
                ? "bg-amber-500/15 text-amber-700 dark:text-amber-300"
                : "bg-red-500/15 text-red-700 dark:text-red-300";
    return (
        <span className="inline-flex flex-wrap items-center gap-x-2 gap-y-1 sm:justify-end">
            <span className="text-xs text-muted-foreground">
                {corretas} de {total}
            </span>
            <span
                className={`rounded-full px-2 py-0.5 text-xs font-bold tabular-nums ${cor}`}
                title={poucas ? `Poucas questões: responda pelo menos ${MIN_QTD_FRACO} para o número ficar confiável.` : undefined}
            >
                {pct}%
            </span>
        </span>
    );
}

function ordenarLinhas(linhas: LinhaDesempenho[], ordem: OrdemTabela) {
    const copia = [...linhas];
    if (ordem === "acerto") {
        // Primeiro quem tem questões suficientes, do pior para o melhor.
        return copia.sort((a, b) => {
            const okA = a.total >= MIN_QTD_FRACO ? 0 : a.total ? 1 : 2;
            const okB = b.total >= MIN_QTD_FRACO ? 0 : b.total ? 1 : 2;
            if (okA !== okB) return okA - okB;
            return safePct(a.corretas, a.total) - safePct(b.corretas, b.total) || b.total - a.total;
        });
    }
    return copia.sort((a, b) => b.seg - a.seg || b.total - a.total || a.nome.localeCompare(b.nome, "pt-BR"));
}

function LinhaTabela({
    l,
    maxSeg,
    nivel,
    aberta,
    aoAlternar,
}: {
    l: LinhaDesempenho;
    maxSeg: number;
    nivel: 0 | 1;
    aberta?: boolean;
    aoAlternar?: () => void;
}) {
    const temFilhos = nivel === 0 && l.assuntos.length > 0;
    const largura = maxSeg > 0 ? Math.max(l.seg > 0 ? 4 : 0, Math.round((l.seg / maxSeg) * 100)) : 0;
    const nome = (
        <span className={`flex min-w-0 items-center gap-1.5 ${nivel ? "pl-6 text-sm text-muted-foreground" : "font-medium"}`}>
            {nivel === 0 && (
                <ChevronRight
                    size={16}
                    aria-hidden
                    className={`shrink-0 transition-transform ${temFilhos ? "" : "invisible"} ${aberta ? "rotate-90" : ""}`}
                />
            )}
            <span className="truncate" title={l.nome}>
                {l.nome}
            </span>
        </span>
    );

    const conteudo = (
        <>
            <div className="col-span-3 min-w-0 sm:col-span-1">{nome}</div>
            <div className="flex flex-col gap-0.5 sm:flex-row sm:items-center sm:justify-end sm:gap-2">
                <span className="text-[11px] text-muted-foreground sm:hidden">Tempo</span>
                <span className="text-sm tabular-nums sm:w-16 sm:shrink-0 sm:text-right">{fmtTempoCurto(l.seg)}</span>
                <span className="hidden h-1.5 w-20 overflow-hidden rounded-full bg-muted md:block" aria-hidden>
                    <span className="block h-full rounded-full bg-primary" style={{ width: `${largura}%` }} />
                </span>
            </div>
            <div className="flex flex-col gap-0.5 sm:flex-row sm:items-center sm:justify-end sm:gap-2">
                <span className="text-[11px] text-muted-foreground sm:hidden">Questões</span>
                <span className="text-sm tabular-nums">{l.total || "—"}</span>
            </div>
            <div className="flex flex-col items-start gap-0.5 sm:flex-row sm:items-center sm:justify-end sm:gap-2">
                <span className="text-[11px] text-muted-foreground sm:hidden">Acerto</span>
                <SeloAcerto total={l.total} corretas={l.corretas} />
            </div>
        </>
    );

    // Celular: nome numa linha e os três números lado a lado embaixo.
    const grade = "grid grid-cols-3 gap-x-3 gap-y-1.5 px-3 py-2.5 sm:grid-cols-[minmax(0,1fr)_9rem_5rem_9.5rem] sm:items-center sm:gap-3";

    if (temFilhos) {
        return (
            <button
                type="button"
                onClick={aoAlternar}
                aria-expanded={aberta}
                className={`${grade} w-full text-left transition hover:bg-muted/60`}
            >
                {conteudo}
            </button>
        );
    }
    return <div className={`${grade} ${nivel ? "bg-muted/30" : ""}`}>{conteudo}</div>;
}

function TabelaDesempenho({ linhas, carregando }: { linhas: LinhaDesempenho[]; carregando: boolean }) {
    const [ordem, setOrdem] = useState<OrdemTabela>("estudo");
    const [abertas, setAbertas] = useState<Set<string>>(new Set());

    const ordenadas = useMemo(() => ordenarLinhas(linhas, ordem), [linhas, ordem]);
    const maxSeg = useMemo(
        () => Math.max(0, ...linhas.flatMap((l) => [l.seg, ...l.assuntos.map((a) => a.seg)])),
        [linhas]
    );
    const atencao = useMemo(
        () =>
            linhas
                .filter((l) => l.total >= MIN_QTD_FRACO && safePct(l.corretas, l.total) < WEAK_THRESHOLD)
                .sort((a, b) => safePct(a.corretas, a.total) - safePct(b.corretas, b.total))
                .slice(0, 3),
        [linhas]
    );
    const algumaComDados = linhas.some((l) => l.total >= MIN_QTD_FRACO);

    function alternar(id: string) {
        setAbertas((atual) => {
            const novo = new Set(atual);
            if (novo.has(id)) novo.delete(id);
            else novo.add(id);
            return novo;
        });
    }

    return (
        <div className="rounded-xl border border-border bg-card p-4">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                <div>
                    <h3 className="font-semibold">Desempenho por disciplina</h3>
                    <p className="text-xs text-muted-foreground">Clique numa disciplina para ver os assuntos dela.</p>
                </div>
                <SeletorSegmentado
                    rotulo="Ordenar"
                    valor={ordem}
                    aoMudar={setOrdem}
                    opcoes={[
                        { id: "estudo", nome: "Mais estudadas" },
                        { id: "acerto", nome: "Menor acerto" },
                    ]}
                />
            </div>

            {linhas.length > 0 && (
                <div className="mb-3 rounded-lg border border-border bg-muted/40 px-3 py-2 text-sm">
                    {atencao.length > 0 ? (
                        <>
                            <span className="font-semibold">Precisa de atenção: </span>
                            {atencao.map((l, i) => (
                                <span key={l.id}>
                                    {i > 0 && ", "}
                                    {l.nome} ({safePct(l.corretas, l.total)}%)
                                </span>
                            ))}
                        </>
                    ) : algumaComDados ? (
                        <span className="text-muted-foreground">
                            Nenhuma disciplina abaixo de {WEAK_THRESHOLD}% de acerto no período. Continue assim.
                        </span>
                    ) : (
                        <span className="text-muted-foreground">
                            Responda pelo menos {MIN_QTD_FRACO} questões de uma disciplina para ver onde está mais fraco.
                        </span>
                    )}
                </div>
            )}

            {linhas.length === 0 ? (
                <p className="py-4 text-sm text-muted-foreground">
                    {carregando ? "Carregando…" : "Sem estudo nem questões respondidas no período."}
                </p>
            ) : (
                <div className="overflow-hidden rounded-lg border border-border">
                    <div className="hidden grid-cols-[minmax(0,1fr)_9rem_5rem_9.5rem] gap-3 border-b border-border bg-muted/50 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground sm:grid">
                        <span>Disciplina</span>
                        <span className="text-right">Tempo</span>
                        <span className="text-right">Questões</span>
                        <span className="text-right">Acerto</span>
                    </div>
                    <div className="divide-y divide-border">
                        {ordenadas.map((l) => {
                            const aberta = abertas.has(l.id);
                            return (
                                <div key={l.id}>
                                    <LinhaTabela l={l} maxSeg={maxSeg} nivel={0} aberta={aberta} aoAlternar={() => alternar(l.id)} />
                                    {aberta && (
                                        <div className="divide-y divide-border border-t border-border">
                                            {ordenarLinhas(l.assuntos, ordem).map((a) => (
                                                <LinhaTabela key={a.id} l={a} maxSeg={maxSeg} nivel={1} />
                                            ))}
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}
        </div>
    );
}
