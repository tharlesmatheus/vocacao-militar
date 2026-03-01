"use client";

import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

/* ========== utils ========== */
function renderWithMarks(text?: string) {
    const t = text ?? "";
    return t
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/==(.+?)==/g, "<mark>$1</mark>")
        .replace(/\n/g, "<br/>");
}
function plainSnippet(text?: string, size = 140) {
    const t = (text ?? "").replace(/==(.+?)==/g, "$1");
    const trimmed = t.replace(/\s+/g, " ").trim();
    return trimmed.length > size ? trimmed.slice(0, size) + "…" : trimmed;
}

/* ========== types ========== */
type Opt = { value: string; label: string };
type ResumoRow = {
    id: string;
    titulo: string;
    conteudo: string | null;
    created_at: string;
    edital_id: string | null;
    materia_id: string | null;
    assunto_id: string | null;
};
type RevItem = {
    id: string;
    etapa: number;
    scheduled_for: string;
    resumo: ResumoRow;
};

/* ========== Modal com tokens ========== */
function TokenModal({
    open,
    title,
    onClose,
    children,
    width = "max-w-3xl",
}: {
    open: boolean;
    title?: string;
    onClose: () => void;
    children: React.ReactNode;
    width?: string;
}) {
    if (!open) return null;
    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center px-4">
            <div className="absolute inset-0 bg-black/60" onClick={onClose} />
            <div
                className={`relative z-[101] w-full ${width} rounded-2xl bg-card text-foreground border border-border shadow-xl`}
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
                <div className="p-5">{children}</div>
            </div>
        </div>
    );
}

