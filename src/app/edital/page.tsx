"use client";

import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import BadgeSeen from "@/components/BadgeSeen";
import {
    ResponsiveContainer,
    BarChart,
    Bar,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    Legend,
    Cell,
} from "recharts";

/** Tipos */
type Edital = { id: string; nome: string };
type Materia = { id: string; nome: string };
type Assunto = {
    id: string;
    nome: string;
    visto_count: number;
    importance_level: number;
};


type CatalogDisciplina = {
    id: string;
    nome: string;
    ativo: boolean;
};

type CatalogAssunto = {
    id: string;
    disciplina_id: string;
    nome: string;
    ativo: boolean;
};

type AssuntoEstrutura = {
    id: string;
    materia_id: string;
    nome: string;
};

function normalizarNomeCatalogo(valor: string) {
    return valor
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLocaleLowerCase("pt-BR")
        .replace(/[^a-z0-9]+/g, "");
}

function mensagemErro(error: unknown) {
    if (
        error &&
        typeof error === "object" &&
        "message" in error
    ) {
        return String((error as { message?: unknown }).message ?? "Erro inesperado.");
    }

    if (error instanceof Error) return error.message;

    return "Erro inesperado.";
}

async function garantirDisciplinaCanonica(
    uid: string,
    nome: string
): Promise<CatalogDisciplina> {
    const nomeLimpo = nome.trim();

    if (!nomeLimpo) {
        throw new Error("Informe o nome da disciplina.");
    }

    const chave = normalizarNomeCatalogo(nomeLimpo);

    const { data: existente, error: erroLeitura } = await supabase
        .from("questao_disciplinas")
        .select("id,nome,ativo")
        .eq("user_id", uid)
        .eq("nome_normalizado", chave)
        .maybeSingle();

    if (erroLeitura) throw erroLeitura;

    if (existente) {
        if (!existente.ativo) {
            const { data: reativada, error: erroReativar } = await supabase
                .from("questao_disciplinas")
                .update({ ativo: true })
                .eq("id", existente.id)
                .eq("user_id", uid)
                .select("id,nome,ativo")
                .single();

            if (erroReativar) throw erroReativar;
            return reativada as CatalogDisciplina;
        }

        return existente as CatalogDisciplina;
    }

    const { data, error } = await supabase
        .from("questao_disciplinas")
        .insert({
            user_id: uid,
            nome: nomeLimpo,
            ativo: true,
        })
        .select("id,nome,ativo")
        .single();

    if (!error && data) {
        return data as CatalogDisciplina;
    }

    // Proteção para uma eventual corrida de duas inserções simultâneas.
    if ((error as { code?: string } | null)?.code === "23505") {
        const { data: concorrente, error: erroConcorrente } = await supabase
            .from("questao_disciplinas")
            .select("id,nome,ativo")
            .eq("user_id", uid)
            .eq("nome_normalizado", chave)
            .single();

        if (erroConcorrente) throw erroConcorrente;
        return concorrente as CatalogDisciplina;
    }

    throw error ?? new Error("Não foi possível criar a disciplina.");
}

async function garantirAssuntoCanonico(
    uid: string,
    disciplinaId: string,
    nome: string
): Promise<CatalogAssunto> {
    const nomeLimpo = nome.trim();

    if (!disciplinaId) {
        throw new Error("Selecione a disciplina do assunto.");
    }

    if (!nomeLimpo) {
        throw new Error("Informe o nome do assunto.");
    }

    const chave = normalizarNomeCatalogo(nomeLimpo);

    const { data: existente, error: erroLeitura } = await supabase
        .from("questao_assuntos")
        .select("id,disciplina_id,nome,ativo")
        .eq("user_id", uid)
        .eq("disciplina_id", disciplinaId)
        .eq("nome_normalizado", chave)
        .maybeSingle();

    if (erroLeitura) throw erroLeitura;

    if (existente) {
        if (!existente.ativo) {
            const { data: reativado, error: erroReativar } = await supabase
                .from("questao_assuntos")
                .update({ ativo: true })
                .eq("id", existente.id)
                .eq("user_id", uid)
                .select("id,disciplina_id,nome,ativo")
                .single();

            if (erroReativar) throw erroReativar;
            return reativado as CatalogAssunto;
        }

        return existente as CatalogAssunto;
    }

    const { data, error } = await supabase
        .from("questao_assuntos")
        .insert({
            user_id: uid,
            disciplina_id: disciplinaId,
            nome: nomeLimpo,
            ativo: true,
        })
        .select("id,disciplina_id,nome,ativo")
        .single();

    if (!error && data) {
        return data as CatalogAssunto;
    }

    if ((error as { code?: string } | null)?.code === "23505") {
        const { data: concorrente, error: erroConcorrente } = await supabase
            .from("questao_assuntos")
            .select("id,disciplina_id,nome,ativo")
            .eq("user_id", uid)
            .eq("disciplina_id", disciplinaId)
            .eq("nome_normalizado", chave)
            .single();

        if (erroConcorrente) throw erroConcorrente;
        return concorrente as CatalogAssunto;
    }

    throw error ?? new Error("Não foi possível criar o assunto.");
}

/** Modal baseado em tokens (sem dark:) */
function TokenModal({
    open,
    title,
    onClose,
    children,
    wide = false,
}: {
    open: boolean;
    title?: string;
    onClose: () => void;
    children: React.ReactNode;
    wide?: boolean;
}) {
    if (!open) return null;
    return (
        <div
            className="fixed inset-0 z-[100] flex items-center justify-center px-4"
            aria-modal="true"
            role="dialog"
        >
            {/* overlay */}
            <div
                className="absolute inset-0 bg-black/60"
                onClick={onClose}
                aria-hidden="true"
            />
            {/* painel */}
            <div
                className={`relative z-[101] w-full ${wide ? "max-w-5xl" : "max-w-2xl"
                    } max-h-[90vh] overflow-hidden rounded-2xl bg-card text-foreground border border-border shadow-xl`}
            >
                <div className="flex items-center justify-between px-5 py-4 border-b border-border rounded-t-2xl">
                    <h2 className="text-lg font-semibold">{title}</h2>
                    <button
                        className="rounded p-2 hover:bg-muted text-muted-foreground"
                        onClick={onClose}
                        aria-label="Fechar"
                    >
                        ✕
                    </button>
                </div>
                <div className="max-h-[calc(90vh-72px)] overflow-y-auto p-5">
                    {children}
                </div>
            </div>
        </div>
    );
}

/** Badge de importância (clicável) – tokens */
function ImportanceBadge({
    level,
    onClick,
}: {
    level: number;
    onClick?: () => void;
}) {
    const map = [
        { txt: "Normal", icon: "⚪", className: "text-muted-foreground" },
        { txt: "Relevante", icon: "⚠️", className: "text-amber-600" },
        { txt: "Importante", icon: "🚨", className: "text-orange-600" },
        { txt: "Cai sempre", icon: "🔥", className: "text-red-600" },
    ];
    const cfg = map[level] ?? map[0];
    return (
        <button
            type="button"
            title={cfg.txt}
            onClick={onClick}
            className={`inline-flex items-center gap-1 text-sm ${onClick ? "hover:opacity-80" : ""
                }`}
        >
            <span>{cfg.icon}</span>
            <span className={cfg.className}>{cfg.txt}</span>
        </button>
    );
}

/** Badge de "vezes visto" (clicável com long-press p/ zerar) */
function SeenBadge({
    count,
    onShortPress,
    onLongPress,
    longPressMs = 700,
}: {
    count: number;
    onShortPress?: () => void; // incrementa (+1)
    onLongPress?: () => void; // zera (0)
    longPressMs?: number; // tempo para considerar "segurar"
}) {
    const timerRef = useRef<number | null>(null);
    const handledByLongPress = useRef(false);

    const startPress = () => {
        handledByLongPress.current = false;
        timerRef.current = window.setTimeout(() => {
            handledByLongPress.current = true;
            onLongPress?.();
        }, longPressMs);
    };

    const clearPress = () => {
        if (timerRef.current) {
            clearTimeout(timerRef.current);
            timerRef.current = null;
        }
    };

    const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
        // se o long-press já tratou, suprime o click
        if (handledByLongPress.current) {
            e.preventDefault();
            e.stopPropagation();
            handledByLongPress.current = false; // reseta para próxima interação
            return;
        }
        onShortPress?.();
    };

    return (
        <button
            type="button"
            title="Clique para +1 • Segure ~0,7s para zerar"
            onMouseDown={startPress}
            onMouseUp={clearPress}
            onMouseLeave={clearPress}
            onTouchStart={startPress}
            onTouchEnd={clearPress}
            onClick={handleClick}
            className="inline-flex items-center gap-1 text-sm hover:opacity-80"
        >
            <span>👁️</span>
            <BadgeSeen count={count} />
        </button>
    );
}

