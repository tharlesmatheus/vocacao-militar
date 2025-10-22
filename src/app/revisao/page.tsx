"use client";

import { useEffect, useState } from "react";
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

type Resumo = {
    id: string;
    titulo: string;
    assunto_id: string | null;
    conteudo?: string;
};

type Rev = {
    id: string;
    etapa: number;
    scheduled_for: string; // YYYY-MM-DD
    resumo_id: string;
    resumo: Resumo | null;
};

// Linha "crua" (Supabase pode trazer relação como array)
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

    // Carrega revisões pendentes
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
                .select("id,etapa,scheduled_for,resumo_id,resumos(id,titulo,assunto_id,conteudo)")
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

    // Concluir revisão (só aparece dentro da visualização)
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

                {/* Lista de flashcards (quando não está visualizando um item específico) */}
                {!viewing &&
                    rows.map((r) => (
                        <div
                            key={r.id}
                            className="flex flex-col justify-between gap-2 rounded border p-3 sm:flex-row sm:items-center"
                        >
                            <div>
                                <div className="font-medium">{r.resumo?.titulo || "Resumo"}</div>
                                <div className="text-sm text-gray-500">
                                    Etapa {r.etapa} • Agendado para{" "}
                                    {new Date(r.scheduled_for).toLocaleDateString("pt-BR")}
                                </div>
                            </div>
                            <div className="flex gap-2">
                                <button
                                    onClick={() => setViewing(r)}
                                    className="self-start rounded bg-indigo-600 px-3 py-2 text-white sm:self-auto"
                                >
                                    Ver
                                </button>
                            </div>
                        </div>
                    ))}

                {/* Visualização do resumo (conteúdo + concluir) */}
                {viewing && (
                    <div className="rounded border">
                        <div className="flex items-center justify-between border-b p-3">
                            <div>
                                <div className="text-sm text-gray-500">
                                    Etapa {viewing.etapa} • {new Date(viewing.scheduled_for).toLocaleDateString("pt-BR")}
                                </div>
                                <h2 className="text-lg font-semibold">{viewing.resumo?.titulo || "Resumo"}</h2>
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
