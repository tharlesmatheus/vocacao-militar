"use client";

import React, { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { Trophy, Star, Flame, Zap, Target, Crown, Share2, Medal } from "lucide-react";
import html2canvas from "html2canvas";

// Mapeamento de ícones por título da conquista
const iconeMap: Record<string, React.ReactNode> = {
    Soldado: <Medal className="w-10 h-10 text-[#64748b] opacity-70" />,
    Cabo: <Medal className="w-10 h-10 text-[#22d3ee] opacity-70" />,
    "Terceiro Sargento": <Star className="w-10 h-10 text-[#a3e635] opacity-70" />,
    "Segundo Sargento": <Star className="w-10 h-10 text-[#16a34a] opacity-70" />,
    "Primeiro Sargento": <Star className="w-10 h-10 text-[#ea580c] opacity-70" />,
    Subtenente: <Trophy className="w-10 h-10 text-[#fde68a] opacity-70" />,
    Aspirante: <Target className="w-10 h-10 text-[#fbbf24] opacity-70" />,
    "Segundo Tenente": <Flame className="w-10 h-10 text-[#ef4444] opacity-70" />,
    "Primeiro Tenente": <Flame className="w-10 h-10 text-[#7c3aed] opacity-70" />,
    Capitão: <Crown className="w-10 h-10 text-[#eab308] opacity-70" />,
    Major: <Crown className="w-10 h-10 text-[#818cf8] opacity-70" />,
    "Tenente Coronel": <Crown className="w-10 h-10 text-[#6366f1] opacity-70" />,
    Coronel: <Crown className="w-10 h-10 text-[#f59e42] opacity-70" />,
    General: <Crown className="w-10 h-10 text-[#eab308] opacity-90" />,
};

function tipoClasse(tipo: string) {
    if (tipo === "Lendário") return "bg-yellow-400/90 text-white";
    if (tipo === "Épico") return "bg-pink-500/90 text-white";
    if (tipo === "Raro") return "bg-blue-500/90 text-white";
    return "bg-gray-300/90 text-[#425179]";
}

type Conquista = {
    id: number;
    user_id: string;
    titulo: string;
    descricao: string;
    tipo: string;
    xp: number;
    icone?: string;
    progresso: number;
    conquistada_em: string | null;
    compartilhavel?: boolean;
};

export default function ConquistasPage() {
    const [conquistas, setConquistas] = useState<Conquista[]>([]);
    const [copied, setCopied] = useState<number | null>(null);
    const cardRefs = useRef<{ [key: number]: HTMLDivElement | null }>({});

    useEffect(() => {
        async function fetchConquistas() {
            // 1. Pega usuário logado
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) return;
            // 2. Busca conquistas desse usuário
            const { data } = await supabase
                .from("conquistas")
                .select("*")
                .eq("user_id", user.id)
                .order("xp", { ascending: true });

            setConquistas(data ?? []);
        }
        fetchConquistas();
    }, []);

    async function handleCompartilhar(conquista: Conquista) {
        const ref = cardRefs.current[conquista.id];
        if (ref) {
            // 1. Tira print do card
            const canvas = await html2canvas(ref);
            const imgData = canvas.toDataURL("image/png");
            // 2. Cria blob (necessário para compartilhar)
            const res = await fetch(imgData);
            const blob = await res.blob();

            // 3. Tenta compartilhar imagem (Web Share API Level 2)
            if (
                navigator.canShare &&
                navigator.canShare({ files: [new File([blob], "conquista.png", { type: "image/png" })] })
            ) {
                try {
                    await navigator.share({
                        files: [new File([blob], "conquista.png", { type: "image/png" })],
                        text: `Conheça a melhor plataforma de questões comentadas para carreiras policiais: https://vocacaomilitar.com.br`,
                    });
                } catch (err) {
                    // usuário cancelou ou erro
                }
            } else {
                // fallback: faz download da imagem + copia texto para compartilhar
                const link = document.createElement("a");
                link.href = imgData;
                link.download = "conquista.png";
                link.click();
                navigator.clipboard.writeText(
                    `Conheça a melhor plataforma de questões comentadas para carreiras policiais: https://vocacaomilitar.com.br`
                );
                setCopied(conquista.id);
                setTimeout(() => setCopied(null), 2000);
            }
        }
    }

    return (
        <div className="w-full max-w-7xl mx-auto px-2 sm:px-4 md:px-8 py-8">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                {conquistas.map((c) => (
                    <div
                        key={c.id}
                        ref={el => { cardRefs.current[c.id] = el; }}
                        className={`relative bg-white border border-[#E3E8F3] rounded-2xl shadow-sm flex flex-col items-center px-6 py-8 hover:shadow-md hover:border-[#b7c6de] transition-all`}
                    >
                        {/* Medalha verde de conquistado */}
                        {c.progresso === 100 && (
                            <span className="absolute top-3 right-3 bg-green-500 text-white rounded-full p-1 shadow text-xs">
                                <Trophy className="w-5 h-5" />
                            </span>
                        )}
                        <div className="mb-3">
                            {iconeMap[c.titulo] ?? <Medal className="w-10 h-10 text-[#64748b] opacity-70" />}
                        </div>
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
                                    Conquistada em {c.conquistada_em ? new Date(c.conquistada_em).toLocaleDateString("pt-BR") : ""}
                                </div>
                                {c.compartilhavel !== false && (
                                    <button
                                        className="w-full border border-blue-500 bg-[#eaf1fe] hover:bg-blue-50 text-blue-700 rounded-lg py-2 mt-2 flex items-center justify-center gap-2 font-semibold text-sm transition"
                                        onClick={() => handleCompartilhar(c)}
                                    >
                                        <Share2 className="w-4 h-4" />
                                        {copied === c.id ? "Copiado/Download!" : "Compartilhar"}
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
