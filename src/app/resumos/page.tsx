"use client";

import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

/* ===== utils ===== */
function renderWithMarks(text: string) {
    return text
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/==(.+?)==/g, "<mark>$1</mark>")
        .replace(/\n/g, "<br/>");
}
function plainSnippet(text: string, size = 140) {
    const noMarks = text.replace(/==(.+?)==/g, "$1");
    const trimmed = noMarks.replace(/\s+/g, " ").trim();
    return trimmed.length > size ? trimmed.slice(0, size) + "…" : trimmed;
}

/* ===== types ===== */
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

type RevItem = {
    id: string; // id da linha em revisoes
    etapa: number;
    scheduled_for: string; // YYYY-MM-DD
    resumo: ResumoRow;
};

/* ===== page ===== */
export default function ResumosPage() {
    const [tab, setTab] = useState<"revisao" | "lista">("revisao");

    // mapas de nomes
    const [editalMap, setEditalMap] = useState<Record<string, string>>({});
    const [materiaMap, setMateriaMap] = useState<Record<string, string>>({});
    const [assuntoMap, setAssuntoMap] = useState<Record<string, string>>({});

    // filtros (apenas para lista)
    const [editais, setEditais] = useState<Opt[]>([]);
    const [materiasOpt, setMateriasOpt] = useState<Opt[]>([]);
    const [assuntosOpt, setAssuntosOpt] = useState<Opt[]>([]);
    const [edital, setEdital] = useState("");
    const [materia, setMateria] = useState("");
    const [assunto, setAssunto] = useState("");

    // lista de resumos
    const [loadingList, setLoadingList] = useState(true);
    const [resumos, setResumos] = useState<ResumoRow[]>([]);
    const [viewingResumo, setViewingResumo] = useState<ResumoRow | null>(null);
    const [editing, setEditing] = useState(false);
    const [editText, setEditText] = useState("");

    // fila de revisões
    const [today, setToday] = useState<string>(new Date().toISOString().slice(0, 10));
    const [loadingRev, setLoadingRev] = useState(true);
    const [revisoes, setRevisoes] = useState<RevItem[]>([]);
    const [viewingRev, setViewingRev] = useState<RevItem | null>(null);

    // modal: novo resumo
    const [openNew, setOpenNew] = useState(false);
    const [newTitulo, setNewTitulo] = useState("");
    const [newConteudo, setNewConteudo] = useState("");
    const [newEdital, setNewEdital] = useState("");
    const [newMateria, setNewMateria] = useState("");
    const [newAssunto, setNewAssunto] = useState("");
    const [savingNew, setSavingNew] = useState(false);
    const newTextRef = useRef<HTMLTextAreaElement>(null);

    /* ===== nomes (uma vez) ===== */
    useEffect(() => {
        (async () => {
            const uid = (await supabase.auth.getUser()).data.user?.id;
            if (!uid) return;
            const [eds, mats, asss] = await Promise.all([
                supabase.from("editais").select("id,nome").eq("user_id", uid).order("created_at", { ascending: false }),
                supabase.from("materias").select("id,nome").eq("user_id", uid),
                supabase.from("assuntos").select("id,nome").eq("user_id", uid),
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

    const nameEdital = (id: string | null) => (id && editalMap[id]) || "Edital";
    const nameMateria = (id: string | null) => (id && materiaMap[id]) || "Matéria";
    const nameAssunto = (id: string | null) => (id && assuntoMap[id]) || "Assunto";

    /* ===== filtros dependentes (lista) ===== */
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

    /* ===== carregar lista de resumos ===== */
    const loadResumos = async () => {
        setLoadingList(true);
        const uid = (await supabase.auth.getUser()).data.user?.id;
        if (!uid) {
            setResumos([]); setLoadingList(false); return;
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
        setLoadingList(false);
    };

    useEffect(() => {
        loadResumos();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [edital, materia, assunto]);

    /* ===== carregar fila de revisões ===== */
    const loadRevisoes = async () => {
        setLoadingRev(true);
        const uid = (await supabase.auth.getUser()).data.user?.id;
        if (!uid) {
            setRevisoes([]); setLoadingRev(false); return;
        }
        const { data, error } = await supabase
            .from("revisoes")
            .select("id,etapa,scheduled_for,resumos(id,titulo,conteudo,created_at,edital_id,materia_id,assunto_id)")
            .eq("user_id", uid)
            .is("done_at", null)
            .lte("scheduled_for", today)
            .order("scheduled_for", { ascending: true });

        if (!error && data) {
            const items: RevItem[] = (data as any[]).map((r) => ({
                id: r.id,
                etapa: r.etapa,
                scheduled_for: r.scheduled_for,
                resumo: r.resumos?.[0] as ResumoRow,
            }));
            setRevisoes(items);
        } else {
            setRevisoes([]);
        }
        setViewingRev(null);
        setLoadingRev(false);
    };

    useEffect(() => {
        loadRevisoes();
    }, [today]);

    /* ===== ações ===== */
    const openViewResumo = (row: ResumoRow) => {
        setViewingResumo(row);
        setEditing(false);
        setEditText(row.conteudo);
    };

    const salvarEdicao = async () => {
        if (!viewingResumo) return;
        await supabase.from("resumos").update({ conteudo: editText }).eq("id", viewingResumo.id);
        setViewingResumo({ ...viewingResumo, conteudo: editText });
        setEditing(false);
    };

    const excluirResumo = async () => {
        if (!viewingResumo) return;
        if (!confirm("Excluir este resumo? Isso também removerá as revisões relacionadas.")) return;
        await supabase.from("resumos").delete().eq("id", viewingResumo.id);
        setViewingResumo(null);
        await Promise.all([loadResumos(), loadRevisoes()]);
    };

    const concluirRevisao = async (idRevisao: string) => {
        await supabase.from("revisoes").update({ done_at: new Date().toISOString() }).eq("id", idRevisao);
        setRevisoes((rs) => rs.filter((x) => x.id !== idRevisao));
        setViewingRev(null);
    };

    /* ===== modal novo resumo ===== */
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
            await Promise.all([loadResumos(), loadRevisoes()]);
        } catch (e: any) {
            alert(e?.message || "Falha ao salvar.");
        } finally {
            setSavingNew(false);
        }
    };

    /* ===== opções do modal ===== */
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

    /* ===== UI ===== */
    return (
        <div className="mx-auto max-w-4xl p-4">
            <div className="mb-4 flex items-center justify-between">
                <h1 className="text-2xl font-semibold">Estudos</h1>

                <div className="flex items-center gap-2">
                    <button
                        onClick={() => setTab("revisao")}
                        className={`rounded px-3 py-2 ${tab === "revisao" ? "bg-indigo-600 text-white" : "bg-gray-200"}`}
                    >
                        Revisões
                    </button>
                    <button
                        onClick={() => setTab("lista")}
                        className={`rounded px-3 py-2 ${tab === "lista" ? "bg-indigo-600 text-white" : "bg-gray-200"}`}
                    >
                        Resumos
                    </button>
                    <button className="ml-2 rounded bg-indigo-600 px-3 py-2 text-white" onClick={() => setOpenNew(true)}>
                        + Novo Resumo
                    </button>
                </div>
            </div>

            {/* ===== TAB: REVISÃO ===== */}
            {tab === "revisao" && (
                <div>
                    <label className="text-sm text-gray-600">
                        Mostrar pendentes até:
                        <input
                            type="date"
                            value={today}
                            onChange={(e) => setToday(e.target.value)}
                            className="ml-2 rounded border p-1"
                        />
                    </label>

                    <div className="mt-3 space-y-3">
                        {loadingRev && <div className="rounded border p-3">Carregando…</div>}
                        {!loadingRev && revisoes.length === 0 && !viewingRev && (
                            <div className="rounded border p-3 text-gray-500">Sem revisões pendentes 🎉</div>
                        )}

                        {/* fila */}
                        {!viewingRev &&
                            revisoes.map((rv) => (
                                <div key={rv.id} className="rounded border p-3 hover:bg-gray-50 transition">
                                    <div className="flex items-start justify-between gap-2">
                                        <div className="min-w-0">
                                            <div className="text-xs text-gray-500">
                                                {nameMateria(rv.resumo.materia_id)} • {nameAssunto(rv.resumo.assunto_id)}
                                            </div>
                                            <div className="font-medium truncate">{rv.resumo.titulo}</div>
                                            {rv.resumo.conteudo && (
                                                <div className="mt-1 text-sm text-gray-700 line-clamp-2">
                                                    {plainSnippet(rv.resumo.conteudo)}
                                                </div>
                                            )}
                                            <div className="mt-1 text-xs text-gray-500">
                                                Etapa {rv.etapa} • {new Date(rv.scheduled_for).toLocaleDateString("pt-BR")}
                                            </div>
                                        </div>
                                        <button
                                            onClick={() => setViewingRev(rv)}
                                            className="shrink-0 rounded bg-indigo-600 px-3 py-2 text-white"
                                        >
                                            Ver
                                        </button>
                                    </div>
                                </div>
                            ))}

                        {/* ver resumo + concluir */}
                        {viewingRev && (
                            <div className="rounded border">
                                <div className="flex items-center justify-between border-b p-3">
                                    <div className="min-w-0">
                                        <div className="text-sm text-gray-500">
                                            {nameMateria(viewingRev.resumo.materia_id)} • {nameAssunto(viewingRev.resumo.assunto_id)}
                                        </div>
                                        <div className="text-xs text-gray-500">
                                            Etapa {viewingRev.etapa} • {new Date(viewingRev.scheduled_for).toLocaleDateString("pt-BR")}
                                        </div>
                                        <h2 className="mt-1 truncate text-lg font-semibold">{viewingRev.resumo.titulo}</h2>
                                    </div>
                                    <div className="flex gap-2">
                                        <button onClick={() => setViewingRev(null)} className="rounded bg-gray-200 px-3 py-2">
                                            Voltar
                                        </button>
                                        <button
                                            onClick={() => concluirRevisao(viewingRev.id)}
                                            className="rounded bg-green-600 px-3 py-2 text-white"
                                        >
                                            Concluir revisão
                                        </button>
                                    </div>
                                </div>
                                <div
                                    className="prose max-w-none p-4"
                                    dangerouslySetInnerHTML={{ __html: renderWithMarks(viewingRev.resumo.conteudo || "") }}
                                />
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* ===== TAB: LISTA DE RESUMOS ===== */}
            {tab === "lista" && (
                <>
                    {/* filtros */}
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

                    {/* lista */}
                    <div className="mt-3 space-y-3">
                        {loadingList && <div className="rounded border p-3">Carregando…</div>}
                        {!loadingList && resumos.length === 0 && !viewingResumo && (
                            <div className="rounded border p-3 text-gray-500">Nenhum resumo encontrado.</div>
                        )}

                        {!viewingResumo &&
                            resumos.map((r) => (
                                <div key={r.id} className="flex flex-col justify-between gap-2 rounded border p-3 sm:flex-row sm:items-center">
                                    <div className="min-w-0">
                                        <div className="text-sm text-gray-500">
                                            {nameEdital(r.edital_id)} • {nameMateria(r.materia_id)} • {nameAssunto(r.assunto_id)} •{" "}
                                            {new Date(r.created_at).toLocaleDateString("pt-BR")}
                                        </div>
                                        <div className="font-medium truncate">{r.titulo}</div>
                                    </div>
                                    <button onClick={() => openViewResumo(r)} className="rounded bg-indigo-600 px-3 py-2 text-white">
                                        Ver
                                    </button>
                                </div>
                            ))}

                        {viewingResumo && (
                            <div className="rounded border">
                                <div className="flex items-center justify-between border-b p-3">
                                    <div className="min-w-0">
                                        <div className="text-sm text-gray-500">
                                            {nameEdital(viewingResumo.edital_id)} • {nameMateria(viewingResumo.materia_id)} •{" "}
                                            {nameAssunto(viewingResumo.assunto_id)} •{" "}
                                            {new Date(viewingResumo.created_at).toLocaleDateString("pt-BR")}
                                        </div>
                                        <h2 className="mt-1 truncate text-lg font-semibold">{viewingResumo.titulo}</h2>
                                    </div>
                                    <div className="flex gap-2">
                                        {!editing ? (
                                            <button onClick={() => setEditing(true)} className="rounded bg-gray-800 px-3 py-2 text-white">
                                                Editar
                                            </button>
                                        ) : (
                                            <>
                                                <button onClick={salvarEdicao} className="rounded bg-green-600 px-3 py-2 text-white">
                                                    Salvar
                                                </button>
                                                <button
                                                    onClick={() => {
                                                        setEditing(false);
                                                        setEditText(viewingResumo.conteudo);
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
                                        <button onClick={() => setViewingResumo(null)} className="rounded bg-gray-200 px-3 py-2">
                                            Voltar
                                        </button>
                                    </div>
                                </div>

                                {!editing ? (
                                    <div
                                        className="prose max-w-none p-4"
                                        dangerouslySetInnerHTML={{ __html: renderWithMarks(viewingResumo.conteudo) }}
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
                </>
            )}

            {/* ===== MODAL: Novo Resumo ===== */}
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
