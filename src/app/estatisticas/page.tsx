"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import {
    BarChart,
    Bar,
    XAxis,
    YAxis,
    ResponsiveContainer,
    Tooltip,
    CartesianGrid,
} from "recharts";

type ProgressoDia = { dia: string; questoes: number };

export default function EstatisticasPage() {
    const [estat, setEstat] = useState<{
        questoes_respondidas: number;
        taxa_acerto: number;
        tempo_estudado: string;
        progresso_semanal: ProgressoDia[];
    } | null>(null);

    const [loading, setLoading] = useState(true);
    const [erro, setErro] = useState<string | null>(null);

    useEffect(() => {
        async function fetchEstatisticas() {
            setLoading(true);
            setErro(null);

            // 1. Pega o usuário logado
            const { data: { user }, error: errUser } = await supabase.auth.getUser();
            if (errUser || !user) {
                setErro("Não foi possível obter usuário logado.");
                setLoading(false);
                return;
            }

            // 2. Busca estatísticas no banco
            const { data, error } = await supabase
                .from("estatisticas")
                .select("*")
                .eq("user_id", user.id)
                .single();

            if (error || !data) {
                setErro("Não foi possível obter estatísticas.");
                setLoading(false);
                return;
            }

            // 3. Monta dados para os cards e gráfico
            setEstat({
                questoes_respondidas: data.questoes_respondidas,
                taxa_acerto: data.taxa_acerto,
                tempo_estudado: formatarInterval(data.tempo_estudado),
                progresso_semanal: data.progresso_semanal ?? [],
            });
            setLoading(false);
        }

        fetchEstatisticas();
    }, []);

    // Função para formatar o intervalo do Postgres (ex: 02:40:00 para "2h 40m")
    function formatarInterval(intervalo: string | null): string {
        if (!intervalo) return "0h";
        // Formato típico: "HH:MM:SS" ou "DD days HH:MM:SS"
        const match = intervalo.match(/((\d+) days )?(\d+):(\d+):(\d+)/);
        if (!match) return intervalo;
        const dias = match[2] ? Number(match[2]) : 0;
        const horas = Number(match[3]);
        const min = Number(match[4]);
        let partes = [];
        if (dias) partes.push(`${dias}d`);
        if (horas) partes.push(`${horas}h`);
        if (min) partes.push(`${min}m`);
        return partes.join(" ") || "0h";
    }

    // Cards que vão ser exibidos
    const cards = estat
        ? [
            { label: "Questões Respondidas", valor: estat.questoes_respondidas ?? 0 },
            { label: "Taxa de Acerto", valor: estat.taxa_acerto != null ? estat.taxa_acerto + "%" : "--" },
            { label: "Tempo Estudado", valor: estat.tempo_estudado || "0h" },
        ]
        : [];

    return (
        <div className="w-full max-w-6xl mx-auto px-2 sm:px-4 md:px-8 py-8 flex flex-col gap-8">

            {/* Carregando ou erro */}
            {loading && (
                <div className="text-center text-[#7b8bb0] font-semibold">Carregando estatísticas...</div>
            )}
            {erro && (
                <div className="text-center text-red-500 font-semibold">{erro}</div>
            )}

            {!loading && !erro && estat && (
                <>
                    {/* Cards de estatísticas */}
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-5 mb-2">
                        {cards.map((item, i) => (
                            <div
                                key={i}
                                className="rounded-2xl bg-white border border-[#E3E8F3] py-6 px-2 flex flex-col items-center shadow-sm"
                            >
                                <span className="text-xs sm:text-sm text-[#7b8bb0] mb-1 font-medium">
                                    {item.label}
                                </span>
                                <span className="text-xl sm:text-2xl font-bold text-[#232939] tracking-tight">
                                    {item.valor}
                                </span>
                            </div>
                        ))}
                    </div>

                    {/* Progresso semanal */}
                    <div className="bg-white rounded-2xl shadow-lg border border-[#E3E8F3] px-4 sm:px-8 py-6 flex flex-col items-center mb-2">
                        <h2 className="text-base sm:text-lg font-bold mb-4 text-[#232939]">
                            Progresso semanal
                        </h2>
                        <div className="w-full h-48 sm:h-64">
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={estat.progresso_semanal ?? []}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="#E3E8F3" />
                                    <XAxis dataKey="dia" stroke="#aab6cf" fontSize={13} />
                                    <YAxis stroke="#aab6cf" fontSize={13} allowDecimals={false} />
                                    <Tooltip
                                        contentStyle={{
                                            background: "#f8fafc",
                                            border: "1px solid #E3E8F3",
                                            color: "#232939",
                                            fontFamily: "inherit",
                                            borderRadius: 12,
                                        }}
                                        itemStyle={{ color: "#3b82f6" }}
                                        cursor={{ fill: "#e7efff", opacity: 0.16 }}
                                    />
                                    <Bar dataKey="questoes" fill="#6a88d7" radius={[8, 8, 0, 0]} />
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    </div>
                </>
            )}
        </div>
    );
}
