"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import Pomodoro from "@/components/Pomodoro";

type Resumo = {
    id: string;
    titulo: string;
    assunto_id: string | null;
};

type Rev = {
    id: string;
    etapa: number;
    scheduled_for: string; // date (YYYY-MM-DD)
    resumo_id: string;
    resumo: Resumo | null; // <- objeto único para usar direto no render
};

// Como o Supabase pode retornar a relação como array, tipamos a linha "crua"
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
                .select("id,etapa,scheduled_for,resumo_id,resumos(id,titulo,assunto_id)")
                .eq("user_id", uid)
                .is("done_at", null)
                .lte("scheduled_for", today)
                .order("scheduled_for", { ascending: true });

            if (!error && data) {
                // Normaliza: transforma resumos[] -> resumo (primeiro item)
                const normalized: Rev[] = (data as RevRow[]).map((r) => ({
                    id: r.id,
                    etapa: r.etapa,
                    scheduled_for: r.scheduled_for,
                    resumo_id: r.resumo_id,
                    resumo: r.resumos && r.resumos[0] ? r.resumos[0] : null,
                }));
                setRows(normalized);
            }
            setLoading(false);
        })();
    }, [today]);

    const concluir = async (id: string) => {
        await supabase.from("revisoes").update({ done_at: new Date().toISOString() }).eq("id", id);
        // Trigger no banco já incrementa visto_count; aqui só removemos da lista
        setRows((rs) => rs.filter((r) => r.id !== id));
    };

    return (
        <div className="mx-auto max-w-5xl p-4">
            <div className="mb-4 grid grid-cols-1 gap-4 md:grid-cols-3">
                {/* Coluna principal */}
                <div className="md:col-span-2">
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

                    <div className="mt-3 space-y-2">
                        {loading && <div className="rounded border p-3">Carregando…</div>}
                        {!loading && rows.length === 0 && (
                            <div className="rounded border p-3 text-gray-500">Sem revisões pendentes 🎉</div>
                        )}

                        {rows.map((r) => (
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
                                <button
                                    onClick={() => concluir(r.id)}
                                    className="self-start rounded bg-green-600 px-3 py-2 text-white sm:self-auto"
                                >
                                    Concluir
                                </button>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Coluna lateral */}
                <div className="md:col-span-1">
                    <h2 className="mb-2 text-lg font-semibold">Pomodoro</h2>
                    <Pomodoro study={30} rest={5} />
                </div>
            </div>
        </div>
    );
}
