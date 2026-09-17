"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
    ArrowDown,
    ArrowUp,
    CalendarRange,
    Plus,
    Save,
    Trash2,
} from "lucide-react";

import { supabase } from "@/lib/supabaseClient";

/* ============================================================================
 * Tipos
 * ========================================================================== */

type Disciplina = {
    id: string;
    nome: string;
    ativo: boolean;
};

type Assunto = {
    id: string;
    disciplina_id: string;
    nome: string;
    ativo: boolean;
};

type LegacyMateria = {
    id: string;
    nome: string;
};

type LegacyAssunto = {
    id: string;
    materia_id: string | null;
    nome: string;
};

type ScheduleItem = {
    id: string;
    disciplina_id: string | null;
    assunto_id: string | null;
    legacy_title?: string | null;
};

type ScheduleCycle = {
    id: string;
    items: ScheduleItem[];
};

type SchedulePayload = {
    version: 4;
    cycles: ScheduleCycle[];
};

type LegacyCycleItem = {
    id?: unknown;
    materia_id?: unknown;
    assunto_id?: unknown;
    free_title?: unknown;
};

type LegacyWeeklyBlock = {
    hora?: unknown;
    atividades?: unknown;
};

/* ============================================================================
 * Helpers
 * ========================================================================== */

function newId() {
    if (
        typeof crypto !== "undefined" &&
        typeof crypto.randomUUID === "function"
    ) {
        return crypto.randomUUID();
    }

    return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return !!value && typeof value === "object" && !Array.isArray(value);
}

function normalizar(valor: string) {
    return valor
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLocaleLowerCase("pt-BR")
        .replace(/[^a-z0-9]+/g, "");
}

function mensagemErro(error: unknown) {
    if (error instanceof Error) return error.message;

    if (error && typeof error === "object" && "message" in error) {
        return String((error as { message?: unknown }).message ?? "Erro inesperado.");
    }

    return "Erro inesperado.";
}

function createDefaultCycles(count = 6): ScheduleCycle[] {
    return Array.from({ length: count }, () => ({
        id: newId(),
        items: [],
    }));
}

function emptyPayload(): SchedulePayload {
    return {
        version: 4,
        cycles: createDefaultCycles(6),
    };
}

function formatCycle(index: number) {
    return `Ciclo ${String(index + 1).padStart(2, "0")}`;
}

function formatSlot(index: number) {
    return `Bloco ${String(index + 1).padStart(2, "0")}`;
}

/* ============================================================================
 * Migração de formatos antigos
 * ========================================================================== */

