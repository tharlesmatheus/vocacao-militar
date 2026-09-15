"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
    ArrowDown,
    ArrowUp,
    CheckCircle2,
    Clock3,
    ListRestart,
    Pencil,
    Play,
    Plus,
    RotateCcw,
    Save,
    Target,
    Trash2,
} from "lucide-react";
import { supabase } from "@/lib/supabaseClient";

/* ========================================================================== */
/* Tipos                                                                      */
/* ========================================================================== */

type Materia = {
    id: string;
    nome: string;
};

type Assunto = {
    id: string;
    nome: string;
    materia_id: string | null;
};

type CycleActivity =
    | "TEORIA_QUESTOES"
    | "QUESTOES"
    | "REVISAO"
    | "FLASHCARDS"
    | "RESUMOS";

type CycleItem = {
    id: string;
    materia_id: string | null;
    assunto_id: string | null;
    free_title: string | null;
    activity: CycleActivity;
    duration_min: number;
    target_questions: number | null;
    active: boolean;
};

type CyclePayload = {
    version: 2;
    current_item_id: string | null;
    round: number;
    items: CycleItem[];
};

type LegacyBloco = {
    hora?: unknown;
    atividades?: unknown;
};

type FormState = {
    materiaId: string;
    assuntoId: string;
    activity: CycleActivity;
    durationMin: number;
    targetQuestions: string;
};

/* ========================================================================== */
/* Constantes / helpers                                                       */
/* ========================================================================== */

const ACTIVITY_OPTIONS: Array<{ value: CycleActivity; label: string }> = [
    { value: "TEORIA_QUESTOES", label: "Teoria + Questões" },
    { value: "QUESTOES", label: "Questões" },
    { value: "REVISAO", label: "Revisão" },
    { value: "FLASHCARDS", label: "Flashcards" },
    { value: "RESUMOS", label: "Resumos" },
];

const EMPTY_FORM: FormState = {
    materiaId: "",
    assuntoId: "",
    activity: "TEORIA_QUESTOES",
    durationMin: 50,
    targetQuestions: "",
};

function newId() {
    if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
        return crypto.randomUUID();
    }
    return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function clampInt(value: unknown, min: number, max: number, fallback: number) {
    const n = Math.floor(Number(value));
    if (!Number.isFinite(n)) return fallback;
    return Math.min(max, Math.max(min, n));
}

function normalizeText(value: string) {
    return value
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .trim()
        .toLowerCase();
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return !!value && typeof value === "object" && !Array.isArray(value);
}

function normalizeActivity(value: unknown): CycleActivity {
    const candidate = String(value ?? "").toUpperCase();
    if (
        candidate === "TEORIA_QUESTOES" ||
        candidate === "QUESTOES" ||
        candidate === "REVISAO" ||
        candidate === "FLASHCARDS" ||
        candidate === "RESUMOS"
    ) {
        return candidate;
    }
    return "TEORIA_QUESTOES";
}

function emptyPayload(): CyclePayload {
    return {
        version: 2,
        current_item_id: null,
        round: 1,
        items: [],
    };
}

function normalizeCurrentId(payload: CyclePayload): CyclePayload {
    const active = payload.items.filter((item) => item.active);
    if (!active.length) {
        return { ...payload, current_item_id: null };
    }

    if (active.some((item) => item.id === payload.current_item_id)) {
        return payload;
    }

    return { ...payload, current_item_id: active[0].id };
}

