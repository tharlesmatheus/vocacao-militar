"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

/** Util: converte ==texto== para <mark> e faz escape básico */
function renderWithMarks(text: string) {
    return text
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/==(.+?)==/g, "<mark>$1</mark>")
        .replace(/\n/g, "<br/>");
}
/** Gera um snippet simples (sem HTML) para preview do card */
function plainSnippet(text: string, size = 140) {
    const noMarks = text.replace(/==(.+?)==/g, "$1");
    const trimmed = noMarks.replace(/\s+/g, " ").trim();
    return trimmed.length > size ? trimmed.slice(0, size) + "…" : trimmed;
}

type Resumo = {
    id: string;
    titulo: string;
    conteudo?: string;
    assunto_id: string | null;
    materia_id?: string | null;
    // relações (Supabase retorna arrays)
    materias?: { id: string; nome: string }[] | null;
    assuntos?: { id: string; nome: string }[] | null;
};

type Rev = {
    id: string;
    etapa: number;
    scheduled_for: string; // YYYY-MM-DD
    resumo_id: string;
    resumo: Resumo | null;
};

// Linha "crua" do Supabase (relação pode vir como array)
type RevRow = {
    id: string;
    etapa: number;
    scheduled_for: string;
    resumo_id: string;
    resumos: Resumo[] | null;
};

export default function RevisaoPage() {
    const [today, setToday] = useState<string>(new Date().toISOString().slice(0, 10));
    const [loading, setLoading] = useState(true);
    const [rows, setRows] = useState<Rev[]>([]);
    const [viewing, setViewing] = useState<Rev | null>(null); // item em visualização

    // Carrega revisões pendentes com matéria/assunto do resumo
    useEffect(() => {
        (async () => {
            setLoading(true);
            const uid = (await supabase.auth.getUser()).data.user?.id;
            if (!uid) {
                setRows([]);
                setLoading(false);
                return;
            }

            const { data, error } = await supabase
                .from("revisoes")
                .select(`
          id, etapa, scheduled_for, resumo_id,
          resumos (
            id, titulo, conteudo, assunto_id, materia_id,
            materias ( id, nome ),
            assuntos ( id, nome )
          )
        `)
                .eq("user_id", uid)
                .is("done_at", null)
                .lte("scheduled_for", today)
                .order("scheduled_for", { ascending: true });

            if (!error && data) {
                const normalized: Rev[] = (data as RevRow[]).map((r) => ({
                    id: r.id,
                    etapa: r.etapa,
                    scheduled_for: r.scheduled_for,
                    resumo_id: r.resumo_id,
                    resumo: r.resumos?.[0] ?? null,
                }));
                setRows(normalized);
            } else {
                setRows([]);
            }
            setViewing(null);
            setLoading(false);
        })();
    }, [today]);

    // Concluir revisão (apenas dentro da visualização)
    const concluir = async (id: string) => {
        await supabase.from("revisoes").update({ done_at: new Date().toISOString() }).eq("id", id);
        // Trigger já incrementa visto_count no assunto
        setRows((rs) => rs.filter((r) => r.id !== id));
        setViewing(null);
    };

    return (
        <div className="mx-auto max-w-3xl p-4">
            <h1 className="mb-2 text-2xl font-semibold">Revisões</h1>

            <label className="text-sm text-gray-600">
                Mostrar pendentes até:
                <input
                    type="date"
                    value={today}
                    onChange={(e) => setToday(e.target.value)}
                    className="ml-2 rounded border p-1"
                />
            </label>

            <div className="mt-4 space-y-3">
                {loading && <div className="rounded border p-3">Carregando…</div>}

                {!loading && rows.length === 0 && !viewing && (
                    <div className="rounded border p-3 text-gray-500">Sem revisões pendentes 🎉</div>
                )}

                {/* Fila de flashcards (estilo Anki) */}
                {!viewing &&
                    rows.map((r) => {
                        const mat = r.resumo?.materias?.[0]?.nome || "Matéria";
                        const ass = r.resumo?.assuntos?.[0]?.nome || "Assunto";
                        const snippet = plainSnippet(r.resumo?.conteudo || "");
                        return (
                            <div
                                key={r.id}
                                className="rounded border p-3 hover:bg-gray-50 transition"
                            >
                                <div className="flex items-start justify-between gap-2">
                                    <div className="min-w-0">
                                        <div className="text-xs text-gray-500">
                                            {mat} • {ass}
                                        </div>
                                        <div className="font-medium truncate">{r.resumo?.titulo || "Resumo"}</div>
                                        {snippet && (
                                            <div className="mt-1 text-sm text-gray-700 line-clamp-2">{snippet}</div>
                                        )}
                                        <div className="mt-1 text-xs text-gray-500">
                                            Etapa {r.etapa} • {new Date(r.scheduled_for).toLocaleDateString("pt-BR")}
                                        </div>
                                    </div>
                                    <button
                                        onClick={() => setViewing(r)}
                                        className="shrink-0 rounded bg-indigo-600 px-3 py-2 text-white"
                                    >
                                        Ver
                                    </button>
                                </div>
                            </div>
                        );
                    })}

                {/* Visualização do resumo (conteúdo + concluir) */}
                {viewing && (
                    <div className="rounded border">
                        <div className="flex items-center justify-between border-b p-3">
                            <div className="min-w-0">
                                <div className="text-sm text-gray-500">
                                    {viewing.resumo?.materias?.[0]?.nome || "Matéria"} •{" "}
                                    {viewing.resumo?.assuntos?.[0]?.nome || "Assunto"}
                                </div>
                                <div className="text-xs text-gray-500">
                                    Etapa {viewing.etapa} •{" "}
                                    {new Date(viewing.scheduled_for).toLocaleDateString("pt-BR")}
                                </div>
                                <h2 className="mt-1 truncate text-lg font-semibold">
                                    {viewing.resumo?.titulo || "Resumo"}
                                </h2>
                            </div>
                            <div className="flex gap-2">
                                <button
                                    onClick={() => setViewing(null)}
                                    className="rounded bg-gray-200 px-3 py-2"
                                >
                                    Voltar
                                </button>
                                <button
                                    onClick={() => concluir(viewing.id)}
                                    className="rounded bg-green-600 px-3 py-2 text-white"
                                >
                                    Concluir revisão
                                </button>
                            </div>
                        </div>
                        <div
                            className="prose max-w-none p-4"
                            dangerouslySetInnerHTML={{
                                __html: renderWithMarks(viewing.resumo?.conteudo || ""),
                            }}
                        />
                    </div>
                )}
            </div>
        </div>
    );
}
