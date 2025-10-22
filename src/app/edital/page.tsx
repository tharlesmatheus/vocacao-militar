"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import Modal from "@/components/Modal";
import BadgeSeen from "@/components/BadgeSeen";

/** Tipos */
type Edital = { id: string; nome: string };
type Materia = { id: string; nome: string };
type Assunto = { id: string; nome: string; visto_count: number; importance_level: number };

/** Badge de importância (clicável) */
function ImportanceBadge({
    level,
    onClick,
}: {
    level: number;
    onClick?: () => void;
}) {
    const map = [
        { txt: "Normal", icon: "⚪", className: "text-gray-400" },
        { txt: "Relevante", icon: "⚠️", className: "text-amber-500" },
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
        // recarrega matérias + assuntos (após criar/editar)
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

    return (
        <div className="mx-auto max-w-5xl p-4">
            <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <h1 className="text-2xl font-semibold">Edital</h1>
                <div className="flex gap-2">
                    <button
                        className="rounded-lg bg-indigo-600 px-3 py-2 text-white"
                        onClick={() => setOpenNovo(true)}
                    >
                        + Novo Edital
                    </button>
                    <button
                        className="rounded-lg bg-gray-200 px-3 py-2"
                        onClick={() => setOpenEditar(true)}
                        disabled={!selEdital}
                        title={!selEdital ? "Selecione um edital" : "Editar"}
                    >
                        Editar Matérias/Assuntos
                    </button>
                </div>
            </div>

            {loading && <div className="rounded border p-3">Carregando…</div>}

            <label className="mb-4 block text-sm text-gray-600">
                Selecione um edital
                <select
                    className="mt-1 w-full rounded-lg border p-2"
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
                <p className="text-gray-500">Escolha um edital para ver matérias e assuntos.</p>
            )}

            {!!selEdital && (
                <div className="space-y-6">
                    {materias.map((m) => (
                        <div key={m.id} className="rounded-lg border p-3">
                            <div className="mb-2 text-lg font-medium">{m.nome}</div>
                            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                                {(assuntos[m.id] || []).map((a) => (
                                    <div
                                        key={a.id}
                                        className="flex items-center justify-between rounded bg-gray-50 p-2"
                                    >
                                        <span className="truncate">{a.nome}</span>
                                        <div className="flex items-center gap-3">
                                            {/* badge de importância: clique para ciclar 0→1→2→3→0 */}
                                            <ImportanceBadge
                                                level={a.importance_level ?? 0}
                                                onClick={async () => {
                                                    const next = ((a.importance_level ?? 0) + 1) % 4;
                                                    await supabase
                                                        .from("assuntos")
                                                        .update({ importance_level: next })
                                                        .eq("id", a.id);
                                                    // atualiza somente no estado local
                                                    setAssuntos((prev) => {
                                                        const copy = { ...prev };
                                                        copy[m.id] = (copy[m.id] || []).map((x) =>
                                                            x.id === a.id ? { ...x, importance_level: next } : x
                                                        );
                                                        return copy;
                                                    });
                                                }}
                                            />

                                            {/* “olhinho” + vezes visto */}
                                            <span title="vezes visto">👁️</span>
                                            <BadgeSeen count={a.visto_count} />
                                        </div>
                                    </div>
                                ))}
                                {(!assuntos[m.id] || assuntos[m.id].length === 0) && (
                                    <div className="rounded bg-white p-2 text-sm text-gray-400">
                                        Sem assuntos ainda.
                                    </div>
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* MODAL: Novo Edital */}
            <Modal open={openNovo} onClose={() => setOpenNovo(false)} title="Novo Edital">
                <NovoEdital
                    onCreated={async (id) => {
                        setOpenNovo(false);
                        // recarrega lista de editais do usuário e seleciona o novo
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
            </Modal>

            {/* MODAL: Editar matérias e assuntos */}
            <Modal
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
            </Modal>
        </div>
    );
}

/** Form "Novo Edital" */
function NovoEdital({ onCreated }: { onCreated: (id: string) => void }) {
    const [nome, setNome] = useState("");
    const [loading, setLoading] = useState(false);

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
                className="w-full rounded border p-2"
                placeholder="Nome do edital"
                value={nome}
                onChange={(e) => setNome(e.target.value)}
                required
            />
            <div className="text-right">
                <button
                    disabled={loading}
                    className="rounded bg-indigo-600 px-3 py-2 text-white disabled:opacity-50"
                >
                    {loading ? "Salvando..." : "Salvar"}
                </button>
            </div>
        </form>
    );
}

/** Modal de edição/adição de matérias e assuntos */
function EditarEstrutura({
    editalId,
    onChanged,
}: {
    editalId: string;
    onChanged: () => void;
}) {
    const [materiaNome, setMateriaNome] = useState("");
    const [assuntoNome, setAssuntoNome] = useState("");
    const [assuntoImport, setAssuntoImport] = useState<number>(0); // nível ao criar
    const [materias, setMaterias] = useState<Materia[]>([]);
    const [selMateria, setSelMateria] = useState("");

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

    return (
        <div className="space-y-4">
            {!editalId && (
                <p className="text-sm text-gray-500">
                    Selecione um edital na tela principal.
                </p>
            )}

            {/* Adicionar Matéria */}
            <div className="rounded border p-3">
                <div className="mb-2 font-medium">Adicionar Matéria</div>
                <div className="flex flex-col gap-2 sm:flex-row">
                    <input
                        className="flex-1 rounded border p-2"
                        placeholder="Nome da matéria"
                        value={materiaNome}
                        onChange={(e) => setMateriaNome(e.target.value)}
                    />
                    <button
                        className="rounded bg-gray-800 px-3 py-2 text-white"
                        onClick={async () => {
                            if (!editalId || !materiaNome) return;
                            await supabase
                                .from("materias")
                                .insert({
                                    edital_id: editalId,
                                    nome: materiaNome,
                                    user_id: await getUid(),
                                });
                            setMateriaNome("");
                            onChanged();
                        }}
                    >
                        Adicionar
                    </button>
                </div>
            </div>

            {/* Adicionar Assunto */}
            <div className="rounded border p-3">
                <div className="mb-2 font-medium">Adicionar Assunto</div>
                <div className="mb-2">
                    <select
                        className="w-full rounded border p-2"
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

                <div className="flex flex-col gap-2 sm:flex-row">
                    <input
                        className="flex-1 rounded border p-2"
                        placeholder="Nome do assunto"
                        value={assuntoNome}
                        onChange={(e) => setAssuntoNome(e.target.value)}
                    />

                    {/* Seleção de importância ao criar */}
                    <select
                        className="rounded border p-2"
                        value={assuntoImport}
                        onChange={(e) => setAssuntoImport(Number(e.target.value))}
                        title="Grau de importância"
                    >
                        <option value={0}>⚪ Normal</option>
                        <option value={1}>⚠️ Relevante</option>
                        <option value={2}>🚨 Importante</option>
                        <option value={3}>🔥 Cai sempre</option>
                    </select>

                    <button
                        className="rounded bg-gray-800 px-3 py-2 text-white"
                        onClick={async () => {
                            if (!selMateria || !assuntoNome) return;
                            const { data: mat } = await supabase
                                .from("materias")
                                .select("edital_id")
                                .eq("id", selMateria)
                                .single();
                            await supabase.from("assuntos").insert({
                                materia_id: selMateria,
                                edital_id: mat?.edital_id,
                                nome: assuntoNome,
                                user_id: await getUid(),
                                importance_level: assuntoImport, // grava a importância
                            });
                            setAssuntoNome("");
                            setAssuntoImport(0);
                            onChanged();
                        }}
                    >
                        Adicionar
                    </button>
                </div>
            </div>
        </div>
    );
}