function parseSchedulePayload(
    raw: unknown,
    disciplinas: Disciplina[],
    assuntos: Assunto[],
    legacyMaterias: LegacyMateria[],
    legacyAssuntos: LegacyAssunto[]
): { payload: SchedulePayload; migrated: boolean } {
    // Formato atual.
    if (
        isRecord(raw) &&
        Number(raw.version) === 4 &&
        Array.isArray(raw.cycles)
    ) {
        const cycles: ScheduleCycle[] = raw.cycles
            .filter(isRecord)
            .map((cycle) => {
                const rawItems = Array.isArray(cycle.items)
                    ? cycle.items
                    : [];

                const items: ScheduleItem[] = rawItems
                    .filter(isRecord)
                    .map((item) => ({
                        id:
                            typeof item.id === "string" && item.id
                                ? item.id
                                : newId(),
                        disciplina_id:
                            typeof item.disciplina_id === "string" &&
                                item.disciplina_id
                                ? item.disciplina_id
                                : null,
                        assunto_id:
                            typeof item.assunto_id === "string" &&
                                item.assunto_id
                                ? item.assunto_id
                                : null,
                        legacy_title:
                            typeof item.legacy_title === "string" &&
                                item.legacy_title.trim()
                                ? item.legacy_title.trim()
                                : null,
                    }));

                return {
                    id:
                        typeof cycle.id === "string" && cycle.id
                            ? cycle.id
                            : newId(),
                    items,
                };
            });

        return {
            payload: {
                version: 4,
                cycles: cycles.length ? cycles : createDefaultCycles(6),
            },
            migrated: false,
        };
    }

    const disciplinaByNormalizedName = new Map(
        disciplinas.map(
            (item) => [normalizar(item.nome), item] as const
        )
    );

    const legacyMateriaMap = new Map(
        legacyMaterias.map((item) => [item.id, item] as const)
    );

    const legacyAssuntoMap = new Map(
        legacyAssuntos.map((item) => [item.id, item] as const)
    );

    function resolveLegacyItem(rawItem: LegacyCycleItem): ScheduleItem | null {
        let disciplina: Disciplina | null = null;
        let legacyTitle: string | null = null;

        if (
            typeof rawItem.materia_id === "string" &&
            rawItem.materia_id
        ) {
            const legacyMateria =
                legacyMateriaMap.get(rawItem.materia_id) ?? null;

            if (legacyMateria) {
                disciplina =
                    disciplinaByNormalizedName.get(
                        normalizar(legacyMateria.nome)
                    ) ?? null;

                if (!disciplina) {
                    legacyTitle = legacyMateria.nome;
                }
            }
        }

        if (
            !disciplina &&
            typeof rawItem.free_title === "string" &&
            rawItem.free_title.trim()
        ) {
            const titulo = rawItem.free_title.trim();
            disciplina =
                disciplinaByNormalizedName.get(normalizar(titulo)) ?? null;

            if (!disciplina) {
                legacyTitle = titulo;
            }
        }

        let assuntoId: string | null = null;

        if (
            disciplina &&
            typeof rawItem.assunto_id === "string" &&
            rawItem.assunto_id
        ) {
            const legacyAssunto =
                legacyAssuntoMap.get(rawItem.assunto_id) ?? null;

            if (legacyAssunto) {
                assuntoId =
                    assuntos.find(
                        (assunto) =>
                            assunto.disciplina_id === disciplina!.id &&
                            normalizar(assunto.nome) ===
                            normalizar(legacyAssunto.nome)
                    )?.id ?? null;
            }
        }

        if (!disciplina && !legacyTitle) return null;

        return {
            id:
                typeof rawItem.id === "string" && rawItem.id
                    ? rawItem.id
                    : newId(),
            disciplina_id: disciplina?.id ?? null,
            assunto_id: assuntoId,
            legacy_title: legacyTitle,
        };
    }

    const orderedItems: ScheduleItem[] = [];

    // Ciclo v3/v2.
    if (
        isRecord(raw) &&
        (Number(raw.version) === 3 || Number(raw.version) === 2) &&
        Array.isArray(raw.items)
    ) {
        for (const value of raw.items) {
            if (!isRecord(value)) continue;

            const resolved = resolveLegacyItem(value);
            if (resolved) orderedItems.push(resolved);
        }
    }

    // Cronograma semanal antigo.
    if (Array.isArray(raw)) {
        for (const rawBlock of raw as LegacyWeeklyBlock[]) {
            if (
                !rawBlock ||
                !Array.isArray(rawBlock.atividades)
            ) {
                continue;
            }

            for (const value of rawBlock.atividades) {
                if (typeof value !== "string") continue;

                const titulo = value.trim();
                if (!titulo) continue;

                const disciplina =
                    disciplinaByNormalizedName.get(
                        normalizar(titulo)
                    ) ?? null;

                orderedItems.push({
                    id: newId(),
                    disciplina_id: disciplina?.id ?? null,
                    assunto_id: null,
                    legacy_title: disciplina ? null : titulo,
                });
            }
        }
    }

    if (!orderedItems.length) {
        return {
            payload: emptyPayload(),
            migrated: false,
        };
    }

    // Distribui a sequência antiga nos seis ciclos, linha a linha.
    const cycles = createDefaultCycles(6);

    orderedItems.forEach((item, index) => {
        cycles[index % cycles.length].items.push(item);
    });

    return {
        payload: {
            version: 4,
            cycles,
        },
        migrated: true,
    };
}

/* ============================================================================
 * Página
 * ========================================================================== */

