"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { BookOpen, LayoutGrid, List } from "lucide-react";

/* ================= UTILS ================= */

function renderWithMarks(text: string) {
    return text
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/==(.+?)==/g, "<mark>$1</mark>")
        .replace(/\n/g, "<br/>");
}

function plainSnippet(text: string, size = 140) {
    const t = text.replace(/==(.+?)==/g, "$1");
    const trimmed = t.replace(/\s+/g, " ").trim();
    return trimmed.length > size ? trimmed.slice(0, size) + "…" : trimmed;
}

/* ================= TYPES ================= */

type Resumo = {
    id: string;
    titulo: string;
    conteudo: string | null;
    assunto_id: string | null;
    materia_id: string | null;
};

type Rev = {
    id: string;
    etapa: number;
    scheduled_for: string;
    resumo: Resumo | null;
};

type ViewLevel = "materias" | "assuntos" | "revisoes";
type ViewMode = "grid" | "list";

/* ================= PAGE ================= */

export default function RevisaoPage() {
    const today = new Date().toISOString().slice(0, 10);

    const [rows, setRows] = useState<Rev[]>([]);
    const [loading, setLoading] = useState(true);

    const [materiaMap, setMateriaMap] = useState<Record<string, string>>({});
    const [assuntoMap, setAssuntoMap] = useState<Record<string, string>>({});

    const [viewLevel, setViewLevel] = useState<ViewLevel>("materias");
    const [viewMode, setViewMode] = useState<ViewMode>("grid");

    const [materiaSel, setMateriaSel] = useState<string | null>(null);
    const [assuntoSel, setAssuntoSel] = useState<string | null>(null);

    const [viewing, setViewing] = useState<Rev | null>(null);

    /* ================= LOAD DATA ================= */

    useEffect(() => {
        (async () => {
            setLoading(true);

            const { data: userData } = await supabase.auth.getUser();
            const uid = userData.user?.id;
            if (!uid) return;

            /* MAPAS */
            const [mats, asss] = await Promise.all([
                supabase.from("materias").select("id,nome").eq("user_id", uid),
                supabase.from("assuntos").select("id,nome").eq("user_id", uid),
            ]);

            const mm: Record<string, string> = {};
            mats.data?.forEach((m: any) => (mm[m.id] = m.nome));

            const am: Record<string, string> = {};
            asss.data?.forEach((a: any) => (am[a.id] = a.nome));

            setMateriaMap(mm);
            setAssuntoMap(am);

            /* REVISOES */
            const { data } = await supabase
                .from("revisoes")
                .select(`
          id,
          etapa,
          scheduled_for,
          resumos (
            id,
            titulo,
            conteudo,
            assunto_id,
            materia_id
          )
        `)
                .eq("user_id", uid)
                .is("done_at", null)
                .lte("scheduled_for", today)
                .order("scheduled_for", { ascending: true });

            const normalized: Rev[] =
                (data ?? []).map((r: any) => ({
                    id: r.id,
                    etapa: r.etapa,
                    scheduled_for: r.scheduled_for,
                    resumo: r.resumos ?? null,
                })) || [];

            setRows(normalized);
            setLoading(false);
        })();
    }, [today]);

    /* ================= HELPERS ================= */

    const nomeMateria = (r: Rev) =>
        (r.resumo?.materia_id && materiaMap[r.resumo.materia_id]) || "Matéria";

    const nomeAssunto = (r: Rev) =>
        (r.resumo?.assunto_id && assuntoMap[r.resumo.assunto_id]) || "Assunto";

    const concluir = async (id: string) => {
        await supabase
            .from("revisoes")
            .update({ done_at: new Date().toISOString() })
            .eq("id", id);

        setRows((r) => r.filter((x) => x.id !== id));
        setViewing(null);
    };

    /* ================= AGRUPAMENTOS ================= */

    const materias = Object.entries(
        rows.reduce((acc: any, r) => {
            const key = nomeMateria(r);
            if (!acc[key]) acc[key] = [];
            acc[key].push(r);
            return acc;
        }, {})
    );

    const assuntos = Object.entries(
        rows
            .filter((r) => nomeMateria(r) === materiaSel)
            .reduce((acc: any, r) => {
                const key = nomeAssunto(r);
                if (!acc[key]) acc[key] = [];
                acc[key].push(r);
                return acc;
            }, {})
    );

    const revisoesFiltradas = rows.filter(
        (r) =>
            nomeMateria(r) === materiaSel &&
            nomeAssunto(r) === assuntoSel
    );

    /* ================= CARD ================= */

    const Card = ({ title, count, onClick }: any) => {
        if (viewMode === "list") {
            return (
                <button
                    onClick={onClick}
                    className="w-full flex items-center justify-between border border-border bg-card rounded-xl px-4 py-3 hover:bg-muted transition"
                >
                    <div className="flex items-center gap-3">
                        <div className="bg-red-500 text-white p-2 rounded-lg">
                            <BookOpen size={18} />
                        </div>

                        <div className="text-left">
                            <div className="font-medium">{title}</div>
                            <div className="text-xs text-muted-foreground">
                                {count} revisões
                            </div>
                        </div>
                    </div>
                </button>
            );
        }

        return (
            <button
                onClick={onClick}
                className="bg-card border border-border rounded-2xl p-6 flex flex-col items-center text-center hover:shadow-md transition"
            >
                <div className="bg-red-500 text-white p-4 rounded-xl mb-4">
                    <BookOpen size={26} />
                </div>

                <h3 className="font-semibold text-lg">{title}</h3>

                <p className="text-sm text-muted-foreground mt-2">
                    {count} revisões
                </p>
            </button>
        );
    };

    /* ================= UI ================= */

    if (loading)
        return (
            <div className="p-6 text-muted-foreground">
                Carregando revisões...
            </div>
        );

    return (
        <div className="mx-auto max-w-6xl p-6">

            {/* HEADER */}
            <div className="flex justify-between items-center mb-6">
                <h1 className="text-2xl font-semibold">Revisões</h1>

                {/* TOGGLE GRID/LIST */}
                <div className="flex bg-muted border border-border rounded-xl p-1">
                    <button
                        onClick={() => setViewMode("grid")}
                        className={`p-2 rounded-lg ${viewMode === "grid"
                                ? "bg-background shadow"
                                : "text-muted-foreground"
                            }`}
                    >
                        <LayoutGrid size={18} />
                    </button>

                    <button
                        onClick={() => setViewMode("list")}
                        className={`p-2 rounded-lg ${viewMode === "list"
                                ? "bg-background shadow"
                                : "text-muted-foreground"
                            }`}
                    >
                        <List size={18} />
                    </button>
                </div>
            </div>

            {/* MATÉRIAS */}
            {viewLevel === "materias" && (
                <div
                    className={
                        viewMode === "grid"
                            ? "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6"
                            : "space-y-3"
                    }
                >
                    {materias.map(([m, items]: any) => (
                        <Card
                            key={m}
                            title={m}
                            count={items.length}
                            onClick={() => {
                                setMateriaSel(m);
                                setViewLevel("assuntos");
                            }}
                        />
                    ))}
                </div>
            )}

            {/* ASSUNTOS */}
            {viewLevel === "assuntos" && (
                <>
                    <button
                        className="mb-6 text-sm"
                        onClick={() => {
                            setViewLevel("materias");
                            setMateriaSel(null);
                        }}
                    >
                        ← Matérias
                    </button>

                    <div
                        className={
                            viewMode === "grid"
                                ? "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6"
                                : "space-y-3"
                        }
                    >
                        {assuntos.map(([a, items]: any) => (
                            <Card
                                key={a}
                                title={a}
                                count={items.length}
                                onClick={() => {
                                    setAssuntoSel(a);
                                    setViewLevel("revisoes");
                                }}
                            />
                        ))}
                    </div>
                </>
            )}

            {/* LISTA REVISOES */}
            {viewLevel === "revisoes" && !viewing && (
                <>
                    <button
                        className="mb-6 text-sm"
                        onClick={() => {
                            setViewLevel("assuntos");
                            setAssuntoSel(null);
                        }}
                    >
                        ← Assuntos
                    </button>

                    <div className="space-y-3">
                        {revisoesFiltradas.map((r) => (
                            <div
                                key={r.id}
                                className="rounded border border-border p-4 bg-card flex justify-between"
                            >
                                <div>
                                    <div className="font-medium">{r.resumo?.titulo}</div>

                                    <div className="text-xs text-muted-foreground">
                                        Etapa {r.etapa} •{" "}
                                        {new Date(r.scheduled_for).toLocaleDateString("pt-BR")}
                                    </div>

                                    <p className="text-sm mt-1">
                                        {plainSnippet(r.resumo?.conteudo || "")}
                                    </p>
                                </div>

                                <button
                                    onClick={() => setViewing(r)}
                                    className="bg-primary text-white px-3 py-2 rounded"
                                >
                                    Revisar
                                </button>
                            </div>
                        ))}
                    </div>
                </>
            )}

            {/* VISUALIZAÇÃO */}
            {viewing && (
                <div className="border rounded-xl bg-card">
                    <div className="flex justify-between border-b p-4">
                        <h2 className="font-semibold text-lg">
                            {viewing.resumo?.titulo}
                        </h2>

                        <div className="flex gap-2">
                            <button
                                onClick={() => setViewing(null)}
                                className="px-3 py-2 bg-muted rounded"
                            >
                                Voltar
                            </button>

                            <button
                                onClick={() => concluir(viewing.id)}
                                className="px-3 py-2 bg-green-600 text-white rounded"
                            >
                                Concluir
                            </button>
                        </div>
                    </div>

                    <div
                        className="prose max-w-none p-4"
                        dangerouslySetInnerHTML={{
                            __html: renderWithMarks(
                                viewing.resumo?.conteudo || ""
                            ),
                        }}
                    />
                </div>
            )}
        </div>
    );
}