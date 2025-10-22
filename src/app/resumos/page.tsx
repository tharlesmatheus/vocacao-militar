"use client";

import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

/** Util: converte ==texto== para <mark> */
function renderWithMarks(text: string) {
    return text
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/==(.+?)==/g, "<mark>$1</mark>")
        .replace(/\n/g, "<br/>");
}

type Opt = { value: string; label: string };

type ResumoRow = {
    id: string;
    titulo: string;
    conteudo: string;
    created_at: string;
    edital_id: string;
    materia_id: string;
    assunto_id: string;
    assuntos?: { id: string; nome: string }[] | null;
    materias?: { id: string; nome: string }[] | null;
    editais?: { id: string; nome: string }[] | null;
};

export default function ResumosPage() {
    // Filtros
    const [editais, setEditais] = useState<Opt[]>([]);
    const [materias, setMaterias] = useState<Opt[]>([]);
    const [assuntos, setAssuntos] = useState<Opt[]>([]);
    const [edital, setEdital] = useState("");
    const [materia, setMateria] = useState("");
    const [assunto, setAssunto] = useState("");

    // Lista
    const [loading, setLoading] = useState(true);
    const [resumos, setResumos] = useState<ResumoRow[]>([]);
    const [viewing, setViewing] = useState<ResumoRow | null>(null);
    const [editing, setEditing] = useState(false);
    const [editText, setEditText] = useState("");

    // Modal "Novo resumo"
    const [openNew, setOpenNew] = useState(false);
    const [newTitulo, setNewTitulo] = useState("");
    const [newConteudo, setNewConteudo] = useState("");
    const [newEdital, setNewEdital] = useState("");
    const [newMateria, setNewMateria] = useState("");
    const [newAssunto, setNewAssunto] = useState("");
    const [savingNew, setSavingNew] = useState(false);
    const newTextRef = useRef<HTMLTextAreaElement>(null);

    // Carregar opções de filtros
    useEffect(() => {
        (async () => {
            const { data } = await supabase.from("editais").select("id,nome").order("created_at", { ascending: false });
            setEditais((data || []).map((d: any) => ({ value: d.id, label: d.nome })));
        })();
    }, []);

    useEffect(() => {
        (async () => {
            setMaterias([]); setMateria(""); setAssuntos([]); setAssunto("");
            if (!edital) return;
            const { data } = await supabase.from("materias").select("id,nome").eq("edital_id", edital).order("nome");
            setMaterias((data || []).map((d: any) => ({ value: d.id, label: d.nome })));
        })();
    }, [edital]);

    useEffect(() => {
        (async () => {
            setAssuntos([]); setAssunto("");
            if (!materia) return;
            const { data } = await supabase.from("assuntos").select("id,nome").eq("materia_id", materia).order("nome");
            setAssuntos((data || []).map((d: any) => ({ value: d.id, label: d.nome })));
        })();
    }, [materia]);

    // Carregar lista de resumos
    const loadResumos = async () => {
        setLoading(true);
        const uid = (await supabase.auth.getUser()).data.user?.id;
        if (!uid) {
            setResumos([]); setLoading(false); return;
        }
        let q = supabase
            .from("resumos")
            .select("id,titulo,conteudo,created_at,edital_id,materia_id,assunto_id,editais(id,nome),materias(id,nome),assuntos(id,nome)")
            .eq("user_id", uid)
            .order("created_at", { ascending: false })
            .limit(100);

        if (edital) q = q.eq("edital_id", edital);
        if (materia) q = q.eq("materia_id", materia);
        if (assunto) q = q.eq("assunto_id", assunto);

        const { data, error } = await q;
        if (!error && data) setResumos(data as ResumoRow[]);
        else setResumos([]);
        setLoading(false);
    };

    useEffect(() => {
        loadResumos();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [edital, materia, assunto]);

    // Ver/Editar/Excluir
    const openView = (row: ResumoRow) => {
        setViewing(row);
        setEditing(false);
        setEditText(row.conteudo);
    };

    const salvarEdicao = async () => {
        if (!viewing) return;
        await supabase.from("resumos").update({ conteudo: editText }).eq("id", viewing.id);
        setViewing({ ...viewing, conteudo: editText });
        setEditing(false);
    };

    const excluirResumo = async () => {
        if (!viewing) return;
        if (!confirm("Excluir este resumo? Isso também removerá revisões relacionadas.")) return;
        await supabase.from("resumos").delete().eq("id", viewing.id);
        setViewing(null);
        await loadResumos();
    };

    // Novo resumo (modal)
    const addMarkNew = () => {
        const ta = newTextRef.current;
        if (!ta) return;
        const { selectionStart: s, selectionEnd: e, value: v } = ta;
        if (s === e) return;
        const marked = v.slice(0, s) + "==" + v.slice(s, e) + "==" + v.slice(e);
        setNewConteudo(marked);
        setTimeout(() => {
            ta.focus();
            ta.selectionStart = s + 2;
            ta.selectionEnd = e + 2;
        }, 0);
    };

    const salvarNovo = async () => {
        try {
            setSavingNew(true);
            const uid = (await supabase.auth.getUser()).data.user?.id;
            if (!uid) throw new Error("Você precisa estar autenticado.");

            if (!newEdital || !newMateria || !newAssunto || !newTitulo.trim() || !newConteudo.trim()) {
                throw new Error("Preencha todos os campos.");
            }

            const { error } = await supabase.from("resumos").insert({
                edital_id: newEdital,
                materia_id: newMateria,
                assunto_id: newAssunto,
                titulo: newTitulo.trim(),
                conteudo: newConteudo,
                user_id: uid,
            });
            if (error) throw error;

            // Limpa modal e recarrega lista
            setOpenNew(false);
            setNewTitulo(""); setNewConteudo("");
            setNewEdital(""); setNewMateria(""); setNewAssunto("");
            await loadResumos();
        } catch (e: any) {
            alert(e?.message || "Falha ao salvar.");
        } finally {
            setSavingNew(false);
        }
    };

    // Quando abre o modal "Novo Resumo", carregar selects de novo (independentes do filtro da lista)
    const [optsNewEditais, setOptsNewEditais] = useState<Opt[]>([]);
    const [optsNewMaterias, setOptsNewMaterias] = useState<Opt[]>([]);
    const [optsNewAssuntos, setOptsNewAssuntos] = useState<Opt[]>([]);
    useEffect(() => {
        if (!openNew) return;
        (async () => {
            const { data } = await supabase.from("editais").select("id,nome").order("created_at", { ascending: false });
            setOptsNewEditais((data || []).map((d: any) => ({ value: d.id, label: d.nome })));
        })();
    }, [openNew]);

    useEffect(() => {
        (async () => {
            setOptsNewMaterias([]); setNewMateria(""); setOptsNewAssuntos([]); setNewAssunto("");
            if (!newEdital) return;
            const { data } = await supabase.from("materias").select("id,nome").eq("edital_id", newEdital).order("nome");
            setOptsNewMaterias((data || []).map((d: any) => ({ value: d.id, label: d.nome })));
        })();
    }, [newEdital]);

    useEffect(() => {
        (async () => {
            setOptsNewAssuntos([]); setNewAssunto("");
            if (!newMateria) return;
            const { data } = await supabase.from("assuntos").select("id,nome").eq("materia_id", newMateria).order("nome");
            setOptsNewAssuntos((data || []).map((d: any) => ({ value: d.id, label: d.nome })));
        })();
    }, [newMateria]);

    return (
        <div className="mx-auto max-w-4xl p-4">
            <div className="mb-4 flex items-center justify-between gap-2">
                <h1 className="text-2xl font-semibold">Resumos</h1>
                <button
                    className="rounded bg-indigo-600 px-3 py-2 text-white"
                    onClick={() => setOpenNew(true)}
                >
                    + Novo Resumo
                </button>
            </div>

            {/* Filtros */}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <label className="block">
                    <span className="mb-1 block text-sm text-gray-600">Edital</span>
                    <select
                        value={edital}
                        onChange={(e) => setEdital(e.target.value)}
                        className="w-full rounded border p-2"
                    >
                        <option value="">Todos</option>
                        {editais.map((o) => (
                            <option key={o.value} value={o.value}>
                                {o.label}
                            </option>
                        ))}
                    </select>
                </label>

                <label className="block">
                    <span className="mb-1 block text-sm text-gray-600">Matéria</span>
                    <select
                        value={materia}
                        onChange={(e) => setMateria(e.target.value)}
                        className="w-full rounded border p-2"
                        disabled={!edital}
                    >
                        <option value="">{edital ? "Todas" : "Selecione um edital"}</option>
                        {materias.map((o) => (
                            <option key={o.value} value={o.value}>
                                {o.label}
                            </option>
                        ))}
                    </select>
                </label>

                <label className="block">
                    <span className="mb-1 block text-sm text-gray-600">Assunto</span>
                    <select
                        value={assunto}
                        onChange={(e) => setAssunto(e.target.value)}
                        className="w-full rounded border p-2"
                        disabled={!materia}
                    >
                        <option value="">{materia ? "Todos" : "Selecione a matéria"}</option>
                        {assuntos.map((o) => (
                            <option key={o.value} value={o.value}>
                                {o.label}
                            </option>
                        ))}
                    </select>
                </label>
            </div>

            {/* Lista */}
            <div className="mt-4 space-y-3">
                {loading && <div className="rounded border p-3">Carregando…</div>}
                {!loading && resumos.length === 0 && (
                    <div className="rounded border p-3 text-gray-500">Nenhum resumo encontrado.</div>
                )}

                {!viewing &&
                    resumos.map((r) => (
                        <div
                            key={r.id}
                            className="flex flex-col justify-between gap-2 rounded border p-3 sm:flex-row sm:items-center"
                        >
                            <div>
                                <div className="font-medium">{r.titulo}</div>
                                <div className="text-sm text-gray-500">
                                    {r.editais?.[0]?.nome || "Edital"} • {r.materias?.[0]?.nome || "Matéria"} •{" "}
                                    {r.assuntos?.[0]?.nome || "Assunto"} • {new Date(r.created_at).toLocaleDateString("pt-BR")}
                                </div>
                            </div>
                            <div className="flex gap-2">
                                <button
                                    onClick={() => openView(r)}
                                    className="rounded bg-indigo-600 px-3 py-2 text-white"
                                >
                                    Ver
                                </button>
                            </div>
                        </div>
                    ))}

                {/* Visualização do resumo (com Editar/Excluir) */}
                {viewing && (
                    <div className="rounded border">
                        <div className="flex items-center justify-between border-b p-3">
                            <div>
                                <div className="text-sm text-gray-500">
                                    {viewing.editais?.[0]?.nome || "Edital"} •{" "}
                                    {viewing.materias?.[0]?.nome || "Matéria"} •{" "}
                                    {viewing.assuntos?.[0]?.nome || "Assunto"} •{" "}
                                    {new Date(viewing.created_at).toLocaleDateString("pt-BR")}
                                </div>
                                <h2 className="text-lg font-semibold">{viewing.titulo}</h2>
                            </div>
                            <div className="flex gap-2">
                                {!editing ? (
                                    <button
                                        onClick={() => setEditing(true)}
                                        className="rounded bg-gray-800 px-3 py-2 text-white"
                                    >
                                        Editar
                                    </button>
                                ) : (
                                    <>
                                        <button
                                            onClick={salvarEdicao}
                                            className="rounded bg-green-600 px-3 py-2 text-white"
                                        >
                                            Salvar
                                        </button>
                                        <button
                                            onClick={() => { setEditing(false); setEditText(viewing.conteudo); }}
                                            className="rounded bg-gray-200 px-3 py-2"
                                        >
                                            Cancelar
                                        </button>
                                    </>
                                )}
                                <button
                                    onClick={excluirResumo}
                                    className="rounded bg-red-600 px-3 py-2 text-white"
                                >
                                    Excluir
                                </button>
                                <button
                                    onClick={() => setViewing(null)}
                                    className="rounded bg-gray-200 px-3 py-2"
                                >
                                    Voltar
                                </button>
                            </div>
                        </div>

                        {!editing ? (
                            <div
                                className="prose max-w-none p-4"
                                dangerouslySetInnerHTML={{ __html: renderWithMarks(viewing.conteudo) }}
                            />
                        ) : (
                            <div className="p-4">
                                <div className="mb-2 text-sm text-gray-600">
                                    Dica: use <code>==texto==</code> para <mark>grifar</mark>
                                </div>
                                <textarea
                                    className="h-64 w-full rounded border p-2"
                                    value={editText}
                                    onChange={(e) => setEditText(e.target.value)}
                                />
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* MODAL: Novo Resumo */}
            {openNew && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
                    <div className="w-full max-w-2xl rounded-lg bg-white shadow">
                        <div className="flex items-center justify-between border-b p-3">
                            <h3 className="text-lg font-semibold">Novo Resumo</h3>
                            <button onClick={() => setOpenNew(false)} className="rounded px-2 py-1 hover:bg-gray-100">✕</button>
                        </div>
                        <div className="p-4 space-y-3">
                            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                                <label className="block">
                                    <span className="mb-1 block text-sm text-gray-600">Edital</span>
                                    <select
                                        value={newEdital}
                                        onChange={(e) => setNewEdital(e.target.value)}
                                        className="w-full rounded border p-2"
                                    >
                                        <option value="">Selecione</option>
                                        {optsNewEditais.map((o) => (
                                            <option key={o.value} value={o.value}>{o.label}</option>
                                        ))}
                                    </select>
                                </label>

                                <label className="block">
                                    <span className="mb-1 block text-sm text-gray-600">Matéria</span>
                                    <select
                                        value={newMateria}
                                        onChange={(e) => setNewMateria(e.target.value)}
                                        className="w-full rounded border p-2"
                                        disabled={!newEdital}
                                    >
                                        <option value="">{newEdital ? "Selecione" : "Selecione um edital"}</option>
                                        {optsNewMaterias.map((o) => (
                                            <option key={o.value} value={o.value}>{o.label}</option>
                                        ))}
                                    </select>
                                </label>

                                <label className="block">
                                    <span className="mb-1 block text-sm text-gray-600">Assunto</span>
                                    <select
                                        value={newAssunto}
                                        onChange={(e) => setNewAssunto(e.target.value)}
                                        className="w-full rounded border p-2"
                                        disabled={!newMateria}
                                    >
                                        <option value="">{newMateria ? "Selecione" : "Selecione a matéria"}</option>
                                        {optsNewAssuntos.map((o) => (
                                            <option key={o.value} value={o.value}>{o.label}</option>
                                        ))}
                                    </select>
                                </label>
                            </div>

                            <input
                                className="w-full rounded border p-2"
                                placeholder="Título do resumo"
                                value={newTitulo}
                                onChange={(e) => setNewTitulo(e.target.value)}
                            />

                            <div className="rounded border">
                                <div className="flex items-center justify-between border-b p-2">
                                    <div className="text-sm text-gray-600">
                                        Dica: use <code>==texto==</code> para <mark>grifar</mark>
                                    </div>
                                    <button
                                        className="rounded bg-gray-100 px-2 py-1 text-sm"
                                        onClick={addMarkNew}
                                        disabled={!newConteudo}
                                    >
                                        Grifar seleção
                                    </button>
                                </div>
                                <textarea
                                    ref={newTextRef}
                                    className="h-64 w-full p-3 outline-none"
                                    value={newConteudo}
                                    onChange={(e) => setNewConteudo(e.target.value)}
                                    placeholder="Escreva seu resumo…"
                                />
                            </div>

                            <div className="flex items-center justify-end gap-2">
                                <button onClick={() => setOpenNew(false)} className="rounded bg-gray-200 px-3 py-2">
                                    Cancelar
                                </button>
                                <button
                                    onClick={salvarNovo}
                                    disabled={savingNew}
                                    className="rounded bg-indigo-600 px-3 py-2 text-white disabled:opacity-50"
                                >
                                    {savingNew ? "Salvando..." : "Salvar resumo"}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
