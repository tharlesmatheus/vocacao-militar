"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
    BookOpen,
    Brain,
    CheckCircle2,
    ChevronLeft,
    Clock,
    Eye,
    ListOrdered,
    Plus,
    RotateCcw,
    Settings,
    Shuffle,
    Trash2,
    XCircle,
} from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { recordReviewResultForGamification } from "@/lib/gamification";

type ReviewMethod = "CADERNO" | "FLASHCARD" | "RESUMO";
type ReviewResult = "ACERTO" | "ERRO" | "CONCLUIDO";

type Materia = {
    id: string;
    nome: string;
};

type Assunto = {
    id: string;
    nome: string;
    materia_id: string | null;
};

type MethodSettings = Record<ReviewMethod, number[]>;

type ReviewProgress = {
    id: string;
    user_id: string;
    method: ReviewMethod;
    item_id: string;
    materia_id: string | null;
    assunto_id: string | null;
    etapa: number;
    review_count: number;
    next_review: string;
    last_reviewed_at: string | null;
};

type FlashcardRow = {
    id: string;
    materia_id: string | null;
    assunto_id: string | null;
    frente: string;
    verso: string;
    active: boolean;
    created_at: string;
};

type CadernoItemRow = {
    questao_id: string;
    created_at: string | null;
};

type QuestaoRow = {
    id: string;
    materia_id?: string | null;
    assunto_id?: string | null;
    disciplina?: string | null;
    assunto?: string | null;
    instituicao?: string | null;
    cargo?: string | null;
    banca?: string | null;
    modalidade?: string | null;
    enunciado: string;
    alternativas: Record<string, string> | null;
    correta: string;
    explicacao?: string | null;
    created_at?: string | null;
};

type ResumoRow = {
    id: string;
    titulo: string;
    conteudo: string | null;
    materia_id: string | null;
    assunto_id: string | null;
    created_at: string;
};

type BaseReviewItem = {
    method: ReviewMethod;
    itemId: string;
    materiaId: string | null;
    assuntoId: string | null;
    materiaNome: string;
    assuntoNome: string;
    createdAt: string;
    progress: ReviewProgress;
};

type CadernoReviewItem = BaseReviewItem & {
    method: "CADERNO";
    questao: QuestaoRow;
};

type FlashcardReviewItem = BaseReviewItem & {
    method: "FLASHCARD";
    flashcard: FlashcardRow;
};

type ResumoReviewItem = BaseReviewItem & {
    method: "RESUMO";
    resumo: ResumoRow;
};

type ReviewItem =
    | CadernoReviewItem
    | FlashcardReviewItem
    | ResumoReviewItem;

type Screen =
    | "HOME"
    | "CADERNO_MODO"
    | "CADERNO_MATERIAS"
    | "CADERNO_ASSUNTOS"
    | "ATIVIDADE";

const DEFAULT_SETTINGS: MethodSettings = {
    CADERNO: [1, 7, 15, 30, 90],
    FLASHCARD: [1, 7, 15, 30, 90],
    RESUMO: [1, 7, 15, 30, 90],
};

function normalizeIntervals(value: unknown): number[] {
    if (!Array.isArray(value)) return [...DEFAULT_SETTINGS.CADERNO];

    const clean = value
        .map((x) => Math.floor(Number(x)))
        .filter((x) => Number.isFinite(x) && x >= 1);

    return clean.length ? clean : [...DEFAULT_SETTINGS.CADERNO];
}

function localISODate(date = new Date()) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const d = String(date.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
}

function addDaysISO(base: string | Date | null | undefined, days: number) {
    const d = base ? new Date(base) : new Date();

    if (Number.isNaN(d.getTime())) {
        return localISODate();
    }

    d.setHours(12, 0, 0, 0);
    d.setDate(d.getDate() + Math.max(1, Math.floor(days || 1)));

    return localISODate(d);
}

function isDue(progress: ReviewProgress) {
    return progress.next_review <= localISODate();
}

function sortByDue(a: ReviewItem, b: ReviewItem) {
    const due = a.progress.next_review.localeCompare(
        b.progress.next_review
    );

    if (due !== 0) return due;

    return a.createdAt.localeCompare(b.createdAt);
}

function shuffle<T>(arr: T[]) {
    const copy = [...arr];

    for (let i = copy.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [copy[i], copy[j]] = [copy[j], copy[i]];
    }

    return copy;
}

function normalizeAnswer(value: string) {
    return String(value ?? "")
        .trim()
        .toUpperCase()
        .replace(/[.)]/g, "");
}

function methodLabel(method: ReviewMethod) {
    if (method === "CADERNO") return "Caderno de Erros";
    if (method === "FLASHCARD") return "Flashcards";
    return "Resumos";
}

function methodDescription(method: ReviewMethod) {
    if (method === "CADERNO") {
        return "Refaça as questões que você errou e registre um novo resultado.";
    }

    if (method === "FLASHCARD") {
        return "Veja somente a frente, pense e revele o verso quando estiver pronto.";
    }

    return "Leia seus resumos normalmente e conclua a revisão ao terminar.";
}

