"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import BadgeSeen from "@/components/BadgeSeen";

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
                <div className="space-y-6">
                    {materias.map((m) => (
                        <div
                            key={m.id}
                            className="rounded-lg border border-border p-3 bg-card"
                        >
                            <div className="mb-2 text-lg font-medium">{m.nome}</div>

                            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                                {(assuntos[m.id] || []).map((a) => (
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
                                            <div className="flex items-center gap-2 whitespace-nowrap">
                                                <span title="vezes visto">👁️</span>
                                                <BadgeSeen count={a.visto_count} />
                                            </div>
                                        </div>
                                    </div>
                                ))}

                                {(!assuntos[m.id] || assuntos[m.id].length === 0) && (
                                    <div className="rounded p-2 text-sm bg-transparent border border-border text-muted-foreground">
                                        Sem assuntos ainda.
                                    </div>
                                )}
                            </div>
                        </div>
                    ))}
                </div>
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

    const atualizarLinha = (
        idx: number,
        patch: Partial<AssuntoLote>
    ) =>
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

    const podeSalvar =
        !!selMateria && linhasValidas().length > 0 && !savingLote;

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
                                onChange={(e) =>
                                    atualizarLinha(idx, { nome: e.target.value })
                                }
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
                        {erroLote && (
                            <span className="text-sm text-red-600">{erroLote}</span>
                        )}
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
                    diferentes por linha. Linhas em branco são ignoradas e nomes
                    duplicados (na própria lista) são filtrados automaticamente.
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