function parseCyclePayload(
    raw: unknown,
    materias: Materia[]
): { payload: CyclePayload; migratedLegacy: boolean } {
    if (isRecord(raw) && Number(raw.version) === 2 && Array.isArray(raw.items)) {
        const items: CycleItem[] = raw.items
            .filter(isRecord)
            .map((item) => ({
                id:
                    typeof item.id === "string" && item.id.trim()
                        ? item.id
                        : newId(),
                materia_id:
                    typeof item.materia_id === "string" && item.materia_id
                        ? item.materia_id
                        : null,
                assunto_id:
                    typeof item.assunto_id === "string" && item.assunto_id
                        ? item.assunto_id
                        : null,
                free_title:
                    typeof item.free_title === "string" && item.free_title.trim()
                        ? item.free_title.trim()
                        : null,
                activity: normalizeActivity(item.activity),
                duration_min: clampInt(item.duration_min, 10, 240, 50),
                target_questions:
                    item.target_questions == null || item.target_questions === ""
                        ? null
                        : clampInt(item.target_questions, 0, 300, 0),
                active: item.active !== false,
            }));

        return {
            payload: normalizeCurrentId({
                version: 2,
                current_item_id:
                    typeof raw.current_item_id === "string"
                        ? raw.current_item_id
                        : null,
                round: clampInt(raw.round, 1, 999999, 1),
                items,
            }),
            migratedLegacy: false,
        };
    }

    // Migração segura do antigo cronograma semanal. Não descartamos as atividades:
    // cada texto único vira uma etapa do ciclo. Quando o nome coincidir com uma matéria,
    // o vínculo é reaproveitado automaticamente.
    if (Array.isArray(raw)) {
        const materiaByName = new Map(
            materias.map((m) => [normalizeText(m.nome), m] as const)
        );
        const seen = new Set<string>();
        const items: CycleItem[] = [];

        for (const rawBlock of raw as LegacyBloco[]) {
            if (!rawBlock || !Array.isArray(rawBlock.atividades)) continue;

            for (const activity of rawBlock.atividades) {
                if (typeof activity !== "string") continue;
                const title = activity.trim();
                if (!title) continue;

                const key = normalizeText(title);
                if (!key || seen.has(key)) continue;
                seen.add(key);

                const matched = materiaByName.get(key) ?? null;

                items.push({
                    id: newId(),
                    materia_id: matched?.id ?? null,
                    assunto_id: null,
                    free_title: matched ? null : title,
                    activity: "TEORIA_QUESTOES",
                    duration_min: 50,
                    target_questions: null,
                    active: true,
                });
            }
        }

        const payload = normalizeCurrentId({
            version: 2,
            current_item_id: items[0]?.id ?? null,
            round: 1,
            items,
        });

        return { payload, migratedLegacy: true };
    }

    return { payload: emptyPayload(), migratedLegacy: false };
}

function activityLabel(activity: CycleActivity) {
    return (
        ACTIVITY_OPTIONS.find((option) => option.value === activity)?.label ??
        "Teoria + Questões"
    );
}

/* ========================================================================== */
/* Página                                                                      */
/* ========================================================================== */

