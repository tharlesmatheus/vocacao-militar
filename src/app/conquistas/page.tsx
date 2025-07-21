"use client";

import React, { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { Trophy, Medal, Share2 } from "lucide-react";
import html2canvas from "html2canvas";

// Ícones por título
const iconeMap: Record<string, React.ReactNode> = {
    Soldado: <Medal className="w-10 h-10" style={{ color: "#64748b" }} />,
    Cabo: <Medal className="w-10 h-10" style={{ color: "#22d3ee" }} />,
    // ...adicione outros conforme necessário
};

type Conquista = {
    id: number;
    user_id: string;
    titulo: string;
    descricao: string;
    tipo: string;
    xp: number;
    progresso: number;
    conquistada_em: string | null;
};

const conquistasPadrao = [
    { titulo: "Soldado", descricao: "Respondeu 50 questões", tipo: "Comum", xp: 50, progressoMin: 50 },
    { titulo: "Cabo", descricao: "Respondeu 300 questões", tipo: "Comum", xp: 80, progressoMin: 300 },
    // ...adicione as demais
];

export default function ConquistasPage() {
    const [conquistas, setConquistas] = useState<Conquista[]>([]);
    const [estat, setEstat] = useState<{ questoes_respondidas: number } | null>(null);
    const [userName, setUserName] = useState("");
    const [copied, setCopied] = useState<number | null>(null);
    const cardRefs = useRef<{ [key: number]: HTMLDivElement | null }>({});

    useEffect(() => {
        async function getNome() {
            const { data: { user } } = await supabase.auth.getUser();
            setUserName(user?.user_metadata?.nome || user?.email?.split("@")[0] || "Aluno");
        }
        getNome();
    }, []);

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

    useEffect(() => {
        async function checkAndCreateConquistas() {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user || !estat) return;
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
            const { data } = await supabase
                .from("conquistas")
                .select("*")
                .eq("user_id", user.id)
                .order("xp", { ascending: true });
            setConquistas(data ?? []);
        }
        if (estat) checkAndCreateConquistas();
    }, [estat]);

    // Patch de cor: remove "oklch" antes do print
    function patchColorsForPrint(ref: HTMLDivElement) {
        Array.from(ref.querySelectorAll('*')).forEach(el => {
            const style = window.getComputedStyle(el);
            if (style.backgroundColor.includes('oklch')) {
                (el as HTMLElement).style.backgroundColor = "#fff";
            }
            if (style.color.includes('oklch')) {
                (el as HTMLElement).style.color = "#232939";
            }
        });
    }

    async function handleCompartilhar(conquista: Conquista) {
        const ref = cardRefs.current[conquista.id];
        if (ref) {
            // Salva estilos antigos
            const oldBg = ref.style.background;
            const oldBorder = ref.style.border;
            const oldBoxShadow = ref.style.boxShadow;

            // Patching core card for print (garante cor sólida)
            ref.style.background = "#fff";
            ref.style.border = "1.5px solid #E3E8F3";
            ref.style.borderRadius = "18px";
            ref.style.boxShadow = "0 1px 10px 0 rgba(75,110,204,0.06)";
            patchColorsForPrint(ref);

            // Esconde botão
            const btn = ref.querySelector(".btn-compartilhar") as HTMLElement;
            if (btn) btn.style.display = "none";

            // Faz print
            const canvas = await html2canvas(ref, {
                backgroundColor: "#fff",
                useCORS: true,
                scale: 2,
            });

            // Restaura estilos
            ref.style.background = oldBg;
            ref.style.border = oldBorder;
            ref.style.boxShadow = oldBoxShadow;
            if (btn) btn.style.display = "";

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
                } catch (err) { /* usuário cancelou */ }
            } else {
                // fallback: download da imagem + cópia de texto
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
                        className="relative flex flex-col items-center px-7 py-7 bg-white border border-[#E3E8F3] rounded-2xl shadow-sm transition-all"
                        style={{ minWidth: 310, maxWidth: 340, margin: "0 auto" }}
                    >
                        {c.progresso === 100 && (
                            <span className="absolute top-3 right-3 bg-green-500 text-white rounded-full p-1 shadow text-xs">
                                <Trophy className="w-5 h-5" />
                            </span>
                        )}
                        <div className="mb-4">{iconeMap[c.titulo] ?? <Medal className="w-10 h-10" style={{ color: "#64748b" }} />}</div>
                        <div className="font-bold text-lg mb-0 text-[#232939] text-center">{c.titulo}</div>
                        <div className="text-[15px] font-semibold text-[#5d5f6d] mb-1 text-center">{userName}</div>
                        <div className="text-[#a3adc7] text-base text-center mb-2">{c.descricao}</div>
                        <div className="flex gap-2 mb-2 flex-wrap justify-center">
                            <span className="rounded-full px-3 py-1 text-xs font-semibold bg-gray-100 text-[#7582a2] border border-[#e3e8f3]">
                                {c.tipo}
                            </span>
                            <span className="rounded-full bg-[#f3f5fa] text-[#232939] px-3 py-1 text-xs font-semibold border border-[#e3e8f3]">
                                +{c.xp} XP
                            </span>
                        </div>
                        {c.progresso === 100 && (
                            <div className="text-xs text-[#a3adc7] mb-0 text-center">
                                Conquistada em {c.conquistada_em ? new Date(c.conquistada_em).toLocaleDateString("pt-BR") : ""}
                            </div>
                        )}

                        {/* Botão compartilhar, não aparece no print */}
                        <button
                            className="btn-compartilhar w-full border border-blue-400 bg-[#f9fbff] hover:bg-blue-50 text-blue-700 rounded-lg py-2 mt-6 flex items-center justify-center gap-2 font-semibold text-base transition"
                            style={{
                                boxShadow: "0 0 0 1.5px #bfd8ff, 0 1px 10px 0 rgba(75,110,204,0.05)"
                            }}
                            onClick={() => handleCompartilhar(c)}
                        >
                            <Share2 className="w-5 h-5" />
                            Compartilhar
                        </button>
                        {copied === c.id && (
                            <span className="text-green-600 text-xs mt-2">Imagem copiada/baixada!</span>
                        )}
                    </div>
                ))}
            </div>
        </div>
    );
}
