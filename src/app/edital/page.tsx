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

/** Modal baseado em tokens (sem dark:) */
function TokenModal({
    open,
    title,
    onClose,
    children,
}: {
    open: boolean;
    title?: string;
    onClose: () => void;
    children: React.ReactNode;
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
            <div className="relative z-[101] w-full max-w-2xl rounded-2xl bg-card text-foreground border border-border shadow-xl">
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
                <div className="p-5">{children}</div>
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

    /** helpers (tokens) */
    const selectBase =
        "rounded border border-border p-2 bg-input text-foreground appearance-none " +
        "focus:outline-none focus:ring-2 focus:ring-primary/20";

    /** ======= LÓGICA DO GRÁFICO =======
     * Para cada matéria:
     * - convertemos cada assunto em um nível:
     *   visto_count 0 => nível 0 (vermelho)
     *   visto_count 1 => nível 0.5 (amarelo)
     *   visto_count >=2 => nível 1 (verde)
     * - média_nivel = média desses níveis
     * - valor da barra = média_nivel * 100 (0–100)
     * - cor da barra: <=33 vermelho, 34–66 amarelo, >=67 verde
     * - SEMPRE inclui a matéria, mesmo se não houver assuntos (barra = 0).
     */
    type ChartRow = { name: string; valor: number; cor: string; legenda: string };

    const nivelFromVisto = (v: number | undefined | null): number => {
        const n = v ?? 0;
        if (n <= 0) return 0; // vermelho
        if (n === 1) return 0.5; // amarelo
        return 1; // verde
    };

    const colorFromValor = (valor: number) => {
        if (valor <= 33) return "#ef4444"; // red-500
        if (valor <= 66) return "#f59e0b"; // amber-500
        return "#10b981"; // emerald-500
    };

    const legendaFromValor = (valor: number) => {
        if (valor <= 33) return "Predomínio Vermelho (pouco ou nunca visto)";
        if (valor <= 66) return "Predomínio Amarelo (vistos ~1x)";
        return "Predomínio Verde (vistos 2+ vezes)";
    };

    // 🔸 Gera dados para TODAS as matérias do edital selecionado.
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
        const niveis = lista.map((a) => nivelFromVisto(a.visto_count));
        const media = niveis.reduce((s: number, n) => s + n, 0) / niveis.length; // 0..1
        const valor = Math.round(media * 100); // 0..100
        return {
            name: m.nome,
            valor,
            cor: colorFromValor(valor),
            legenda: legendaFromValor(valor),
        };
    });

    return (
        <div className="mx-auto max-w-6xl p-4 text-foreground">
            <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <h1 className="text-2xl font-semibold">Edital</h1>
                <div className="flex gap-2">
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
                            className={`rounded px-3 py-2 border border-border ${showOnlyNeverSeen ? "bg-amber-100 text-amber-700" : "bg-transparent"
                                }`}
                            title="Exibir apenas assuntos com 0 vistas"
                        >
                            {showOnlyNeverSeen ? "Mostrar todos" : "Somente nunca vistos"}
                        </button>

                        <button
                            onClick={() => setShowGrafico((v) => !v)}
                            className={`rounded px-3 py-2 border border-border ${showGrafico ? "bg-green-100 text-green-700" : "bg-transparent"
                                }`}
                            title="Ver um resumo por matéria"
                        >
                            {showGrafico ? "Ocultar gráfico" : "Gráfico de evolução"}
                        </button>
                    </div>

                    {/* Gráfico de Evolução (SEMPRE inclui todas as matérias) */}
                    {showGrafico && (
                        <div className="mb-8 w-full h-80 border border-border rounded-lg bg-card p-4">
                            <div className="flex items-center justify-between mb-2">
                                <h2 className="font-medium text-lg">📊 Gráfico de Evolução</h2>
                                <span className="text-xs text-muted-foreground">
                                    Escala: 0% (vermelho) → 100% (verde)
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
                                        margin={{ top: 10, right: 20, left: 0, bottom: 40 }}
                                        barCategoryGap={12}
                                    >
                                        <CartesianGrid strokeDasharray="3 3" />
                                        {/* interval={0} força exibir TODAS as matérias no eixo X */}
                                        <XAxis
                                            dataKey="name"
                                            interval={0}
                                            angle={-15}
                                            textAnchor="end"
                                            height={60}
                                        />
                                        <YAxis domain={[0, 100]} />
                                        <Tooltip
                                            formatter={(value: any, name: any, props: any) => {
                                                if (name === "Progresso") {
                                                    return [`${value}%`, "Progresso"];
                                                }
                                                return [value, name];
                                            }}
                                            labelFormatter={(label: any) => `Matéria: ${label}`}
                                        />
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
                                Dica: a cor e a altura refletem a média por matéria — se todos os
                                assuntos estiverem <b>verdes</b> (2+ vistas), a barra fica no topo; se
                                a maioria for <b>amarela</b> (1 vista) ou <b>vermelha</b> (0 vistas),
                                a barra fica mais abaixo.
                            </div>
                        </div>
                    )}

                    {/* Listagem por matéria (filtro afeta apenas a lista, não o gráfico) */}
                    <div className="space-y-6">
                        {materias.map((m) => {
                            const listaAssuntos = showOnlyNeverSeen
                                ? (assuntos[m.id] || []).filter((a) => (a.visto_count ?? 0) === 0)
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
                                                            const next = ((a.importance_level ?? 0) + 1) % 4;
                                                            await supabase
                                                                .from("assuntos")
                                                                .update({ importance_level: next })
                                                                .eq("id", a.id);
                                                            setAssuntos((prev) => {
                                                                const copy = { ...prev };
                                                                copy[m.id] = (copy[m.id] || []).map((x) =>
                                                                    x.id === a.id
                                                                        ? { ...x, importance_level: next }
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
                                                                copy[m.id] = (copy[m.id] || []).map((x) =>
                                                                    x.id === a.id ? { ...x, visto_count: next } : x
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
                                                                copy[m.id] = (copy[m.id] || []).map((x) =>
                                                                    x.id === a.id ? { ...x, visto_count: next } : x
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
            >
                <EditarEstrutura
                    editalId={selEdital}
                    onChanged={async () => {
                        setOpenEditar(false);
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
                            setEditingAssunto({ open: false, materiaId: null, assunto: null })
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

/** Form "Novo Edital" – tokens */
function NovoEdital({ onCreated }: { onCreated: (id: string) => void }) {
    const [nome, setNome] = useState("");
    const [loading, setLoading] = useState(false);

    const inputBase =
        "w-full rounded border border-border p-2 bg-input text-foreground placeholder:text-muted-foreground " +
        "focus:outline-none focus:ring-2 focus:ring-primary/20";

    return (
        <form
            className="space-y-3"
            onSubmit={async (e) => {
                e.preventDefault();
                setLoading(true);
                const uid = (await supabase.auth.getUser()).data.user?.id;
                if (!uid) return;
                const { data, error } = await supabase
                    .from("editais")
                    .insert({ nome, user_id: uid })
                    .select("id")
                    .single();
                setLoading(false);
                if (!error && data) onCreated(data.id);
            }}
        >
            <input
                className={inputBase}
                placeholder="Nome do edital"
                value={nome}
                onChange={(e) => setNome(e.target.value)}
                required
            />
            <div className="text-right">
                <button
                    disabled={loading}
                    className="rounded bg-primary px-3 py-2 text-primary-foreground disabled:opacity-50"
                >
                    {loading ? "Salvando..." : "Salvar"}
                </button>
            </div>
        </form>
    );
}

/** Modal de edição/adição de matérias e assuntos – tokens */
function EditarEstrutura({
    editalId,
    onChanged,
}: {
    editalId: string;
    onChanged: () => void;
}) {
    const [materiaNome, setMateriaNome] = useState("");
    const [materias, setMaterias] = useState<Materia[]>([]);
    const [selMateria, setSelMateria] = useState("");

    // NOVO: lote de assuntos
    type AssuntoLote = { nome: string; importance_level: number };
    const [assuntosLote, setAssuntosLote] = useState<AssuntoLote[]>([
        { nome: "", importance_level: 0 },
    ]);
    const [savingLote, setSavingLote] = useState(false);
    const [erroLote, setErroLote] = useState<string | null>(null);

    useEffect(() => {
        (async () => {
            if (!editalId) {
                setMaterias([]);
                return;
            }
            const uid = (await supabase.auth.getUser()).data.user?.id;
            const { data } = await supabase
                .from("materias")
                .select("id,nome")
                .eq("user_id", uid)
                .eq("edital_id", editalId)
                .order("nome");
            setMaterias(data || []);
        })();
    }, [editalId]);

    const getUid = async () => (await supabase.auth.getUser()).data.user?.id;

    const inputBase =
        "rounded border border-border p-2 bg-input text-foreground placeholder:text-muted-foreground " +
        "focus:outline-none focus:ring-2 focus:ring-primary/20";
    const selectBase =
        "rounded border border-border p-2 bg-input text-foreground appearance-none " +
        "focus:outline-none focus:ring-2 focus:ring-primary/20";

    // helpers de lote
    const addLinha = () =>
        setAssuntosLote((prev) => [...prev, { nome: "", importance_level: 0 }]);

    const removeLinha = (idx: number) =>
        setAssuntosLote((prev) => prev.filter((_, i) => i !== idx));

    const atualizarLinha = (idx: number, patch: Partial<AssuntoLote>) =>
        setAssuntosLote((prev) =>
            prev.map((row, i) => (i === idx ? { ...row, ...patch } : row))
        );

    const limparLote = () => setAssuntosLote([{ nome: "", importance_level: 0 }]);

    const linhasValidas = () => {
        const nomes = new Set<string>();
        return assuntosLote
            .map((r) => ({ ...r, nome: r.nome.trim() }))
            .filter((r) => r.nome.length > 0)
            .filter((r) => {
                const key = r.nome.toLowerCase();
                if (nomes.has(key)) return false; // evita duplicados na tela
                nomes.add(key);
                return true;
            });
    };

    const podeSalvar = !!selMateria && linhasValidas().length > 0 && !savingLote;

    return (
        <div className="space-y-4">
            {!editalId && (
                <p className="text-sm text-muted-foreground">
                    Selecione um edital na tela principal.
                </p>
            )}

            {/* Adicionar Matéria */}
            <div className="rounded border border-border p-3 bg-card">
                <div className="mb-2 font-medium">Adicionar Matéria</div>
                <div className="flex flex-col gap-2 sm:flex-row">
                    <input
                        className={`flex-1 ${inputBase}`}
                        placeholder="Nome da matéria"
                        value={materiaNome}
                        onChange={(e) => setMateriaNome(e.target.value)}
                    />
                    <button
                        className="rounded bg-primary px-3 py-2 text-primary-foreground"
                        onClick={async () => {
                            if (!editalId || !materiaNome.trim()) return;
                            await supabase.from("materias").insert({
                                edital_id: editalId,
                                nome: materiaNome.trim(),
                                user_id: await getUid(),
                            });
                            setMateriaNome("");
                            // recarrega lista
                            const uid = await getUid();
                            const { data } = await supabase
                                .from("materias")
                                .select("id,nome")
                                .eq("user_id", uid)
                                .eq("edital_id", editalId)
                                .order("nome");
                            setMaterias(data || []);
                        }}
                    >
                        Adicionar
                    </button>
                </div>
            </div>

            {/* Adicionar Assuntos (LOTE) */}
            <div className="rounded border border-border p-3 bg-card">
                <div className="mb-2 font-medium flex items-center justify-between">
                    <span>Adicionar Assuntos (vários de uma vez)</span>
                    <span className="text-xs text-muted-foreground">
                        Linhas válidas: {linhasValidas().length}/{assuntosLote.length}
                    </span>
                </div>

                <div className="mb-2">
                    <select
                        className={`w-full ${selectBase}`}
                        value={selMateria}
                        onChange={(e) => setSelMateria(e.target.value)}
                    >
                        <option value="">Selecione a matéria</option>
                        {materias.map((m) => (
                            <option key={m.id} value={m.id}>
                                {m.nome}
                            </option>
                        ))}
                    </select>
                </div>

                {/* Tabela simples de linhas */}
                <div className="space-y-2">
                    {assuntosLote.map((row, idx) => (
                        <div
                            key={idx}
                            className="flex flex-col gap-2 sm:flex-row sm:items-center"
                        >
                            <input
                                className={`flex-1 ${inputBase}`}
                                placeholder={`Assunto ${idx + 1}`}
                                value={row.nome}
                                onChange={(e) => atualizarLinha(idx, { nome: e.target.value })}
                            />
                            <select
                                className={selectBase}
                                value={row.importance_level}
                                onChange={(e) =>
                                    atualizarLinha(idx, { importance_level: Number(e.target.value) })
                                }
                                title="Grau de importância"
                            >
                                <option value={0}>⚪ Normal</option>
                                <option value={1}>⚠️ Relevante</option>
                                <option value={2}>🚨 Importante</option>
                                <option value={3}>🔥 Cai sempre</option>
                            </select>
                            <div className="flex gap-2">
                                <button
                                    type="button"
                                    className="rounded px-3 py-2 bg-transparent text-foreground border border-border"
                                    onClick={() => removeLinha(idx)}
                                    title="Remover esta linha"
                                    disabled={assuntosLote.length === 1}
                                >
                                    Remover
                                </button>
                            </div>
                        </div>
                    ))}
                </div>

                {/* Ações de lote */}
                <div className="mt-3 flex flex-wrap items-center gap-2">
                    <button
                        type="button"
                        className="rounded px-3 py-2 bg-transparent text-foreground border border-border"
                        onClick={addLinha}
                        title="Adicionar nova linha"
                    >
                        + Adicionar linha
                    </button>
                    <button
                        type="button"
                        className="rounded px-3 py-2 bg-transparent text-foreground border border-border"
                        onClick={limparLote}
                        title="Limpar todos os campos"
                        disabled={assuntosLote.length === 1 && !assuntosLote[0].nome}
                    >
                        Limpar
                    </button>

                    <div className="ml-auto flex items-center gap-2">
                        {erroLote && <span className="text-sm text-red-600">{erroLote}</span>}
                        <button
                            className="rounded bg-primary px-3 py-2 text-primary-foreground disabled:opacity-50"
                            disabled={!podeSalvar}
                            onClick={async () => {
                                setErroLote(null);
                                if (!selMateria) {
                                    setErroLote("Selecione a matéria.");
                                    return;
                                }
                                const uid = await getUid();
                                if (!uid) {
                                    setErroLote("Usuário não autenticado.");
                                    return;
                                }

                                const linhas = linhasValidas();
                                if (linhas.length === 0) {
                                    setErroLote("Preencha ao menos um assunto válido.");
                                    return;
                                }

                                setSavingLote(true);
                                try {
                                    // pegar edital_id da matéria selecionada
                                    const { data: mat } = await supabase
                                        .from("materias")
                                        .select("edital_id")
                                        .eq("id", selMateria)
                                        .single();

                                    const payload = linhas.map((r) => ({
                                        materia_id: selMateria,
                                        edital_id: mat?.edital_id,
                                        nome: r.nome.trim(),
                                        user_id: uid,
                                        importance_level: r.importance_level ?? 0,
                                    }));

                                    const { error } = await supabase
                                        .from("assuntos")
                                        .insert(payload);

                                    if (error) {
                                        setErroLote(error.message);
                                    } else {
                                        // sucesso
                                        limparLote();
                                        setErroLote(null);
                                        onChanged();
                                    }
                                } catch (e: any) {
                                    setErroLote(e?.message || "Erro ao salvar os assuntos.");
                                } finally {
                                    setSavingLote(false);
                                }
                            }}
                        >
                            {savingLote ? "Salvando..." : "Salvar todos"}
                        </button>
                    </div>
                </div>

                <p className="mt-2 text-xs text-muted-foreground">
                    Dica: você pode preencher vários nomes e escolher importâncias
                    diferentes por linha. Linhas em branco são ignoradas e nomes duplicados
                    (na própria lista) são filtrados automaticamente.
                </p>
            </div>
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