export default function EditalPage() {
    const [editais, setEditais] = useState<Edital[]>([]);
    const [selEdital, setSelEdital] = useState("");
    const [materias, setMaterias] = useState<Materia[]>([]);
    const [assuntos, setAssuntos] = useState<Record<string, Assunto[]>>({});
    const [openNovo, setOpenNovo] = useState(false);
    const [openEditar, setOpenEditar] = useState(false);
    const [loading, setLoading] = useState(true);

    // modal de edição de um assunto
    const [editingAssunto, setEditingAssunto] = useState<{
        open: boolean;
        materiaId: string | null;
        assunto: Assunto | null;
    }>({ open: false, materiaId: null, assunto: null });

    // NOVOS: filtro e gráfico
    const [showOnlyNeverSeen, setShowOnlyNeverSeen] = useState(false);
    const [showGrafico, setShowGrafico] = useState(false);

    // carrega lista de editais do usuário
    useEffect(() => {
        (async () => {
            const uid = (await supabase.auth.getUser()).data.user?.id;
            if (!uid) {
                setEditais([]);
                setLoading(false);
                return;
            }
            const { data } = await supabase
                .from("editais")
                .select("id,nome")
                .eq("user_id", uid)
                .order("created_at", { ascending: false });
            setEditais(data || []);
            setLoading(false);
        })();
    }, []);

    // carrega matérias + assuntos do edital selecionado
    useEffect(() => {
        (async () => {
            if (!selEdital) {
                setMaterias([]);
                setAssuntos({});
                return;
            }
            const uid = (await supabase.auth.getUser()).data.user?.id;
            if (!uid) return;

            const { data: mats } = await supabase
                .from("materias")
                .select("id,nome")
                .eq("user_id", uid)
                .eq("edital_id", selEdital)
                .order("nome");
            setMaterias(mats || []);

            const byMateria: Record<string, Assunto[]> = {};
            for (const m of mats || []) {
                const { data: ass } = await supabase
                    .from("assuntos")
                    .select("id,nome,visto_count,importance_level")
                    .eq("user_id", uid)
                    .eq("materia_id", m.id)
                    .order("nome");
                byMateria[m.id] = ass || [];
            }
            setAssuntos(byMateria);
        })();
    }, [selEdital]);

    const refreshTudo = async (editalId: string) => {
        const uid = (await supabase.auth.getUser()).data.user?.id;
        if (!uid) return;
        const { data: mats } = await supabase
            .from("materias")
            .select("id,nome")
            .eq("user_id", uid)
            .eq("edital_id", editalId)
            .order("nome");
        setMaterias(mats || []);
        const byMateria: Record<string, Assunto[]> = {};
        for (const m of mats || []) {
            const { data: ass } = await supabase
                .from("assuntos")
                .select("id,nome,visto_count,importance_level")
                .eq("user_id", uid)
                .eq("materia_id", m.id)
                .order("nome");
            byMateria[m.id] = ass || [];
        }
        setAssuntos(byMateria);
    };

    // Ao voltar para esta aba depois de concluir revisões, recarrega o
    // progresso do edital. A função complete_review do Supabase incrementa
    // automaticamente assuntos.visto_count a cada revisão concluída.
    useEffect(() => {
        const handleFocus = () => {
            if (selEdital) {
                refreshTudo(selEdital);
            }
        };

        window.addEventListener("focus", handleFocus);

        return () => {
            window.removeEventListener("focus", handleFocus);
        };
    }, [selEdital]);

    /** helpers (tokens) */
    const selectBase =
        "rounded border border-border p-2 bg-input text-foreground appearance-none " +
        "focus:outline-none focus:ring-2 focus:ring-primary/20";

    /** ======= LÓGICA DO GRÁFICO =======
     * Objetivo: topo (100%) somente se TODOS os assuntos da matéria tiverem >= 7 vistas.
     * Para isso:
     * - normalizamos cada assunto: nivel = min(visto_count / 7, 1)  // 0..1
     * - média_nivel = média de todos os níveis da matéria            // 0..1
     * - valor = média_nivel * 100                                    // 0..100
     * - cor: <=33 vermelho, 34–66 amarelo, >=67 verde
     * - matérias sem assuntos aparecem com valor 0.
     */
    type ChartRow = { name: string; valor: number; cor: string; legenda: string };

    const normBySeven = (v: number | undefined | null): number => {
        const n = v ?? 0;
        return Math.min(n / 7, 1);
    };

    const colorFromValor = (valor: number) => {
        if (valor <= 33) return "#ef4444"; // red-500
        if (valor <= 66) return "#f59e0b"; // amber-500
        return "#10b981"; // emerald-500
    };

    const legendaFromValor = (valor: number) => {
        if (valor <= 33) return "Predomínio Vermelho (abaixo da meta de 7x)";
        if (valor <= 66) return "Predomínio Amarelo (aproximando 7x)";
        return "Predomínio Verde (>= 7x por assunto)";
    };

    const chartData: ChartRow[] = (materias || []).map((m) => {
        const lista = assuntos[m.id] || [];
        if (lista.length === 0) {
            return {
                name: m.nome,
                valor: 0,
                cor: colorFromValor(0),
                legenda: legendaFromValor(0),
            };
        }
        const niveis = lista.map((a) => normBySeven(a.visto_count)); // 0..1 por assunto
        const media = niveis.reduce((s: number, n) => s + n, 0) / niveis.length; // 0..1
        const valor = Math.round(media * 100); // 0..100
        return {
            name: m.nome,
            valor,
            cor: colorFromValor(valor),
            legenda: legendaFromValor(valor),
        };
    });

    /** Tooltip customizado: mostra nome da matéria e legenda */
    function CustomTooltip({
        active,
        payload,
    }: {
        active?: boolean;
        payload?: any[];
    }) {
        if (!active || !payload || payload.length === 0) return null;

        const d = payload[0].payload as ChartRow;

        return (
            <div className="rounded border border-border bg-card px-3 py-2 text-xs shadow-md">
                <div className="font-semibold mb-1">{d.name}</div>
                <div>Progresso: <b>{d.valor}%</b></div>
                <div className="text-muted-foreground mt-1">{d.legenda}</div>
            </div>
        );
    }

    return (
        <div className="mx-auto max-w-6xl p-4 text-foreground">
            <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div>
                    <h1 className="text-2xl font-semibold">Edital</h1>
                    <p className="mt-1 text-xs text-muted-foreground">
                        O progresso também é atualizado automaticamente pelas revisões concluídas.
                    </p>
                </div>

                <div className="flex flex-wrap gap-2">
                    <button
                        type="button"
                        className="rounded-lg border border-border bg-card px-3 py-2 text-foreground hover:bg-muted"
                        onClick={() => {
                            window.location.href = "/revisao";
                        }}
                    >
                        Centro de Revisões
                    </button>

                    <button
                        className="rounded-lg bg-primary px-3 py-2 text-primary-foreground"
                        onClick={() => setOpenNovo(true)}
                    >
                        + Novo Edital
                    </button>

                    <button
                        className="rounded-lg px-3 py-2 bg-transparent text-foreground border border-border disabled:opacity-60"
                        onClick={() => setOpenEditar(true)}
                        disabled={!selEdital}
                        title={!selEdital ? "Selecione um edital" : "Editar"}
                    >
                        Editar Matérias/Assuntos
                    </button>
                </div>
            </div>

            {loading && (
                <div className="rounded border border-border p-3">Carregando…</div>
            )}

            <label className="mb-4 block text-sm text-muted-foreground">
                Selecione um edital
                <select
                    className={`mt-1 w-full ${selectBase}`}
                    value={selEdital}
                    onChange={(e) => setSelEdital(e.target.value)}
                >
                    <option value="">--</option>
                    {editais.map((e) => (
                        <option key={e.id} value={e.id}>
                            {e.nome}
                        </option>
                    ))}
                </select>
            </label>

            {!selEdital && !loading && (
                <p className="text-muted-foreground">
                    Escolha um edital para ver matérias e assuntos.
                </p>
            )}

            {!!selEdital && (
                <>
                    {/* Ações globais */}
                    <div className="flex flex-wrap items-center gap-2 mb-4">
                        <button
                            onClick={() => setShowOnlyNeverSeen((v) => !v)}
                            className={`rounded px-3 py-2 border border-border ${showOnlyNeverSeen
                                ? "bg-amber-100 text-amber-700"
                                : "bg-transparent"
                                }`}
                            title="Exibir apenas assuntos com 0 vistas"
                        >
                            {showOnlyNeverSeen ? "Mostrar todos" : "Somente nunca vistos"}
                        </button>

                        <button
                            onClick={() => setShowGrafico((v) => !v)}
                            className={`rounded px-3 py-2 border border-border ${showGrafico
                                ? "bg-green-100 text-green-700"
                                : "bg-transparent"
                                }`}
                            title="Ver um resumo por matéria"
                        >
                            {showGrafico ? "Ocultar gráfico" : "Gráfico de evolução"}
                        </button>
                    </div>

                    {/* Gráfico de Evolução – inclui TODAS as matérias */}
                    {showGrafico && (
                        <div className="mb-8 w-full h-80 border border-border rounded-lg bg-card p-4">
                            <div className="flex items-center justify-between mb-2">
                                <h2 className="font-medium text-lg">📊 Gráfico de Evolução</h2>
                                <span className="text-xs text-muted-foreground">
                                    Meta: 7x por assunto • Escala: 0% → 100%
                                </span>
                            </div>

                            {materias.length === 0 ? (
                                <div className="text-sm text-muted-foreground">
                                    Nenhuma matéria encontrada neste edital.
                                </div>
                            ) : (
                                <ResponsiveContainer width="100%" height="100%">
                                    <BarChart
                                        data={chartData}
                                        margin={{ top: 10, right: 20, left: 0, bottom: 10 }}
                                        barCategoryGap={12}
                                    >
                                        <CartesianGrid strokeDasharray="3 3" />
                                        {/* Esconde os nomes das matérias no eixo X */}
                                        <XAxis dataKey="name" hide />
                                        <YAxis domain={[0, 100]} />
                                        <Tooltip content={<CustomTooltip />} />
                                        <Legend />
                                        <Bar dataKey="valor" name="Progresso">
                                            {chartData.map((entry, index) => (
                                                <Cell key={`cell-${index}`} fill={entry.cor} />
                                            ))}
                                        </Bar>
                                    </BarChart>
                                </ResponsiveContainer>
                            )}

                            <div className="mt-2 text-xs text-muted-foreground">
                                A barra só atinge <b>100%</b> quando <b>todos</b> os assuntos dessa
                                matéria tiverem acumulado <b>7 registros de estudo/revisão</b> cada.
                                Revisões concluídas no Centro de Revisões incrementam esse progresso
                                automaticamente.
                            </div>
                        </div>
                    )}

                    {/* Listagem por matéria (filtro afeta apenas a lista, não o gráfico) */}
                    <div className="space-y-6">
                        {materias.map((m) => {
                            const listaAssuntos = showOnlyNeverSeen
                                ? (assuntos[m.id] || []).filter(
                                    (a) => (a.visto_count ?? 0) === 0
                                )
                                : assuntos[m.id] || [];

                            return (
                                <div
                                    key={m.id}
                                    className="rounded-lg border border-border p-3 bg-card"
                                >
                                    <div className="mb-2 text-lg font-medium">{m.nome}</div>

                                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                                        {listaAssuntos.map((a) => (
                                            <div
                                                key={a.id}
                                                className="flex items-center justify-between rounded p-2 bg-card border border-border text-foreground"
                                            >
                                                {/* Clicar no nome abre modal de edição */}
                                                <button
                                                    type="button"
                                                    className="min-w-0 flex-1 truncate text-left hover:underline"
                                                    onClick={() =>
                                                        setEditingAssunto({
                                                            open: true,
                                                            materiaId: m.id,
                                                            assunto: a,
                                                        })
                                                    }
                                                    title="Clique para renomear ou excluir"
                                                >
                                                    {a.nome}
                                                </button>

                                                <div className="ml-3 flex flex-none flex-nowrap items-center gap-4">
                                                    <ImportanceBadge
                                                        level={a.importance_level ?? 0}
                                                        onClick={async () => {
                                                            const next =
                                                                ((a.importance_level ?? 0) + 1) % 4;
                                                            await supabase
                                                                .from("assuntos")
                                                                .update({ importance_level: next })
                                                                .eq("id", a.id);
                                                            setAssuntos((prev) => {
                                                                const copy = { ...prev };
                                                                copy[m.id] = (copy[m.id] || []).map(
                                                                    (x) =>
                                                                        x.id === a.id
                                                                            ? {
                                                                                ...x,
                                                                                importance_level:
                                                                                    next,
                                                                            }
                                                                            : x
                                                                );
                                                                return copy;
                                                            });
                                                        }}
                                                    />

                                                    {/* Contador clicável (curto: +1, longo: zera) */}
                                                    <SeenBadge
                                                        count={a.visto_count ?? 0}
                                                        onShortPress={async () => {
                                                            const next = (a.visto_count ?? 0) + 1;
                                                            await supabase
                                                                .from("assuntos")
                                                                .update({ visto_count: next })
                                                                .eq("id", a.id);
                                                            setAssuntos((prev) => {
                                                                const copy = { ...prev };
                                                                copy[m.id] = (copy[m.id] || []).map(
                                                                    (x) =>
                                                                        x.id === a.id
                                                                            ? {
                                                                                ...x,
                                                                                visto_count: next,
                                                                            }
                                                                            : x
                                                                );
                                                                return copy;
                                                            });
                                                        }}
                                                        onLongPress={async () => {
                                                            const next = 0;
                                                            await supabase
                                                                .from("assuntos")
                                                                .update({ visto_count: next })
                                                                .eq("id", a.id);
                                                            setAssuntos((prev) => {
                                                                const copy = { ...prev };
                                                                copy[m.id] = (copy[m.id] || []).map(
                                                                    (x) =>
                                                                        x.id === a.id
                                                                            ? {
                                                                                ...x,
                                                                                visto_count: next,
                                                                            }
                                                                            : x
                                                                );
                                                                return copy;
                                                            });
                                                        }}
                                                        longPressMs={700}
                                                    />
                                                </div>
                                            </div>
                                        ))}

                                        {(!listaAssuntos || listaAssuntos.length === 0) && (
                                            <div className="rounded p-2 text-sm bg-transparent border border-border text-muted-foreground">
                                                {showOnlyNeverSeen
                                                    ? "Todos os assuntos desta matéria já foram vistos."
                                                    : "Sem assuntos ainda."}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </>
            )}

            {/* MODAL: Novo Edital */}
            <TokenModal
                open={openNovo}
                onClose={() => setOpenNovo(false)}
                title="Novo Edital"
                wide
            >
                <NovoEdital
                    onCreated={async (id) => {
                        setOpenNovo(false);
                        const uid = (await supabase.auth.getUser()).data.user?.id;
                        const { data } = await supabase
                            .from("editais")
                            .select("id,nome")
                            .eq("user_id", uid)
                            .order("created_at", { ascending: false });
                        setEditais(data || []);
                        setSelEdital(id);
                    }}
                />
            </TokenModal>

            {/* MODAL: Editar matérias e assuntos */}
            <TokenModal
                open={openEditar}
                onClose={() => setOpenEditar(false)}
                title="Editar matérias e assuntos"
                wide
            >
                <EditarEstrutura
                    editalId={selEdital}
                    onChanged={async () => {
                        if (selEdital) await refreshTudo(selEdital);
                    }}
                />
            </TokenModal>

            {/* MODAL: Editar/Excluir um assunto */}
            <TokenModal
                open={editingAssunto.open}
                onClose={() =>
                    setEditingAssunto({ open: false, materiaId: null, assunto: null })
                }
                title="Editar assunto"
            >
                {editingAssunto.assunto && editingAssunto.materiaId && (
                    <EditarAssuntoForm
                        assunto={editingAssunto.assunto}
                        onCancel={() =>
                            setEditingAssunto({
                                open: false,
                                materiaId: null,
                                assunto: null,
                            })
                        }
                        onSaved={async (updated) => {
                            const mId = editingAssunto.materiaId!;
                            setAssuntos((prev) => {
                                const copy = { ...prev };
                                copy[mId] = (copy[mId] || []).map((x) =>
                                    x.id === updated.id ? { ...x, nome: updated.nome } : x
                                );
                                return copy;
                            });
                            setEditingAssunto({
                                open: false,
                                materiaId: null,
                                assunto: null,
                            });
                        }}
                        onDeleted={async () => {
                            const mId = editingAssunto.materiaId!;
                            setAssuntos((prev) => {
                                const copy = { ...prev };
                                copy[mId] = (copy[mId] || []).filter(
                                    (x) => x.id !== editingAssunto.assunto!.id
                                );
                                return copy;
                            });
                            setEditingAssunto({
                                open: false,
                                materiaId: null,
                                assunto: null,
                            });
                        }}
                    />
                )}
            </TokenModal>
        </div>
    );
}

/** Form "Novo Edital" – usa o catálogo canônico */
function NovoEdital({ onCreated }: { onCreated: (id: string) => void }) {
    const [nome, setNome] = useState("");
    const [loading, setLoading] = useState(false);
    const [loadingCatalogo, setLoadingCatalogo] = useState(true);
    const [erro, setErro] = useState("");

    const [disciplinasCatalogo, setDisciplinasCatalogo] = useState<
        CatalogDisciplina[]
    >([]);
    const [assuntosCatalogo, setAssuntosCatalogo] = useState<CatalogAssunto[]>(
        []
    );

    const [disciplinasSelecionadas, setDisciplinasSelecionadas] = useState<
        string[]
    >([]);
    const [assuntosSelecionados, setAssuntosSelecionados] = useState<
        Record<string, string[]>
    >({});

    const [novaDisciplina, setNovaDisciplina] = useState("");
    const [disciplinaNovoAssunto, setDisciplinaNovoAssunto] = useState("");
    const [novoAssunto, setNovoAssunto] = useState("");
    const [criandoCatalogo, setCriandoCatalogo] = useState(false);

    const inputBase =
        "w-full rounded border border-border p-2 bg-input text-foreground placeholder:text-muted-foreground " +
        "focus:outline-none focus:ring-2 focus:ring-primary/20";

    const selectBase =
        "w-full rounded border border-border p-2 bg-input text-foreground appearance-none " +
        "focus:outline-none focus:ring-2 focus:ring-primary/20";

    const carregarCatalogo = async (uid: string) => {
        const [disciplinasReq, assuntosReq] = await Promise.all([
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

        const firstError = disciplinasReq.error || assuntosReq.error;
        if (firstError) throw firstError;

        const disciplinas =
            (disciplinasReq.data ?? []) as CatalogDisciplina[];
        const assuntos = (assuntosReq.data ?? []) as CatalogAssunto[];

        setDisciplinasCatalogo(disciplinas);
        setAssuntosCatalogo(assuntos);

        setDisciplinaNovoAssunto((atual) => {
            if (
                atual &&
                disciplinas.some((disciplina) => disciplina.id === atual)
            ) {
                return atual;
            }

            return disciplinas[0]?.id ?? "";
        });
    };

    useEffect(() => {
        let cancelled = false;

        (async () => {
            setLoadingCatalogo(true);
            setErro("");

            try {
                const uid = (await supabase.auth.getUser()).data.user?.id;

                if (!uid) {
                    throw new Error("Usuário não autenticado.");
                }

                if (cancelled) return;
                await carregarCatalogo(uid);
            } catch (e) {
                if (!cancelled) setErro(mensagemErro(e));
            } finally {
                if (!cancelled) setLoadingCatalogo(false);
            }
        })();

        return () => {
            cancelled = true;
        };
    }, []);

    const assuntosDaDisciplina = (disciplinaId: string) =>
        assuntosCatalogo
            .filter(
                (assunto) =>
                    assunto.ativo &&
                    assunto.disciplina_id === disciplinaId
            )
            .sort((a, b) =>
                a.nome.localeCompare(b.nome, "pt-BR", {
                    sensitivity: "base",
                })
            );

    const selecionarDisciplina = (disciplinaId: string) => {
        const marcada = disciplinasSelecionadas.includes(disciplinaId);

        if (marcada) {
            setDisciplinasSelecionadas((prev) =>
                prev.filter((id) => id !== disciplinaId)
            );

            setAssuntosSelecionados((prev) => {
                const next = { ...prev };
                delete next[disciplinaId];
                return next;
            });

            return;
        }

        const idsAssuntos = assuntosDaDisciplina(disciplinaId).map(
            (assunto) => assunto.id
        );

        setDisciplinasSelecionadas((prev) => [
            ...prev,
            disciplinaId,
        ]);
        setAssuntosSelecionados((prev) => ({
            ...prev,
            [disciplinaId]: idsAssuntos,
        }));
    };

    const alternarAssunto = (
        disciplinaId: string,
        assuntoId: string
    ) => {
        if (!disciplinasSelecionadas.includes(disciplinaId)) {
            setDisciplinasSelecionadas((prev) => [
                ...prev,
                disciplinaId,
            ]);
        }

        setAssuntosSelecionados((prev) => {
            const atuais = prev[disciplinaId] ?? [];
            const marcado = atuais.includes(assuntoId);

            return {
                ...prev,
                [disciplinaId]: marcado
                    ? atuais.filter((id) => id !== assuntoId)
                    : [...atuais, assuntoId],
            };
        });
    };

    const selecionarTodosAssuntos = (disciplinaId: string) => {
        const ids = assuntosDaDisciplina(disciplinaId).map(
            (assunto) => assunto.id
        );

        if (!disciplinasSelecionadas.includes(disciplinaId)) {
            setDisciplinasSelecionadas((prev) => [
                ...prev,
                disciplinaId,
            ]);
        }

        setAssuntosSelecionados((prev) => ({
            ...prev,
            [disciplinaId]: ids,
        }));
    };

    const limparAssuntos = (disciplinaId: string) => {
        setAssuntosSelecionados((prev) => ({
            ...prev,
            [disciplinaId]: [],
        }));
    };

    const criarDisciplina = async () => {
        const nomeLimpo = novaDisciplina.trim();
        if (!nomeLimpo || criandoCatalogo) return;

        setCriandoCatalogo(true);
        setErro("");

        try {
            const uid = (await supabase.auth.getUser()).data.user?.id;
            if (!uid) throw new Error("Usuário não autenticado.");

            const criada = await garantirDisciplinaCanonica(
                uid,
                nomeLimpo
            );

            await carregarCatalogo(uid);

            setDisciplinasSelecionadas((prev) =>
                prev.includes(criada.id)
                    ? prev
                    : [...prev, criada.id]
            );
            setAssuntosSelecionados((prev) => ({
                ...prev,
                [criada.id]: prev[criada.id] ?? [],
            }));
            setDisciplinaNovoAssunto(criada.id);
            setNovaDisciplina("");
        } catch (e) {
            setErro(mensagemErro(e));
        } finally {
            setCriandoCatalogo(false);
        }
    };

    const criarAssunto = async () => {
        const nomeLimpo = novoAssunto.trim();

        if (
            !disciplinaNovoAssunto ||
            !nomeLimpo ||
            criandoCatalogo
        ) {
            return;
        }

        setCriandoCatalogo(true);
        setErro("");

        try {
            const uid = (await supabase.auth.getUser()).data.user?.id;
            if (!uid) throw new Error("Usuário não autenticado.");

            const criado = await garantirAssuntoCanonico(
                uid,
                disciplinaNovoAssunto,
                nomeLimpo
            );

            await carregarCatalogo(uid);

            setDisciplinasSelecionadas((prev) =>
                prev.includes(disciplinaNovoAssunto)
                    ? prev
                    : [...prev, disciplinaNovoAssunto]
            );

            setAssuntosSelecionados((prev) => {
                const atuais = prev[disciplinaNovoAssunto] ?? [];

                return {
                    ...prev,
                    [disciplinaNovoAssunto]: atuais.includes(criado.id)
                        ? atuais
                        : [...atuais, criado.id],
                };
            });

            setNovoAssunto("");
        } catch (e) {
            setErro(mensagemErro(e));
        } finally {
            setCriandoCatalogo(false);
        }
    };

    const criarEdital = async (e: React.FormEvent) => {
        e.preventDefault();

        if (loading) return;

        const nomeLimpo = nome.trim();

        if (!nomeLimpo) {
            setErro("Informe o nome do edital.");
            return;
        }

        setLoading(true);
        setErro("");

        let editalCriadoId = "";

        try {
            const uid = (await supabase.auth.getUser()).data.user?.id;
            if (!uid) throw new Error("Usuário não autenticado.");

            const { data: editalCriado, error: erroEdital } =
                await supabase
                    .from("editais")
                    .insert({
                        nome: nomeLimpo,
                        user_id: uid,
                    })
                    .select("id")
                    .single();

            if (erroEdital || !editalCriado?.id) {
                throw erroEdital ?? new Error("Falha ao criar o edital.");
            }

            editalCriadoId = editalCriado.id;

            for (const disciplinaId of disciplinasSelecionadas) {
                const disciplina = disciplinasCatalogo.find(
                    (item) => item.id === disciplinaId
                );

                if (!disciplina) continue;

                const { data: materiaCriada, error: erroMateria } =
                    await supabase
                        .from("materias")
                        .insert({
                            edital_id: editalCriadoId,
                            nome: disciplina.nome.trim(),
                            user_id: uid,
                        })
                        .select("id")
                        .single();

                if (erroMateria || !materiaCriada?.id) {
                    throw (
                        erroMateria ??
                        new Error(
                            `Falha ao adicionar a disciplina "${disciplina.nome}".`
                        )
                    );
                }

                const idsAssuntos =
                    assuntosSelecionados[disciplinaId] ?? [];

                const assuntosEscolhidos = assuntosCatalogo.filter(
                    (assunto) =>
                        assunto.disciplina_id === disciplinaId &&
                        idsAssuntos.includes(assunto.id)
                );

                if (assuntosEscolhidos.length > 0) {
                    const { error: erroAssuntos } = await supabase
                        .from("assuntos")
                        .insert(
                            assuntosEscolhidos.map((assunto) => ({
                                materia_id: materiaCriada.id,
                                edital_id: editalCriadoId,
                                nome: assunto.nome.trim(),
                                user_id: uid,
                                importance_level: 0,
                            }))
                        );

                    if (erroAssuntos) throw erroAssuntos;
                }
            }

            onCreated(editalCriadoId);
        } catch (e) {
            /*
             * Como o fluxo é feito pelo client, fazemos uma compensação
             * caso alguma etapa falhe depois da criação do edital.
             */
            if (editalCriadoId) {
                await supabase
                    .from("assuntos")
                    .delete()
                    .eq("edital_id", editalCriadoId);

                await supabase
                    .from("materias")
                    .delete()
                    .eq("edital_id", editalCriadoId);

                await supabase
                    .from("editais")
                    .delete()
                    .eq("id", editalCriadoId);
            }

            setErro(mensagemErro(e));
        } finally {
            setLoading(false);
        }
    };

    return (
        <form className="space-y-5" onSubmit={criarEdital}>
            <div>
                <label className="mb-1 block text-sm font-medium">
                    Nome do edital
                </label>
                <input
                    className={inputBase}
                    placeholder="Ex.: PMBA 2027"
                    value={nome}
                    onChange={(e) => setNome(e.target.value)}
                    required
                />
            </div>

            {erro && (
                <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                    {erro}
                </div>
            )}

            <div className="rounded-xl border border-border bg-muted/20 p-4">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                        <h3 className="font-semibold">
                            Estrutura do edital
                        </h3>
                        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                            As disciplinas e assuntos abaixo vêm do catálogo
                            canônico. Marque somente o que faz parte deste
                            edital. Ao selecionar uma disciplina, todos os
                            assuntos dela são marcados inicialmente.
                        </p>
                    </div>

                    <div className="text-xs text-muted-foreground">
                        {disciplinasSelecionadas.length} disciplina(s)
                        selecionada(s)
                    </div>
                </div>

                {loadingCatalogo ? (
                    <div className="py-8 text-center text-sm text-muted-foreground">
                        Carregando catálogo...
                    </div>
                ) : disciplinasCatalogo.length === 0 ? (
                    <div className="mt-4 rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">
                        Ainda não há disciplinas no catálogo. Crie a primeira
                        disciplina abaixo.
                    </div>
                ) : (
                    <div className="mt-4 space-y-3">
                        {disciplinasCatalogo.map((disciplina) => {
                            const selecionada =
                                disciplinasSelecionadas.includes(
                                    disciplina.id
                                );
                            const assuntosDisciplina =
                                assuntosDaDisciplina(disciplina.id);
                            const idsSelecionados =
                                assuntosSelecionados[disciplina.id] ?? [];

                            return (
                                <div
                                    key={disciplina.id}
                                    className={`rounded-xl border p-3 ${selecionada
                                            ? "border-primary/40 bg-primary/5"
                                            : "border-border bg-card"
                                        }`}
                                >
                                    <label className="flex cursor-pointer items-start gap-3">
                                        <input
                                            type="checkbox"
                                            className="mt-1 h-4 w-4 accent-primary"
                                            checked={selecionada}
                                            onChange={() =>
                                                selecionarDisciplina(
                                                    disciplina.id
                                                )
                                            }
                                        />

                                        <span className="min-w-0 flex-1">
                                            <span className="block font-medium">
                                                {disciplina.nome}
                                            </span>
                                            <span className="mt-0.5 block text-xs text-muted-foreground">
                                                {assuntosDisciplina.length} assunto(s)
                                                no catálogo
                                            </span>
                                        </span>
                                    </label>

                                    {selecionada && (
                                        <div className="mt-3 border-t border-border pt-3">
                                            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                                                <span className="text-xs font-medium text-muted-foreground">
                                                    Assuntos deste edital
                                                </span>

                                                <div className="flex gap-2">
                                                    <button
                                                        type="button"
                                                        className="text-xs text-primary hover:underline"
                                                        onClick={() =>
                                                            selecionarTodosAssuntos(
                                                                disciplina.id
                                                            )
                                                        }
                                                    >
                                                        Marcar todos
                                                    </button>

                                                    <button
                                                        type="button"
                                                        className="text-xs text-muted-foreground hover:underline"
                                                        onClick={() =>
                                                            limparAssuntos(
                                                                disciplina.id
                                                            )
                                                        }
                                                    >
                                                        Desmarcar todos
                                                    </button>
                                                </div>
                                            </div>

                                            {assuntosDisciplina.length === 0 ? (
                                                <p className="text-xs text-muted-foreground">
                                                    Nenhum assunto cadastrado
                                                    nesta disciplina.
                                                </p>
                                            ) : (
                                                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                                                    {assuntosDisciplina.map(
                                                        (assunto) => (
                                                            <label
                                                                key={assunto.id}
                                                                className="flex cursor-pointer items-start gap-2 rounded-lg border border-border bg-background px-3 py-2 text-sm"
                                                            >
                                                                <input
                                                                    type="checkbox"
                                                                    className="mt-0.5 h-4 w-4 accent-primary"
                                                                    checked={idsSelecionados.includes(
                                                                        assunto.id
                                                                    )}
                                                                    onChange={() =>
                                                                        alternarAssunto(
                                                                            disciplina.id,
                                                                            assunto.id
                                                                        )
                                                                    }
                                                                />
                                                                <span>
                                                                    {assunto.nome}
                                                                </span>
                                                            </label>
                                                        )
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                <div className="rounded-xl border border-border bg-card p-4">
                    <h3 className="font-medium">
                        Nova disciplina canônica
                    </h3>
                    <p className="mt-1 text-xs text-muted-foreground">
                        Se não existir no catálogo, cadastre aqui. Ela ficará
                        disponível também para questões e próximos editais.
                    </p>

                    <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                        <input
                            className={`flex-1 ${inputBase}`}
                            placeholder="Ex.: Direito Penal"
                            value={novaDisciplina}
                            onChange={(e) =>
                                setNovaDisciplina(e.target.value)
                            }
                        />

                        <button
                            type="button"
                            onClick={() => void criarDisciplina()}
                            disabled={
                                criandoCatalogo ||
                                !novaDisciplina.trim()
                            }
                            className="rounded bg-primary px-3 py-2 text-primary-foreground disabled:opacity-50"
                        >
                            Adicionar
                        </button>
                    </div>
                </div>

                <div className="rounded-xl border border-border bg-card p-4">
                    <h3 className="font-medium">
                        Novo assunto canônico
                    </h3>
                    <p className="mt-1 text-xs text-muted-foreground">
                        O assunto será cadastrado dentro de uma disciplina do
                        catálogo e já ficará marcado para este novo edital.
                    </p>

                    <div className="mt-3 space-y-2">
                        <select
                            className={selectBase}
                            value={disciplinaNovoAssunto}
                            onChange={(e) =>
                                setDisciplinaNovoAssunto(e.target.value)
                            }
                        >
                            <option value="">
                                Selecione a disciplina
                            </option>
                            {disciplinasCatalogo.map((disciplina) => (
                                <option
                                    key={disciplina.id}
                                    value={disciplina.id}
                                >
                                    {disciplina.nome}
                                </option>
                            ))}
                        </select>

                        <div className="flex flex-col gap-2 sm:flex-row">
                            <input
                                className={`flex-1 ${inputBase}`}
                                placeholder="Ex.: Crimes contra a vida"
                                value={novoAssunto}
                                onChange={(e) =>
                                    setNovoAssunto(e.target.value)
                                }
                            />

                            <button
                                type="button"
                                onClick={() => void criarAssunto()}
                                disabled={
                                    criandoCatalogo ||
                                    !disciplinaNovoAssunto ||
                                    !novoAssunto.trim()
                                }
                                className="rounded bg-primary px-3 py-2 text-primary-foreground disabled:opacity-50"
                            >
                                Adicionar
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            <div className="flex flex-col gap-2 border-t border-border pt-4 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-xs text-muted-foreground">
                    O catálogo continua único. O edital recebe uma cópia da
                    estrutura selecionada para preservar o funcionamento de
                    revisões, flashcards, cronograma e progresso atuais.
                </p>

                <button
                    type="submit"
                    disabled={loading || loadingCatalogo}
                    className="shrink-0 rounded bg-green-600 px-4 py-2 text-white disabled:opacity-50"
                >
                    {loading ? "Criando edital..." : "Criar edital"}
                </button>
            </div>
        </form>
    );
}

/** Modal de edição: seleciona do catálogo e permite criar novos itens canônicos */
function EditarEstrutura({
    editalId,
    onChanged,
}: {
    editalId: string;
    onChanged: () => void;
}) {
    const [materias, setMaterias] = useState<Materia[]>([]);
    const [assuntosEstrutura, setAssuntosEstrutura] = useState<
        AssuntoEstrutura[]
    >([]);

    const [disciplinasCatalogo, setDisciplinasCatalogo] = useState<
        CatalogDisciplina[]
    >([]);
    const [assuntosCatalogo, setAssuntosCatalogo] = useState<CatalogAssunto[]>(
        []
    );

    const [disciplinaCatalogoId, setDisciplinaCatalogoId] = useState("");
    const [incluirTodosAssuntos, setIncluirTodosAssuntos] = useState(true);
    const [novaDisciplina, setNovaDisciplina] = useState("");

    const [selMateria, setSelMateria] = useState("");
    const [assuntosMarcados, setAssuntosMarcados] = useState<string[]>([]);
    const [novoAssunto, setNovoAssunto] = useState("");

    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [erro, setErro] = useState("");
    const [msg, setMsg] = useState("");

    const inputBase =
        "w-full rounded border border-border p-2 bg-input text-foreground placeholder:text-muted-foreground " +
        "focus:outline-none focus:ring-2 focus:ring-primary/20";

    const selectBase =
        "w-full rounded border border-border p-2 bg-input text-foreground appearance-none " +
        "focus:outline-none focus:ring-2 focus:ring-primary/20";

    const getUid = async () =>
        (await supabase.auth.getUser()).data.user?.id;

    const carregarTudo = async () => {
        if (!editalId) {
            setMaterias([]);
            setAssuntosEstrutura([]);
            return;
        }

        setLoading(true);
        setErro("");

        try {
            const uid = await getUid();
            if (!uid) throw new Error("Usuário não autenticado.");

            const [
                materiasReq,
                assuntosEditalReq,
                disciplinasReq,
                assuntosCatalogoReq,
            ] = await Promise.all([
                supabase
                    .from("materias")
                    .select("id,nome")
                    .eq("user_id", uid)
                    .eq("edital_id", editalId)
                    .order("nome"),
                supabase
                    .from("assuntos")
                    .select("id,materia_id,nome")
                    .eq("user_id", uid)
                    .eq("edital_id", editalId)
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
                materiasReq.error ||
                assuntosEditalReq.error ||
                disciplinasReq.error ||
                assuntosCatalogoReq.error;

            if (firstError) throw firstError;

            const listaMaterias = (materiasReq.data ?? []) as Materia[];

            setMaterias(listaMaterias);
            setAssuntosEstrutura(
                (assuntosEditalReq.data ?? []) as AssuntoEstrutura[]
            );
            setDisciplinasCatalogo(
                (disciplinasReq.data ?? []) as CatalogDisciplina[]
            );
            setAssuntosCatalogo(
                (assuntosCatalogoReq.data ?? []) as CatalogAssunto[]
            );

            setSelMateria((atual) =>
                listaMaterias.some((materia) => materia.id === atual)
                    ? atual
                    : listaMaterias[0]?.id ?? ""
            );
        } catch (e) {
            setErro(mensagemErro(e));
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        void carregarTudo();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [editalId]);

    const chavesMateriasAtuais = new Set(
        materias.map((materia) => normalizarNomeCatalogo(materia.nome))
    );

    const disciplinasDisponiveis = disciplinasCatalogo.filter(
        (disciplina) =>
            !chavesMateriasAtuais.has(
                normalizarNomeCatalogo(disciplina.nome)
            )
    );

    const materiaSelecionada =
        materias.find((materia) => materia.id === selMateria) ?? null;

    const disciplinaCanonicaDaMateria = materiaSelecionada
        ? disciplinasCatalogo.find(
            (disciplina) =>
                normalizarNomeCatalogo(disciplina.nome) ===
                normalizarNomeCatalogo(materiaSelecionada.nome)
        ) ?? null
        : null;

    const chavesAssuntosAtuais = new Set(
        assuntosEstrutura
            .filter((assunto) => assunto.materia_id === selMateria)
            .map((assunto) => normalizarNomeCatalogo(assunto.nome))
    );

    const assuntosDisponiveis = disciplinaCanonicaDaMateria
        ? assuntosCatalogo.filter(
            (assunto) =>
                assunto.disciplina_id ===
                disciplinaCanonicaDaMateria.id &&
                !chavesAssuntosAtuais.has(
                    normalizarNomeCatalogo(assunto.nome)
                )
        )
        : [];

    const adicionarDisciplinaAoEdital = async (
        disciplina: CatalogDisciplina
    ) => {
        if (!editalId) return;

        setSaving(true);
        setErro("");
        setMsg("");

        try {
            const uid = await getUid();
            if (!uid) throw new Error("Usuário não autenticado.");

            const jaExiste = materias.some(
                (materia) =>
                    normalizarNomeCatalogo(materia.nome) ===
                    normalizarNomeCatalogo(disciplina.nome)
            );

            if (jaExiste) {
                throw new Error(
                    "Essa disciplina já existe neste edital."
                );
            }

            const { data: materiaCriada, error: erroMateria } =
                await supabase
                    .from("materias")
                    .insert({
                        edital_id: editalId,
                        nome: disciplina.nome.trim(),
                        user_id: uid,
                    })
                    .select("id")
                    .single();

            if (erroMateria || !materiaCriada?.id) {
                throw (
                    erroMateria ??
                    new Error("Não foi possível adicionar a disciplina.")
                );
            }

            if (incluirTodosAssuntos) {
                const assuntosDaDisciplina = assuntosCatalogo.filter(
                    (assunto) =>
                        assunto.disciplina_id === disciplina.id
                );

                if (assuntosDaDisciplina.length > 0) {
                    const { error: erroAssuntos } = await supabase
                        .from("assuntos")
                        .insert(
                            assuntosDaDisciplina.map((assunto) => ({
                                materia_id: materiaCriada.id,
                                edital_id: editalId,
                                nome: assunto.nome.trim(),
                                user_id: uid,
                                importance_level: 0,
                            }))
                        );

                    if (erroAssuntos) {
                        await supabase
                            .from("materias")
                            .delete()
                            .eq("id", materiaCriada.id);

                        throw erroAssuntos;
                    }
                }
            }

            setDisciplinaCatalogoId("");
            setMsg(
                incluirTodosAssuntos
                    ? "Disciplina e assuntos adicionados ao edital."
                    : "Disciplina adicionada ao edital."
            );

            await carregarTudo();
            await onChanged();
        } catch (e) {
            setErro(mensagemErro(e));
        } finally {
            setSaving(false);
        }
    };

    const criarNovaDisciplina = async () => {
        if (!novaDisciplina.trim() || saving) return;

        setSaving(true);
        setErro("");
        setMsg("");

        try {
            const uid = await getUid();
            if (!uid) throw new Error("Usuário não autenticado.");

            const disciplina = await garantirDisciplinaCanonica(
                uid,
                novaDisciplina
            );

            setNovaDisciplina("");

            /*
             * A disciplina recém-criada entra no edital. Como ainda não
             * possui assuntos novos obrigatoriamente, a função usa o
             * catálogo atualizado depois.
             */
            const { data: assuntosData, error: assuntosError } =
                await supabase
                    .from("questao_assuntos")
                    .select("id,disciplina_id,nome,ativo")
                    .eq("user_id", uid)
                    .eq("ativo", true)
                    .order("nome");

            if (assuntosError) throw assuntosError;

            setAssuntosCatalogo(
                (assuntosData ?? []) as CatalogAssunto[]
            );

            await adicionarDisciplinaAoEdital(disciplina);
        } catch (e) {
            setErro(mensagemErro(e));
            setSaving(false);
        }
    };

    const adicionarAssuntosSelecionados = async () => {
        if (!selMateria || assuntosMarcados.length === 0 || saving) {
            return;
        }

        setSaving(true);
        setErro("");
        setMsg("");

        try {
            const uid = await getUid();
            if (!uid) throw new Error("Usuário não autenticado.");

            const escolhidos = assuntosDisponiveis.filter((assunto) =>
                assuntosMarcados.includes(assunto.id)
            );

            if (escolhidos.length === 0) {
                throw new Error("Selecione ao menos um assunto.");
            }

            const { error } = await supabase
                .from("assuntos")
                .insert(
                    escolhidos.map((assunto) => ({
                        materia_id: selMateria,
                        edital_id: editalId,
                        nome: assunto.nome.trim(),
                        user_id: uid,
                        importance_level: 0,
                    }))
                );

            if (error) throw error;

            setAssuntosMarcados([]);
            setMsg(
                `${escolhidos.length} assunto(s) adicionado(s) ao edital.`
            );

            await carregarTudo();
            await onChanged();
        } catch (e) {
            setErro(mensagemErro(e));
        } finally {
            setSaving(false);
        }
    };

    const criarNovoAssunto = async () => {
        if (!selMateria || !novoAssunto.trim() || saving) return;

        setSaving(true);
        setErro("");
        setMsg("");

        try {
            const uid = await getUid();
            if (!uid) throw new Error("Usuário não autenticado.");

            if (!materiaSelecionada) {
                throw new Error("Selecione uma disciplina do edital.");
            }

            let disciplinaCanonica = disciplinaCanonicaDaMateria;

            if (!disciplinaCanonica) {
                disciplinaCanonica = await garantirDisciplinaCanonica(
                    uid,
                    materiaSelecionada.nome
                );
            }

            const assuntoCanonico = await garantirAssuntoCanonico(
                uid,
                disciplinaCanonica.id,
                novoAssunto
            );

            const jaExisteNoEdital = assuntosEstrutura.some(
                (assunto) =>
                    assunto.materia_id === selMateria &&
                    normalizarNomeCatalogo(assunto.nome) ===
                    normalizarNomeCatalogo(assuntoCanonico.nome)
            );

            if (jaExisteNoEdital) {
                throw new Error(
                    "Esse assunto já existe nessa disciplina do edital."
                );
            }

            const { error } = await supabase.from("assuntos").insert({
                materia_id: selMateria,
                edital_id: editalId,
                nome: assuntoCanonico.nome.trim(),
                user_id: uid,
                importance_level: 0,
            });

            if (error) throw error;

            setNovoAssunto("");
            setMsg(
                "Assunto criado no catálogo e adicionado ao edital."
            );

            await carregarTudo();
            await onChanged();
        } catch (e) {
            setErro(mensagemErro(e));
        } finally {
            setSaving(false);
        }
    };

    if (!editalId) {
        return (
            <p className="text-sm text-muted-foreground">
                Selecione um edital na tela principal.
            </p>
        );
    }

    return (
        <div className="space-y-5">
            {erro && (
                <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                    {erro}
                </div>
            )}

            {msg && (
                <div className="rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-700">
                    {msg}
                </div>
            )}

            {loading ? (
                <div className="py-8 text-center text-sm text-muted-foreground">
                    Carregando estrutura...
                </div>
            ) : (
                <>
                    <div className="rounded-xl border border-border bg-card p-4">
                        <div className="mb-3">
                            <h3 className="font-medium">
                                Adicionar disciplina existente
                            </h3>
                            <p className="mt-1 text-xs text-muted-foreground">
                                Selecione uma disciplina do catálogo canônico.
                                Ela não será cadastrada novamente.
                            </p>
                        </div>

                        <div className="grid grid-cols-1 gap-3 lg:grid-cols-[minmax(0,1fr)_auto]">
                            <select
                                className={selectBase}
                                value={disciplinaCatalogoId}
                                onChange={(e) =>
                                    setDisciplinaCatalogoId(
                                        e.target.value
                                    )
                                }
                            >
                                <option value="">
                                    Selecione a disciplina
                                </option>
                                {disciplinasDisponiveis.map(
                                    (disciplina) => (
                                        <option
                                            key={disciplina.id}
                                            value={disciplina.id}
                                        >
                                            {disciplina.nome}
                                        </option>
                                    )
                                )}
                            </select>

                            <button
                                type="button"
                                disabled={
                                    saving || !disciplinaCatalogoId
                                }
                                className="rounded bg-primary px-3 py-2 text-primary-foreground disabled:opacity-50"
                                onClick={() => {
                                    const disciplina =
                                        disciplinasCatalogo.find(
                                            (item) =>
                                                item.id ===
                                                disciplinaCatalogoId
                                        );

                                    if (disciplina) {
                                        void adicionarDisciplinaAoEdital(
                                            disciplina
                                        );
                                    }
                                }}
                            >
                                Adicionar ao edital
                            </button>
                        </div>

                        <label className="mt-3 flex cursor-pointer items-center gap-2 text-sm">
                            <input
                                type="checkbox"
                                className="h-4 w-4 accent-primary"
                                checked={incluirTodosAssuntos}
                                onChange={(e) =>
                                    setIncluirTodosAssuntos(
                                        e.target.checked
                                    )
                                }
                            />
                            Incluir automaticamente todos os assuntos já
                            cadastrados nessa disciplina
                        </label>

                        {disciplinasDisponiveis.length === 0 && (
                            <p className="mt-3 text-xs text-muted-foreground">
                                Todas as disciplinas do catálogo já estão
                                neste edital.
                            </p>
                        )}
                    </div>

                    <div className="rounded-xl border border-border bg-card p-4">
                        <h3 className="font-medium">
                            Nova disciplina canônica
                        </h3>
                        <p className="mt-1 text-xs text-muted-foreground">
                            Cria no catálogo e adiciona ao edital atual.
                        </p>

                        <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                            <input
                                className={`flex-1 ${inputBase}`}
                                placeholder="Nome da nova disciplina"
                                value={novaDisciplina}
                                onChange={(e) =>
                                    setNovaDisciplina(e.target.value)
                                }
                            />

                            <button
                                type="button"
                                disabled={
                                    saving || !novaDisciplina.trim()
                                }
                                onClick={() =>
                                    void criarNovaDisciplina()
                                }
                                className="rounded bg-primary px-3 py-2 text-primary-foreground disabled:opacity-50"
                            >
                                Criar e adicionar
                            </button>
                        </div>
                    </div>

                    <div className="rounded-xl border border-border bg-card p-4">
                        <div className="mb-3">
                            <h3 className="font-medium">
                                Adicionar assuntos
                            </h3>
                            <p className="mt-1 text-xs text-muted-foreground">
                                Escolha uma disciplina já presente no edital.
                                Os assuntos disponíveis vêm do catálogo
                                canônico.
                            </p>
                        </div>

                        <select
                            className={selectBase}
                            value={selMateria}
                            onChange={(e) => {
                                setSelMateria(e.target.value);
                                setAssuntosMarcados([]);
                                setErro("");
                                setMsg("");
                            }}
                        >
                            <option value="">
                                Selecione a disciplina do edital
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

                        {selMateria && !disciplinaCanonicaDaMateria && (
                            <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                                Essa disciplina existia no edital antes do
                                catálogo canônico. Ao criar um novo assunto,
                                ela será automaticamente cadastrada no
                                catálogo.
                            </div>
                        )}

                        {disciplinaCanonicaDaMateria && (
                            <div className="mt-4">
                                <div className="mb-2 flex items-center justify-between gap-2">
                                    <span className="text-sm font-medium">
                                        Assuntos disponíveis
                                    </span>

                                    <span className="text-xs text-muted-foreground">
                                        {assuntosDisponiveis.length} disponível(is)
                                    </span>
                                </div>

                                {assuntosDisponiveis.length === 0 ? (
                                    <div className="rounded-lg border border-dashed border-border p-3 text-sm text-muted-foreground">
                                        Não há outros assuntos do catálogo
                                        para adicionar nessa disciplina.
                                    </div>
                                ) : (
                                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                                        {assuntosDisponiveis.map(
                                            (assunto) => (
                                                <label
                                                    key={assunto.id}
                                                    className="flex cursor-pointer items-start gap-2 rounded-lg border border-border bg-background px-3 py-2 text-sm"
                                                >
                                                    <input
                                                        type="checkbox"
                                                        className="mt-0.5 h-4 w-4 accent-primary"
                                                        checked={assuntosMarcados.includes(
                                                            assunto.id
                                                        )}
                                                        onChange={() =>
                                                            setAssuntosMarcados(
                                                                (prev) =>
                                                                    prev.includes(
                                                                        assunto.id
                                                                    )
                                                                        ? prev.filter(
                                                                            (
                                                                                id
                                                                            ) =>
                                                                                id !==
                                                                                assunto.id
                                                                        )
                                                                        : [
                                                                            ...prev,
                                                                            assunto.id,
                                                                        ]
                                                            )
                                                        }
                                                    />
                                                    <span>
                                                        {assunto.nome}
                                                    </span>
                                                </label>
                                            )
                                        )}
                                    </div>
                                )}

                                <div className="mt-3 text-right">
                                    <button
                                        type="button"
                                        disabled={
                                            saving ||
                                            assuntosMarcados.length === 0
                                        }
                                        onClick={() =>
                                            void adicionarAssuntosSelecionados()
                                        }
                                        className="rounded bg-primary px-3 py-2 text-primary-foreground disabled:opacity-50"
                                    >
                                        Adicionar selecionados
                                    </button>
                                </div>
                            </div>
                        )}

                        <div className="mt-5 border-t border-border pt-4">
                            <h4 className="text-sm font-medium">
                                Novo assunto canônico
                            </h4>
                            <p className="mt-1 text-xs text-muted-foreground">
                                Cria o assunto no catálogo e adiciona na
                                disciplina selecionada do edital.
                            </p>

                            <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                                <input
                                    className={`flex-1 ${inputBase}`}
                                    placeholder="Nome do novo assunto"
                                    value={novoAssunto}
                                    onChange={(e) =>
                                        setNovoAssunto(e.target.value)
                                    }
                                    disabled={!selMateria}
                                />

                                <button
                                    type="button"
                                    disabled={
                                        saving ||
                                        !selMateria ||
                                        !novoAssunto.trim()
                                    }
                                    onClick={() =>
                                        void criarNovoAssunto()
                                    }
                                    className="rounded bg-green-600 px-3 py-2 text-white disabled:opacity-50"
                                >
                                    Criar e adicionar
                                </button>
                            </div>
                        </div>
                    </div>

                    <div className="rounded-xl border border-border bg-muted/20 p-4">
                        <h3 className="font-medium">
                            Estrutura atual
                        </h3>

                        <div className="mt-3 space-y-3">
                            {materias.map((materia) => {
                                const lista = assuntosEstrutura.filter(
                                    (assunto) =>
                                        assunto.materia_id ===
                                        materia.id
                                );

                                return (
                                    <div
                                        key={materia.id}
                                        className="rounded-lg border border-border bg-card p-3"
                                    >
                                        <div className="font-medium">
                                            {materia.nome}
                                        </div>

                                        <div className="mt-2 flex flex-wrap gap-2">
                                            {lista.map((assunto) => (
                                                <span
                                                    key={assunto.id}
                                                    className="rounded-full bg-muted px-2.5 py-1 text-xs"
                                                >
                                                    {assunto.nome}
                                                </span>
                                            ))}

                                            {lista.length === 0 && (
                                                <span className="text-xs text-muted-foreground">
                                                    Sem assuntos.
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                );
                            })}

                            {materias.length === 0 && (
                                <p className="text-sm text-muted-foreground">
                                    Este edital ainda não possui disciplinas.
                                </p>
                            )}
                        </div>
                    </div>
                </>
            )}
        </div>
    );
}

/** Form de edição/remoção de um assunto – tokens */
function EditarAssuntoForm({
    assunto,
    onSaved,
    onDeleted,
    onCancel,
}: {
    assunto: Assunto;
    onSaved: (updated: { id: string; nome: string }) => void;
    onDeleted: () => void;
    onCancel: () => void;
}) {
    const [nome, setNome] = useState(assunto.nome);
    const [saving, setSaving] = useState(false);
    const [deleting, setDeleting] = useState(false);

    const inputBase =
        "mt-1 w-full rounded border border-border p-2 bg-input text-foreground placeholder:text-muted-foreground " +
        "focus:outline-none focus:ring-2 focus:ring-primary/20";

    return (
        <div className="space-y-3">
            <label className="block text-sm text-muted-foreground">
                Nome do assunto
                <input
                    className={inputBase}
                    value={nome}
                    onChange={(e) => setNome(e.target.value)}
                />
            </label>

            <div className="flex items-center justify-between">
                <button
                    className="rounded bg-destructive px-3 py-2 text-destructive-foreground disabled:opacity-50"
                    disabled={deleting}
                    onClick={async () => {
                        if (
                            !confirm(
                                "Excluir este assunto? Os resumos relacionados também podem ser removidos em cascata."
                            )
                        )
                            return;
                        setDeleting(true);
                        await supabase.from("assuntos").delete().eq("id", assunto.id);
                        setDeleting(false);
                        onDeleted();
                    }}
                >
                    {deleting ? "Excluindo..." : "Excluir"}
                </button>

                <div className="flex gap-2">
                    <button
                        className="rounded px-3 py-2 bg-transparent text-foreground border border-border"
                        onClick={onCancel}
                    >
                        Cancelar
                    </button>
                    <button
                        className="rounded bg-green-600 px-3 py-2 text-white disabled:opacity-50"
                        disabled={saving || nome.trim().length === 0}
                        onClick={async () => {
                            setSaving(true);
                            await supabase
                                .from("assuntos")
                                .update({ nome: nome.trim() })
                                .eq("id", assunto.id);
                            setSaving(false);
                            onSaved({ id: assunto.id, nome: nome.trim() });
                        }}
                    >
                        {saving ? "Salvando..." : "Salvar"}
                    </button>
                </div>
            </div>
        </div>
    );
}
