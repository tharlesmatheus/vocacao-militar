"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
    ArrowDown,
    ArrowUp,
    CheckCircle2,
    ChevronRight,
    ListRestart,
    Plus,
    RotateCcw,
    Save,
    Trash2,
} from "lucide-react";

import { supabase } from "@/lib/supabaseClient";

/* ==========================================================================
 * Tipos
 * ========================================================================== */

type Materia = {
    id: string;
    nome: string;
};

type Assunto = {
    id: string;
    nome: string;
    materia_id: string | null;
};

type CycleItem = {
    id: string;
    materia_id: string | null;
    assunto_id: string | null;
    free_title: string | null;
};

type CyclePayload = {
    version: 3;
    current_item_id: string | null;
    round: number;
    items: CycleItem[];
};

type LegacyWeeklyBlock = {
    hora?: unknown;
    atividades?: unknown;
};

/* ==========================================================================
 * Helpers
 * ========================================================================== */

function newId() {
    if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
        return crypto.randomUUID();
    }

    return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
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

function clampRound(value: unknown) {
    const n = Math.floor(Number(value));
    return Number.isFinite(n) && n >= 1 ? n : 1;
}

function emptyPayload(): CyclePayload {
    return {
        version: 3,
        current_item_id: null,
        round: 1,
        items: [],
    };
}

function normalizeCurrent(payload: CyclePayload): CyclePayload {
    if (!payload.items.length) {
        return {
            ...payload,
            current_item_id: null,
        };
    }

    const exists = payload.items.some(
        (item) => item.id === payload.current_item_id
    );

    if (exists) return payload;

    return {
        ...payload,
        current_item_id: payload.items[0].id,
    };
}

/**
 * Aceita:
 * - versão 3 (nova tabela simples)
 * - versão 2 (ciclo anterior mais complexo)
 * - cronograma semanal antigo (array de blocos)
 *
 * Assim a troca da interface não apaga o que o usuário já tinha.
 */
function parseCyclePayload(
    raw: unknown,
    materias: Materia[]
): { payload: CyclePayload; migrated: boolean } {
    if (
        isRecord(raw) &&
        Number(raw.version) === 3 &&
        Array.isArray(raw.items)
    ) {
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
                    typeof item.free_title === "string" &&
                        item.free_title.trim()
                        ? item.free_title.trim()
                        : null,
            }));

        return {
            payload: normalizeCurrent({
                version: 3,
                current_item_id:
                    typeof raw.current_item_id === "string"
                        ? raw.current_item_id
                        : null,
                round: clampRound(raw.round),
                items,
            }),
            migrated: false,
        };
    }

    // Migração do ciclo v2 anterior.
    if (
        isRecord(raw) &&
        Number(raw.version) === 2 &&
        Array.isArray(raw.items)
    ) {
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
                    typeof item.free_title === "string" &&
                        item.free_title.trim()
                        ? item.free_title.trim()
                        : null,
            }));

        return {
            payload: normalizeCurrent({
                version: 3,
                current_item_id:
                    typeof raw.current_item_id === "string"
                        ? raw.current_item_id
                        : null,
                round: clampRound(raw.round),
                items,
            }),
            migrated: true,
        };
    }

    // Migração do cronograma semanal antigo.
    if (Array.isArray(raw)) {
        const materiaByName = new Map(
            materias.map(
                (materia) =>
                    [normalizeText(materia.nome), materia] as const
            )
        );

        const seen = new Set<string>();
        const items: CycleItem[] = [];

        for (const rawBlock of raw as LegacyWeeklyBlock[]) {
            if (
                !rawBlock ||
                !Array.isArray(rawBlock.atividades)
            ) {
                continue;
            }

            for (const value of rawBlock.atividades) {
                if (typeof value !== "string") continue;

                const title = value.trim();
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
                });
            }
        }

        return {
            payload: normalizeCurrent({
                version: 3,
                current_item_id: items[0]?.id ?? null,
                round: 1,
                items,
            }),
            migrated: items.length > 0,
        };
    }

    return {
        payload: emptyPayload(),
        migrated: false,
    };
}

/* ==========================================================================
 * Página
 * ========================================================================== */

