"use client";

import React, { useEffect, useState } from "react";
import { QuestionCard } from "./QuestionCard";
import { Pagination } from "./Pagination";
import { supabase } from "../lib/supabaseClient";

/* ========== Tipos ========== */
type Filters = {
    instituicao?: string;
    cargo?: string;
    disciplina?: string;
    assunto?: string;
    modalidade?: string;
    banca?: string;
    excluirRespondidas?: boolean;
};

type Questao = {
    id: string;
    instituicao: string;
    cargo: string;
    disciplina: string; // <- vem como nome da matéria
    assunto: string;    // <- vem como nome do assunto
    modalidade: string;
    banca: string;
    enunciado: string;
    alternativas: { [key: string]: string };
    correta: string;
    explicacao: string;
    comentarios?: any[];
    erros?: any[];
    created_at?: string;
};

interface QuestionsListProps {
    filters?: Filters;
}

/* ========== Componente ========== */
function QuestionsList({ filters = {} }: QuestionsListProps) {
    const [questoes, setQuestoes] = useState<Questao[]>([]);
    const [page, setPage] = useState(1);
    const [perPage, setPerPage] = useState(3);
    const [loading, setLoading] = useState(true);

    // Carrega questões do banco ao montar e quando filtros mudam
    useEffect(() => {
        setLoading(true);

        let query = supabase.from("questoes").select("*");

        // Aplica os filtros (exceto excluirRespondidas)
        Object.entries(filters).forEach(([key, value]) => {
            if (value && key !== "excluirRespondidas") {
                query = query.eq(key, value as string);
            }
        });

        // Filtro especial: excluir já respondidas (ajuste esse campo se necessário)
        if (filters.excluirRespondidas) {
            query = query.eq("respondida", false);
        }

        query
            .order("created_at", { ascending: false })
            .then(({ data, error }) => {
                if (!error && data) setQuestoes(data as Questao[]);
                else setQuestoes([]);
                setLoading(false);
            });

        // Volta para página 1 ao alterar filtros
        setPage(1);
    }, [filters]);

    // Atualiza erros localmente sem refetch
    const handleNotificarErro = (questaoId: string, erroText: string) => {
        setQuestoes((qs) =>
            qs.map((q) =>
                q.id === questaoId
                    ? {
                        ...q,
                        erros: [
                            ...(q.erros ?? []),
                            { mensagem: erroText, data: new Date().toISOString() },
                        ],
                    }
                    : q
            )
        );
    };

    // Paginação
    const start = (page - 1) * perPage;
    const end = start + perPage;
    const paginated = questoes.slice(start, end);

    return (
        <div className="mt-2">
            <div className="bg-card rounded-2xl p-8 shadow-xl mb-8 transition-colors border border-border">
                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 border-b border-border pb-3 mb-4">
                    <span className="text-sm font-medium text-muted-foreground tracking-tight">
                        Questões encontradas
                    </span>
                    <div className="flex items-center gap-4">
                        <span className="text-muted-foreground text-xs">
                            Mostrando {paginated.length} de {questoes.length} questões
                        </span>
                        <select
                            className="bg-muted border border-border rounded px-3 py-1 text-xs text-foreground"
                            value={perPage}
                            onChange={(e) => {
                                setPerPage(Number(e.target.value));
                                setPage(1);
                            }}
                        >
                            <option value={3}>3 por página</option>
                            <option value={5}>5 por página</option>
                            <option value={10}>10 por página</option>
                        </select>
                    </div>
                </div>

                <div className="flex flex-col gap-7">
                    {loading ? (
                        <div className="text-muted-foreground py-8 text-center">
                            Carregando questões...
                        </div>
                    ) : paginated.length === 0 ? (
                        <div className="min-h-[120px] flex items-center justify-center text-[#a8b1c6]">
                            Nenhuma questão encontrada.
                        </div>
                    ) : (
                        paginated.map((q) => (
                            <QuestionCard
                                key={q.id}
                                id={q.id}
                                // >>> ESSAS DUAS PROPS SÃO O PONTO-CHAVE <<<
                                materiaNome={q.disciplina} // disciplina = “matéria” (nome)
                                assuntoNome={q.assunto}    // assunto (nome)
                                // -------------------------------------------------------
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
                                comentarios={q.comentarios}
                                erros={q.erros}
                                onNotificarErro={(erroText) => handleNotificarErro(q.id, erroText)}
                            />
                        ))
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

/* 
   Para evitar futuros erros de import (como o da Vercel),
   exporto como named *e* default.
*/
export { QuestionsList };
export default QuestionsList;
