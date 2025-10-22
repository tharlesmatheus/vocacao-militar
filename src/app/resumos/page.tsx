"use client";

import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

/** Escapa básico + ==grifo== -> <mark> */
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
    edital_id: string | null;
    materia_id: string | null;
    assunto_id: string | null;
};

export default function ResumosPage() {
    // filtros
    const [editais, setEditais] = useState<Opt[]>([]);
    const [materiasOpt, setMateriasOpt] = useState<Opt[]>([]);
    const [assuntosOpt, setAssuntosOpt] = useState<Opt[]>([]);
    const [edital, setEdital] = useState("");
    const [materia, setMateria] = useState("");
    const [assunto, setAssunto] = useState("");

    // mapas de nomes
    const [materiaMap, setMateriaMap] = useState<Record<string, string>>({});
    const [assuntoMap, setAssuntoMap] = useState<Record<string, string>>({});
    const [editalMap, setEditalMap] = useState<Record<string, string>>({});

    // lista & view
    const [loading, setLoading] = useState(true);
    const [resumos, setResumos] = useState<ResumoRow[]>([]);
    const [viewing, setViewing] = useState<ResumoRow | null>(null);
    const [editing, setEditing] = useState(false);
    const [editText, setEditText] = useState("");

    // modal novo resumo
    const [openNew, setOpenNew] = useState(false);
    const [newTitulo, setNewTitulo] = useState("");
    const [newConteudo, setNewConteudo] = useState("");
    const [newEdital, setNewEdital] = useState("");
    const [newMateria, setNewMateria] = useState("");
    const [newAssunto, setNewAssunto] = useState("");
    const [savingNew, setSavingNew] = useState(false);
    const newTextRef = useRef<HTMLTextAreaElement>(null);

    // Carrega mapas + opções
    useEffect(() => {
        (async () => {
            const uid = (await supabase.auth.getUser()).data.user?.id;
            if (!uid) return;
            const [eds, mats, asss] = await Promise.all([
                supabase.from("editais").select("id,nome").eq("user_id", uid).order("created_at", { ascending: false }),
                supabase.from("materias").select("id,nome,edital_id").eq("user_id", uid),
                supabase.from("assuntos").select("id,nome,materia_id").eq("user_id", uid),
            ]);

            const eMap: Record<string, string> = {};
            (eds.data || []).forEach((e: any) => (eMap[e.id] = e.nome));
            setEditalMap(eMap);
            setEditais((eds.data || []).map((d: any) => ({ value: d.id, label: d.nome })));

            const mMap: Record<string, string> = {};
            (mats.data || []).forEach((m: any) => (mMap[m.id] = m.nome));
            setMateriaMap(mMap);

            const aMap: Record<string, string> = {};
            (asss.data || []).forEach((a: any) => (aMap[a.id] = a.nome));
            setAssuntoMap(aMap);
        })();
    }, []);

    // opções dependentes (filtros)
    useEffect(() => {
        (async () => {
            setMateriasOpt([]); setMateria(""); setAssuntosOpt([]); setAssunto("");
            if (!edital) return;
            const { data } = await supabase.from("materias").select("id,nome").eq("edital_id", edital).order("nome");
            setMateriasOpt((data || []).map((d: any) => ({ value: d.id, label: d.nome })));
        })();
    }, [edital]);

    useEffect(() => {
        (async () => {
            setAssuntosOpt([]); setAssunto("");
            if (!materia) return;
            const { data } = await supabase.from("assuntos").select("id,nome").eq("materia_id", materia).order("nome");
            setAssuntosOpt((data || []).map((d: any) => ({ value: d.id, label: d.nome })));
        })();
    }, [materia]);

    // Carrega lista de resumos (sem join; usa mapas para nomes)
    const loadResumos = async () => {
        setLoading(true);
        const uid = (await supabase.auth.getUser()).data.user?.id;
        if (!uid) {
            setResumos([]); setLoading(false); return;
        }
        let q = supabase
            .from("resumos")
            .select("id,titulo,conteudo,created_at,edital_id,materia_id,assunto_id")
            .eq("user_id", uid)
            .order("created_at", { ascending: false })
            .limit(100);

        if (edital) q = q.eq("edital_id", edital);
        if (materia) q = q.eq("materia_id", materia);
        if (assunto) q = q.eq("assunto_id", assunto);

        const { data, error } = await q;
        setResumos(!error && data ? (data as ResumoRow[]) : []);
        setLoading(false);
    };

    useEffect(() => {
        loadResumos();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [edital, materia, assunto]);

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
        if (!confirm("Excluir este resumo? Isso também removerá as revisões relacionadas.")) return;
        await supabase.from("resumos").delete().eq("id", viewing.id);
        setViewing(null);
        await loadResumos();
    };

    // Modal "Novo resumo"
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

    // opções do modal
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

    const nameEdital = (id: string | null) => (id && editalMap[id]) || "Edital";
    const nameMateria = (id: string | null) => (id && materiaMap[id]) || "Matéria";
    const nameAssunto = (id: string | null) => (id && assuntoMap[id]) || "Assunto";

    return (
        <div className="mx-auto max-w-4xl p-4">
            <div className="mb-4 flex items-center justify-between gap-2">
                <h1 className="text-2xl font-semibold">Resumos</h1>
                <button className="rounded bg-indigo-600 px-3 py-2 text-white" onClick={() => setOpenNew(true)}>
                    + Novo Resumo
                </button>
            </div>

            {/* Filtros */}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <label className="block">
                    <span className="mb-1 block text-sm text-gray-600">Edital</span>
                    <select value={edital} onChange={(e) => setEdital(e.target.value)} className="w-full rounded border p-2">
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
                        {materiasOpt.map((o) => (
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
                        {assuntosOpt.map((o) => (
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
                        <div key={r.id} className="flex flex-col justify-between gap-2 rounded border p-3 sm:flex-row sm:items-center">
                            <div className="min-w-0">
                                <div className="text-sm text-gray-500">
                                    {nameEdital(r.edital_id)} • {nameMateria(r.materia_id)} • {nameAssunto(r.assunto_id)} •{" "}
                                    {new Date(r.created_at).toLocaleDateString("pt-BR")}
                                </div>
                                <div className="font-medium truncate">{r.titulo}</div>
                            </div>
                            <div className="flex gap-2">
                                <button onClick={() => openView(r)} className="rounded bg-indigo-600 px-3 py-2 text-white">
                                    Ver
                                </button>
                            </div>
                        </div>
                    ))}

                {/* Visualização + editar/excluir */}
                {viewing && (
                    <div className="rounded border">
                        <div className="flex items-center justify-between border-b p-3">
                            <div className="min-w-0">
                                <div className="text-sm text-gray-500">
                                    {nameEdital(viewing.edital_id)} • {nameMateria(viewing.materia_id)} •{" "}
                                    {nameAssunto(viewing.assunto_id)} • {new Date(viewing.created_at).toLocaleDateString("pt-BR")}
                                </div>
                                <h2 className="mt-1 truncate text-lg font-semibold">{viewing.titulo}</h2>
                            </div>
                            <div className="flex gap-2">
                                {!editing ? (
                                    <button onClick={() => setEditing(true)} className="rounded bg-gray-800 px-3 py-2 text-white">
                                        Editar
                                    </button>
                                ) : (
                                    <>
                                        <button onClick={async () => { await salvarEdicao(); }} className="rounded bg-green-600 px-3 py-2 text-white">
                                            Salvar
                                        </button>
                                        <button
                                            onClick={() => {
                                                setEditing(false);
                                                setEditText(viewing.conteudo);
                                            }}
                                            className="rounded bg-gray-200 px-3 py-2"
                                        >
                                            Cancelar
                                        </button>
                                    </>
                                )}
                                <button onClick={excluirResumo} className="rounded bg-red-600 px-3 py-2 text-white">
                                    Excluir
                                </button>
                                <button onClick={() => setViewing(null)} className="rounded bg-gray-200 px-3 py-2">
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

            {/* MODAL: Novo resumo */}
            {openNew && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
                    <div className="w-full max-w-2xl rounded-lg bg-white shadow">
                        <div className="flex items-center justify-between border-b p-3">
                            <h3 className="text-lg font-semibold">Novo Resumo</h3>
                            <button onClick={() => setOpenNew(false)} className="rounded px-2 py-1 hover:bg-gray-100">
                                ✕
                            </button>
                        </div>
                        <div className="p-4 space-y-3">
                            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                                <label className="block">
                                    <span className="mb-1 block text-sm text-gray-600">Edital</span>
                                    <select value={newEdital} onChange={(e) => setNewEdital(e.target.value)} className="w-full rounded border p-2">
                                        <option value="">Selecione</option>
                                        {editais.map((o) => (
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
                                        {materiasOpt.map((o) => (
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
                                        {assuntosOpt.map((o) => (
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
                                    <button className="rounded bg-gray-100 px-2 py-1 text-sm" onClick={addMarkNew} disabled={!newConteudo}>
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
                                <button onClick={salvarNovo} disabled={savingNew} className="rounded bg-indigo-600 px-3 py-2 text-white disabled:opacity-50">
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
