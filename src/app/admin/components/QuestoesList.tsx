"use client";
import React, { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

export default function QuestoesList() {
    const [questoes, setQuestoes] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        async function fetchQuestoes() {
            setLoading(true);
            const { data } = await supabase
                .from("questoes")
                .select("*")
                .order("created_at", { ascending: false })
                .limit(20);
            setQuestoes(data || []);
            setLoading(false);
        }
        fetchQuestoes();
    }, []);

    if (loading) return <div>Carregando...</div>;

    return (
        <div className="bg-white rounded-2xl p-6 shadow">
            <h2 className="text-xl font-bold mb-4">Questões Recentes</h2>
            <div className="overflow-x-auto">
                <table className="w-full text-sm">
                    <thead>
                        <tr className="text-left text-[#5d5f6d]">
                            <th className="p-2">Disciplina</th>
                            <th className="p-2">Assunto</th>
                            <th className="p-2">Cargo</th>
                            <th className="p-2">Banca</th>
                            <th className="p-2">Enunciado</th>
                            <th className="p-2">Correta</th>
                        </tr>
                    </thead>
                    <tbody>
                        {questoes.map((q) => (
                            <tr
                                key={q.id}
                                className="border-b last:border-none hover:bg-[#f3f6fa]"
                            >
                                <td className="p-2">{q.disciplina}</td>
                                <td className="p-2">{q.assunto}</td>
                                <td className="p-2">{q.cargo}</td>
                                <td className="p-2">{q.banca}</td>
                                <td className="p-2">{q.enunciado?.slice(0, 40)}...</td>
                                <td className="p-2 font-bold">{q.correta}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
