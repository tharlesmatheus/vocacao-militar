"use client";

import React, { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { Trophy, Medal } from "lucide-react";

// Ícones por título
const iconeMap: Record<string, React.ReactNode> = {
    Soldado: <Medal className="w-10 h-10" style={{ color: "#64748b" }} />,
    Cabo: <Medal className="w-10 h-10" style={{ color: "#22d3ee" }} />,
    "Terceiro Sargento": <Medal className="w-10 h-10" style={{ color: "#a3e635" }} />,
    "Segundo Sargento": <Medal className="w-10 h-10" style={{ color: "#16a34a" }} />,
    "Primeiro Sargento": <Medal className="w-10 h-10" style={{ color: "#ea580c" }} />,
    Subtenente: <Medal className="w-10 h-10" style={{ color: "#fde68a" }} />,
    Aspirante: <Medal className="w-10 h-10" style={{ color: "#fbbf24" }} />,
    "Segundo Tenente": <Medal className="w-10 h-10" style={{ color: "#ef4444" }} />,
    "Primeiro Tenente": <Medal className="w-10 h-10" style={{ color: "#7c3aed" }} />,
    Capitão: <Medal className="w-10 h-10" style={{ color: "#eab308" }} />,
    Major: <Medal className="w-10 h-10" style={{ color: "#818cf8" }} />,
    "Tenente Coronel": <Medal className="w-10 h-10" style={{ color: "#6366f1" }} />,
    Coronel: <Medal className="w-10 h-10" style={{ color: "#f59e42" }} />,
    General: <Medal className="w-10 h-10" style={{ color: "#eab308" }} />,
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
    const [userName, setUserName] = useState("");

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

    return (
        <div className="w-full max-w-7xl mx-auto px-2 sm:px-4 md:px-8 py-8">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                {conquistas.map((c) => (
                    <div
                        key={c.id}
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
                    </div>
                ))}
            </div>
        </div>
    );
}