export default function RevisaoPage() {
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [erro, setErro] = useState("");
    const [msg, setMsg] = useState("");

    const [userId, setUserId] = useState<string | null>(null);

    const [materias, setMaterias] = useState<Materia[]>([]);
    const [assuntos, setAssuntos] = useState<Assunto[]>([]);

    const [settings, setSettings] =
        useState<MethodSettings>(DEFAULT_SETTINGS);

    const [draftSettings, setDraftSettings] =
        useState<MethodSettings>(DEFAULT_SETTINGS);

    const [configOpen, setConfigOpen] = useState(false);

    const [items, setItems] = useState<ReviewItem[]>([]);

    const [screen, setScreen] = useState<Screen>("HOME");

    const [cadernoMateriaId, setCadernoMateriaId] =
        useState<string | null>(null);

    const [activeMethod, setActiveMethod] =
        useState<ReviewMethod | null>(null);

    const [queue, setQueue] = useState<ReviewItem[]>([]);
    const [queueIndex, setQueueIndex] = useState(0);

    const [showBack, setShowBack] = useState(false);
    const [selectedAnswer, setSelectedAnswer] =
        useState<string | null>(null);

    const studySessionIdRef = useRef<string | null>(null);
    const studyStartedAtRef = useRef<number | null>(null);

    const currentItem =
        queueIndex < queue.length ? queue[queueIndex] : null;

    const dueItems = useMemo(
        () => items.filter((item) => isDue(item.progress)),
        [items]
    );

    const dueByMethod = useMemo(() => {
        return {
            CADERNO: dueItems.filter(
                (item) => item.method === "CADERNO"
            ),
            FLASHCARD: dueItems.filter(
                (item) => item.method === "FLASHCARD"
            ),
            RESUMO: dueItems.filter(
                (item) => item.method === "RESUMO"
            ),
        } satisfies Record<ReviewMethod, ReviewItem[]>;
    }, [dueItems]);

    async function ensureSettings(uid: string) {
        const { data, error } = await supabase
            .from("review_method_settings")
            .select("method,intervals_days")
            .eq("user_id", uid);

        if (error) throw error;

        const next: MethodSettings = {
            CADERNO: [...DEFAULT_SETTINGS.CADERNO],
            FLASHCARD: [...DEFAULT_SETTINGS.FLASHCARD],
            RESUMO: [...DEFAULT_SETTINGS.RESUMO],
        };

        for (const row of data ?? []) {
            const method = row.method as ReviewMethod;

            if (
                method === "CADERNO" ||
                method === "FLASHCARD" ||
                method === "RESUMO"
            ) {
                next[method] = normalizeIntervals(
                    row.intervals_days
                );
            }
        }

        const existing = new Set(
            (data ?? []).map((row: any) => row.method)
        );

        const missing = (
            ["CADERNO", "FLASHCARD", "RESUMO"] as ReviewMethod[]
        ).filter((method) => !existing.has(method));

        if (missing.length) {
            const { error: insertError } = await supabase
                .from("review_method_settings")
                .insert(
                    missing.map((method) => ({
                        user_id: uid,
                        method,
                        intervals_days: next[method],
                    }))
                );

            if (insertError) throw insertError;
        }

        setSettings(next);
        setDraftSettings(next);

        return next;
    }

    async function seedProgress(
        uid: string,
        sourceItems: Array<{
            method: ReviewMethod;
            itemId: string;
            materiaId: string | null;
            assuntoId: string | null;
            createdAt: string;
        }>,
        currentSettings: MethodSettings
    ) {
        if (!sourceItems.length) return;

        const { data: existing, error } = await supabase
            .from("review_progress")
            .select("method,item_id")
            .eq("user_id", uid);

        if (error) throw error;

        const keys = new Set(
            (existing ?? []).map(
                (row: any) => `${row.method}:${row.item_id}`
            )
        );

        const missing = sourceItems
            .filter(
                (item) =>
                    !keys.has(`${item.method}:${item.itemId}`)
            )
            .map((item) => ({
                user_id: uid,
                method: item.method,
                item_id: item.itemId,
                materia_id: item.materiaId,
                assunto_id: item.assuntoId,
                etapa: 1,
                review_count: 0,
                next_review: addDaysISO(
                    item.createdAt,
                    currentSettings[item.method][0] ?? 1
                ),
            }));

        if (!missing.length) return;

        const { error: insertError } = await supabase
            .from("review_progress")
            .insert(missing);

        if (insertError) throw insertError;
    }

    async function carregarTudo() {
        setLoading(true);
        setErro("");

        try {
            const {
                data: auth,
                error: authError,
            } = await supabase.auth.getUser();

            const uid = auth?.user?.id ?? null;

            if (authError || !uid) {
                throw new Error("Usuário não autenticado.");
            }

            setUserId(uid);

            const [
                materiasReq,
                assuntosReq,
                flashcardsReq,
                cadernoReq,
                resumosReq,
            ] = await Promise.all([
                supabase
                    .from("materias")
                    .select("id,nome")
                    .eq("user_id", uid)
                    .order("nome"),

                supabase
                    .from("assuntos")
                    .select("id,nome,materia_id")
                    .eq("user_id", uid)
                    .order("nome"),

                supabase
                    .from("flashcards")
                    .select(
                        "id,materia_id,assunto_id,frente,verso,active,created_at"
                    )
                    .eq("user_id", uid)
                    .eq("active", true)
                    .order("created_at", {
                        ascending: true,
                    }),

                supabase
                    .from("caderno_itens")
                    .select("questao_id,created_at")
                    .eq("user_id", uid)
                    .eq("tipo", "ERROS")
                    .order("created_at", {
                        ascending: true,
                    }),

                supabase
                    .from("resumos")
                    .select(
                        "id,titulo,conteudo,materia_id,assunto_id,created_at"
                    )
                    .eq("user_id", uid)
                    .order("created_at", {
                        ascending: true,
                    }),
            ]);

            if (materiasReq.error) throw materiasReq.error;
            if (assuntosReq.error) throw assuntosReq.error;
            if (flashcardsReq.error) throw flashcardsReq.error;
            if (cadernoReq.error) throw cadernoReq.error;
            if (resumosReq.error) throw resumosReq.error;

            const mats =
                (materiasReq.data ?? []) as Materia[];
            const asss =
                (assuntosReq.data ?? []) as Assunto[];

            setMaterias(mats);
            setAssuntos(asss);

            const localMateriaMap: Record<string, string> = {};
            const localAssuntoMap: Record<string, string> = {};

            const localMateriaName = new Map<string, Materia[]>();
            const localAssuntoName = new Map<string, Assunto[]>();

            for (const materia of mats) {
                localMateriaMap[materia.id] = materia.nome;

                const key = materia.nome
                    .trim()
                    .toLocaleLowerCase("pt-BR");

                localMateriaName.set(key, [
                    ...(localMateriaName.get(key) ?? []),
                    materia,
                ]);
            }

            for (const assunto of asss) {
                localAssuntoMap[assunto.id] = assunto.nome;

                const key = assunto.nome
                    .trim()
                    .toLocaleLowerCase("pt-BR");

                localAssuntoName.set(key, [
                    ...(localAssuntoName.get(key) ?? []),
                    assunto,
                ]);
            }

            const currentSettings = await ensureSettings(uid);

            const cadernoRows =
                (cadernoReq.data ?? []) as CadernoItemRow[];

            const questaoIds = Array.from(
                new Set(
                    cadernoRows
                        .map((row) => row.questao_id)
                        .filter(Boolean)
                )
            );

            const questoes: QuestaoRow[] = [];

            for (
                let i = 0;
                i < questaoIds.length;
                i += 400
            ) {
                const lote = questaoIds.slice(i, i + 400);

                const { data, error } = await supabase
                    .from("questoes")
                    .select("*")
                    .in("id", lote);

                if (error) throw error;

                questoes.push(
                    ...((data ?? []) as QuestaoRow[])
                );
            }

            const cadernoCreatedAt = new Map(
                cadernoRows.map((row) => [
                    row.questao_id,
                    row.created_at ??
                    new Date().toISOString(),
                ])
            );

            const source: Array<{
                method: ReviewMethod;
                itemId: string;
                materiaId: string | null;
                assuntoId: string | null;
                createdAt: string;
                raw:
                | FlashcardRow
                | QuestaoRow
                | ResumoRow;
            }> = [];

            for (const card of
                (flashcardsReq.data ?? []) as FlashcardRow[]) {
                source.push({
                    method: "FLASHCARD",
                    itemId: card.id,
                    materiaId: card.materia_id,
                    assuntoId: card.assunto_id,
                    createdAt:
                        card.created_at ??
                        new Date().toISOString(),
                    raw: card,
                });
            }

            for (const questao of questoes) {
                let materiaId =
                    questao.materia_id ?? null;
                let assuntoId =
                    questao.assunto_id ?? null;

                if (!materiaId && questao.disciplina) {
                    const options =
                        localMateriaName.get(
                            questao.disciplina
                                .trim()
                                .toLocaleLowerCase("pt-BR")
                        ) ?? [];

                    if (options.length === 1) {
                        materiaId = options[0].id;
                    }
                }

                if (!assuntoId && questao.assunto) {
                    const options =
                        localAssuntoName.get(
                            questao.assunto
                                .trim()
                                .toLocaleLowerCase("pt-BR")
                        ) ?? [];

                    const filtered = materiaId
                        ? options.filter(
                            (item) =>
                                item.materia_id ===
                                materiaId
                        )
                        : options;

                    if (filtered.length === 1) {
                        assuntoId = filtered[0].id;
                    }
                }

                source.push({
                    method: "CADERNO",
                    itemId: questao.id,
                    materiaId,
                    assuntoId,
                    createdAt:
                        cadernoCreatedAt.get(questao.id) ??
                        questao.created_at ??
                        new Date().toISOString(),
                    raw: questao,
                });
            }

            for (const resumo of
                (resumosReq.data ?? []) as ResumoRow[]) {
                source.push({
                    method: "RESUMO",
                    itemId: resumo.id,
                    materiaId: resumo.materia_id,
                    assuntoId: resumo.assunto_id,
                    createdAt:
                        resumo.created_at ??
                        new Date().toISOString(),
                    raw: resumo,
                });
            }

            const sourceUnique = Array.from(
                new Map(
                    source.map((item) => [
                        `${item.method}:${item.itemId}`,
                        item,
                    ])
                ).values()
            );

            await seedProgress(
                uid,
                sourceUnique.map((item) => ({
                    method: item.method,
                    itemId: item.itemId,
                    materiaId: item.materiaId,
                    assuntoId: item.assuntoId,
                    createdAt: item.createdAt,
                })),
                currentSettings
            );

            const { data: progressData, error: progressError } =
                await supabase
                    .from("review_progress")
                    .select(
                        "id,user_id,method,item_id,materia_id,assunto_id,etapa,review_count,next_review,last_reviewed_at"
                    )
                    .eq("user_id", uid);

            if (progressError) throw progressError;

            const progressMap = new Map<string, ReviewProgress>();

            for (const row of
                (progressData ?? []) as ReviewProgress[]) {
                progressMap.set(
                    `${row.method}:${row.item_id}`,
                    row
                );
            }

            const normalized: ReviewItem[] = [];

            for (const item of sourceUnique) {
                const progress = progressMap.get(
                    `${item.method}:${item.itemId}`
                );

                if (!progress) continue;

                const materiaNome = item.materiaId
                    ? localMateriaMap[item.materiaId] ??
                    "Sem matéria"
                    : "Sem matéria";

                const assuntoNome = item.assuntoId
                    ? localAssuntoMap[item.assuntoId] ??
                    "Sem assunto"
                    : "Sem assunto";

                const base: BaseReviewItem = {
                    method: item.method,
                    itemId: item.itemId,
                    materiaId: item.materiaId,
                    assuntoId: item.assuntoId,
                    materiaNome,
                    assuntoNome,
                    createdAt: item.createdAt,
                    progress,
                };

                if (item.method === "CADERNO") {
                    normalized.push({
                        ...base,
                        method: "CADERNO",
                        questao: item.raw as QuestaoRow,
                    });
                } else if (item.method === "FLASHCARD") {
                    normalized.push({
                        ...base,
                        method: "FLASHCARD",
                        flashcard: item.raw as FlashcardRow,
                    });
                } else {
                    normalized.push({
                        ...base,
                        method: "RESUMO",
                        resumo: item.raw as ResumoRow,
                    });
                }
            }

            setItems(normalized.sort(sortByDue));
        } catch (e: any) {
            setErro(
                e?.message ||
                "Não foi possível carregar o Centro de Revisões."
            );
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => {
        carregarTudo();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    async function getAccessToken() {
        const { data } = await supabase.auth.getSession();
        const token = data?.session?.access_token;

        if (!token) {
            throw new Error(
                "Sessão inválida para registrar o tempo de estudo."
            );
        }

        return token;
    }

    async function stopStudySession() {
        const startedAt = studyStartedAtRef.current;
        const duration = startedAt
            ? Math.max(
                1,
                Math.round((Date.now() - startedAt) / 1000)
            )
            : 0;

        const sessionId = studySessionIdRef.current;

        studySessionIdRef.current = null;
        studyStartedAtRef.current = null;

        if (!sessionId) {
            return duration;
        }

        try {
            const access_token = await getAccessToken();

            await fetch("/api/study-sessions", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    action: "stop",
                    access_token,
                    session_id: sessionId,
                }),
            });
        } catch {
            // A revisão não deve ser perdida se apenas o contador falhar.
        }

        return duration;
    }

    async function startStudySession(item: ReviewItem) {
        if (!userId || !item.materiaId) {
            studySessionIdRef.current = null;
            studyStartedAtRef.current = Date.now();
            return;
        }

        try {
            const access_token = await getAccessToken();

            const { data: abertas } = await supabase
                .from("study_sessions")
                .select("id")
                .eq("user_id", userId)
                .is("ended_at", null)
                .order("started_at", {
                    ascending: false,
                })
                .limit(1);

            if (abertas?.[0]?.id) {
                await fetch("/api/study-sessions", {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                    },
                    body: JSON.stringify({
                        action: "stop",
                        access_token,
                        session_id: abertas[0].id,
                    }),
                });
            }

            const res = await fetch("/api/study-sessions", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    action: "start",
                    access_token,
                    materia_id: item.materiaId,
                    assunto_id: item.assuntoId || null,
                }),
            });

            const out = await res.json().catch(() => null);

            if (!res.ok) {
                throw new Error(
                    out?.error ||
                    "Não foi possível iniciar o tempo de estudo."
                );
            }

            studySessionIdRef.current =
                out?.session?.id ?? null;

            studyStartedAtRef.current = Date.now();
        } catch {
            studySessionIdRef.current = null;
            studyStartedAtRef.current = Date.now();
        }
    }

    async function iniciarFila(
        method: ReviewMethod,
        list: ReviewItem[]
    ) {
        if (!list.length) {
            setMsg(
                `Não há revisões de ${methodLabel(method)} vencidas hoje.`
            );
            return;
        }

        setErro("");
        setMsg("");
        setActiveMethod(method);
        setQueue(list);
        setQueueIndex(0);
        setShowBack(false);
        setSelectedAnswer(null);
        setScreen("ATIVIDADE");

        await startStudySession(list[0]);
    }

    async function sairAtividade() {
        await stopStudySession();

        setActiveMethod(null);
        setQueue([]);
        setQueueIndex(0);
        setShowBack(false);
        setSelectedAnswer(null);
        setScreen("HOME");

        await carregarTudo();
    }

    async function concluirItem(result: ReviewResult) {
        if (!currentItem || saving) return;

        setSaving(true);
        setErro("");

        try {
            const duration = await stopStudySession();

            const { data, error } = await supabase.rpc(
                "complete_review",
                {
                    p_method: currentItem.method,
                    p_item_id: currentItem.itemId,
                    p_result: result,
                    p_duration_seconds: duration,
                }
            );

            if (error) throw error;

            // A revisão base já gera XP no banco através do trigger de review_progress.
            // Esta chamada apenas registra bônus ligados ao resultado (ex.: erro recuperado).
            // Uma falha de gamificação nunca deve desfazer uma revisão já concluída.
            try {
                const reward = await recordReviewResultForGamification({
                    method: currentItem.method,
                    itemId: currentItem.itemId,
                    result,
                });

                if (reward.bonusXp > 0) {
                    if (currentItem.method === "CADERNO" && result === "ACERTO") {
                        setMsg(`Erro recuperado! +${reward.bonusXp} XP de bônus.`);
                    } else if (
                        currentItem.method === "FLASHCARD" &&
                        result === "ACERTO"
                    ) {
                        setMsg(`Flashcard lembrado! +${reward.bonusXp} XP de bônus.`);
                    }
                }
            } catch (gamificationError) {
                console.error(
                    "Revisão concluída, mas o bônus de gamificação não pôde ser confirmado:",
                    gamificationError
                );
            }

            const returned = Array.isArray(data)
                ? data[0]
                : data;

            if (returned) {
                setItems((prev) =>
                    prev.map((item) =>
                        item.method === currentItem.method &&
                            item.itemId === currentItem.itemId
                            ? {
                                ...item,
                                progress: {
                                    ...item.progress,
                                    etapa:
                                        Number(
                                            returned.next_stage
                                        ) ||
                                        item.progress.etapa,
                                    next_review:
                                        String(
                                            returned.next_review
                                        ) ||
                                        item.progress.next_review,
                                    review_count:
                                        Number(
                                            returned.review_count
                                        ) ||
                                        item.progress.review_count +
                                        1,
                                    last_reviewed_at:
                                        new Date().toISOString(),
                                },
                            }
                            : item
                    )
                );
            }

            const nextIndex = queueIndex + 1;

            if (nextIndex >= queue.length) {
                setQueueIndex(nextIndex);
                setShowBack(false);
                setSelectedAnswer(null);
                return;
            }

            setQueueIndex(nextIndex);
            setShowBack(false);
            setSelectedAnswer(null);

            await startStudySession(queue[nextIndex]);
        } catch (e: any) {
            setErro(
                e?.message ||
                "Não foi possível concluir esta revisão."
            );

            if (currentItem) {
                await startStudySession(currentItem);
            }
        } finally {
            setSaving(false);
        }
    }

    async function salvarConfiguracoes() {
        if (!userId) return;

        setSaving(true);
        setErro("");

        try {
            const clean: MethodSettings = {
                CADERNO: normalizeIntervals(
                    draftSettings.CADERNO
                ),
                FLASHCARD: normalizeIntervals(
                    draftSettings.FLASHCARD
                ),
                RESUMO: normalizeIntervals(
                    draftSettings.RESUMO
                ),
            };

            const { error } = await supabase
                .from("review_method_settings")
                .upsert(
                    (
                        [
                            "CADERNO",
                            "FLASHCARD",
                            "RESUMO",
                        ] as ReviewMethod[]
                    ).map((method) => ({
                        user_id: userId,
                        method,
                        intervals_days: clean[method],
                        updated_at: new Date().toISOString(),
                    })),
                    {
                        onConflict: "user_id,method",
                    }
                );

            if (error) throw error;

            const firstReviewUpdates = items
                .filter(
                    (item) =>
                        item.progress.review_count === 0
                )
                .map((item) => ({
                    ...item,
                    newDate: addDaysISO(
                        item.createdAt,
                        clean[item.method][0] ?? 1
                    ),
                }));

            for (const item of firstReviewUpdates) {
                const { error: updateError } =
                    await supabase
                        .from("review_progress")
                        .update({
                            next_review: item.newDate,
                            updated_at:
                                new Date().toISOString(),
                        })
                        .eq("id", item.progress.id)
                        .eq("user_id", userId);

                if (updateError) throw updateError;
            }

            setSettings(clean);
            setDraftSettings(clean);
            setConfigOpen(false);
            setMsg(
                "Intervalos de revisão salvos com sucesso."
            );

            await carregarTudo();
        } catch (e: any) {
            setErro(
                e?.message ||
                "Não foi possível salvar os intervalos."
            );
        } finally {
            setSaving(false);
        }
    }

    function updateDraftInterval(
        method: ReviewMethod,
        index: number,
        value: number
    ) {
        setDraftSettings((prev) => ({
            ...prev,
            [method]: prev[method].map((item, i) =>
                i === index
                    ? Math.max(
                        1,
                        Math.floor(Number(value) || 1)
                    )
                    : item
            ),
        }));
    }

    function addDraftInterval(method: ReviewMethod) {
        setDraftSettings((prev) => {
            const current = prev[method];
            const last = current[current.length - 1] ?? 90;

            return {
                ...prev,
                [method]: [
                    ...current,
                    Math.max(last, 1),
                ],
            };
        });
    }

    function removeDraftInterval(
        method: ReviewMethod,
        index: number
    ) {
        setDraftSettings((prev) => {
            if (prev[method].length <= 1) return prev;

            return {
                ...prev,
                [method]: prev[method].filter(
                    (_, i) => i !== index
                ),
            };
        });
    }

    const cadernoMaterias = useMemo(() => {
        const map = new Map<
            string,
            {
                id: string | null;
                nome: string;
                total: number;
            }
        >();

        for (const item of dueByMethod.CADERNO) {
            const key = item.materiaId ?? "SEM_MATERIA";
            const current = map.get(key);

            if (current) {
                current.total += 1;
            } else {
                map.set(key, {
                    id: item.materiaId,
                    nome: item.materiaNome,
                    total: 1,
                });
            }
        }

        return Array.from(map.values()).sort((a, b) =>
            a.nome.localeCompare(b.nome, "pt-BR")
        );
    }, [dueByMethod.CADERNO]);

    const cadernoAssuntos = useMemo(() => {
        const map = new Map<
            string,
            {
                id: string | null;
                nome: string;
                total: number;
            }
        >();

        for (const item of dueByMethod.CADERNO) {
            if (item.materiaId !== cadernoMateriaId) {
                continue;
            }

            const key = item.assuntoId ?? "SEM_ASSUNTO";
            const current = map.get(key);

            if (current) {
                current.total += 1;
            } else {
                map.set(key, {
                    id: item.assuntoId,
                    nome: item.assuntoNome,
                    total: 1,
                });
            }
        }

        return Array.from(map.values()).sort((a, b) =>
            a.nome.localeCompare(b.nome, "pt-BR")
        );
    }, [
        dueByMethod.CADERNO,
        cadernoMateriaId,
    ]);

    async function iniciarCadernoAssunto(
        assuntoId: string | null
    ) {
        const selected = dueByMethod.CADERNO
            .filter(
                (item) =>
                    item.materiaId === cadernoMateriaId &&
                    item.assuntoId === assuntoId
            )
            .sort(sortByDue);

        await iniciarFila("CADERNO", selected);
    }

    function voltar() {
        if (screen === "CADERNO_ASSUNTOS") {
            setScreen("CADERNO_MATERIAS");
            return;
        }

        if (
            screen === "CADERNO_MATERIAS" ||
            screen === "CADERNO_MODO"
        ) {
            setScreen("HOME");
            setCadernoMateriaId(null);
            return;
        }

        setScreen("HOME");
    }

    if (loading) {
        return (
            <main className="min-h-[60vh] flex items-center justify-center px-4">
                <span className="text-sm text-muted-foreground">
                    Carregando Centro de Revisões...
                </span>
            </main>
        );
    }

    return (
        <main className="w-full px-4 sm:px-6 lg:px-8 py-6 md:py-10">
            <div className="mx-auto max-w-6xl space-y-6">
                <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                        <h1 className="text-2xl font-bold">
                            Centro de Revisões
                        </h1>

                        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
                            Revise Cadernos de Erros, Flashcards e Resumos
                            com revisão espaçada. O tempo gasto em cada item
                            entra automaticamente no tempo de estudo da
                            matéria e do assunto.
                        </p>
                    </div>

                    <button
                        type="button"
                        onClick={() => {
                            setDraftSettings(settings);
                            setConfigOpen(true);
                        }}
                        className="inline-flex items-center justify-center gap-2 rounded-xl border border-border bg-card px-4 py-2.5 text-sm font-semibold hover:bg-muted"
                    >
                        <Settings size={17} />
                        Configurar intervalos
                    </button>
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

                {screen !== "HOME" &&
                    screen !== "ATIVIDADE" && (
                        <button
                            type="button"
                            onClick={voltar}
                            className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
                        >
                            <ChevronLeft size={16} />
                            Voltar
                        </button>
                    )}

                {screen === "HOME" && (
                    <>
                        <section className="grid grid-cols-1 gap-5 md:grid-cols-3">
                            <MethodCard
                                title="Caderno de Erros"
                                description={methodDescription(
                                    "CADERNO"
                                )}
                                due={
                                    dueByMethod.CADERNO.length
                                }
                                total={
                                    items.filter(
                                        (x) =>
                                            x.method ===
                                            "CADERNO"
                                    ).length
                                }
                                icon={
                                    <BookOpen size={26} />
                                }
                                onClick={() => {
                                    setMsg("");
                                    setScreen(
                                        "CADERNO_MODO"
                                    );
                                }}
                            />

                            <MethodCard
                                title="Flashcards"
                                description={methodDescription(
                                    "FLASHCARD"
                                )}
                                due={
                                    dueByMethod.FLASHCARD
                                        .length
                                }
                                total={
                                    items.filter(
                                        (x) =>
                                            x.method ===
                                            "FLASHCARD"
                                    ).length
                                }
                                icon={<Brain size={26} />}
                                onClick={() =>
                                    iniciarFila(
                                        "FLASHCARD",
                                        [...dueByMethod.FLASHCARD].sort(
                                            sortByDue
                                        )
                                    )
                                }
                            />

                            <MethodCard
                                title="Resumos"
                                description={methodDescription(
                                    "RESUMO"
                                )}
                                due={
                                    dueByMethod.RESUMO.length
                                }
                                total={
                                    items.filter(
                                        (x) =>
                                            x.method ===
                                            "RESUMO"
                                    ).length
                                }
                                icon={
                                    <RotateCcw size={26} />
                                }
                                onClick={() =>
                                    iniciarFila(
                                        "RESUMO",
                                        [...dueByMethod.RESUMO].sort(
                                            sortByDue
                                        )
                                    )
                                }
                            />
                        </section>

                        <section className="rounded-2xl border border-border bg-card p-5">
                            <div className="flex items-center gap-2 font-semibold">
                                <Clock size={17} />
                                Como funciona a agenda
                            </div>

                            <p className="mt-2 text-sm text-muted-foreground">
                                Um item novo recebe a primeira revisão de
                                acordo com o primeiro intervalo do método.
                                Quando a última etapa configurada é atingida,
                                ela passa a se repetir para sempre nesse mesmo
                                prazo. Se você adicionar uma nova etapa depois,
                                a sequência volta a avançar.
                            </p>
                        </section>
                    </>
                )}

                {screen === "CADERNO_MODO" && (
                    <section className="grid grid-cols-1 gap-5 md:grid-cols-2">
                        <button
                            type="button"
                            onClick={() => {
                                setCadernoMateriaId(null);
                                setScreen(
                                    "CADERNO_MATERIAS"
                                );
                            }}
                            className="rounded-2xl border border-border bg-card p-6 text-left transition hover:bg-muted/40"
                        >
                            <ListOrdered
                                size={28}
                                className="text-primary"
                            />
                            <h2 className="mt-4 text-lg font-semibold">
                                Revisar por matéria
                            </h2>
                            <p className="mt-2 text-sm text-muted-foreground">
                                Escolha a matéria e depois o assunto.
                                As questões aparecem de forma ordenada.
                            </p>
                        </button>

                        <button
                            type="button"
                            onClick={() =>
                                iniciarFila(
                                    "CADERNO",
                                    shuffle(
                                        dueByMethod.CADERNO
                                    )
                                )
                            }
                            className="rounded-2xl border border-border bg-card p-6 text-left transition hover:bg-muted/40"
                        >
                            <Shuffle
                                size={28}
                                className="text-primary"
                            />
                            <h2 className="mt-4 text-lg font-semibold">
                                Revisar aleatoriamente
                            </h2>
                            <p className="mt-2 text-sm text-muted-foreground">
                                Mistura as questões vencidas de todas as
                                disciplinas e assuntos do Caderno de Erros.
                            </p>
                        </button>
                    </section>
                )}

                {screen === "CADERNO_MATERIAS" && (
                    <section>
                        <h2 className="text-lg font-semibold">
                            Escolha a matéria
                        </h2>

                        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                            {cadernoMaterias.map(
                                (materia) => (
                                    <button
                                        key={
                                            materia.id ??
                                            "SEM_MATERIA"
                                        }
                                        type="button"
                                        onClick={() => {
                                            setCadernoMateriaId(
                                                materia.id
                                            );
                                            setScreen(
                                                "CADERNO_ASSUNTOS"
                                            );
                                        }}
                                        className="rounded-2xl border border-border bg-card p-5 text-left hover:bg-muted/40"
                                    >
                                        <div className="font-semibold">
                                            {materia.nome}
                                        </div>
                                        <div className="mt-1 text-sm text-muted-foreground">
                                            {materia.total} questão(ões)
                                            vencida(s)
                                        </div>
                                    </button>
                                )
                            )}
                        </div>

                        {!cadernoMaterias.length && (
                            <EmptyState text="Não há questões do Caderno de Erros vencidas hoje." />
                        )}
                    </section>
                )}

                {screen === "CADERNO_ASSUNTOS" && (
                    <section>
                        <h2 className="text-lg font-semibold">
                            Escolha o assunto
                        </h2>

                        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                            {cadernoAssuntos.map(
                                (assunto) => (
                                    <button
                                        key={
                                            assunto.id ??
                                            "SEM_ASSUNTO"
                                        }
                                        type="button"
                                        onClick={() =>
                                            iniciarCadernoAssunto(
                                                assunto.id
                                            )
                                        }
                                        className="rounded-2xl border border-border bg-card p-5 text-left hover:bg-muted/40"
                                    >
                                        <div className="font-semibold">
                                            {assunto.nome}
                                        </div>
                                        <div className="mt-1 text-sm text-muted-foreground">
                                            {assunto.total} questão(ões)
                                        </div>
                                    </button>
                                )
                            )}
                        </div>

                        {!cadernoAssuntos.length && (
                            <EmptyState text="Não há assuntos vencidos nesta matéria." />
                        )}
                    </section>
                )}

                {screen === "ATIVIDADE" && (
                    <ActivityArea
                        item={currentItem}
                        method={activeMethod}
                        index={queueIndex}
                        total={queue.length}
                        showBack={showBack}
                        setShowBack={setShowBack}
                        selectedAnswer={selectedAnswer}
                        setSelectedAnswer={
                            setSelectedAnswer
                        }
                        saving={saving}
                        onFinish={concluirItem}
                        onExit={sairAtividade}
                    />
                )}
            </div>

            {configOpen && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center px-4">
                    <div
                        className="absolute inset-0 bg-black/60"
                        onClick={() =>
                            !saving &&
                            setConfigOpen(false)
                        }
                    />

                    <div className="relative z-[101] max-h-[90vh] w-full max-w-4xl overflow-y-auto rounded-2xl border border-border bg-card shadow-2xl">
                        <div className="flex items-center justify-between border-b border-border px-5 py-4">
                            <div>
                                <h2 className="text-lg font-semibold">
                                    Revisão espaçada
                                </h2>
                                <p className="mt-1 text-xs text-muted-foreground">
                                    Defina os dias de cada revisão
                                    separadamente para cada método.
                                </p>
                            </div>

                            <button
                                type="button"
                                disabled={saving}
                                onClick={() =>
                                    setConfigOpen(false)
                                }
                                className="rounded-lg border border-border px-3 py-1.5 text-sm"
                            >
                                Fechar
                            </button>
                        </div>

                        <div className="grid grid-cols-1 gap-5 p-5 lg:grid-cols-3">
                            {(
                                [
                                    "CADERNO",
                                    "FLASHCARD",
                                    "RESUMO",
                                ] as ReviewMethod[]
                            ).map((method) => (
                                <div
                                    key={method}
                                    className="rounded-2xl border border-border p-4"
                                >
                                    <h3 className="font-semibold">
                                        {methodLabel(method)}
                                    </h3>

                                    <div className="mt-4 space-y-3">
                                        {draftSettings[
                                            method
                                        ].map(
                                            (
                                                days,
                                                index
                                            ) => (
                                                <div
                                                    key={`${method}-${index}`}
                                                    className="flex items-end gap-2"
                                                >
                                                    <label className="min-w-0 flex-1">
                                                        <span className="mb-1 block text-xs text-muted-foreground">
                                                            {index +
                                                                1}
                                                            ª revisão
                                                        </span>

                                                        <input
                                                            type="number"
                                                            min={1}
                                                            value={
                                                                days
                                                            }
                                                            onChange={(
                                                                e
                                                            ) =>
                                                                updateDraftInterval(
                                                                    method,
                                                                    index,
                                                                    Number(
                                                                        e
                                                                            .target
                                                                            .value
                                                                    )
                                                                )
                                                            }
                                                            className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm"
                                                        />
                                                    </label>

                                                    <span className="pb-2 text-xs text-muted-foreground">
                                                        dias
                                                    </span>

                                                    {draftSettings[
                                                        method
                                                    ].length >
                                                        1 && (
                                                            <button
                                                                type="button"
                                                                onClick={() =>
                                                                    removeDraftInterval(
                                                                        method,
                                                                        index
                                                                    )
                                                                }
                                                                className="mb-0.5 rounded-lg border border-border p-2 text-muted-foreground hover:text-red-600"
                                                            >
                                                                <Trash2
                                                                    size={
                                                                        15
                                                                    }
                                                                />
                                                            </button>
                                                        )}
                                                </div>
                                            )
                                        )}
                                    </div>

                                    <button
                                        type="button"
                                        onClick={() =>
                                            addDraftInterval(
                                                method
                                            )
                                        }
                                        className="mt-4 inline-flex items-center gap-1 rounded-lg border border-border px-3 py-2 text-xs font-medium hover:bg-muted"
                                    >
                                        <Plus size={14} />
                                        Adicionar revisão
                                    </button>

                                    <p className="mt-3 text-[11px] leading-relaxed text-muted-foreground">
                                        Depois da última etapa,
                                        esse último prazo fica
                                        fixo até você adicionar uma
                                        nova revisão.
                                    </p>
                                </div>
                            ))}
                        </div>

                        <div className="flex justify-end border-t border-border p-5">
                            <button
                                type="button"
                                disabled={saving}
                                onClick={
                                    salvarConfiguracoes
                                }
                                className="rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-50"
                            >
                                {saving
                                    ? "Salvando..."
                                    : "Salvar intervalos"}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </main>
    );
}

