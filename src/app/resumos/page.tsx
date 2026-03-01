"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { BookOpen } from "lucide-react";

/* ================= TYPES ================= */

type Resumo = {
    id: string;
    titulo: string;
    created_at: string;
    materia_id: string | null;
    assunto_id: string | null;
};

type ViewLevel = "disciplinas" | "assuntos" | "resumos";

/* ================= PAGE ================= */

export default function ResumosPage() {
    const [resumos, setResumos] = useState<Resumo[]>([]);
    const [materiaMap, setMateriaMap] = useState<Record<string, string>>({});
    const [assuntoMap, setAssuntoMap] = useState<Record<string, string>>({});

    const [viewLevel, setViewLevel] =
        useState<ViewLevel>("disciplinas");

    const [disciplinaSel, setDisciplinaSel] =
        useState<string | null>(null);

    const [assuntoSel, setAssuntoSel] =
        useState<string | null>(null);

    /* ================= LOAD DATA ================= */

    useEffect(() => {
        (async () => {
            const { data: u } = await supabase.auth.getUser();
            const uid = u?.user?.id;
            if (!uid) return;

            const [res, mats, ass] = await Promise.all([
                supabase
                    .from("resumos")
                    .select("id,titulo,created_at,materia_id,assunto_id")
                    .eq("user_id", uid),

                supabase.from("materias").select("id,nome"),

                supabase.from("assuntos").select("id,nome"),
            ]);

            setResumos((res.data ?? []) as Resumo[]);

            const m: any = {};
            mats.data?.forEach((x: any) => (m[x.id] = x.nome));
            setMateriaMap(m);

            const a: any = {};
            ass.data?.forEach((x: any) => (a[x.id] = x.nome));
            setAssuntoMap(a);
        })();
    }, []);

    const nameMateria = (id?: string | null) =>
        (id && materiaMap[id]) || "Sem matéria";

    const nameAssunto = (id?: string | null) =>
        (id && assuntoMap[id]) || "Sem assunto";

    /* ================= AGRUPAMENTOS ================= */

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
            .filter(r => nameMateria(r.materia_id) === disciplinaSel)
            .reduce((acc: any, r) => {
                const key = nameAssunto(r.assunto_id);
                if (!acc[key]) acc[key] = [];
                acc[key].push(r);
                return acc;
            }, {})
    );

    const resumosFiltrados = resumos.filter(
        r =>
            nameMateria(r.materia_id) === disciplinaSel &&
            nameAssunto(r.assunto_id) === assuntoSel
    );

    /* ================= CARD PADRÃO CADERNOS ================= */

    const Card = ({
        title,
        count,
        onClick,
    }: {
        title: string;
        count: number;
        onClick: () => void;
    }) => (
        <button
            onClick={onClick}
            className="
        bg-card
        border border-border
        rounded-2xl
        p-6
        flex flex-col items-center
        text-center
        hover:shadow-md
        transition
      "
        >
            {/* ICON */}
            <div className="bg-red-500 text-white p-4 rounded-xl mb-4">
                <BookOpen size={26} />
            </div>

            {/* TITLE */}
            <h3 className="font-semibold text-lg">{title}</h3>

            {/* COUNT */}
            <p className="text-sm text-muted-foreground mt-2">
                {count} resumos
            </p>
        </button>
    );

    /* ================= UI ================= */

    return (
        <div className="mx-auto max-w-6xl p-6">

            {/* HEADER */}
            <div className="flex justify-between items-center mb-8">
                <h1 className="text-2xl font-semibold">
                    Meus Resumos
                </h1>

                <button className="bg-primary text-white px-5 py-2 rounded-xl">
                    + Novo resumo
                </button>
            </div>

            {/* ================= DISCIPLINAS ================= */}
            {viewLevel === "disciplinas" && (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                    {disciplinas.map(([disciplina, items]: any) => (
                        <Card
                            key={disciplina}
                            title={disciplina}
                            count={items.length}
                            onClick={() => {
                                setDisciplinaSel(disciplina);
                                setViewLevel("assuntos");
                            }}
                        />
                    ))}
                </div>
            )}

            {/* ================= ASSUNTOS ================= */}
            {viewLevel === "assuntos" && (
                <>
                    <button
                        className="mb-6 text-sm"
                        onClick={() => {
                            setViewLevel("disciplinas");
                            setDisciplinaSel(null);
                        }}
                    >
                        ← Voltar
                    </button>

                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                        {assuntos.map(([assunto, items]: any) => (
                            <Card
                                key={assunto}
                                title={assunto}
                                count={items.length}
                                onClick={() => {
                                    setAssuntoSel(assunto);
                                    setViewLevel("resumos");
                                }}
                            />
                        ))}
                    </div>
                </>
            )}

            {/* ================= RESUMOS ================= */}
            {viewLevel === "resumos" && (
                <>
                    <button
                        className="mb-6 text-sm"
                        onClick={() => {
                            setViewLevel("assuntos");
                            setAssuntoSel(null);
                        }}
                    >
                        ← Voltar
                    </button>

                    <div className="space-y-3">
                        {resumosFiltrados.map(r => (
                            <div
                                key={r.id}
                                className="bg-card border border-border rounded-xl p-4 flex justify-between"
                            >
                                <div>
                                    <p className="font-medium">{r.titulo}</p>
                                    <p className="text-xs text-muted-foreground">
                                        {new Date(r.created_at).toLocaleDateString("pt-BR")}
                                    </p>
                                </div>

                                <button className="bg-primary text-white px-3 py-1 rounded">
                                    Ver
                                </button>
                            </div>
                        ))}
                    </div>
                </>
            )}
        </div>
    );
}