"use client";
import React, { useEffect, useState } from "react";
import { QuestionCard } from "./QuestionCard";
import { Pagination } from "./Pagination";
import { supabase } from "../lib/supabaseClient"; // ajuste o caminho se necessário

type Questao = {
    id: string;
    instituicao: string;
    cargo: string;
    disciplina: string;
    assunto: string;
    modalidade: string;
    banca: string;
    enunciado: string;
    alternativas: { [key: string]: string }; // JSONB
    correta: string;
    explicacao: string;
    created_at?: string;
};

export function QuestionsList() {
    const [questoes, setQuestoes] = useState<Questao[]>([]);
    const [page, setPage] = useState(1);
    const [perPage, setPerPage] = useState(3);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        setLoading(true);
        supabase
            .from("questoes")
            .select("*")
            .order("created_at", { ascending: false })
            .then(({ data, error }) => {
                if (!error && data) setQuestoes(data as Questao[]);
                setLoading(false);
            });
    }, []);

    // Paginação
    const start = (page - 1) * perPage;
    const end = start + perPage;
    const paginated = questoes.slice(start, end);

    return (
        <div className="mt-2">
            <div className="bg-white rounded-2xl p-8 shadow-xl mb-8 transition-colors border border-[#e3e8f3]">
                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 border-b border-[#e3e8f3] pb-3 mb-4">
                    <span className="text-sm font-medium text-[#8694ad] tracking-tight">
                        Questões encontradas
                    </span>
                    <div className="flex items-center gap-4">
                        <span className="text-[#65749b] text-xs">
                            Mostrando {paginated.length} de {questoes.length} questões
                        </span>
                        <select
                            className="bg-[#f3f5fa] border border-[#e3e8f3] rounded px-3 py-1 text-xs text-[#232939]"
                            value={perPage}
                            onChange={e => { setPerPage(Number(e.target.value)); setPage(1); }}
                        >
                            <option value={3}>3 por página</option>
                            <option value={5}>5 por página</option>
                            <option value={10}>10 por página</option>
                        </select>
                    </div>
                </div>
                <div className="flex flex-col gap-7">
                    {loading ? (
                        <div>Carregando questões...</div>
                    ) : paginated.length === 0 ? (
                        <div className="min-h-[120px] flex items-center justify-center text-[#a8b1c6]">
                            Nenhuma questão encontrada.
                        </div>
                    ) : (
                        paginated.map((q) =>
                            <QuestionCard
                                key={q.id}
                                tags={[
                                    q.instituicao,
                                    q.cargo,
                                    q.disciplina,
                                    q.assunto,
                                    q.modalidade,
                                    q.banca,
                                ]}
                                statement={q.enunciado}
                                options={Object.entries(q.alternativas).map(([letter, text]) => ({
                                    letter,
                                    text,
                                }))}
                                correct={q.correta}
                                explanation={q.explicacao}
                            />
                        )
                    )}
                </div>
                <Pagination
                    total={questoes.length}
                    perPage={perPage}
                    page={page}
                    setPage={setPage}
                />
            </div>
        </div>
    );
}