function MethodCard({
    title,
    description,
    due,
    total,
    icon,
    onClick,
}: {
    title: string;
    description: string;
    due: number;
    total: number;
    icon: ReactNode;
    onClick: () => void;
}) {
    return (
        <button
            type="button"
            onClick={onClick}
            className="rounded-2xl border border-border bg-card p-6 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
        >
            <div className="flex items-start justify-between gap-4">
                <div className="rounded-xl bg-primary/10 p-3 text-primary">
                    {icon}
                </div>

                <div
                    className={`rounded-full px-3 py-1 text-xs font-semibold ${due
                        ? "bg-amber-100 text-amber-700"
                        : "bg-green-100 text-green-700"
                        }`}
                >
                    {due} para hoje
                </div>
            </div>

            <h2 className="mt-5 text-lg font-semibold">
                {title}
            </h2>

            <p className="mt-2 min-h-10 text-sm text-muted-foreground">
                {description}
            </p>

            <div className="mt-5 text-xs text-muted-foreground">
                {total} item(ns) acompanhados
            </div>
        </button>
    );
}

function EmptyState({ text }: { text: string }) {
    return (
        <div className="mt-4 rounded-2xl border border-dashed border-border bg-card p-8 text-center text-sm text-muted-foreground">
            {text}
        </div>
    );
}