export default function CronogramaPage() {
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [msg, setMsg] = useState("");
    const [error, setError] = useState("");

    const [userId, setUserId] = useState<string | null>(null);
    const [cronogramaId, setCronogramaId] = useState<string | null>(null);

    const [disciplinas, setDisciplinas] = useState<Disciplina[]>([]);
    const [assuntos, setAssuntos] = useState<Assunto[]>([]);

    const [schedule, setSchedule] =
        useState<SchedulePayload>(emptyPayload());

    const [targetCycleId, setTargetCycleId] = useState("");
    const [disciplinaNova, setDisciplinaNova] = useState("");
    const [assuntoNovo, setAssuntoNovo] = useState("");

    const loadedRef = useRef(false);
    const saveMessageTimerRef =
        useRef<ReturnType<typeof setTimeout> | null>(null);

    const disciplinaMap = useMemo(() => {
        const map = new Map<string, Disciplina>();
        disciplinas.forEach((item) => map.set(item.id, item));
        return map;
    }, [disciplinas]);

    const assuntoMap = useMemo(() => {
        const map = new Map<string, Assunto>();
        assuntos.forEach((item) => map.set(item.id, item));
        return map;
    }, [assuntos]);

    const assuntosDaDisciplina = useMemo(
        () =>
            disciplinaNova
                ? assuntos.filter(
                    (item) =>
                        item.ativo &&
                        item.disciplina_id === disciplinaNova
                )
                : [],
        [assuntos, disciplinaNova]
    );

    const maxSlots = useMemo(
        () =>
            Math.max(
                1,
                ...schedule.cycles.map(
                    (cycle) => cycle.items.length
                )
            ),
        [schedule.cycles]
    );

    /* ------------------------------------------------------------------------
     * Load
     * ---------------------------------------------------------------------- */

    useEffect(() => {
        let mounted = true;

        (async () => {
            setLoading(true);
            setError("");

            try {
                const { data: auth, error: authError } =
                    await supabase.auth.getUser();

                const uid = auth.user?.id ?? null;

                if (authError || !uid) {
                    throw new Error("Usuário não autenticado.");
                }

                const [
                    disciplinasReq,
                    assuntosReq,
                    legacyMateriasReq,
                    legacyAssuntosReq,
                    cronogramaReq,
                ] = await Promise.all([
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

                    supabase
                        .from("materias")
                        .select("id,nome")
                        .eq("user_id", uid),

                    supabase
                        .from("assuntos")
                        .select("id,materia_id,nome")
                        .eq("user_id", uid),

                    supabase
                        .from("cronograma")
                        .select("id,blocos")
                        .eq("user_id", uid)
                        .maybeSingle(),
                ]);

                if (!mounted) return;

                const firstError =
                    disciplinasReq.error ||
                    assuntosReq.error ||
                    legacyMateriasReq.error ||
                    legacyAssuntosReq.error ||
                    cronogramaReq.error;

                if (firstError) throw firstError;

                const listaDisciplinas =
                    (disciplinasReq.data ?? []) as Disciplina[];

                const listaAssuntos =
                    (assuntosReq.data ?? []) as Assunto[];

                const listaLegacyMaterias =
                    (legacyMateriasReq.data ?? []) as LegacyMateria[];

                const listaLegacyAssuntos =
                    (legacyAssuntosReq.data ?? []) as LegacyAssunto[];

                setUserId(uid);
                setDisciplinas(listaDisciplinas);
                setAssuntos(listaAssuntos);

                if (!cronogramaReq.data) {
                    const initial = emptyPayload();

                    const { data: created, error: createError } =
                        await supabase
                            .from("cronograma")
                            .insert({
                                user_id: uid,
                                blocos: initial,
                            })
                            .select("id,blocos")
                            .single();

                    if (createError || !created) {
                        throw (
                            createError ??
                            new Error(
                                "Não foi possível criar o cronograma."
                            )
                        );
                    }

                    setCronogramaId(created.id);
                    setSchedule(initial);
                    setTargetCycleId(initial.cycles[0]?.id ?? "");
                } else {
                    const parsed = parseSchedulePayload(
                        cronogramaReq.data.blocos,
                        listaDisciplinas,
                        listaAssuntos,
                        listaLegacyMaterias,
                        listaLegacyAssuntos
                    );

                    setCronogramaId(cronogramaReq.data.id);
                    setSchedule(parsed.payload);
                    setTargetCycleId(
                        parsed.payload.cycles[0]?.id ?? ""
                    );

                    if (parsed.migrated) {
                        setMsg(
                            "Seu cronograma anterior foi reorganizado na tabela de Ciclos 01–06."
                        );
                    }
                }

                loadedRef.current = true;
            } catch (e) {
                if (mounted) {
                    setError(mensagemErro(e));
                }
            } finally {
                if (mounted) {
                    setLoading(false);
                }
            }
        })();

        return () => {
            mounted = false;

            if (saveMessageTimerRef.current) {
                clearTimeout(saveMessageTimerRef.current);
            }
        };
    }, []);

    /* ------------------------------------------------------------------------
     * Salvamento automático
     * ---------------------------------------------------------------------- */

    useEffect(() => {
        if (
            !loadedRef.current ||
            !cronogramaId ||
            !userId
        ) {
            return;
        }

        const timeout = setTimeout(async () => {
            setSaving(true);

            const { error: saveError } = await supabase
                .from("cronograma")
                .update({
                    blocos: schedule,
                    atualizado_em: new Date().toISOString(),
                })
                .eq("id", cronogramaId)
                .eq("user_id", userId);

            setSaving(false);

            if (saveError) {
                setError(
                    saveError.message ||
                    "Não foi possível salvar o cronograma."
                );
                return;
            }

            setError("");
            setMsg("Cronograma salvo.");

            if (saveMessageTimerRef.current) {
                clearTimeout(saveMessageTimerRef.current);
            }

            saveMessageTimerRef.current = setTimeout(
                () => setMsg(""),
                1200
            );
        }, 600);

        return () => clearTimeout(timeout);
    }, [schedule, cronogramaId, userId]);

    /* ------------------------------------------------------------------------
     * Ações
     * ---------------------------------------------------------------------- */

    function addItem() {
        setError("");

        if (!targetCycleId) {
            setError("Selecione o ciclo de destino.");
            return;
        }

        if (!disciplinaNova) {
            setError("Selecione uma disciplina.");
            return;
        }

        if (
            assuntoNovo &&
            assuntoMap.get(assuntoNovo)?.disciplina_id !== disciplinaNova
        ) {
            setError(
                "O assunto selecionado não pertence à disciplina."
            );
            return;
        }

        const cycle = schedule.cycles.find(
            (item) => item.id === targetCycleId
        );

        if (!cycle) {
            setError("Ciclo não encontrado.");
            return;
        }

        const duplicate = cycle.items.some(
            (item) =>
                item.disciplina_id === disciplinaNova &&
                (item.assunto_id ?? "") === (assuntoNovo || "")
        );

        if (duplicate) {
            setError(
                "Essa disciplina/assunto já está neste ciclo."
            );
            return;
        }

        const newItem: ScheduleItem = {
            id: newId(),
            disciplina_id: disciplinaNova,
            assunto_id: assuntoNovo || null,
            legacy_title: null,
        };

        setSchedule((prev) => ({
            ...prev,
            cycles: prev.cycles.map((item) =>
                item.id === targetCycleId
                    ? {
                        ...item,
                        items: [...item.items, newItem],
                    }
                    : item
            ),
        }));

        setDisciplinaNova("");
        setAssuntoNovo("");
    }

    function removeItem(cycleId: string, itemId: string) {
        setSchedule((prev) => ({
            ...prev,
            cycles: prev.cycles.map((cycle) =>
                cycle.id === cycleId
                    ? {
                        ...cycle,
                        items: cycle.items.filter(
                            (item) => item.id !== itemId
                        ),
                    }
                    : cycle
            ),
        }));
    }

    function moveItem(
        cycleId: string,
        itemId: string,
        direction: -1 | 1
    ) {
        setSchedule((prev) => ({
            ...prev,
            cycles: prev.cycles.map((cycle) => {
                if (cycle.id !== cycleId) return cycle;

                const index = cycle.items.findIndex(
                    (item) => item.id === itemId
                );

                const nextIndex = index + direction;

                if (
                    index < 0 ||
                    nextIndex < 0 ||
                    nextIndex >= cycle.items.length
                ) {
                    return cycle;
                }

                const items = [...cycle.items];

                [items[index], items[nextIndex]] = [
                    items[nextIndex],
                    items[index],
                ];

                return {
                    ...cycle,
                    items,
                };
            }),
        }));
    }

    function addCycle() {
        const cycle: ScheduleCycle = {
            id: newId(),
            items: [],
        };

        setSchedule((prev) => ({
            ...prev,
            cycles: [...prev.cycles, cycle],
        }));

        setTargetCycleId(cycle.id);
    }

    function removeCycle(cycleId: string) {
        if (schedule.cycles.length <= 1) {
            setError("O cronograma precisa ter pelo menos um ciclo.");
            return;
        }

        const cycle = schedule.cycles.find(
            (item) => item.id === cycleId
        );

        if (!cycle) return;

        if (cycle.items.length > 0) {
            const confirmed = window.confirm(
                "Este ciclo possui blocos. Remover o ciclo também removerá esses blocos do cronograma. Continuar?"
            );

            if (!confirmed) return;
        }

        const cycles = schedule.cycles.filter(
            (item) => item.id !== cycleId
        );

        setSchedule((prev) => ({
            ...prev,
            cycles,
        }));

        if (targetCycleId === cycleId) {
            setTargetCycleId(cycles[0]?.id ?? "");
        }
    }

    function clearSchedule() {
        const confirmed = window.confirm(
            "Limpar todos os blocos do cronograma? As disciplinas e assuntos do catálogo não serão apagados."
        );

        if (!confirmed) return;

        setSchedule((prev) => ({
            ...prev,
            cycles: prev.cycles.map((cycle) => ({
                ...cycle,
                items: [],
            })),
        }));
    }

    function itemTitle(item: ScheduleItem) {
        if (
            item.disciplina_id &&
            disciplinaMap.has(item.disciplina_id)
        ) {
            return disciplinaMap.get(item.disciplina_id)!.nome;
        }

        return item.legacy_title || "Disciplina não vinculada";
    }

    function itemSubject(item: ScheduleItem) {
        if (
            item.assunto_id &&
            assuntoMap.has(item.assunto_id)
        ) {
            return assuntoMap.get(item.assunto_id)!.nome;
        }

        return item.disciplina_id
            ? "Todos os assuntos"
            : "Registro legado";
    }

    if (loading) {
        return (
            <main className="flex min-h-[60vh] items-center justify-center px-4">
                <div className="text-sm text-muted-foreground">
                    Carregando cronograma...
                </div>
            </main>
        );
    }

    return (
        <main className="mx-auto w-full max-w-[1600px] space-y-6 px-3 py-6 sm:px-6 lg:py-8">
            <header className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
                <div>
                    <div className="flex items-center gap-2 text-sm font-semibold text-primary">
                        <CalendarRange size={18} />
                        Cronograma por ciclos
                    </div>

                    <h1 className="mt-2 text-2xl font-bold tracking-tight sm:text-3xl">
                        Tabela de estudo
                    </h1>

                    <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
                        Sem segunda, terça ou quarta. Cada coluna é um ciclo de estudo e usa somente disciplinas e assuntos do catálogo canônico.
                    </p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <Save size={14} />
                        {saving
                            ? "Salvando..."
                            : "Salvamento automático"}
                    </div>

                    <button
                        type="button"
                        onClick={addCycle}
                        className="inline-flex items-center gap-2 rounded-xl border border-border bg-card px-3 py-2 text-sm font-semibold hover:bg-muted"
                    >
                        <Plus size={16} />
                        Adicionar ciclo
                    </button>

                    <button
                        type="button"
                        onClick={clearSchedule}
                        className="rounded-xl border border-border bg-card px-3 py-2 text-sm font-semibold hover:bg-muted"
                    >
                        Limpar blocos
                    </button>
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

            <section className="rounded-2xl border border-border bg-card p-4 shadow-sm">
                <div className="mb-3">
                    <h2 className="font-semibold">
                        Adicionar bloco ao cronograma
                    </h2>
                    <p className="mt-1 text-xs text-muted-foreground">
                        Escolha o ciclo, a disciplina e, se quiser, um assunto específico.
                    </p>
                </div>

                <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-[220px_minmax(260px,1fr)_minmax(260px,1fr)_auto] xl:items-end">
                    <label className="flex flex-col gap-1">
                        <span className="text-xs text-muted-foreground">
                            Ciclo
                        </span>

                        <select
                            value={targetCycleId}
                            onChange={(e) =>
                                setTargetCycleId(e.target.value)
                            }
                            className="w-full rounded-xl border border-border bg-input px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-primary/20"
                        >
                            {schedule.cycles.map((cycle, index) => (
                                <option
                                    key={cycle.id}
                                    value={cycle.id}
                                >
                                    {formatCycle(index)}
                                </option>
                            ))}
                        </select>
                    </label>

                    <label className="flex flex-col gap-1">
                        <span className="text-xs text-muted-foreground">
                            Disciplina
                        </span>

                        <select
                            value={disciplinaNova}
                            onChange={(e) => {
                                setDisciplinaNova(e.target.value);
                                setAssuntoNovo("");
                            }}
                            className="w-full rounded-xl border border-border bg-input px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-primary/20"
                        >
                            <option value="">
                                Selecione uma disciplina
                            </option>

                            {disciplinas
                                .filter((item) => item.ativo)
                                .map((item) => (
                                    <option
                                        key={item.id}
                                        value={item.id}
                                    >
                                        {item.nome}
                                    </option>
                                ))}
                        </select>
                    </label>

                    <label className="flex flex-col gap-1">
                        <span className="text-xs text-muted-foreground">
                            Assunto opcional
                        </span>

                        <select
                            value={assuntoNovo}
                            disabled={!disciplinaNova}
                            onChange={(e) =>
                                setAssuntoNovo(e.target.value)
                            }
                            className="w-full rounded-xl border border-border bg-input px-3 py-2.5 text-sm outline-none disabled:opacity-50 focus:ring-2 focus:ring-primary/20"
                        >
                            <option value="">
                                Todos os assuntos
                            </option>

                            {assuntosDaDisciplina.map((item) => (
                                <option
                                    key={item.id}
                                    value={item.id}
                                >
                                    {item.nome}
                                </option>
                            ))}
                        </select>
                    </label>

                    <button
                        type="button"
                        onClick={addItem}
                        className="inline-flex h-[42px] items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground hover:opacity-90"
                    >
                        <Plus size={17} />
                        Adicionar
                    </button>
                </div>
            </section>

            <section className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
                <div className="flex flex-col gap-2 border-b border-border px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                        <h2 className="font-semibold">
                            Cronograma
                        </h2>
                        <p className="mt-1 text-xs text-muted-foreground">
                            {schedule.cycles.length} ciclo(s) •{" "}
                            {schedule.cycles.reduce(
                                (total, cycle) =>
                                    total + cycle.items.length,
                                0
                            )}{" "}
                            bloco(s)
                        </p>
                    </div>

                    <p className="text-xs text-muted-foreground">
                        A ordem vertical dentro de cada ciclo pode ser ajustada pelas setas.
                    </p>
                </div>

                <div className="w-full overflow-x-auto">
                    <table
                        className="w-full border-collapse text-sm"
                        style={{
                            minWidth: Math.max(
                                980,
                                schedule.cycles.length * 250 + 110
                            ),
                        }}
                    >
                        <thead>
                            <tr className="bg-muted/70">
                                <th className="w-[110px] border-b border-r border-border px-3 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                                    Ordem
                                </th>

                                {schedule.cycles.map((cycle, index) => (
                                    <th
                                        key={cycle.id}
                                        className="min-w-[250px] border-b border-r border-border px-3 py-3 text-left last:border-r-0"
                                    >
                                        <div className="flex items-center justify-between gap-2">
                                            <div>
                                                <div className="font-semibold text-foreground">
                                                    {formatCycle(index)}
                                                </div>
                                                <div className="mt-0.5 text-[11px] font-normal text-muted-foreground">
                                                    {cycle.items.length} bloco(s)
                                                </div>
                                            </div>

                                            {schedule.cycles.length > 1 && (
                                                <button
                                                    type="button"
                                                    title={`Remover ${formatCycle(
                                                        index
                                                    )}`}
                                                    onClick={() =>
                                                        removeCycle(
                                                            cycle.id
                                                        )
                                                    }
                                                    className="rounded-lg p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                                                >
                                                    <Trash2 size={14} />
                                                </button>
                                            )}
                                        </div>
                                    </th>
                                ))}
                            </tr>
                        </thead>

                        <tbody>
                            {Array.from({
                                length: maxSlots,
                            }).map((_, slotIndex) => (
                                <tr
                                    key={slotIndex}
                                    className="align-top"
                                >
                                    <td className="border-b border-r border-border bg-muted/20 px-3 py-3 text-xs font-semibold text-muted-foreground">
                                        {formatSlot(slotIndex)}
                                    </td>

                                    {schedule.cycles.map((cycle) => {
                                        const item =
                                            cycle.items[slotIndex] ??
                                            null;

                                        return (
                                            <td
                                                key={cycle.id}
                                                className="border-b border-r border-border p-2 last:border-r-0"
                                            >
                                                {item ? (
                                                    <div
                                                        className={`rounded-xl border p-3 ${item.disciplina_id
                                                                ? "border-border bg-background"
                                                                : "border-amber-200 bg-amber-50"
                                                            }`}
                                                    >
                                                        <div className="font-semibold leading-snug">
                                                            {itemTitle(item)}
                                                        </div>

                                                        <div className="mt-1 text-xs leading-relaxed text-muted-foreground">
                                                            {itemSubject(item)}
                                                        </div>

                                                        {!item.disciplina_id && (
                                                            <div className="mt-2 text-[11px] text-amber-700">
                                                                Registro antigo sem correspondência no catálogo. Você pode removê-lo e adicionar a disciplina canônica correta.
                                                            </div>
                                                        )}

                                                        <div className="mt-3 flex items-center justify-end gap-1">
                                                            <button
                                                                type="button"
                                                                title="Subir"
                                                                disabled={
                                                                    slotIndex ===
                                                                    0
                                                                }
                                                                onClick={() =>
                                                                    moveItem(
                                                                        cycle.id,
                                                                        item.id,
                                                                        -1
                                                                    )
                                                                }
                                                                className="rounded-lg border border-border p-1.5 hover:bg-muted disabled:cursor-not-allowed disabled:opacity-30"
                                                            >
                                                                <ArrowUp
                                                                    size={
                                                                        14
                                                                    }
                                                                />
                                                            </button>

                                                            <button
                                                                type="button"
                                                                title="Descer"
                                                                disabled={
                                                                    slotIndex ===
                                                                    cycle.items
                                                                        .length -
                                                                    1
                                                                }
                                                                onClick={() =>
                                                                    moveItem(
                                                                        cycle.id,
                                                                        item.id,
                                                                        1
                                                                    )
                                                                }
                                                                className="rounded-lg border border-border p-1.5 hover:bg-muted disabled:cursor-not-allowed disabled:opacity-30"
                                                            >
                                                                <ArrowDown
                                                                    size={
                                                                        14
                                                                    }
                                                                />
                                                            </button>

                                                            <button
                                                                type="button"
                                                                title="Excluir bloco"
                                                                onClick={() =>
                                                                    removeItem(
                                                                        cycle.id,
                                                                        item.id
                                                                    )
                                                                }
                                                                className="rounded-lg border border-destructive/20 p-1.5 text-destructive hover:bg-destructive/10"
                                                            >
                                                                <Trash2
                                                                    size={
                                                                        14
                                                                    }
                                                                />
                                                            </button>
                                                        </div>
                                                    </div>
                                                ) : (
                                                    <div className="flex min-h-[92px] items-center justify-center rounded-xl border border-dashed border-border text-xs text-muted-foreground/60">
                                                        —
                                                    </div>
                                                )}
                                            </td>
                                        );
                                    })}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </section>

            <p className="text-xs leading-relaxed text-muted-foreground">
                O cronograma apenas organiza sua sequência de estudo. Ele não cria disciplinas nem assuntos: toda classificação vem do catálogo canônico em /catalogo.
            </p>
        </main>
    );
}
