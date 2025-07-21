"use client";

import React, { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { Trophy, Star, Flame, Zap, Target, Crown, Share2, Medal, X } from "lucide-react";
import html2canvas from "html2canvas";

// ... o resto do seu código de mapping e conquistasPadrao não muda ...

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

const conquistasPadrao = [
    { titulo: "Soldado", descricao: "Respondeu 50 questões", tipo: "Comum", xp: 50, progressoMin: 50 },
    { titulo: "Cabo", descricao: "Respondeu 300 questões", tipo: "Comum", xp: 80, progressoMin: 300 },
    { titulo: "Terceiro Sargento", descricao: "Respondeu 400 questões", tipo: "Raro", xp: 120, progressoMin: 400 },
    { titulo: "Segundo Sargento", descricao: "Respondeu 500 questões", tipo: "Raro", xp: 200, progressoMin: 500 },
    { titulo: "Primeiro Sargento", descricao: "Respondeu 700 questões", tipo: "Raro", xp: 250, progressoMin: 700 },
    { titulo: "Subtenente", descricao: "Respondeu 900 questões", tipo: "Épico", xp: 350, progressoMin: 900 },
    { titulo: "Aspirante", descricao: "Respondeu 1200 questões", tipo: "Épico", xp: 500, progressoMin: 1200 },
    { titulo: "Segundo Tenente", descricao: "Respondeu 1500 questões", tipo: "Épico", xp: 700, progressoMin: 1500 },
    { titulo: "Primeiro Tenente", descricao: "Respondeu 1800 questões", tipo: "Épico", xp: 900, progressoMin: 1800 },
    { titulo: "Capitão", descricao: "Respondeu 2100 questões", tipo: "Lendário", xp: 1200, progressoMin: 2100 },
    { titulo: "Major", descricao: "Respondeu 2500 questões", tipo: "Lendário", xp: 1600, progressoMin: 2500 },
    { titulo: "Tenente Coronel", descricao: "Respondeu 3000 questões", tipo: "Lendário", xp: 2200, progressoMin: 3000 },
    { titulo: "Coronel", descricao: "Respondeu 4000 questões", tipo: "Lendário", xp: 3500, progressoMin: 4000 },
    { titulo: "General", descricao: "Respondeu 5000 questões", tipo: "Lendário", xp: 5000, progressoMin: 5000 },
];

export default function ConquistasPage() {
    const [conquistas, setConquistas] = useState<Conquista[]>([]);
    const [estat, setEstat] = useState<{ questoes_respondidas: number } | null>(null);
    const [copied, setCopied] = useState<number | null>(null);
    const cardRefs = useRef<{ [key: number]: HTMLDivElement | null }>({});
    const [showModal, setShowModal] = useState(false);
    const [modalImage, setModalImage] = useState<string | null>(null);

    // Carrega estatísticas
    useEffect(() => {
        async function fetchEstatisticas() {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) return;
            const { data } = await supabase
                .from("estatisticas")
                .select("*")
                .eq("user_id", user.id)
                .single();
            setEstat(data ? { questoes_respondidas: data.questoes_respondidas } : null);
        }
        fetchEstatisticas();
    }, []);

    // Checa e cria conquistas, depois carrega todas para exibir
    useEffect(() => {
        async function checkAndCreateConquistas() {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user || !estat) return;
            // Busca conquistas já conquistadas
            const { data: conquistasExistentes } = await supabase
                .from("conquistas")
                .select("titulo")
                .eq("user_id", user.id);
            const titulos = (conquistasExistentes ?? []).map(c => c.titulo);

            for (const c of conquistasPadrao) {
                if (estat.questoes_respondidas >= c.progressoMin && !titulos.includes(c.titulo)) {
                    await supabase.from("conquistas").insert([{
                        user_id: user.id,
                        titulo: c.titulo,
                        descricao: c.descricao,
                        tipo: c.tipo,
                        xp: c.xp,
                        progresso: 100,
                        conquistada_em: new Date().toISOString(),
                        compartilhavel: true
                    }]);
                }
            }
            // Agora busca todas as conquistas para exibir
            const { data } = await supabase
                .from("conquistas")
                .select("*")
                .eq("user_id", user.id)
                .order("xp", { ascending: true });
            setConquistas(data ?? []);
        }
        if (estat) checkAndCreateConquistas();
    }, [estat]);

    async function handleCompartilhar(conquista: Conquista) {
        const ref = cardRefs.current[conquista.id];
        if (!ref) return;
        const canvas = await html2canvas(ref);
        const imgData = canvas.toDataURL("image/png");
        const res = await fetch(imgData);
        const blob = await res.blob();
        const file = new File([blob], "conquista.png", { type: "image/png" });

        if (
            navigator.canShare &&
            navigator.canShare({ files: [file] })
        ) {
            try {
                await navigator.share({
                    files: [file],
                    text: `Conheça a melhor plataforma de questões comentadas para carreiras policiais: https://vocacaomilitar.com.br`,
                });
                return;
            } catch (err) {
                // Usuário cancelou, cai para fallback/modal
            }
        }

        // Fallback: mostra modal com imagem e instrução de compartilhar manualmente
        setModalImage(imgData);
        setShowModal(true);
        navigator.clipboard.writeText(
            `Conheça a melhor plataforma de questões comentadas para carreiras policiais: https://vocacaomilitar.com.br`
        );
        setCopied(conquista.id);
        setTimeout(() => setCopied(null), 2000);
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

            {/* Modal Fallback Compartilhamento */}
            {showModal && modalImage && (
                <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center px-4">
                    <div className="bg-white rounded-xl p-7 max-w-md w-full shadow-2xl border border-[#e3e8f3] relative text-center">
                        <button
                            onClick={() => setShowModal(false)}
                            className="absolute top-2 right-2 rounded-full hover:bg-[#f3f5fa] p-1 text-[#425179] font-bold"
                            aria-label="Fechar"
                        >
                            <X size={22} />
                        </button>
                        <h3 className="font-bold text-lg text-[#232939] mb-3">
                            Compartilhamento Manual
                        </h3>
                        <img src={modalImage} alt="Print da conquista" className="w-full rounded-lg mb-4" />
                        <div className="text-sm text-[#232939] mb-2">
                            Baixe a imagem acima e compartilhe no WhatsApp, Instagram, etc. <br />
                            <span className="block mt-2 font-semibold text-[#6a88d7]">Mensagem copiada para você colar:</span>
                            <div className="bg-[#f3f6fa] rounded p-2 text-xs mt-2 break-words">
                                Conheça a melhor plataforma de questões comentadas para carreiras policiais: https://vocacaomilitar.com.br
                            </div>
                        </div>
                        <a
                            href={modalImage}
                            download="conquista.png"
                            className="inline-block bg-[#6a88d7] hover:bg-[#5272b4] text-white rounded-lg px-5 py-2 font-bold text-sm transition mt-2"
                        >
                            Baixar Imagem
                        </a>
                    </div>
                </div>
            )}
        </div>
    );
}