function ActivityArea({
    item,
    method,
    index,
    total,
    showBack,
    setShowBack,
    selectedAnswer,
    setSelectedAnswer,
    saving,
    onFinish,
    onExit,
}: {
    item: ReviewItem | null;
    method: ReviewMethod | null;
    index: number;
    total: number;
    showBack: boolean;
    setShowBack: (value: boolean) => void;
    selectedAnswer: string | null;
    setSelectedAnswer: (value: string | null) => void;
    saving: boolean;
    onFinish: (result: ReviewResult) => Promise<void>;
    onExit: () => Promise<void>;
}) {
    if (!method) return null;

    if (!item) {
        return (
            <section className="mx-auto max-w-2xl rounded-2xl border border-border bg-card p-10 text-center">
                <CheckCircle2
                    size={48}
                    className="mx-auto text-green-600"
                />

                <h2 className="mt-4 text-xl font-semibold">
                    Revisão concluída
                </h2>

                <p className="mt-2 text-sm text-muted-foreground">
                    Você concluiu {total} item(ns) de{" "}
                    {methodLabel(method)}.
                </p>

                <button
                    type="button"
                    onClick={onExit}
                    className="mt-6 rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground"
                >
                    Voltar ao Centro de Revisões
                </button>
            </section>
        );
    }

    const progress =
        total > 0
            ? Math.round(
                ((Math.min(index + 1, total)) / total) *
                100
            )
            : 0;

    return (
        <section className="mx-auto max-w-3xl">
            <div className="mb-5 flex items-center justify-between gap-4">
                <button
                    type="button"
                    onClick={onExit}
                    className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
                >
                    <ChevronLeft size={16} />
                    Encerrar revisão
                </button>

                <div className="text-right text-xs text-muted-foreground">
                    <div>
                        {index + 1} de {total}
                    </div>
                    <div>
                        Etapa {item.progress.etapa}
                    </div>
                </div>
            </div>

            <div className="mb-5 h-1.5 overflow-hidden rounded-full bg-muted">
                <div
                    className="h-full bg-primary transition-all"
                    style={{ width: `${progress}%` }}
                />
            </div>

            <div className="mb-4 flex flex-wrap gap-2 text-xs text-muted-foreground">
                <span className="rounded-full border border-border bg-card px-3 py-1">
                    {item.materiaNome}
                </span>
                <span className="rounded-full border border-border bg-card px-3 py-1">
                    {item.assuntoNome}
                </span>
                <span className="rounded-full border border-border bg-card px-3 py-1">
                    Revisões concluídas:{" "}
                    {item.progress.review_count}
                </span>
            </div>

            {item.method === "FLASHCARD" && (
                <FlashcardActivity
                    item={item}
                    showBack={showBack}
                    setShowBack={setShowBack}
                    saving={saving}
                    onFinish={onFinish}
                />
            )}

            {item.method === "CADERNO" && (
                <CadernoActivity
                    item={item}
                    selectedAnswer={selectedAnswer}
                    setSelectedAnswer={
                        setSelectedAnswer
                    }
                    saving={saving}
                    onFinish={onFinish}
                />
            )}

            {item.method === "RESUMO" && (
                <ResumoActivity
                    item={item}
                    saving={saving}
                    onFinish={onFinish}
                />
            )}
        </section>
    );
}

