"use client";

import { useState } from "react";
import { Trophy, Star, Flame, Zap, Target, Crown, Share2 } from "lucide-react";

const conquistasMock = [
    {
        id: 1,
        titulo: "Recruta",
        descricao: "Cadastro realizado na plataforma",
        tipo: "Comum",
        xp: 10,
        icone: <Star className="w-10 h-10 text-[#22d3ee] opacity-70" />,
        progresso: 100,
        conquistadaEm: "01/07/2024",
        compartilhavel: true,
    },
    {
        id: 2,
        titulo: "Soldado",
        descricao: "Primeira questão respondida corretamente",
        tipo: "Comum",
        xp: 50,
        icone: <Trophy className="w-10 h-10 text-[#fbbf24] opacity-70" />,
        progresso: 100,
        conquistadaEm: "02/07/2024",
        compartilhavel: true,
    },
    {
        id: 3,
        titulo: "Soldado Especialista",
        descricao: "50 questões corretas em qualquer matéria",
        tipo: "Raro",
        xp: 100,
        icone: <Target className="w-10 h-10 text-[#8b5cf6] opacity-70" />,
        progresso: 80,
        conquistadaEm: null,
        compartilhavel: false,
    },
    {
        id: 4,
        titulo: "Foco Total",
        descricao: "Respondeu questões por 7 dias seguidos",
        tipo: "Épico",
        xp: 300,
        icone: <Flame className="w-10 h-10 text-[#ef4444] opacity-70" />,
        progresso: 100,
        conquistadaEm: "14/07/2024",
        compartilhavel: true,
    },
    {
        id: 5,
        titulo: "Speedster",
        descricao: "50 questões em menos de 1 hora",
        tipo: "Raro",
        xp: 200,
        icone: <Zap className="w-10 h-10 text-[#f59e42] opacity-70" />,
        progresso: 60,
        conquistadaEm: null,
        compartilhavel: false,
    },
    {
        id: 6,
        titulo: "General",
        descricao: "100% de acerto em simulado de 30+ questões",
        tipo: "Lendário",
        xp: 3000,
        icone: <Crown className="w-10 h-10 text-[#eab308] opacity-70" />,
        progresso: 0,
        conquistadaEm: null,
        compartilhavel: false,
    },
];

function tipoClasse(tipo: string) {
    if (tipo === "Lendário") return "bg-yellow-400/90 text-white";
    if (tipo === "Épico") return "bg-pink-500/90 text-white";
    if (tipo === "Raro") return "bg-blue-500/90 text-white";
    return "bg-gray-300/90 text-[#425179]";
}

export default function ConquistasPage() {
    const [copied, setCopied] = useState<number | null>(null);

    function handleCompartilhar(conquista: any) {
        const texto = `Conquistei a medalha "${conquista.titulo}" na Vocação Militar! 🚀 #vocacaomilitar`;
        navigator.clipboard.writeText(texto);
        setCopied(conquista.id);
        setTimeout(() => setCopied(null), 1800);
    }

    return (
        <div className="w-full max-w-7xl mx-auto px-2 sm:px-4 md:px-8 py-8">
            
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                {conquistasMock.map((c) => (
                    <div
                        key={c.id}
                        className={`relative bg-white border border-[#E3E8F3] rounded-2xl shadow-sm flex flex-col items-center px-6 py-8 hover:shadow-md hover:border-[#b7c6de] transition-all`}
                    >
                        {/* Medalha verde de conquistado */}
                        {c.progresso === 100 && (
                            <span className="absolute top-3 right-3 bg-green-500 text-white rounded-full p-1 shadow text-xs">
                                <Trophy className="w-5 h-5" />
                            </span>
                        )}
                        <div className="mb-3">{c.icone}</div>
                        <div className="font-semibold text-lg mb-1 text-[#232939] text-center">{c.titulo}</div>
                        <div className="text-[#7b8bb0] text-sm text-center mb-3">{c.descricao}</div>
                        <div className="flex gap-2 mb-2 flex-wrap justify-center">
                            <span className={`rounded-full px-3 py-1 text-xs font-semibold ${tipoClasse(c.tipo)}`}>
                                {c.tipo}
                            </span>
                            <span className="rounded-full bg-[#f3f5fa] text-[#232939] px-3 py-1 text-xs font-semibold">
                                +{c.xp} XP
                            </span>
                        </div>
                        {/* Barra de progresso */}
                        {c.progresso < 100 && (
                            <>
                                <div className="w-full text-xs text-[#a1aac7] mb-1 text-center">Progresso</div>
                                <div className="w-full h-2 bg-[#f2f3f7] rounded mb-2 overflow-hidden">
                                    <div
                                        className="h-2 rounded bg-blue-500 transition-all"
                                        style={{ width: `${c.progresso}%` }}
                                    ></div>
                                </div>
                                <button
                                    disabled
                                    className="w-full text-[#b1bad3] bg-[#f6f8fb] border border-[#E3E8F3] rounded-lg py-2 mt-2 flex items-center justify-center gap-2 font-semibold text-sm cursor-default"
                                >
                                    <svg width="18" height="18" fill="none" viewBox="0 0 24 24">
                                        <circle cx="12" cy="12" r="10" stroke="#a0aec0" strokeWidth="2" />
                                    </svg>
                                    Em Progresso
                                </button>
                            </>
                        )}
                        {c.progresso === 100 && (
                            <>
                                <div className="text-xs text-[#97a6c2] mb-1 text-center">
                                    Conquistada em {c.conquistadaEm}
                                </div>
                                {c.compartilhavel && (
                                    <button
                                        className="w-full border border-blue-500 bg-[#eaf1fe] hover:bg-blue-50 text-blue-700 rounded-lg py-2 mt-2 flex items-center justify-center gap-2 font-semibold text-sm transition"
                                        onClick={() => handleCompartilhar(c)}
                                    >
                                        <Share2 className="w-4 h-4" />
                                        {copied === c.id ? "Copiado!" : "Compartilhar"}
                                    </button>
                                )}
                            </>
                        )}
                    </div>
                ))}
            </div>
        </div>
    );
}