export default function CicloDeEstudosPage() {
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [msg, setMsg] = useState("");
    const [error, setError] = useState("");

    const [userId, setUserId] = useState<string | null>(null);
    const [cronogramaId, setCronogramaId] = useState<string | null>(null);

    const [materias, setMaterias] = useState<Materia[]>([]);
    const [assuntos, setAssuntos] = useState<Assunto[]>([]);

    const [cycle, setCycle] =
        useState<CyclePayload>(emptyPayload());

    const [materiaNova, setMateriaNova] = useState("");
    const [assuntoNovo, setAssuntoNovo] = useState("");

    const loadedRef = useRef(false);
    const saveMessageTimerRef =
        useRef<ReturnType<typeof setTimeout> | null>(null);

    const materiaMap = useMemo(() => {
        const map: Record<string, string> = {};

        for (const materia of materias) {
            map[materia.id] = materia.nome;
        }

        return map;
    }, [materias]);

    const assuntoMap = useMemo(() => {
        const map: Record<string, string> = {};

        for (const assunto of assuntos) {
            map[assunto.id] = assunto.nome;
        }

        return map;
    }, [assuntos]);

    const assuntosDaMateria = useMemo(
        () =>
            materiaNova
                ? assuntos.filter(
                    (assunto) =>
                        assunto.materia_id === materiaNova
                )
                : [],
        [assuntos, materiaNova]
    );

    const currentIndex = useMemo(() => {
        if (!cycle.items.length) return -1;

        const index = cycle.items.findIndex(
            (item) => item.id === cycle.current_item_id
        );

        return index >= 0 ? index : 0;
    }, [cycle.items, cycle.current_item_id]);

    const currentItem =
        currentIndex >= 0 ? cycle.items[currentIndex] : null;

    const nextItem =
        cycle.items.length > 1 && currentIndex >= 0
            ? cycle.items[
            (currentIndex + 1) % cycle.items.length
            ]
            : null;

    useEffect(() => {
        let mounted = true;

        (async () => {
            setLoading(true);
            setError("");

            try {
                const {
                    data: auth,
                    error: authError,
                } = await supabase.auth.getUser();

                const user = auth?.user;

                if (authError || !user?.id) {
                    throw new Error("Usuário não autenticado.");
                }

                const [
                    materiasRes,
                    assuntosRes,
                    cronogramaRes,
                ] = await Promise.all([
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

                if (materiasRes.error) {
                    throw materiasRes.error;
                }

                if (assuntosRes.error) {
                    throw assuntosRes.error;
                }

                if (cronogramaRes.error) {
                    throw cronogramaRes.error;
                }

                const mList =
                    (materiasRes.data ?? []) as Materia[];

                const aList =
                    (assuntosRes.data ?? []) as Assunto[];

                setUserId(user.id);
                setMaterias(mList);
                setAssuntos(aList);

                if (!cronogramaRes.data) {
                    const initial = emptyPayload();

                    const {
                        data: created,
                        error: createError,
                    } = await supabase
                        .from("cronograma")
                        .insert({
                            user_id: user.id,
                            blocos: initial,
                        })
                        .select("id,blocos")
                        .single();

                    if (createError || !created) {
                        throw (
                            createError ??
                            new Error(
                                "Não foi possível criar o ciclo."
                            )
                        );
                    }

                    setCronogramaId(created.id);
                    setCycle(initial);
                } else {
                    const parsed = parseCyclePayload(
                        cronogramaRes.data.blocos,
                        mList
                    );

                    setCronogramaId(
                        cronogramaRes.data.id
                    );
                    setCycle(parsed.payload);

                    if (parsed.migrated) {
                        setMsg(
                            "Seu planejamento anterior foi convertido para o novo ciclo simples."
                        );
                    }
                }

                loadedRef.current = true;
            } catch (e: any) {
                if (!mounted) return;

                setError(
                    e?.message ||
                    "Não foi possível carregar o ciclo de estudos."
                );
            } finally {
                if (mounted) {
                    setLoading(false);
                }
            }
        })();

        return () => {
            mounted = false;

            if (saveMessageTimerRef.current) {
                clearTimeout(
                    saveMessageTimerRef.current
                );
            }
        };
    }, []);

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

            const payload = normalizeCurrent({
                ...cycle,
                version: 3,
                round: Math.max(1, cycle.round),
            });

            const { error: saveError } =
                await supabase
                    .from("cronograma")
                    .update({
                        blocos: payload,
                        atualizado_em:
                            new Date().toISOString(),
                    })
                    .eq("id", cronogramaId)
                    .eq("user_id", userId);

            setSaving(false);

            if (saveError) {
                setError(
                    saveError.message ||
                    "Não foi possível salvar o ciclo."
                );
                return;
            }

            setError("");
            setMsg("Ciclo salvo.");

            if (saveMessageTimerRef.current) {
                clearTimeout(
                    saveMessageTimerRef.current
                );
            }

            saveMessageTimerRef.current =
                setTimeout(
                    () => setMsg(""),
                    1200
                );
        }, 600);

        return () => clearTimeout(timeout);
    }, [cycle, cronogramaId, userId]);

    function itemTitle(item: CycleItem) {
        if (
            item.materia_id &&
            materiaMap[item.materia_id]
        ) {
            return materiaMap[item.materia_id];
        }

        return (
            item.free_title ||
            "Matéria não vinculada"
        );
    }

    function itemSubject(item: CycleItem) {
        if (
            item.assunto_id &&
            assuntoMap[item.assunto_id]
        ) {
            return assuntoMap[item.assunto_id];
        }

        return "Todos os assuntos";
    }

    function addItem() {
        setError("");

        if (!materiaNova) {
            setError(
                "Selecione uma matéria para adicionar ao ciclo."
            );
            return;
        }

        const duplicate = cycle.items.some(
            (item) =>
                item.materia_id === materiaNova &&
                (item.assunto_id ?? "") ===
                (assuntoNovo || "")
        );

        if (duplicate) {
            setError(
                "Essa matéria/assunto já está no ciclo."
            );
            return;
        }

        const item: CycleItem = {
            id: newId(),
            materia_id: materiaNova,
            assunto_id: assuntoNovo || null,
            free_title: null,
        };

        setCycle((prev) => ({
            ...prev,
            items: [...prev.items, item],
            current_item_id:
                prev.current_item_id ?? item.id,
        }));

        setMateriaNova("");
        setAssuntoNovo("");
    }

    function removeItem(id: string) {
        setCycle((prev) => {
            const oldIndex = prev.items.findIndex(
                (item) => item.id === id
            );

            const items = prev.items.filter(
                (item) => item.id !== id
            );

            let currentId = prev.current_item_id;

            if (currentId === id) {
                if (!items.length) {
                    currentId = null;
                } else {
                    const nextIndex = Math.min(
                        Math.max(oldIndex, 0),
                        items.length - 1
                    );

                    currentId =
                        items[nextIndex]?.id ??
                        items[0].id;
                }
            }

            return normalizeCurrent({
                ...prev,
                items,
                current_item_id: currentId,
            });
        });
    }

    function moveItem(
        id: string,
        direction: -1 | 1
    ) {
        setCycle((prev) => {
            const index = prev.items.findIndex(
                (item) => item.id === id
            );

            if (index < 0) return prev;

            const nextIndex = index + direction;

            if (
                nextIndex < 0 ||
                nextIndex >= prev.items.length
            ) {
                return prev;
            }

            const items = [...prev.items];

            [items[index], items[nextIndex]] = [
                items[nextIndex],
                items[index],
            ];

            return {
                ...prev,
                items,
            };
        });
    }

    function setCurrent(id: string) {
        setCycle((prev) => ({
            ...prev,
            current_item_id: id,
        }));
    }

    function advanceCycle() {
        if (
            !cycle.items.length ||
            currentIndex < 0
        ) {
            return;
        }

        const nextIndex =
            (currentIndex + 1) %
            cycle.items.length;

        const wrapped =
            nextIndex === 0 &&
            cycle.items.length > 0;

        setCycle((prev) => ({
            ...prev,
            current_item_id:
                prev.items[nextIndex].id,
            round: wrapped
                ? prev.round + 1
                : prev.round,
        }));
    }

    function resetPosition() {
        setCycle((prev) => ({
            ...prev,
            current_item_id:
                prev.items[0]?.id ?? null,
            round: 1,
        }));
    }

    function stepDistance(index: number) {
        if (
            currentIndex < 0 ||
            !cycle.items.length
        ) {
            return null;
        }

        return (
            index -
            currentIndex +
            cycle.items.length
        ) % cycle.items.length;
    }

    function statusLabel(index: number) {
        const distance = stepDistance(index);

        if (distance === null) return "";
        if (distance === 0) return "Agora";
        if (distance === 1) return "Próxima";

        return `Em ${distance} etapas`;
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
                        Sua sequência de matérias
                    </h1>

                    <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
                        Sem dias da semana. Você só segue a ordem do ciclo e,
                        na próxima sessão, continua exatamente de onde parou.
                    </p>
                </div>

                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Save size={14} />
                    {saving
                        ? "Salvando..."
                        : "Salvamento automático"}
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
                <div className="flex flex-col gap-3 lg:flex-row lg:items-end">
                    <label className="flex min-w-0 flex-1 flex-col gap-1">
                        <span className="text-xs text-muted-foreground">
                            Matéria
                        </span>

                        <select
                            value={materiaNova}
                            onChange={(e) => {
                                setMateriaNova(
                                    e.target.value
                                );
                                setAssuntoNovo("");
                            }}
                            className="w-full rounded-xl border border-border bg-input px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-primary/20"
                        >
                            <option value="">
                                Selecione uma matéria
                            </option>

                            {materias.map(
                                (materia) => (
                                    <option
                                        key={
                                            materia.id
                                        }
                                        value={
                                            materia.id
                                        }
                                    >
                                        {
                                            materia.nome
                                        }
                                    </option>
                                )
                            )}
                        </select>
                    </label>

                    <label className="flex min-w-0 flex-1 flex-col gap-1">
                        <span className="text-xs text-muted-foreground">
                            Assunto opcional
                        </span>

                        <select
                            value={assuntoNovo}
                            onChange={(e) =>
                                setAssuntoNovo(
                                    e.target.value
                                )
                            }
                            disabled={!materiaNova}
                            className="w-full rounded-xl border border-border bg-input px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-primary/20 disabled:opacity-50"
                        >
                            <option value="">
                                Todos os assuntos
                            </option>

                            {assuntosDaMateria.map(
                                (assunto) => (
                                    <option
                                        key={
                                            assunto.id
                                        }
                                        value={
                                            assunto.id
                                        }
                                    >
                                        {
                                            assunto.nome
                                        }
                                    </option>
                                )
                            )}
                        </select>
                    </label>

                    <button
                        type="button"
                        onClick={addItem}
                        className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground hover:opacity-90"
                    >
                        <Plus size={17} />
                        Adicionar ao ciclo
                    </button>
                </div>
            </section>

            <section className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
                <div className="flex flex-col gap-3 border-b border-border px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                        <h2 className="font-semibold">
                            Ordem do ciclo
                        </h2>

                        <p className="mt-1 text-xs text-muted-foreground">
                            {cycle.items.length}{" "}
                            {cycle.items.length === 1
                                ? "etapa"
                                : "etapas"}{" "}
                            • volta {cycle.round}
                            {nextItem
                                ? ` • próxima: ${itemTitle(
                                    nextItem
                                )}`
                                : ""}
                        </p>
                    </div>

                    <div className="flex flex-wrap gap-2">
                        {currentItem && (
                            <button
                                type="button"
                                onClick={
                                    advanceCycle
                                }
                                className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90"
                            >
                                <CheckCircle2
                                    size={16}
                                />
                                Concluir atual
                                <ChevronRight
                                    size={16}
                                />
                            </button>
                        )}

                        {cycle.items.length > 0 && (
                            <button
                                type="button"
                                onClick={
                                    resetPosition
                                }
                                className="inline-flex items-center gap-2 rounded-xl border border-border bg-card px-3 py-2 text-sm font-semibold hover:bg-muted"
                            >
                                <RotateCcw
                                    size={15}
                                />
                                Reiniciar ciclo
                            </button>
                        )}
                    </div>
                </div>

                {cycle.items.length === 0 ? (
                    <div className="px-4 py-12 text-center">
                        <ListRestart className="mx-auto h-8 w-8 text-muted-foreground" />

                        <h3 className="mt-3 font-semibold">
                            Seu ciclo ainda está vazio
                        </h3>

                        <p className="mt-1 text-sm text-muted-foreground">
                            Adicione as matérias acima na ordem em que deseja estudá-las.
                        </p>
                    </div>
                ) : (
                    <div className="w-full overflow-x-auto">
                        <table className="w-full min-w-[760px] text-sm">
                            <thead className="bg-muted/70 text-left text-xs uppercase tracking-wide text-muted-foreground">
                                <tr>
                                    <th className="w-20 px-4 py-3 text-center">
                                        Ordem
                                    </th>
                                    <th className="px-4 py-3">
                                        Matéria
                                    </th>
                                    <th className="px-4 py-3">
                                        Assunto
                                    </th>
                                    <th className="w-40 px-4 py-3">
                                        Situação
                                    </th>
                                    <th className="w-64 px-4 py-3 text-right">
                                        Ações
                                    </th>
                                </tr>
                            </thead>

                            <tbody className="divide-y divide-border">
                                {cycle.items.map(
                                    (item, index) => {
                                        const isCurrent =
                                            item.id ===
                                            currentItem?.id;

                                        const distance =
                                            stepDistance(
                                                index
                                            );

                                        return (
                                            <tr
                                                key={
                                                    item.id
                                                }
                                                className={
                                                    isCurrent
                                                        ? "bg-primary/5"
                                                        : "hover:bg-muted/30"
                                                }
                                            >
                                                <td className="px-4 py-3 text-center font-bold text-muted-foreground">
                                                    {index +
                                                        1}
                                                </td>

                                                <td className="px-4 py-3">
                                                    <div className="font-semibold text-foreground">
                                                        {itemTitle(
                                                            item
                                                        )}
                                                    </div>
                                                </td>

                                                <td className="px-4 py-3 text-muted-foreground">
                                                    {itemSubject(
                                                        item
                                                    )}
                                                </td>

                                                <td className="px-4 py-3">
                                                    <span
                                                        className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${distance ===
                                                                0
                                                                ? "border-primary/30 bg-primary/10 text-primary"
                                                                : distance ===
                                                                    1
                                                                    ? "border-amber-300 bg-amber-50 text-amber-700"
                                                                    : "border-border bg-muted text-muted-foreground"
                                                            }`}
                                                    >
                                                        {statusLabel(
                                                            index
                                                        )}
                                                    </span>
                                                </td>

                                                <td className="px-4 py-3">
                                                    <div className="flex items-center justify-end gap-1">
                                                        <button
                                                            type="button"
                                                            onClick={() =>
                                                                moveItem(
                                                                    item.id,
                                                                    -1
                                                                )
                                                            }
                                                            disabled={
                                                                index ===
                                                                0
                                                            }
                                                            title="Subir"
                                                            className="rounded-lg border border-border p-2 hover:bg-muted disabled:cursor-not-allowed disabled:opacity-30"
                                                        >
                                                            <ArrowUp
                                                                size={
                                                                    15
                                                                }
                                                            />
                                                        </button>

                                                        <button
                                                            type="button"
                                                            onClick={() =>
                                                                moveItem(
                                                                    item.id,
                                                                    1
                                                                )
                                                            }
                                                            disabled={
                                                                index ===
                                                                cycle
                                                                    .items
                                                                    .length -
                                                                1
                                                            }
                                                            title="Descer"
                                                            className="rounded-lg border border-border p-2 hover:bg-muted disabled:cursor-not-allowed disabled:opacity-30"
                                                        >
                                                            <ArrowDown
                                                                size={
                                                                    15
                                                                }
                                                            />
                                                        </button>

                                                        {!isCurrent && (
                                                            <button
                                                                type="button"
                                                                onClick={() =>
                                                                    setCurrent(
                                                                        item.id
                                                                    )
                                                                }
                                                                className="rounded-lg border border-border px-3 py-2 text-xs font-semibold hover:bg-muted"
                                                            >
                                                                Começar
                                                                daqui
                                                            </button>
                                                        )}

                                                        <button
                                                            type="button"
                                                            onClick={() =>
                                                                removeItem(
                                                                    item.id
                                                                )
                                                            }
                                                            title="Excluir"
                                                            className="rounded-lg border border-destructive/20 p-2 text-destructive hover:bg-destructive/10"
                                                        >
                                                            <Trash2
                                                                size={
                                                                    15
                                                                }
                                                            />
                                                        </button>
                                                    </div>
                                                </td>
                                            </tr>
                                        );
                                    }
                                )}
                            </tbody>
                        </table>
                    </div>
                )}
            </section>

            <p className="text-xs leading-relaxed text-muted-foreground">
                O ciclo serve apenas para organizar a sequência. Concluir uma etapa
                não gera XP nem registra tempo automaticamente; questões, revisões e
                tempo continuam sendo contabilizados nas áreas próprias do aplicativo.
            </p>
        </main>
    );
}
