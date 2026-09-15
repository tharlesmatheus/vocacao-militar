"use client";

import { useEffect, useMemo, useState } from "react";
import {
    Activity,
    BookOpenText,
    Brain,
    CheckCircle2,
    Clock3,
    Layers3,
    RotateCcw,
    Target,
} from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import {
    ResponsiveContainer,
    AreaChart,
    Area,
    XAxis,
    YAxis,
    Tooltip,
    CartesianGrid,
    BarChart,
    Bar,
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

type TopItem = { nome: string; valor: number };
type AccItem = { nome: string; acerto: number; total: number };
type PeriodMode = "7" | "30" | "90" | "custom" | "all";
type ReviewMethod = "CADERNO" | "FLASHCARD" | "RESUMO";

type SessionRow = {
    duration_seconds: number | null;
    started_at: string;
    materia_id: string | null;
    assunto_id: string | null;
};

type AttemptRow = {
    questao_id: string;
    resultado: "ACERTO" | "ERRO";
    created_at: string;
};

type QuestaoMeta = {
    id: string;
    materia_id: string | null;
    assunto_id: string | null;
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
        Array<{ id: string; nome: string; materia_id?: string | null }>
    >([]);
    const [materiaId, setMateriaId] = useState("");
    const [assuntoId, setAssuntoId] = useState("");

    const [matName, setMatName] = useState<Record<string, string>>({});
    const [assName, setAssName] = useState<Record<string, string>>({});

    const [tempoTotalSeg, setTempoTotalSeg] = useState(0);
    const [sessoes, setSessoes] = useState(0);
    const [questoesTotal, setQuestoesTotal] = useState(0);
    const [acertoTotal, setAcertoTotal] = useState(0);
    const [reviewTotals, setReviewTotals] = useState<ReviewTotals>({
        total: 0,
        caderno: 0,
        flashcards: 0,
        resumos: 0,
    });

    const [serie, setSerie] = useState<Daily[]>([]);
    const [topMateriasTempo, setTopMateriasTempo] = useState<TopItem[]>([]);
    const [topAssuntosTempo, setTopAssuntosTempo] = useState<TopItem[]>([]);
    const [matAcc, setMatAcc] = useState<TopItem[]>([]);
    const [assAcc, setAssAcc] = useState<TopItem[]>([]);

    const [pioresMaterias, setPioresMaterias] = useState<AccItem[]>([]);
    const [pioresAssuntos, setPioresAssuntos] = useState<AccItem[]>([]);

    const periodoAtual = useMemo(
        () => rangeLabel(periodMode, customStartApplied, customEndApplied),
        [periodMode, customStartApplied, customEndApplied]
    );

    useEffect(() => {
        let cancelled = false;

        (async () => {
            const { data: auth } = await supabase.auth.getUser();
            const user = auth?.user;
            if (!user?.id || cancelled) return;

            const [mats, asss] = await Promise.all([
                supabase
                    .from("materias")
                    .select("id,nome")
                    .eq("user_id", user.id),
                supabase
                    .from("assuntos")
                    .select("id,nome,materia_id")
                    .eq("user_id", user.id),
            ]);

            if (cancelled) return;

            const mList = (mats.data ?? []) as Array<{ id: string; nome: string }>;
            const aList = (asss.data ?? []) as Array<{
                id: string;
                nome: string;
                materia_id?: string | null;
            }>;

            setMaterias(mList);
            setAssuntos(aList);

            const mMap: Record<string, string> = {};
            mList.forEach((m) => (mMap[m.id] = m.nome));
            setMatName(mMap);

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
                if (!user?.id) throw new Error("Sem usuário autenticado.");

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

                /* ------------------------------------------------------------------ */
                /* Tempo de estudo                                                    */
                /* ------------------------------------------------------------------ */

                let pomodoroQuery = supabase
                    .from("pomodoro_sessions")
                    .select("duration_seconds,started_at,materia_id,assunto_id")
                    .eq("user_id", user.id)
                    .eq("phase", "study")
                    .not("duration_seconds", "is", null)
                    .order("started_at", { ascending: true });

                let studyQuery = supabase
                    .from("study_sessions")
                    .select("duration_seconds,started_at,materia_id,assunto_id")
                    .eq("user_id", user.id)
                    .not("duration_seconds", "is", null)
                    .order("started_at", { ascending: true });

                pomodoroQuery = applyDateBounds(pomodoroQuery, "started_at");
                studyQuery = applyDateBounds(studyQuery, "started_at");

                if (materiaId) {
                    pomodoroQuery = pomodoroQuery.eq("materia_id", materiaId);
                    studyQuery = studyQuery.eq("materia_id", materiaId);
                }

                if (assuntoId) {
                    pomodoroQuery = pomodoroQuery.eq("assunto_id", assuntoId);
                    studyQuery = studyQuery.eq("assunto_id", assuntoId);
                }

                /* ------------------------------------------------------------------ */
                /* Questões                                                           */
                /* ------------------------------------------------------------------ */

                let attemptQuery = supabase
                    .from("question_attempts")
                    .select("questao_id,resultado,created_at")
                    .eq("user_id", user.id)
                    .order("created_at", { ascending: true });

                attemptQuery = applyDateBounds(attemptQuery, "created_at");

                /* ------------------------------------------------------------------ */
                /* Revisões                                                           */
                /* ------------------------------------------------------------------ */

                let reviewEventQuery = supabase
                    .from("gamification_events")
                    .select("event_type,source_id,metadata,occurred_at")
                    .eq("user_id", user.id)
                    .order("occurred_at", { ascending: true });

                if (periodMode === "all") {
                    reviewEventQuery = reviewEventQuery.in("event_type", [
                        "REVIEW_COMPLETED",
                        "LEGACY_REVIEW_COUNT",
                    ]);
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
                    reviewProgressRes,
                    reviewEventsRes,
                ] = await Promise.all([
                    pomodoroQuery,
                    studyQuery,
                    attemptQuery,
                    supabase
                        .from("review_progress")
                        .select("item_id,method,materia_id,assunto_id")
                        .eq("user_id", user.id),
                    reviewEventQuery,
                ]);

                if (pomodoroRes.error && studyRes.error) {
                    throw new Error(
                        `Falha ao carregar tempo de estudo: ${pomodoroRes.error.message}`
                    );
                }

                if (attemptRes.error) {
                    throw new Error(
                        `Falha ao carregar tentativas de questões: ${attemptRes.error.message}`
                    );
                }

                const sessionRows: SessionRow[] = [
                    ...((pomodoroRes.error ? [] : pomodoroRes.data ?? []) as SessionRow[]),
                    ...((studyRes.error ? [] : studyRes.data ?? []) as SessionRow[]),
                ];

                const byDayMin: Record<string, number> = {};
                const byMatSec: Record<string, number> = {};
                const byAssSec: Record<string, number> = {};
                let totalSec = 0;

                for (const session of sessionRows) {
                    const dur = Math.max(0, Number(session.duration_seconds ?? 0));
                    totalSec += dur;

                    const d = new Date(session.started_at);
                    const key = localDateKey(d);
                    byDayMin[key] = (byDayMin[key] ?? 0) + Math.round(dur / 60);

                    if (session.materia_id) {
                        byMatSec[session.materia_id] =
                            (byMatSec[session.materia_id] ?? 0) + dur;
                    }

                    if (session.assunto_id) {
                        byAssSec[session.assunto_id] =
                            (byAssSec[session.assunto_id] ?? 0) + dur;
                    }
                }

                const attempts = (attemptRes.data ?? []) as AttemptRow[];
                const questaoIds = Array.from(
                    new Set(attempts.map((a) => a.questao_id).filter(Boolean))
                );

                const questaoMap = new Map<string, QuestaoMeta>();

                for (let i = 0; i < questaoIds.length; i += 500) {
                    const lote = questaoIds.slice(i, i + 500);
                    if (!lote.length) continue;

                    const { data: qs, error: qsError } = await supabase
                        .from("questoes")
                        .select("id,materia_id,assunto_id")
                        .eq("user_id", user.id)
                        .in("id", lote);

                    if (qsError) {
                        throw new Error(
                            `Falha ao carregar classificação das questões: ${qsError.message}`
                        );
                    }

                    for (const q of (qs ?? []) as QuestaoMeta[]) {
                        questaoMap.set(q.id, q);
                    }
                }

                const attemptsFiltered = attempts.filter((attempt) => {
                    const meta = questaoMap.get(attempt.questao_id);
                    if (!meta) return false;
                    if (materiaId && meta.materia_id !== materiaId) return false;
                    if (assuntoId && meta.assunto_id !== assuntoId) return false;
                    return true;
                });

                const matAgg: Record<string, { total: number; corretas: number }> = {};
                const assAgg: Record<string, { total: number; corretas: number }> = {};
                const byDayQ: Record<string, number> = {};
                let corretasTotal = 0;

                for (const attempt of attemptsFiltered) {
                    const meta = questaoMap.get(attempt.questao_id);
                    if (!meta) continue;

                    const acertou = attempt.resultado === "ACERTO";
                    if (acertou) corretasTotal += 1;

                    if (meta.materia_id) {
                        const row = matAgg[meta.materia_id] ?? {
                            total: 0,
                            corretas: 0,
                        };
                        row.total += 1;
                        if (acertou) row.corretas += 1;
                        matAgg[meta.materia_id] = row;
                    }

                    if (meta.assunto_id) {
                        const row = assAgg[meta.assunto_id] ?? {
                            total: 0,
                            corretas: 0,
                        };
                        row.total += 1;
                        if (acertou) row.corretas += 1;
                        assAgg[meta.assunto_id] = row;
                    }

                    const key = localDateKey(new Date(attempt.created_at));
                    byDayQ[key] = (byDayQ[key] ?? 0) + 1;
                }

                /* ------------------------------------------------------------------ */
                /* Agregação das revisões                                             */
                /* ------------------------------------------------------------------ */

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
                        "Não foi possível carregar as estatísticas de revisão. Confira se o SQL da gamificação já foi executado no Supabase."
                    );
                } else {
                    const reviewMetaMap = new Map<string, ReviewProgressMeta>();

                    if (!reviewProgressRes.error) {
                        for (const row of (reviewProgressRes.data ?? []) as ReviewProgressMeta[]) {
                            const method = normalizeReviewMethod(row.method);
                            if (!method) continue;
                            reviewMetaMap.set(
                                reviewMapKey(method, String(row.item_id)),
                                {
                                    ...row,
                                    method,
                                    item_id: String(row.item_id),
                                }
                            );
                        }
                    } else if (materiaId || assuntoId) {
                        setReviewWarning(
                            "As revisões foram carregadas, mas não foi possível aplicar o filtro de matéria/assunto nelas."
                        );
                    }

                    for (const event of (reviewEventsRes.data ?? []) as ReviewEventRow[]) {
                        const sourceId = event.source_id ? String(event.source_id) : "";
                        const method = normalizeReviewMethod(
                            metaString(event.metadata, "method")
                        );

                        if (!sourceId || !method) continue;

                        const reviewMeta = reviewMetaMap.get(
                            reviewMapKey(method, sourceId)
                        );

                        if (materiaId || assuntoId) {
                            if (!reviewMeta) continue;
                            if (materiaId && reviewMeta.materia_id !== materiaId) continue;
                            if (assuntoId && reviewMeta.assunto_id !== assuntoId) continue;
                        }

                        const weight =
                            event.event_type === "LEGACY_REVIEW_COUNT"
                                ? Math.max(
                                    0,
                                    Math.floor(metaNumber(event.metadata, "count") ?? 0)
                                )
                                : 1;

                        if (weight <= 0) continue;

                        nextReviewTotals.total += weight;
                        if (method === "CADERNO") nextReviewTotals.caderno += weight;
                        if (method === "FLASHCARD") nextReviewTotals.flashcards += weight;
                        if (method === "RESUMO") nextReviewTotals.resumos += weight;

                        // LEGACY_REVIEW_COUNT preserva volume histórico, mas não possui
                        // a data individual de cada revisão. Por isso não entra no gráfico diário.
                        if (event.event_type === "REVIEW_COMPLETED") {
                            const d = new Date(event.occurred_at);
                            if (!Number.isNaN(d.getTime())) {
                                const key = localDateKey(d);
                                byDayReview[key] = (byDayReview[key] ?? 0) + 1;
                                exactReviewTimestamps.push(d.getTime());
                            }
                        }
                    }
                }

                if (cancelled) return;

                setTempoTotalSeg(totalSec);
                setSessoes(sessionRows.length);
                setQuestoesTotal(attemptsFiltered.length);
                setAcertoTotal(safePct(corretasTotal, attemptsFiltered.length));
                setReviewTotals(nextReviewTotals);

                setTopMateriasTempo(
                    materiaId
                        ? []
                        : Object.entries(byMatSec)
                            .map(([id, sec]) => ({
                                nome: matName[id] || `${id.slice(0, 8)}…`,
                                valor: Math.round(sec / 60),
                            }))
                            .sort((a, b) => b.valor - a.valor)
                            .slice(0, 5)
                );

                setTopAssuntosTempo(
                    Object.entries(byAssSec)
                        .map(([id, sec]) => ({
                            nome: assName[id] || `${id.slice(0, 8)}…`,
                            valor: Math.round(sec / 60),
                        }))
                        .sort((a, b) => b.valor - a.valor)
                        .slice(0, 5)
                );

                setMatAcc(
                    materiaId
                        ? matAgg[materiaId]
                            ? [
                                {
                                    nome: matName[materiaId] ?? "Matéria",
                                    valor: safePct(
                                        matAgg[materiaId].corretas,
                                        matAgg[materiaId].total
                                    ),
                                },
                            ]
                            : []
                        : Object.entries(matAgg)
                            .map(([id, v]) => ({
                                nome: matName[id] || `${id.slice(0, 8)}…`,
                                valor: safePct(v.corretas, v.total),
                            }))
                            .sort((a, b) => b.valor - a.valor)
                            .slice(0, 8)
                );

                setAssAcc(
                    assuntoId
                        ? assAgg[assuntoId]
                            ? [
                                {
                                    nome: assName[assuntoId] ?? "Assunto",
                                    valor: safePct(
                                        assAgg[assuntoId].corretas,
                                        assAgg[assuntoId].total
                                    ),
                                },
                            ]
                            : []
                        : Object.entries(assAgg)
                            .map(([id, v]) => ({
                                nome: assName[id] || `${id.slice(0, 8)}…`,
                                valor: safePct(v.corretas, v.total),
                            }))
                            .sort((a, b) => b.valor - a.valor)
                            .slice(0, 8)
                );

                const matWeak: AccItem[] = Object.entries(matAgg)
                    .map(([id, v]) => ({
                        nome: matName[id] || `${id.slice(0, 8)}…`,
                        acerto: safePct(v.corretas, v.total),
                        total: v.total,
                    }))
                    .filter(
                        (x) =>
                            x.total >= MIN_QTD_FRACO &&
                            x.acerto < WEAK_THRESHOLD
                    )
                    .sort((a, b) => a.acerto - b.acerto)
                    .slice(0, 8);

                const assWeak: AccItem[] = Object.entries(assAgg)
                    .map(([id, v]) => ({
                        nome: assName[id] || `${id.slice(0, 8)}…`,
                        acerto: safePct(v.corretas, v.total),
                        total: v.total,
                    }))
                    .filter(
                        (x) =>
                            x.total >= MIN_QTD_FRACO &&
                            x.acerto < WEAK_THRESHOLD
                    )
                    .sort((a, b) => a.acerto - b.acerto)
                    .slice(0, 8);

                setPioresMaterias(matWeak);
                setPioresAssuntos(assWeak);

                let seriesStart: Date;
                let seriesEnd: Date;

                if (bounds.start && bounds.endExclusive) {
                    seriesStart = bounds.start;
                    seriesEnd = addLocalDays(bounds.endExclusive, -1);
                } else {
                    const timestamps: number[] = [];

                    for (const s of sessionRows) {
                        const t = new Date(s.started_at).getTime();
                        if (Number.isFinite(t)) timestamps.push(t);
                    }

                    for (const a of attemptsFiltered) {
                        const t = new Date(a.created_at).getTime();
                        if (Number.isFinite(t)) timestamps.push(t);
                    }

                    timestamps.push(...exactReviewTimestamps);

                    if (timestamps.length) {
                        seriesStart = startOfLocalDay(Math.min(...timestamps));
                        seriesEnd = startOfLocalDay(Math.max(...timestamps));
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
                    setErro(e?.message || "Falha ao carregar estatísticas.");
                    setTempoTotalSeg(0);
                    setSessoes(0);
                    setQuestoesTotal(0);
                    setAcertoTotal(0);
                    setReviewTotals({
                        total: 0,
                        caderno: 0,
                        flashcards: 0,
                        resumos: 0,
                    });
                    setSerie([]);
                    setTopMateriasTempo([]);
                    setTopAssuntosTempo([]);
                    setMatAcc([]);
                    setAssAcc([]);
                    setPioresMaterias([]);
                    setPioresAssuntos([]);
                }
            } finally {
                if (!cancelled) setLoading(false);
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
    ]);

    const cards = useMemo<MetricCard[]>(
        () => [
            {
                label: "Tempo total",
                value: fmtHMS(tempoTotalSeg),
                icon: <Clock3 size={20} />,
                tone: "from-sky-500 to-cyan-500",
            },
            {
                label: "Sessões",
                value: sessoes,
                icon: <Activity size={20} />,
                tone: "from-violet-500 to-fuchsia-500",
            },
            {
                label: "Questões",
                value: questoesTotal,
                icon: <Target size={20} />,
                tone: "from-emerald-500 to-teal-500",
            },
            {
                label: "Acerto",
                value: `${acertoTotal}%`,
                icon: <CheckCircle2 size={20} />,
                tone: "from-amber-500 to-orange-500",
            },
            {
                label: "Revisões feitas",
                value: reviewTotals.total,
                icon: <RotateCcw size={20} />,
                tone: "from-indigo-500 to-blue-500",
                helper: "Caderno + flashcards + resumos",
            },
            {
                label: "Caderno revisado",
                value: reviewTotals.caderno,
                icon: <BookOpenText size={20} />,
                tone: "from-rose-500 to-red-500",
            },
            {
                label: "Flashcards revisados",
                value: reviewTotals.flashcards,
                icon: <Brain size={20} />,
                tone: "from-purple-500 to-violet-500",
            },
            {
                label: "Resumos revisados",
                value: reviewTotals.resumos,
                icon: <Layers3 size={20} />,
                tone: "from-cyan-500 to-sky-500",
            },
        ],
        [
            tempoTotalSeg,
            sessoes,
            questoesTotal,
            acertoTotal,
            reviewTotals,
        ]
    );

    const assuntosFiltrados = useMemo(
        () =>
            materiaId
                ? assuntos.filter((a) => a.materia_id === materiaId)
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
        <div className="mx-auto max-w-6xl space-y-6 px-3 py-6 sm:px-6">
            <div className="space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                        <h1 className="text-2xl font-semibold">Estatísticas</h1>
                        <p className="mt-1 text-xs text-muted-foreground">
                            Período: {periodoAtual}
                        </p>
                    </div>

                    <div className="flex flex-wrap gap-2">
                        {(["7", "30", "90"] as const).map((n) => (
                            <button
                                key={n}
                                type="button"
                                onClick={() => selecionarPreset(n)}
                                className={`rounded-lg border px-3 py-1.5 text-sm transition ${periodMode === n
                                        ? "border-primary bg-primary text-primary-foreground"
                                        : "border-border bg-card hover:bg-muted"
                                    }`}
                            >
                                {n} dias
                            </button>
                        ))}

                        <button
                            type="button"
                            onClick={() => selecionarPreset("all")}
                            className={`rounded-lg border px-3 py-1.5 text-sm transition ${periodMode === "all"
                                    ? "border-primary bg-primary text-primary-foreground"
                                    : "border-border bg-card hover:bg-muted"
                                }`}
                        >
                            Todo o período
                        </button>
                    </div>
                </div>

                <div className="rounded-2xl border border-border bg-card p-4">
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

            <div className="flex flex-wrap gap-3 rounded-2xl border border-border bg-card p-4">
                <div className="flex flex-col gap-1">
                    <span className="text-xs text-muted-foreground">Matéria</span>
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

            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                {cards.map((c) => (
                    <div
                        key={c.label}
                        className={`rounded-2xl bg-gradient-to-r p-4 text-white shadow-sm ${c.tone}`}
                    >
                        <div className="text-sm/5 opacity-90">{c.label}</div>
                        <div className="mt-1 flex items-end justify-between gap-3">
                            <div className="text-2xl font-extrabold tracking-tight">
                                {c.value}
                            </div>
                            <div className="opacity-90">{c.icon}</div>
                        </div>
                        {c.helper && (
                            <div className="mt-1 text-[11px] opacity-80">{c.helper}</div>
                        )}
                    </div>
                ))}
            </div>

            {reviewWarning && (
                <div className="rounded-xl border border-amber-300/50 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                    {reviewWarning}
                </div>
            )}

            {periodMode === "all" && reviewTotals.total > 0 && (
                <div className="rounded-xl border border-border bg-muted/40 px-4 py-3 text-xs text-muted-foreground">
                    Em “Todo o período”, revisões anteriores à implantação da gamificação
                    podem aparecer como volume histórico consolidado. Elas contam no total,
                    mas não são distribuídas artificialmente no gráfico diário porque o
                    histórico antigo não preservava a data de cada revisão.
                </div>
            )}

            <div className="rounded-2xl border border-border bg-card p-4">
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
                                    <stop offset="5%" stopColor="#22c55e" stopOpacity={0.4} />
                                    <stop offset="95%" stopColor="#22c55e" stopOpacity={0} />
                                </linearGradient>
                                <linearGradient id="gRev" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.35} />
                                    <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0} />
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
                                    background: "var(--muted)",
                                    border: "1px solid var(--border)",
                                    color: "var(--foreground)",
                                    borderRadius: 12,
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
                                stroke="#22c55e"
                                fill="url(#gQst)"
                                strokeWidth={2}
                            />
                            <Area
                                type="monotone"
                                dataKey="revisoes"
                                name="Revisões"
                                stroke="#8b5cf6"
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

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                {!materiaId && (
                    <Panel title="Top 5 matérias por tempo (min)">
                        <TinyBarH data={topMateriasTempo} />
                    </Panel>
                )}

                <Panel
                    title={`Top 5 assuntos por tempo (min)${materiaId ? " — desta matéria" : ""
                        }`}
                >
                    <TinyBarH data={topAssuntosTempo} />
                </Panel>
            </div>

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                <Panel
                    title={`Acerto por Matéria ${materiaId ? "(item selecionado)" : "(geral)"
                        }`}
                >
                    <TinyBarH data={matAcc} percent />
                </Panel>

                <Panel
                    title={`Acerto por Assunto ${assuntoId ? "(item selecionado)" : "(geral)"
                        }`}
                >
                    <TinyBarH data={assAcc} percent />
                </Panel>
            </div>

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                <Panel
                    title={`Onde estou pior — Matérias (acerto < ${WEAK_THRESHOLD}%, min. ${MIN_QTD_FRACO} questões)`}
                >
                    <WeakList
                        items={pioresMaterias}
                        empty="Sem itens abaixo do limite 👏"
                    />
                </Panel>

                <Panel
                    title={`Onde estou pior — Assuntos (acerto < ${WEAK_THRESHOLD}%, min. ${MIN_QTD_FRACO} questões)`}
                >
                    <WeakList
                        items={pioresAssuntos}
                        empty="Sem itens abaixo do limite 👏"
                    />
                </Panel>
            </div>

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
        <div className="rounded-2xl border border-border bg-card p-4">
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

function TinyBarH({
    data,
    percent = false,
}: {
    data: TopItem[];
    percent?: boolean;
}) {
    if (!data.length) {
        return (
            <div className="py-4 text-sm text-muted-foreground">
                Sem dados para o período selecionado.
            </div>
        );
    }

    const height = Math.max(120, data.length * 26 + 30);

    return (
        <div style={{ width: "100%", height }}>
            <ResponsiveContainer width="100%" height="100%">
                <BarChart
                    data={data}
                    layout="vertical"
                    margin={{ top: 6, bottom: 6, left: 6, right: 10 }}
                >
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                    <XAxis
                        type="number"
                        domain={percent ? [0, 100] : ["auto", "auto"]}
                        stroke="var(--muted-foreground)"
                        tick={{ fontSize: 11 }}
                    />
                    <YAxis
                        type="category"
                        dataKey="nome"
                        width={140}
                        stroke="var(--muted-foreground)"
                        tick={{ fontSize: 11 }}
                    />
                    <Tooltip
                        formatter={(v: any) =>
                            percent ? [`${v}%`, "Acerto"] : [v, "Minutos"]
                        }
                        contentStyle={{
                            background: "var(--muted)",
                            border: "1px solid var(--border)",
                            color: "var(--foreground)",
                            borderRadius: 12,
                        }}
                    />
                    <Bar
                        dataKey="valor"
                        barSize={12}
                        radius={[0, 8, 8, 0]}
                        fill={percent ? "var(--primary)" : "#60a5fa"}
                    />
                </BarChart>
            </ResponsiveContainer>
        </div>
    );
}

function WeakList({
    items,
    empty,
}: {
    items: AccItem[];
    empty: string;
}) {
    if (!items.length) {
        return <div className="text-sm text-muted-foreground">{empty}</div>;
    }

    return (
        <ul className="space-y-2">
            {items.map((it, i) => (
                <li
                    key={`${it.nome}-${i}`}
                    className="flex items-center justify-between rounded-xl border border-border bg-muted px-3 py-2"
                >
                    <div className="min-w-0 flex-1">
                        <div className="truncate font-medium">{it.nome}</div>
                        <div className="text-xs text-muted-foreground">
                            Total: {it.total} questões
                        </div>
                    </div>
                    <span className="ml-3 text-sm font-bold text-red-600">
                        {it.acerto}%
                    </span>
                </li>
            ))}
        </ul>
    );
}
