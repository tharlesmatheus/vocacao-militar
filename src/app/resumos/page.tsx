"use client";

import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

/* ======================================================
   Utils
====================================================== */

function renderWithMarks(text?: string) {
    const t = text ?? "";
    return t
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/==(.+?)==/g, "<mark>$1</mark>")
        .replace(/\n/g, "<br/>");
}

type ResumoRow = {
    id: string;
    titulo: string;
    conteudo: string | null;
    created_at: string;
    materia_id: string | null;
    assunto_id: string | null;
};

/* ======================================================
   Modal
====================================================== */

function TokenModal({
    open,
    title,
    onClose,
    children,
}: any) {
    if (!open) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
            <div className="absolute inset-0 bg-black/60" onClick={onClose} />
            <div className="relative z-10 w-full max-w-3xl bg-card border border-border rounded-2xl shadow-xl">
                <div className="flex justify-between items-center p-4 border-b border-border">
                    <h2 className="font-semibold">{title}</h2>
                    <button onClick={onClose}>✕</button>
                </div>
                <div className="p-5">{children}</div>
            </div>
        </div>
    );
}

/* ======================================================
   Page
====================================================== */

export default function ResumosPage() {
    /* ---------- navegação estilo cadernos ---------- */

    type ViewLevel = "disciplinas" | "assuntos" | "resumos";

    const [viewLevel, setViewLevel] =
        useState<ViewLevel>("disciplinas");

    const [disciplinaSel, setDisciplinaSel] =
        useState<string | null>(null);

    const [assuntoSel, setAssuntoSel] =
        useState<string | null>(null);

    /* ---------- dados ---------- */

    const [resumos, setResumos] = useState<ResumoRow[]>([]);
    const [loading, setLoading] = useState(true);

    const [materiaMap, setMateriaMap] =
        useState<Record<string, string>>({});

    const [assuntoMap, setAssuntoMap] =
        useState<Record<string, string>>({});

    const nameMateria = (id?: string | null) =>
        (id && materiaMap[id]) || "Sem disciplina";

    const nameAssunto = (id?: string | null) =>
        (id && assuntoMap[id]) || "Sem assunto";

    /* ---------- carregar dados ---------- */

    useEffect(() => {
        (async () => {
            setLoading(true);

            const { data: u } = await supabase.auth.getUser();
            const uid = u?.user?.id;
            if (!uid) return;

            const [mats, asss, res] = await Promise.all([
                supabase.from("materias").select("id,nome").eq("user_id", uid),
                supabase.from("assuntos").select("id,nome").eq("user_id", uid),
                supabase
                    .from("resumos")
                    .select("*")
                    .eq("user_id", uid)
                    .order("created_at", { ascending: false }),
            ]);

            const mMap: any = {};
            mats.data?.forEach((m: any) => (mMap[m.id] = m.nome));
            setMateriaMap(mMap);

            const aMap: any = {};
            asss.data?.forEach((a: any) => (aMap[a.id] = a.nome));
            setAssuntoMap(aMap);

            setResumos(res.data ?? []);
            setLoading(false);
        })();
    }, []);

    /* ======================================================
       AGRUPAMENTOS (igual cadernos)
    ====================================================== */

    const disciplinas = Object.entries(
        resumos.reduce((acc: any, r) => {
            const key = nameMateria(r.materia_id);
            if (!acc[key]) acc[key] = [];
            acc[key].push(r);
            return acc;
        }, {})
    );

    const assuntos = Object.entries(
        resumos
            .filter((r) => nameMateria(r.materia_id) === disciplinaSel)
            .reduce((acc: any, r) => {
                const key = nameAssunto(r.assunto_id);
                if (!acc[key]) acc[key] = [];
                acc[key].push(r);
                return acc;
            }, {})
    );

    /* ======================================================
       VIEW RESUMO
    ====================================================== */

    const [viewingResumo, setViewingResumo] =
        useState<ResumoRow | null>(null);

    /* ======================================================
       MODAL NOVO RESUMO
    ====================================================== */

    const [openNew, setOpenNew] = useState(false);
    const [titulo, setTitulo] = useState("");
    const [conteudo, setConteudo] = useState("");
    const textareaRef = useRef<HTMLTextAreaElement>(null);

    const salvarNovo = async () => {
        const { data: u } = await supabase.auth.getUser();
        const uid = u?.user?.id;
        if (!uid) return;

        await supabase.from("resumos").insert({
            titulo,
            conteudo,
            user_id: uid,
        });

        location.reload();
    };

    /* ======================================================
       UI
    ====================================================== */

    return (
        <div className="max-w-6xl mx-auto px-4 py-10">

            {/* HEADER */}
            <div className="flex justify-between mb-8">
                <h1 className="text-2xl font-bold">Meus Resumos</h1>

                <button
                    onClick={() => setOpenNew(true)}
                    className="bg-primary text-primary-foreground px-4 py-2 rounded-xl"
                >
                    + Novo resumo
                </button>
            </div>

            {loading && <div>Carregando...</div>}

            {/* ================= DISCIPLINAS ================= */}
            {viewLevel === "disciplinas" && (
                <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
                    {disciplinas.map(([disciplina, items]: any) => (
                        <button
                            key={disciplina}
                            onClick={() => {
                                setDisciplinaSel(disciplina);
                                setViewLevel("assuntos");
                            }}
                            className="bg-card border border-border rounded-2xl p-6 text-left hover:shadow-md transition"
                        >
                            <div className="text-lg font-bold">{disciplina}</div>

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
                        className="mb-5 text-sm"
                        onClick={() => {
                            setViewLevel("disciplinas");
                            setDisciplinaSel(null);
                        }}
                    >
                        ← Disciplinas
                    </button>

                    <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
                        {assuntos.map(([assunto, items]: any) => (
                            <button
                                key={assunto}
                                onClick={() => {
                                    setAssuntoSel(assunto);
                                    setViewLevel("resumos");
                                }}
                                className="bg-card border border-border rounded-2xl p-6 text-left hover:shadow-md transition"
                            >
                                <div className="text-lg font-bold">{assunto}</div>

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
                        className="mb-5 text-sm"
                        onClick={() => {
                            setViewLevel("assuntos");
                            setAssuntoSel(null);
                        }}
                    >
                        ← Assuntos
                    </button>

                    <div className="flex flex-col gap-4">
                        {resumos
                            .filter(
                                (r) =>
                                    nameMateria(r.materia_id) === disciplinaSel &&
                                    nameAssunto(r.assunto_id) === assuntoSel
                            )
                            .map((r) => (
                                <div
                                    key={r.id}
                                    className="bg-card border border-border rounded-xl p-4 flex justify-between items-center"
                                >
                                    <div>
                                        <div className="text-xs text-muted-foreground">
                                            {new Date(r.created_at).toLocaleDateString("pt-BR")}
                                        </div>
                                        <div className="font-semibold">{r.titulo}</div>
                                    </div>

                                    <button
                                        onClick={() => setViewingResumo(r)}
                                        className="bg-primary text-primary-foreground px-3 py-2 rounded-lg"
                                    >
                                        Ver
                                    </button>
                                </div>
                            ))}
                    </div>
                </>
            )}

            {/* ================= VISUALIZAR ================= */}
            {viewingResumo && (
                <div className="mt-8 bg-card border border-border rounded-2xl">
                    <div className="p-4 border-b border-border flex justify-between">
                        <h2 className="font-semibold">{viewingResumo.titulo}</h2>
                        <button onClick={() => setViewingResumo(null)}>Voltar</button>
                    </div>

                    <div
                        className="p-5 prose max-w-none"
                        dangerouslySetInnerHTML={{
                            __html: renderWithMarks(viewingResumo.conteudo ?? ""),
                        }}
                    />
                </div>
            )}

            {/* ================= MODAL ================= */}
            <TokenModal
                open={openNew}
                onClose={() => setOpenNew(false)}
                title="Novo resumo"
            >
                <div className="space-y-3">
                    <input
                        className="w-full border border-border rounded p-2"
                        placeholder="Título"
                        value={titulo}
                        onChange={(e) => setTitulo(e.target.value)}
                    />

                    <textarea
                        ref={textareaRef}
                        className="w-full h-56 border border-border rounded p-2"
                        value={conteudo}
                        onChange={(e) => setConteudo(e.target.value)}
                    />

                    <div className="flex justify-end">
                        <button
                            onClick={salvarNovo}
                            className="bg-primary text-primary-foreground px-4 py-2 rounded"
                        >
                            Salvar
                        </button>
                    </div>
                </div>
            </TokenModal>
        </div>
    );
}