export default function CicloDeEstudosPage() {
    const router = useRouter();

    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [msg, setMsg] = useState("");
    const [error, setError] = useState("");

    const [userId, setUserId] = useState<string | null>(null);
    const [cronogramaId, setCronogramaId] = useState<string | null>(null);
    const [materias, setMaterias] = useState<Materia[]>([]);
    const [assuntos, setAssuntos] = useState<Assunto[]>([]);
    const [cycle, setCycle] = useState<CyclePayload>(emptyPayload());

    const [form, setForm] = useState<FormState>(EMPTY_FORM);
    const [editingId, setEditingId] = useState<string | null>(null);

    const loadedRef = useRef(false);
    const saveMessageTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const materiaMap = useMemo(() => {
        const map: Record<string, string> = {};
        materias.forEach((m) => (map[m.id] = m.nome));
        return map;
    }, [materias]);

    const assuntoMap = useMemo(() => {
        const map: Record<string, string> = {};
        assuntos.forEach((a) => (map[a.id] = a.nome));
        return map;
    }, [assuntos]);

    const formAssuntos = useMemo(
        () => assuntos.filter((a) => a.materia_id === form.materiaId),
        [assuntos, form.materiaId]
    );

    const activeItems = useMemo(
        () => cycle.items.filter((item) => item.active),
        [cycle.items]
    );

    const currentItem = useMemo(() => {
        if (!activeItems.length) return null;
        return (
            activeItems.find((item) => item.id === cycle.current_item_id) ??
            activeItems[0]
        );
    }, [activeItems, cycle.current_item_id]);

    const currentActiveIndex = useMemo(() => {
        if (!currentItem) return -1;
        return activeItems.findIndex((item) => item.id === currentItem.id);
    }, [activeItems, currentItem]);

    const nextItems = useMemo(() => {
        if (!activeItems.length || currentActiveIndex < 0) return [];

        const out: CycleItem[] = [];
        const limit = Math.min(3, Math.max(0, activeItems.length - 1));

        for (let offset = 1; offset <= limit; offset += 1) {
            const index = (currentActiveIndex + offset) % activeItems.length;
            out.push(activeItems[index]);
        }

        return out;
    }, [activeItems, currentActiveIndex]);

    const totalMinutes = useMemo(
        () => activeItems.reduce((sum, item) => sum + item.duration_min, 0),
        [activeItems]
    );

    const totalTargetQuestions = useMemo(
        () =>
            activeItems.reduce(
                (sum, item) => sum + Math.max(0, item.target_questions ?? 0),
                0
            ),
        [activeItems]
    );

    useEffect(() => {
        let mounted = true;

        (async () => {
            setLoading(true);
            setError("");
            setMsg("");

            try {
                const { data: auth, error: authError } = await supabase.auth.getUser();
                const user = auth?.user;

                if (authError || !user?.id) {
                    throw new Error("Usuário não autenticado.");
                }

                const [materiasRes, assuntosRes, cronogramaRes] = await Promise.all([
                    supabase
                        .from("materias")
                        .select("id,nome")
                        .eq("user_id", user.id)
                        .order("nome"),
                    supabase
                        .from("assuntos")
                        .select("id,nome,materia_id")
                        .eq("user_id", user.id)
                        .order("nome"),
                    supabase
                        .from("cronograma")
                        .select("id,blocos")
                        .eq("user_id", user.id)
                        .maybeSingle(),
                ]);

                if (!mounted) return;
                if (materiasRes.error) throw materiasRes.error;
                if (assuntosRes.error) throw assuntosRes.error;
                if (cronogramaRes.error) throw cronogramaRes.error;

                const mList = (materiasRes.data ?? []) as Materia[];
                const aList = (assuntosRes.data ?? []) as Assunto[];

                setUserId(user.id);
                setMaterias(mList);
                setAssuntos(aList);

                if (!cronogramaRes.data) {
                    const initial = emptyPayload();
                    const { data: created, error: createError } = await supabase
                        .from("cronograma")
                        .insert({
                            user_id: user.id,
                            blocos: initial,
                        })
                        .select("id,blocos")
                        .single();

                    if (createError || !created) {
                        throw createError ?? new Error("Não foi possível criar o ciclo.");
                    }

                    setCronogramaId(created.id);
                    setCycle(initial);
                } else {
                    const parsed = parseCyclePayload(
                        cronogramaRes.data.blocos,
                        mList
                    );
                    setCronogramaId(cronogramaRes.data.id);
                    setCycle(parsed.payload);

                    if (parsed.migratedLegacy) {
                        setMsg(
                            "Seu cronograma semanal antigo foi convertido em um ciclo de estudos. Revise as etapas e ajuste matéria, duração e atividade quando necessário."
                        );
                    }
                }

                loadedRef.current = true;
            } catch (e: any) {
                if (!mounted) return;
                setError(e?.message || "Não foi possível carregar o ciclo de estudos.");
            } finally {
                if (mounted) setLoading(false);
            }
        })();

        return () => {
            mounted = false;
            if (saveMessageTimerRef.current) {
                clearTimeout(saveMessageTimerRef.current);
            }
        };
    }, []);

    useEffect(() => {
        if (!loadedRef.current || !cronogramaId || !userId) return;

        const timeout = setTimeout(async () => {
            setSaving(true);

            const payload: CyclePayload = normalizeCurrentId({
                ...cycle,
                version: 2,
                round: Math.max(1, cycle.round),
            });

            const { error: saveError } = await supabase
                .from("cronograma")
                .update({
                    blocos: payload,
                    atualizado_em: new Date().toISOString(),
                })
                .eq("id", cronogramaId)
                .eq("user_id", userId);

            setSaving(false);

            if (saveError) {
                setError(saveError.message || "Não foi possível salvar o ciclo.");
                return;
            }

            setError("");
            setMsg("Ciclo salvo.");

            if (saveMessageTimerRef.current) {
                clearTimeout(saveMessageTimerRef.current);
            }
            saveMessageTimerRef.current = setTimeout(() => setMsg(""), 1400);
        }, 700);

        return () => clearTimeout(timeout);
    }, [cycle, cronogramaId, userId]);

    function itemTitle(item: CycleItem) {
        if (item.materia_id && materiaMap[item.materia_id]) {
            return materiaMap[item.materia_id];
        }
        return item.free_title || "Matéria não vinculada";
    }

    function itemSubtitle(item: CycleItem) {
        if (item.assunto_id && assuntoMap[item.assunto_id]) {
            return assuntoMap[item.assunto_id];
        }
        return "Todos os assuntos";
    }

    function resetForm() {
        setForm(EMPTY_FORM);
        setEditingId(null);
    }

    function saveForm() {
        setError("");

        if (!form.materiaId) {
            setError("Selecione uma matéria para adicionar ao ciclo.");
            return;
        }

        const duration = clampInt(form.durationMin, 10, 240, 50);
        const target = form.targetQuestions.trim()
            ? clampInt(form.targetQuestions, 0, 300, 0)
            : null;

        if (editingId) {
            setCycle((prev) => ({
                ...prev,
                items: prev.items.map((item) =>
                    item.id === editingId
                        ? {
                            ...item,
                            materia_id: form.materiaId,
                            assunto_id: form.assuntoId || null,
                            free_title: null,
                            activity: form.activity,
                            duration_min: duration,
                            target_questions: target,
                        }
                        : item
                ),
            }));
        } else {
            const nextItem: CycleItem = {
                id: newId(),
                materia_id: form.materiaId,
                assunto_id: form.assuntoId || null,
                free_title: null,
                activity: form.activity,
                duration_min: duration,
                target_questions: target,
                active: true,
            };

            setCycle((prev) => {
                const items = [...prev.items, nextItem];
                return {
                    ...prev,
                    items,
                    current_item_id: prev.current_item_id ?? nextItem.id,
                };
            });
        }

        resetForm();
    }

    function startEditing(item: CycleItem) {
        setEditingId(item.id);
        setForm({
            materiaId: item.materia_id ?? "",
            assuntoId: item.assunto_id ?? "",
            activity: item.activity,
            durationMin: item.duration_min,
            targetQuestions:
                item.target_questions == null
                    ? ""
                    : String(item.target_questions),
        });
        window.scrollTo({ top: 0, behavior: "smooth" });
    }

    function removeItem(id: string) {
        setCycle((prev) => {
            const items = prev.items.filter((item) => item.id !== id);
            const candidate: CyclePayload = {
                ...prev,
                items,
                current_item_id:
                    prev.current_item_id === id ? null : prev.current_item_id,
            };
            return normalizeCurrentId(candidate);
        });

        if (editingId === id) resetForm();
    }

    function toggleActive(id: string) {
        setCycle((prev) => {
            const items = prev.items.map((item) =>
                item.id === id ? { ...item, active: !item.active } : item
            );
            return normalizeCurrentId({ ...prev, items });
        });
    }

    function moveItem(id: string, direction: -1 | 1) {
        setCycle((prev) => {
            const index = prev.items.findIndex((item) => item.id === id);
            if (index < 0) return prev;

            const nextIndex = index + direction;
            if (nextIndex < 0 || nextIndex >= prev.items.length) return prev;

            const items = [...prev.items];
            [items[index], items[nextIndex]] = [items[nextIndex], items[index]];
            return { ...prev, items };
        });
    }

    function setCurrent(id: string) {
        setCycle((prev) => ({
            ...prev,
            current_item_id: id,
        }));
    }

    function advanceCycle() {
        if (!currentItem || !activeItems.length) return;

        const index = activeItems.findIndex((item) => item.id === currentItem.id);
        if (index < 0) return;

        const nextIndex = (index + 1) % activeItems.length;
        const wrapped = nextIndex === 0 && activeItems.length > 0;

        setCycle((prev) => ({
            ...prev,
            current_item_id: activeItems[nextIndex].id,
            round: wrapped ? prev.round + 1 : prev.round,
        }));
    }

    function resetCyclePosition() {
        setCycle((prev) => ({
            ...prev,
            current_item_id: activeItems[0]?.id ?? null,
            round: 1,
        }));
    }

    if (loading) {
        return (
            <main className="flex min-h-[60vh] items-center justify-center px-4">
                <div className="text-sm text-muted-foreground">
                    Carregando ciclo de estudos...
                </div>
            </main>
        );
    }

    return (
        <main className="mx-auto w-full max-w-6xl space-y-6 px-3 py-6 sm:px-6 lg:py-8">
            <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                <div>
                    <div className="flex items-center gap-2 text-sm font-semibold text-primary">
                        <ListRestart size={18} />
                        Ciclo de estudos
                    </div>
                    <h1 className="mt-2 text-2xl font-bold tracking-tight sm:text-3xl">
                        Estude por sequência, não por dia da semana
                    </h1>
                    <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
                        Monte uma sequência de matérias e avance de onde parou. Se hoje você
                        interromper no meio do ciclo, amanhã continua na próxima etapa — sem
                        prender cada disciplina a uma segunda, terça ou quarta-feira.
                    </p>
                </div>

                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Save size={14} />
                    {saving ? "Salvando..." : "Salvamento automático"}
                </div>
            </header>

            {error && (
                <div className="rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
                    {error}
                </div>
            )}

            {msg && (
                <div className="rounded-xl border border-border bg-muted/50 px-4 py-3 text-sm text-muted-foreground">
                    {msg}
                </div>
            )}

            <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                <SummaryCard
                    label="Etapas ativas"
                    value={activeItems.length}
                    icon={<ListRestart size={19} />}
                />
                <SummaryCard
                    label="Duração do ciclo"
                    value={`${Math.floor(totalMinutes / 60)}h ${totalMinutes % 60}m`}
                    icon={<Clock3 size={19} />}
                />
                <SummaryCard
                    label="Meta de questões"
                    value={totalTargetQuestions}
                    icon={<Target size={19} />}
                />
                <SummaryCard
                    label="Volta atual"
                    value={cycle.round}
                    icon={<RotateCcw size={19} />}
                />
            </section>

            <section className="grid grid-cols-1 gap-4 lg:grid-cols-12">
                <div className="rounded-2xl border border-border bg-card p-5 shadow-sm lg:col-span-7">
                    <div className="flex items-center justify-between gap-3">
                        <div>
                            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                                Agora no ciclo
                            </p>
                            {currentItem ? (
                                <>
                                    <h2 className="mt-1 text-2xl font-bold">
                                        {itemTitle(currentItem)}
                                    </h2>
                                    <p className="mt-1 text-sm text-muted-foreground">
                                        {itemSubtitle(currentItem)} • {activityLabel(currentItem.activity)}
                                    </p>
                                </>
                            ) : (
                                <h2 className="mt-1 text-xl font-semibold">
                                    Adicione sua primeira etapa
                                </h2>
                            )}
                        </div>

                        {currentItem && (
                            <div className="rounded-xl bg-primary/10 px-3 py-2 text-right">
                                <div className="text-xs text-muted-foreground">Tempo sugerido</div>
                                <div className="text-lg font-bold text-primary">
                                    {currentItem.duration_min} min
                                </div>
                            </div>
                        )}
                    </div>

                    {currentItem && (
                        <div className="mt-5 flex flex-wrap gap-2">
                            <button
                                type="button"
                                onClick={advanceCycle}
                                className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground hover:opacity-90"
                            >
                                <CheckCircle2 size={17} />
                                Concluir etapa e avançar
                            </button>
                            <button
                                type="button"
                                onClick={() => router.push("/tempo-de-estudo")}
                                className="inline-flex items-center gap-2 rounded-xl border border-border bg-card px-4 py-2.5 text-sm font-semibold hover:bg-muted"
                            >
                                <Play size={17} />
                                Abrir tempo de estudo
                            </button>
                            <button
                                type="button"
                                onClick={resetCyclePosition}
                                className="inline-flex items-center gap-2 rounded-xl border border-border bg-card px-4 py-2.5 text-sm font-semibold hover:bg-muted"
                            >
                                <RotateCcw size={16} />
                                Reiniciar posição
                            </button>
                        </div>
                    )}

                    <p className="mt-4 text-xs leading-relaxed text-muted-foreground">
                        “Concluir etapa” apenas move a posição do ciclo. Tempo, questões e
                        revisões continuam sendo contabilizados pelas respectivas áreas do app,
                        evitando gerar progresso artificial só por clicar no cronograma.
                    </p>
                </div>

                <div className="rounded-2xl border border-border bg-card p-5 shadow-sm lg:col-span-5">
                    <h2 className="font-semibold">Próximas etapas</h2>
                    <div className="mt-4 space-y-2">
                        {nextItems.map((item, index) => (
                            <div
                                key={item.id}
                                className="flex items-center justify-between gap-3 rounded-xl border border-border bg-muted/40 px-3 py-2.5"
                            >
                                <div className="min-w-0">
                                    <div className="truncate text-sm font-medium">
                                        {index + 1}. {itemTitle(item)}
                                    </div>
                                    <div className="truncate text-xs text-muted-foreground">
                                        {activityLabel(item.activity)} • {item.duration_min} min
                                    </div>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => setCurrent(item.id)}
                                    className="shrink-0 rounded-lg border border-border bg-card px-2.5 py-1.5 text-xs font-semibold hover:bg-muted"
                                >
                                    Ir para
                                </button>
                            </div>
                        ))}

                        {!nextItems.length && (
                            <div className="py-5 text-sm text-muted-foreground">
                                Adicione pelo menos duas etapas ativas para visualizar a sequência.
                            </div>
                        )}
                    </div>
                </div>
            </section>

            <section className="rounded-2xl border border-border bg-card p-5 shadow-sm">
                <div className="flex flex-col gap-1">
                    <h2 className="text-lg font-semibold">
                        {editingId ? "Editar etapa" : "Adicionar etapa ao ciclo"}
                    </h2>
                    <p className="text-sm text-muted-foreground">
                        Escolha a matéria, opcionalmente um assunto, a atividade e o tempo sugerido.
                    </p>
                </div>

                <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-5">
                    <Field label="Matéria">
                        <select
                            value={form.materiaId}
                            onChange={(e) =>
                                setForm((prev) => ({
                                    ...prev,
                                    materiaId: e.target.value,
                                    assuntoId: "",
                                }))
                            }
                            className="w-full rounded-xl border border-border bg-input px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-primary/20"
                        >
                            <option value="">Selecione</option>
                            {materias.map((materia) => (
                                <option key={materia.id} value={materia.id}>
                                    {materia.nome}
                                </option>
                            ))}
                        </select>
                    </Field>

                    <Field label="Assunto (opcional)">
                        <select
                            value={form.assuntoId}
                            onChange={(e) =>
                                setForm((prev) => ({
                                    ...prev,
                                    assuntoId: e.target.value,
                                }))
                            }
                            disabled={!form.materiaId}
                            className="w-full rounded-xl border border-border bg-input px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-primary/20 disabled:opacity-50"
                        >
                            <option value="">Todos os assuntos</option>
                            {formAssuntos.map((assunto) => (
                                <option key={assunto.id} value={assunto.id}>
                                    {assunto.nome}
                                </option>
                            ))}
                        </select>
                    </Field>

                    <Field label="Atividade">
                        <select
                            value={form.activity}
                            onChange={(e) =>
                                setForm((prev) => ({
                                    ...prev,
                                    activity: e.target.value as CycleActivity,
                                }))
                            }
                            className="w-full rounded-xl border border-border bg-input px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-primary/20"
                        >
                            {ACTIVITY_OPTIONS.map((option) => (
                                <option key={option.value} value={option.value}>
                                    {option.label}
                                </option>
                            ))}
                        </select>
                    </Field>

                    <Field label="Duração (min)">
                        <input
                            type="number"
                            min={10}
                            max={240}
                            step={5}
                            value={form.durationMin}
                            onChange={(e) =>
                                setForm((prev) => ({
                                    ...prev,
                                    durationMin: Number(e.target.value),
                                }))
                            }
                            className="w-full rounded-xl border border-border bg-input px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-primary/20"
                        />
                    </Field>

                    <Field label="Meta de questões">
                        <input
                            type="number"
                            min={0}
                            max={300}
                            value={form.targetQuestions}
                            onChange={(e) =>
                                setForm((prev) => ({
                                    ...prev,
                                    targetQuestions: e.target.value,
                                }))
                            }
                            placeholder="Opcional"
                            className="w-full rounded-xl border border-border bg-input px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-primary/20"
                        />
                    </Field>
                </div>

                <div className="mt-5 flex flex-wrap gap-2">
                    <button
                        type="button"
                        onClick={saveForm}
                        className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground hover:opacity-90"
                    >
                        {editingId ? <Save size={17} /> : <Plus size={17} />}
                        {editingId ? "Salvar alterações" : "Adicionar ao ciclo"}
                    </button>

                    {editingId && (
                        <button
                            type="button"
                            onClick={resetForm}
                            className="rounded-xl border border-border bg-card px-4 py-2.5 text-sm font-semibold hover:bg-muted"
                        >
                            Cancelar edição
                        </button>
                    )}
                </div>
            </section>

            <section className="rounded-2xl border border-border bg-card p-5 shadow-sm">
                <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
                    <div>
                        <h2 className="text-lg font-semibold">Sequência do ciclo</h2>
                        <p className="text-sm text-muted-foreground">
                            A ordem abaixo é a ordem real em que as etapas serão apresentadas.
                        </p>
                    </div>
                    <div className="text-xs text-muted-foreground">
                        {cycle.items.length} cadastradas • {activeItems.length} ativas
                    </div>
                </div>

                <div className="mt-5 space-y-3">
                    {cycle.items.map((item, index) => {
                        const isCurrent = currentItem?.id === item.id;

                        return (
                            <article
                                key={item.id}
                                className={`rounded-2xl border p-4 transition ${isCurrent
                                        ? "border-primary bg-primary/5"
                                        : "border-border bg-background"
                                    } ${!item.active ? "opacity-60" : ""}`}
                            >
                                <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                                    <div className="flex min-w-0 items-start gap-3">
                                        <div
                                            className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-sm font-bold ${isCurrent
                                                    ? "bg-primary text-primary-foreground"
                                                    : "bg-muted text-muted-foreground"
                                                }`}
                                        >
                                            {index + 1}
                                        </div>

                                        <div className="min-w-0">
                                            <div className="flex flex-wrap items-center gap-2">
                                                <h3 className="font-semibold">
                                                    {itemTitle(item)}
                                                </h3>
                                                {isCurrent && (
                                                    <span className="rounded-full bg-primary px-2 py-0.5 text-[11px] font-semibold text-primary-foreground">
                                                        Atual
                                                    </span>
                                                )}
                                                {!item.active && (
                                                    <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-semibold text-muted-foreground">
                                                        Pausada
                                                    </span>
                                                )}
                                            </div>

                                            <p className="mt-1 text-sm text-muted-foreground">
                                                {itemSubtitle(item)}
                                            </p>

                                            <div className="mt-2 flex flex-wrap gap-2 text-xs text-muted-foreground">
                                                <span className="rounded-full border border-border bg-muted/50 px-2.5 py-1">
                                                    {activityLabel(item.activity)}
                                                </span>
                                                <span className="rounded-full border border-border bg-muted/50 px-2.5 py-1">
                                                    {item.duration_min} min
                                                </span>
                                                {item.target_questions != null && (
                                                    <span className="rounded-full border border-border bg-muted/50 px-2.5 py-1">
                                                        Meta: {item.target_questions} questões
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                    </div>

                                    <div className="flex flex-wrap items-center gap-1.5">
                                        <button
                                            type="button"
                                            onClick={() => moveItem(item.id, -1)}
                                            disabled={index === 0}
                                            className="rounded-lg border border-border bg-card p-2 hover:bg-muted disabled:opacity-30"
                                            title="Mover para cima"
                                        >
                                            <ArrowUp size={16} />
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => moveItem(item.id, 1)}
                                            disabled={index === cycle.items.length - 1}
                                            className="rounded-lg border border-border bg-card p-2 hover:bg-muted disabled:opacity-30"
                                            title="Mover para baixo"
                                        >
                                            <ArrowDown size={16} />
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => startEditing(item)}
                                            className="rounded-lg border border-border bg-card p-2 hover:bg-muted"
                                            title="Editar"
                                        >
                                            <Pencil size={16} />
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => setCurrent(item.id)}
                                            disabled={!item.active || isCurrent}
                                            className="rounded-lg border border-border bg-card px-3 py-2 text-xs font-semibold hover:bg-muted disabled:opacity-40"
                                        >
                                            Tornar atual
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => toggleActive(item.id)}
                                            className="rounded-lg border border-border bg-card px-3 py-2 text-xs font-semibold hover:bg-muted"
                                        >
                                            {item.active ? "Pausar" : "Ativar"}
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => removeItem(item.id)}
                                            className="rounded-lg border border-destructive/20 bg-destructive/5 p-2 text-destructive hover:bg-destructive/10"
                                            title="Excluir"
                                        >
                                            <Trash2 size={16} />
                                        </button>
                                    </div>
                                </div>
                            </article>
                        );
                    })}

                    {!cycle.items.length && (
                        <div className="rounded-2xl border border-dashed border-border py-12 text-center">
                            <ListRestart className="mx-auto h-8 w-8 text-muted-foreground" />
                            <h3 className="mt-3 font-semibold">Seu ciclo ainda está vazio</h3>
                            <p className="mt-1 text-sm text-muted-foreground">
                                Adicione matérias acima para criar uma sequência de estudo.
                            </p>
                        </div>
                    )}
                </div>
            </section>
        </main>
    );
}

/* ========================================================================== */
/* Componentes auxiliares                                                     */
/* ========================================================================== */

function Field({
    label,
    children,
}: {
    label: string;
    children: React.ReactNode;
}) {
    return (
        <label className="flex min-w-0 flex-col gap-1.5">
            <span className="text-xs font-medium text-muted-foreground">
                {label}
            </span>
            {children}
        </label>
    );
}

function SummaryCard({
    label,
    value,
    icon,
}: {
    label: string;
    value: string | number;
    icon: React.ReactNode;
}) {
    return (
        <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
            <div className="flex items-start justify-between gap-3">
                <div>
                    <div className="text-xs text-muted-foreground">{label}</div>
                    <div className="mt-1 text-2xl font-bold">{value}</div>
                </div>
                <div className="rounded-xl bg-primary/10 p-2 text-primary">{icon}</div>
            </div>
        </div>
    );
}