export default function ResumosPage() {
    const [tab, setTab] = useState<"revisao" | "lista">("revisao");

    // maps p/ nomes
    const [editalMap, setEditalMap] = useState<Record<string, string>>({});
    const [materiaMap, setMateriaMap] = useState<Record<string, string>>({});
    const [assuntoMap, setAssuntoMap] = useState<Record<string, string>>({});

    // filtros LISTA
    const [editais, setEditais] = useState<Opt[]>([]);
    const [materiasOpt, setMateriasOpt] = useState<Opt[]>([]);
    const [assuntosOpt, setAssuntosOpt] = useState<Opt[]>([]);
    const [edital, setEdital] = useState("");
    const [materia, setMateria] = useState("");
    const [assunto, setAssunto] = useState("");

    // lista
    const [loadingList, setLoadingList] = useState(true);
    const [resumos, setResumos] = useState<ResumoRow[]>([]);
    const [viewingResumo, setViewingResumo] = useState<ResumoRow | null>(null);
    const [editing, setEditing] = useState(false);
    const [editText, setEditText] = useState("");

    // revisões
    const [today, setToday] = useState<string>(new Date().toISOString().slice(0, 10));
    const [loadingRev, setLoadingRev] = useState(true);
    const [revisoes, setRevisoes] = useState<RevItem[]>([]);
    const [viewingRev, setViewingRev] = useState<RevItem | null>(null);

    // modal novo resumo
    const [openNew, setOpenNew] = useState(false);
    const [newTitulo, setNewTitulo] = useState("");
    const [newConteudo, setNewConteudo] = useState("");
    const [newEdital, setNewEdital] = useState("");
    const [newMateria, setNewMateria] = useState("");
    const [newAssunto, setNewAssunto] = useState("");
    const [savingNew, setSavingNew] = useState(false);
    const newTextRef = useRef<HTMLTextAreaElement>(null);

    // opções do modal
    const [optsNewEditais, setOptsNewEditais] = useState<Opt[]>([]);
    const [optsNewMaterias, setOptsNewMaterias] = useState<Opt[]>([]);
    const [optsNewAssuntos, setOptsNewAssuntos] = useState<Opt[]>([]);

    /* ========= navegação estilo cadernos ========= */
    type ViewLevel = "disciplinas" | "assuntos" | "resumos";

    const [viewLevel, setViewLevel] = useState<ViewLevel>("disciplinas");
    const [disciplinaSel, setDisciplinaSel] = useState<string | null>(null);
    const [assuntoSel, setAssuntoSel] = useState<string | null>(null);

    /* ========= nomes / combos base ========= */
    useEffect(() => {
        (async () => {
            try {
                const { data: u } = await supabase.auth.getUser();
                const uid = u?.user?.id;
                if (!uid) return;

                const [eds, mats, asss] = await Promise.all([
                    supabase
                        .from("editais")
                        .select("id,nome")
                        .eq("user_id", uid)
                        .order("created_at", { ascending: false }),
                    supabase.from("materias").select("id,nome").eq("user_id", uid),
                    supabase.from("assuntos").select("id,nome").eq("user_id", uid),
                ]);

                const eMap: Record<string, string> = {};
                (eds.data ?? []).forEach((e: any) => (eMap[e.id] = e.nome));
                setEditalMap(eMap);
                setEditais((eds.data ?? []).map((d: any) => ({ value: d.id, label: d.nome })));

                const mMap: Record<string, string> = {};
                (mats.data ?? []).forEach((m: any) => (mMap[m.id] = m.nome));
                setMateriaMap(mMap);

                const aMap: Record<string, string> = {};
                (asss.data ?? []).forEach((a: any) => (aMap[a.id] = a.nome));
                setAssuntoMap(aMap);
            } catch {
                /* noop */
            }
        })();
    }, []);

    const nameEdital = (id?: string | null) => (id && editalMap[id]) || "Edital";
    const nameMateria = (id?: string | null) => (id && materiaMap[id]) || "Matéria";
    const nameAssunto = (id?: string | null) => (id && assuntoMap[id]) || "Assunto";

    /* ========= filtros dependentes (LISTA) ========= */
    useEffect(() => {
        (async () => {
            try {
                setMateriasOpt([]);
                setMateria("");
                setAssuntosOpt([]);
                setAssunto("");
                if (!edital) return;
                const { data: u } = await supabase.auth.getUser();
                const uid = u?.user?.id;
                if (!uid) return;
                const { data } = await supabase
                    .from("materias")
                    .select("id,nome")
                    .eq("user_id", uid)
                    .eq("edital_id", edital)
                    .order("nome");
                setMateriasOpt((data ?? []).map((d: any) => ({ value: d.id, label: d.nome })));
            } catch { }
        })();
    }, [edital]);

    useEffect(() => {
        (async () => {
            try {
                setAssuntosOpt([]);
                setAssunto("");
                if (!materia) return;
                const { data: u } = await supabase.auth.getUser();
                const uid = u?.user?.id;
                if (!uid) return;
                const { data } = await supabase
                    .from("assuntos")
                    .select("id,nome")
                    .eq("user_id", uid)
                    .eq("materia_id", materia)
                    .order("nome");
                setAssuntosOpt((data ?? []).map((d: any) => ({ value: d.id, label: d.nome })));
            } catch { }
        })();
    }, [materia]);

    /* ========= lista de resumos ========= */
    const loadResumos = async () => {
        setLoadingList(true);
        try {
            const { data: u } = await supabase.auth.getUser();
            const uid = u?.user?.id;
            if (!uid) {
                setResumos([]);
                return;
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

            const { data: rows, error } = await q;
            setResumos(!error && rows ? (rows as ResumoRow[]) : []);
        } catch {
            setResumos([]);
        } finally {
            setLoadingList(false);
        }
    };

    useEffect(() => {
        loadResumos();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [edital, materia, assunto]);

    /* ========= revisões ========= */
    const loadRevisoes = async () => {
        setLoadingRev(true);
        try {
            const { data: u } = await supabase.auth.getUser();
            const uid = u?.user?.id;
            if (!uid) {
                setRevisoes([]);
                return;
            }

            const { data: rows, error } = await supabase
                .from("revisoes")
                .select(
                    "id,etapa,scheduled_for,resumos:resumo_id(id,titulo,conteudo,created_at,edital_id,materia_id,assunto_id)"
                )
                .eq("user_id", uid)
                .is("done_at", null)
                .lte("scheduled_for", today)
                .order("scheduled_for", { ascending: true });

            if (!error && rows) {
                const items: RevItem[] = (rows as any[])
                    .map((r) => ({
                        id: r.id,
                        etapa: r.etapa,
                        scheduled_for: r.scheduled_for,
                        resumo: (r.resumos ?? {}) as ResumoRow,
                    }))
                    .filter((x) => !!x.resumo?.id);
                setRevisoes(items);
            } else {
                setRevisoes([]);
            }
        } catch {
            setRevisoes([]);
        } finally {
            setViewingRev(null);
            setLoadingRev(false);
        }
    };

    useEffect(() => {
        loadRevisoes();
    }, [today]);

    /* ========= ações ========= */
    const openViewResumo = (row: ResumoRow) => {
        setViewingResumo(row);
        setEditing(false);
        setEditText(row.conteudo ?? "");
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
        await supabase
            .from("revisoes")
            .update({ done_at: new Date().toISOString() })
            .eq("id", idRevisao);
        setRevisoes((rs) => rs.filter((x) => x.id !== idRevisao));
        setViewingRev(null);
    };

    /* ========= modal: helpers ========= */
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
            const { data: u } = await supabase.auth.getUser();
            const uid = u?.user?.id;
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
            setNewTitulo("");
            setNewConteudo("");
            setNewEdital("");
            setNewMateria("");
            setNewAssunto("");
            await Promise.all([loadResumos(), loadRevisoes()]);
        } catch (e: any) {
            alert(e?.message || "Falha ao salvar.");
        } finally {
            setSavingNew(false);
        }
    };

    /* ========= opções MODAL ========= */
    useEffect(() => {
        if (!openNew) return;
        (async () => {
            const { data: u } = await supabase.auth.getUser();
            const uid = u?.user?.id;
            if (!uid) return;
            const { data } = await supabase
                .from("editais")
                .select("id,nome")
                .eq("user_id", uid)
                .order("created_at", { ascending: false });
            setOptsNewEditais((data ?? []).map((d: any) => ({ value: d.id, label: d.nome })));
        })();
    }, [openNew]);

    useEffect(() => {
        (async () => {
            setOptsNewMaterias([]);
            setNewMateria("");
            setOptsNewAssuntos([]);
            setNewAssunto("");
            if (!newEdital) return;
            const { data: u } = await supabase.auth.getUser();
            const uid = u?.user?.id;
            if (!uid) return;
            const { data } = await supabase
                .from("materias")
                .select("id,nome")
                .eq("user_id", uid)
                .eq("edital_id", newEdital)
                .order("nome");
            setOptsNewMaterias((data ?? []).map((d: any) => ({ value: d.id, label: d.nome })));
        })();
    }, [newEdital]);

    useEffect(() => {
        (async () => {
            setOptsNewAssuntos([]);
            setNewAssunto("");
            if (!newMateria) return;
            const { data: u } = await supabase.auth.getUser();
            const uid = u?.user?.id;
            if (!uid) return;
            const { data } = await supabase
                .from("assuntos")
                .select("id,nome")
                .eq("user_id", uid)
                .eq("materia_id", newMateria)
                .order("nome");
            setOptsNewAssuntos((data ?? []).map((d: any) => ({ value: d.id, label: d.nome })));
        })();
    }, [newMateria]);

    /* ========= helpers de UI (tokens) ========= */
    const inputBase =
        "rounded border border-border p-2 bg-input text-foreground placeholder:text-muted-foreground " +
        "focus:outline-none focus:ring-2 focus:ring-primary/20";
    const selectBase =
        "rounded border border-border p-2 bg-input text-foreground appearance-none " +
        "focus:outline-none focus:ring-2 focus:ring-primary/20";
    const btnTab = (active: boolean) =>
        `rounded px-3 py-2 ${active
            ? "bg-primary text-primary-foreground"
            : "bg-muted text-foreground border border-border"
        }`;

    /* ========= UI ========= */
    return (
        <div className="mx-auto max-w-4xl p-4 overflow-x-hidden text-foreground">
            {/* header */}
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                <h1 className="text-2xl font-semibold">Estudos</h1>
                <div className="flex flex-wrap items-center gap-2">
                    <button onClick={() => setTab("revisao")} className={btnTab(tab === "revisao")}>
                        Revisões
                    </button>
                    <button onClick={() => setTab("lista")} className={btnTab(tab === "lista")}>
                        Resumos
                    </button>
                    <button
                        className="ml-0 sm:ml-2 rounded bg-primary px-3 py-2 text-primary-foreground"
                        onClick={() => setOpenNew(true)}
                    >
                        + Novo Resumo
                    </button>
                </div>
            </div>

            {/* ===== Revisões ===== */}
            {tab === "revisao" && (
                <div>
                    <label className="text-sm text-muted-foreground block">
                        <span className="mr-2">Mostrar pendentes até:</span>
                        <input
                            type="date"
                            value={today}
                            onChange={(e) => setToday(e.target.value)}
                            className="rounded border border-border p-1 bg-input text-foreground"
                        />
                    </label>

                    <div className="mt-3 space-y-3">
                        {loadingRev && <div className="rounded border border-border p-3">Carregando…</div>}
                        {!loadingRev && revisoes.length === 0 && !viewingRev && (
                            <div className="rounded border border-border p-3 text-muted-foreground">
                                Sem revisões pendentes. Adicione um resumo e os agendamentos
                                (1/3/7/15/30/60/90) serão criados.
                            </div>
                        )}

                        {!viewingRev &&
                            revisoes.map((rv) => (
                                <div
                                    key={rv.id}
                                    className="rounded border border-border p-3 hover:bg-muted transition"
                                >
                                    <div className="flex items-start justify-between gap-3">
                                        <div className="min-w-0">
                                            <div className="text-xs text-muted-foreground break-words">
                                                {nameMateria(rv.resumo.materia_id)} • {nameAssunto(rv.resumo.assunto_id)}
                                            </div>
                                            <div className="font-medium truncate">{rv.resumo.titulo || "Resumo"}</div>
                                            {rv.resumo.conteudo && (
                                                <div className="mt-1 text-sm text-foreground/90 line-clamp-2 break-words">
                                                    {plainSnippet(rv.resumo.conteudo)}
                                                </div>
                                            )}
                                            <div className="mt-1 text-xs text-muted-foreground">
                                                Etapa {rv.etapa} •{" "}
                                                {new Date(rv.scheduled_for).toLocaleDateString("pt-BR")}
                                            </div>
                                        </div>
                                        <button
                                            onClick={() => setViewingRev(rv)}
                                            className="shrink-0 rounded bg-primary px-3 py-2 text-primary-foreground"
                                        >
                                            Ver
                                        </button>
                                    </div>
                                </div>
                            ))}

                        {viewingRev && (
                            <div className="rounded border border-border bg-card">
                                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between border-b border-border p-3">
                                    <div className="min-w-0">
                                        <div className="text-sm text-muted-foreground break-words">
                                            {nameMateria(viewingRev.resumo.materia_id)} •{" "}
                                            {nameAssunto(viewingRev.resumo.assunto_id)}
                                        </div>
                                        <div className="text-xs text-muted-foreground">
                                            Etapa {viewingRev.etapa} •{" "}
                                            {new Date(viewingRev.scheduled_for).toLocaleDateString("pt-BR")}
                                        </div>
                                        <h2 className="mt-1 truncate text-lg font-semibold">
                                            {viewingRev.resumo.titulo || "Resumo"}
                                        </h2>
                                    </div>
                                    <div className="flex flex-wrap gap-2">
                                        <button
                                            onClick={() => setViewingRev(null)}
                                            className="rounded bg-transparent text-foreground border border-border px-3 py-2"
                                        >
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
                                    className="prose max-w-none p-4 break-words text-foreground"
                                    dangerouslySetInnerHTML={{
                                        __html: renderWithMarks(viewingRev.resumo.conteudo ?? ""),
                                    }}
                                />
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* ===== Lista de Resumos (NOVO PADRÃO CADERNOS) ===== */}
            {tab === "lista" && (
                <>
                    {/* ================= DISCIPLINAS ================= */}
                    {viewLevel === "disciplinas" && (
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">

                            {Object.entries(
                                resumos.reduce((acc: any, r) => {
                                    const key = nameMateria(r.materia_id);
                                    if (!acc[key]) acc[key] = [];
                                    acc[key].push(r);
                                    return acc;
                                }, {})
                            ).map(([disciplina, items]: any) => (

                                <button
                                    key={disciplina}
                                    onClick={() => {
                                        setDisciplinaSel(disciplina);
                                        setViewLevel("assuntos");
                                    }}
                                    className="bg-card border border-border rounded-2xl p-6 text-left hover:shadow-md transition"
                                >
                                    <div className="text-lg font-semibold">{disciplina}</div>

                                    <div className="mt-4 text-sm text-muted-foreground">
                                        {items.length} resumos
                                    </div>
                                </button>

                            ))}
                        </div>
                    )}

                    {/* ================= ASSUNTOS ================= */}
                    {viewLevel === "assuntos" && (
                        <>
                            <button
                                className="mb-4 text-sm"
                                onClick={() => {
                                    setViewLevel("disciplinas");
                                    setDisciplinaSel(null);
                                }}
                            >
                                ← Disciplinas
                            </button>

                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">

                                {Object.entries(
                                    resumos
                                        .filter(r => nameMateria(r.materia_id) === disciplinaSel)
                                        .reduce((acc: any, r) => {
                                            const key = nameAssunto(r.assunto_id);
                                            if (!acc[key]) acc[key] = [];
                                            acc[key].push(r);
                                            return acc;
                                        }, {})
                                ).map(([assunto, items]: any) => (

                                    <button
                                        key={assunto}
                                        onClick={() => {
                                            setAssuntoSel(assunto);
                                            setViewLevel("resumos");
                                        }}
                                        className="bg-card border border-border rounded-2xl p-6 text-left hover:shadow-md transition"
                                    >
                                        <div className="text-lg font-semibold">{assunto}</div>

                                        <div className="mt-4 text-sm text-muted-foreground">
                                            {items.length} resumos
                                        </div>
                                    </button>

                                ))}
                            </div>
                        </>
                    )}

                    {/* ================= RESUMOS ================= */}
                    {viewLevel === "resumos" && (
                        <>
                            <button
                                className="mb-4 text-sm"
                                onClick={() => {
                                    setViewLevel("assuntos");
                                    setAssuntoSel(null);
                                }}
                            >
                                ← Assuntos
                            </button>

                            <div className="space-y-3">

                                {resumos
                                    .filter(
                                        r =>
                                            nameMateria(r.materia_id) === disciplinaSel &&
                                            nameAssunto(r.assunto_id) === assuntoSel
                                    )
                                    .map((r) => (
                                        <div
                                            key={r.id}
                                            className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 rounded border border-border p-3 bg-card"
                                        >
                                            <div>
                                                <div className="text-sm text-muted-foreground">
                                                    {new Date(r.created_at).toLocaleDateString("pt-BR")}
                                                </div>

                                                <div className="font-medium">{r.titulo}</div>
                                            </div>

                                            <button
                                                onClick={() => openViewResumo(r)}
                                                className="rounded bg-primary px-3 py-2 text-primary-foreground"
                                            >
                                                Ver
                                            </button>
                                        </div>
                                    ))}

                            </div>
                        </>
                    )}

                    {/* ===== VISUALIZAÇÃO EXISTENTE (SEM ALTERAR) ===== */}
                    {viewingResumo && (
                        /* 👉 MANTÉM SEU BLOCO ORIGINAL AQUI (não mudar) */
                        null
                    )}
                </>
            )}

            {/* ===== Modal: Novo Resumo (Tokenizado) ===== */}
            <TokenModal open={openNew} onClose={() => setOpenNew(false)} title="Novo Resumo">
                <div className="space-y-3">
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                        <label className="block">
                            <span className="mb-1 block text-sm text-muted-foreground">Edital</span>
                            <select
                                value={newEdital}
                                onChange={(e) => setNewEdital(e.target.value)}
                                className={`w-full ${selectBase}`}
                            >
                                <option value="">Selecione</option>
                                {optsNewEditais.map((o) => (
                                    <option key={o.value} value={o.value}>
                                        {o.label}
                                    </option>
                                ))}
                            </select>
                        </label>
                        <label className="block">
                            <span className="mb-1 block text-sm text-muted-foreground">Matéria</span>
                            <select
                                value={newMateria}
                                onChange={(e) => setNewMateria(e.target.value)}
                                className={`w-full ${selectBase}`}
                                disabled={!newEdital}
                            >
                                <option value="">{newEdital ? "Selecione" : "Selecione um edital"}</option>
                                {optsNewMaterias.map((o) => (
                                    <option key={o.value} value={o.value}>
                                        {o.label}
                                    </option>
                                ))}
                            </select>
                        </label>
                        <label className="block">
                            <span className="mb-1 block text-sm text-muted-foreground">Assunto</span>
                            <select
                                value={newAssunto}
                                onChange={(e) => setNewAssunto(e.target.value)}
                                className={`w-full ${selectBase}`}
                                disabled={!newMateria}
                            >
                                <option value="">{newMateria ? "Selecione" : "Selecione a matéria"}</option>
                                {optsNewAssuntos.map((o) => (
                                    <option key={o.value} value={o.value}>
                                        {o.label}
                                    </option>
                                ))}
                            </select>
                        </label>
                    </div>

                    <input
                        className={inputBase}
                        placeholder="Título do resumo"
                        value={newTitulo}
                        onChange={(e) => setNewTitulo(e.target.value)}
                    />

                    <div className="rounded border border-border bg-card">
                        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 border-b border-border p-2">
                            <div className="text-sm text-muted-foreground">
                                Dica: use <code>==texto==</code> para <mark>grifar</mark>
                            </div>
                            <button
                                className="rounded bg-muted px-2 py-1 text-sm text-foreground border border-border self-start sm:self-auto"
                                onClick={addMarkNew}
                                disabled={!newConteudo}
                            >
                                Grifar seleção
                            </button>
                        </div>
                        <textarea
                            ref={newTextRef}
                            className="h-64 w-full p-3 outline-none bg-input text-foreground"
                            value={newConteudo}
                            onChange={(e) => setNewConteudo(e.target.value)}
                            placeholder="Escreva seu resumo…"
                        />
                    </div>

                    <div className="flex flex-wrap items-center justify-end gap-2">
                        <button
                            onClick={() => setOpenNew(false)}
                            className="rounded bg-transparent text-foreground border border-border px-3 py-2"
                        >
                            Cancelar
                        </button>
                        <button
                            onClick={salvarNovo}
                            disabled={savingNew}
                            className="rounded bg-primary px-3 py-2 text-primary-foreground disabled:opacity-50"
                        >
                            {savingNew ? "Salvando..." : "Salvar resumo"}
                        </button>
                    </div>
                </div>
            </TokenModal>
        </div>
    );
}