function FlashcardActivity({
    item,
    showBack,
    setShowBack,
    saving,
    onFinish,
}: {
    item: FlashcardReviewItem;
    showBack: boolean;
    setShowBack: (value: boolean) => void;
    saving: boolean;
    onFinish: (result: ReviewResult) => Promise<void>;
}) {
    return (
        <div className="overflow-hidden rounded-3xl border border-border bg-card shadow-sm">
            <div className="p-7 sm:p-10">
                <div className="mb-6 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-primary">
                    <Brain size={16} />
                    Frente
                </div>

                <p className="whitespace-pre-wrap text-xl font-semibold leading-relaxed sm:text-2xl">
                    {item.flashcard.frente}
                </p>

                {!showBack && (
                    <button
                        type="button"
                        onClick={() =>
                            setShowBack(true)
                        }
                        className="mt-8 inline-flex w-full items-center justify-center gap-2 rounded-xl border border-border py-3 font-medium hover:bg-muted"
                    >
                        <Eye size={18} />
                        Ver resposta
                    </button>
                )}

                {showBack && (
                    <>
                        <div className="my-8 border-t border-border" />

                        <div className="mb-4 text-xs font-semibold uppercase tracking-wide text-primary">
                            Verso
                        </div>

                        <div className="rounded-2xl bg-muted/50 p-5">
                            <p className="whitespace-pre-wrap leading-relaxed">
                                {item.flashcard.verso}
                            </p>
                        </div>

                        <p className="mt-8 text-center text-sm text-muted-foreground">
                            Você lembrou corretamente?
                        </p>

                        <div className="mt-4 grid grid-cols-2 gap-3">
                            <button
                                type="button"
                                disabled={saving}
                                onClick={() =>
                                    onFinish("ERRO")
                                }
                                className="inline-flex items-center justify-center gap-2 rounded-xl border border-red-300 bg-red-50 py-3 font-semibold text-red-700 disabled:opacity-50"
                            >
                                <XCircle size={18} />
                                Errei
                            </button>

                            <button
                                type="button"
                                disabled={saving}
                                onClick={() =>
                                    onFinish("ACERTO")
                                }
                                className="inline-flex items-center justify-center gap-2 rounded-xl border border-green-300 bg-green-50 py-3 font-semibold text-green-700 disabled:opacity-50"
                            >
                                <CheckCircle2 size={18} />
                                Acertei
                            </button>
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}

function CadernoActivity({
    item,
    selectedAnswer,
    setSelectedAnswer,
    saving,
    onFinish,
}: {
    item: CadernoReviewItem;
    selectedAnswer: string | null;
    setSelectedAnswer: (value: string | null) => void;
    saving: boolean;
    onFinish: (result: ReviewResult) => Promise<void>;
}) {
    const alternativas = Object.entries(
        item.questao.alternativas ?? {}
    ).sort(([a], [b]) => a.localeCompare(b));

    const selected = selectedAnswer
        ? normalizeAnswer(selectedAnswer)
        : "";

    const correta = normalizeAnswer(item.questao.correta);
    const respondeu = !!selectedAnswer;

    const acertou =
        respondeu && selected === correta;

    return (
        <div className="rounded-3xl border border-border bg-card p-6 shadow-sm sm:p-8">
            <div className="text-xs font-semibold uppercase tracking-wide text-primary">
                Questão do Caderno de Erros
            </div>

            <h2 className="mt-5 whitespace-pre-wrap text-lg font-semibold leading-relaxed">
                {item.questao.enunciado}
            </h2>

            <div className="mt-6 space-y-3">
                {alternativas.map(([letra, texto]) => {
                    const normalized =
                        normalizeAnswer(letra);

                    const isSelected =
                        selected === normalized;

                    const isCorrect =
                        respondeu &&
                        normalized === correta;

                    const isWrongSelected =
                        respondeu &&
                        isSelected &&
                        !isCorrect;

                    return (
                        <button
                            type="button"
                            key={letra}
                            disabled={respondeu}
                            onClick={() =>
                                setSelectedAnswer(letra)
                            }
                            className={`flex w-full items-start gap-3 rounded-xl border p-4 text-left transition ${isCorrect
                                ? "border-green-400 bg-green-50"
                                : isWrongSelected
                                    ? "border-red-400 bg-red-50"
                                    : isSelected
                                        ? "border-primary bg-primary/5"
                                        : "border-border hover:bg-muted"
                                }`}
                        >
                            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-muted text-sm font-bold">
                                {letra}
                            </span>

                            <span className="pt-1 text-sm leading-relaxed">
                                {texto}
                            </span>
                        </button>
                    );
                })}
            </div>

            {respondeu && (
                <div
                    className={`mt-6 rounded-2xl border p-5 ${acertou
                        ? "border-green-200 bg-green-50"
                        : "border-red-200 bg-red-50"
                        }`}
                >
                    <div
                        className={`font-semibold ${acertou
                            ? "text-green-700"
                            : "text-red-700"
                            }`}
                    >
                        {acertou
                            ? "Resposta correta"
                            : `Resposta incorreta. Gabarito: ${item.questao.correta}`}
                    </div>

                    {item.questao.explicacao && (
                        <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-foreground">
                            {item.questao.explicacao}
                        </p>
                    )}

                    <button
                        type="button"
                        disabled={saving}
                        onClick={() =>
                            onFinish(
                                acertou
                                    ? "ACERTO"
                                    : "ERRO"
                            )
                        }
                        className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground disabled:opacity-50"
                    >
                        {saving
                            ? "Salvando revisão..."
                            : "Próxima questão"}
                    </button>
                </div>
            )}
        </div>
    );
}

function ResumoActivity({
    item,
    saving,
    onFinish,
}: {
    item: ResumoReviewItem;
    saving: boolean;
    onFinish: (result: ReviewResult) => Promise<void>;
}) {
    return (
        <div className="rounded-3xl border border-border bg-card p-6 shadow-sm sm:p-8">
            <div className="text-xs font-semibold uppercase tracking-wide text-primary">
                Revisão de resumo
            </div>

            <h2 className="mt-4 text-2xl font-semibold">
                {item.resumo.titulo}
            </h2>

            <div className="mt-6 rounded-2xl bg-muted/40 p-5">
                <div className="whitespace-pre-wrap text-sm leading-7">
                    {item.resumo.conteudo ||
                        "Este resumo não possui conteúdo."}
                </div>
            </div>

            <button
                type="button"
                disabled={saving}
                onClick={() =>
                    onFinish("CONCLUIDO")
                }
                className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground disabled:opacity-50"
            >
                <CheckCircle2 size={18} />
                {saving
                    ? "Salvando..."
                    : "Concluir revisão e avançar"}
            </button>
        </div>
    );
}
