"use client";

import {
    BarChart,
    Bar,
    XAxis,
    YAxis,
    ResponsiveContainer,
    Tooltip,
    CartesianGrid,
} from "recharts";

// MOCKS – Substitua depois pelos dados reais do backend
const estatisticas = [
    { label: "Questões Respondidas", valor: 120 },
    { label: "Taxa de Acerto", valor: "78%" },
    { label: "Tempo Estudado", valor: "16h 45m" },
];
const progressoSemanal = [
    { dia: "Seg", questoes: 10 },
    { dia: "Ter", questoes: 8 },
    { dia: "Qua", questoes: 15 },
    { dia: "Qui", questoes: 12 },
    { dia: "Sex", questoes: 9 },
    { dia: "Sáb", questoes: 5 },
    { dia: "Dom", questoes: 7 },
];

export default function EstatisticasPage() {
    return (
        <div className="w-full max-w-6xl mx-auto px-2 sm:px-4 md:px-8 py-8 flex flex-col gap-8">
                       
            {/* Cards de estatísticas */}
            <div className="grid grid-cols-2 md:grid-cols-3 gap-5 mb-2">
                {estatisticas.map((item, i) => (
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
                        <BarChart data={progressoSemanal}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#E3E8F3" />
                            <XAxis dataKey="dia" stroke="#aab6cf" fontSize={13} />
                            <YAxis stroke="#aab6cf" fontSize={13} />
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
        </div>
    );
}
