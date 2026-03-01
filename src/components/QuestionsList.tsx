"use client";

import React, { useEffect, useMemo, useState } from "react";
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
    disciplina: string;
    assunto: string;
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

type CadernoTipo = "ERROS" | "ACERTOS";

type CadernoStatus = {
    ERROS: boolean;
    ACERTOS: boolean;
};

interface QuestionsListProps {
    filters?: Filters;
}

/* ========== Util: chunk para IN() ========== */
function chunkArray<T>(arr: T[], size: number): T[][] {
    const out: T[][] = [];
    for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
    return out;
}

/* ========== Componente ========== */
function QuestionsList({ filters = {} }: QuestionsListProps) {
    const [questoes, setQuestoes] = useState<Questao[]>([]);
    const [page, setPage] = useState(1);
    const [perPage, setPerPage] = useState(3);
    const [loading, setLoading] = useState(true);

    // auth / cadernos
    const [userId, setUserId] = useState<string | null>(null);
    const [cadernosByQuestao, setCadernosByQuestao] = useState<
        Record<string, CadernoStatus>
    >({});
    const [cadernoBusy, setCadernoBusy] = useState<Record<string, boolean>>({}); // key: `${questaoId}-${tipo}`
    const [cadernoError, setCadernoError] = useState<string>("");

    // Descobre usuário logado
    useEffect(() => {
        let mounted = true;
        (async () => {
            const { data, error } = await supabase.auth.getUser();
            if (!mounted) return;
            if (error || !data?.user?.id) {
                setUserId(null);
                return;
            }
            setUserId(data.user.id);
        })();
        return () => {
            mounted = false;
        };
    }, []);

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
    const paginated = useMemo(() => questoes.slice(start, end), [questoes, start, end]);

    // Carrega status de cadernos para as questões visíveis na página (rápido e barato)
    useEffect(() => {
        if (!userId) return;
        if (!paginated.length) return;

        let cancelled = false;

        (async () => {
            setCadernoError("");

            const ids = paginated.map((q) => q.id);

            // Supabase/Postgres tem limite prático de payload; chunk por segurança
            const chunks = chunkArray(ids, 200);

            const found: Record<string, CadernoStatus> = {};

            for (const ch of chunks) {
                const { data, error } = await supabase
                    .from("caderno_itens")
                    .select("questao_id,tipo")
                    .eq("user_id", userId)
                    .in("questao_id", ch);

                if (error) {
                    if (!cancelled) setCadernoError(error.message);
                    continue;
                }

                (data ?? []).forEach((row: any) => {
                    const qid = row.questao_id as string;
                    const tipo = row.tipo as CadernoTipo;
                    if (!found[qid]) found[qid] = { ERROS: false, ACERTOS: false };
                    found[qid][tipo] = true;
                });
            }

            // Garante defaults para quem não veio
            ids.forEach((id) => {
                if (!found[id]) found[id] = { ERROS: false, ACERTOS: false };
            });

            if (!cancelled) setCadernosByQuestao(found);
        })();

        return () => {
            cancelled = true;
        };
    }, [userId, paginated]);

    async function toggleCaderno(questaoId: string, tipo: CadernoTipo) {
        if (!userId) {
            setCadernoError("Faça login para adicionar aos cadernos.");
            return;
        }

        const key = `${questaoId}-${tipo}`;
        setCadernoBusy((m) => ({ ...m, [key]: true }));
        setCadernoError("");

        try {
            const atual = cadernosByQuestao?.[questaoId]?.[tipo] ?? false;

            if (!atual) {
                // Adiciona (upsert) — evita duplicidade pelo UNIQUE(user_id,questao_id,tipo)
                const { error } = await supabase
                    .from("caderno_itens")
                    .upsert(
                        { user_id: userId, questao_id: questaoId, tipo },
                        { onConflict: "user_id,questao_id,tipo" }
                    );

                if (error) throw error;

                setCadernosByQuestao((m) => ({
                    ...m,
                    [questaoId]: { ...(m[questaoId] ?? { ERROS: false, ACERTOS: false }), [tipo]: true },
                }));
            } else {
                // Remove (toggle off)
                const { error } = await supabase
                    .from("caderno_itens")
                    .delete()
                    .eq("user_id", userId)
                    .eq("questao_id", questaoId)
                    .eq("tipo", tipo);

                if (error) throw error;

                setCadernosByQuestao((m) => ({
                    ...m,
                    [questaoId]: { ...(m[questaoId] ?? { ERROS: false, ACERTOS: false }), [tipo]: false },
                }));
            }
        } catch (e: any) {
            setCadernoError(e?.message || "Erro ao atualizar caderno.");
        } finally {
            setCadernoBusy((m) => ({ ...m, [key]: false }));
        }
    }

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

                {cadernoError && (
                    <div className="text-red-600 text-sm mb-4">{cadernoError}</div>
                )}

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
                        paginated.map((q) => {
                            const status = cadernosByQuestao[q.id] ?? { ERROS: false, ACERTOS: false };

                            return (
                                <QuestionCard
                                    key={q.id}
                                    id={q.id}
                                    materiaNome={q.disciplina}
                                    assuntoNome={q.assunto}
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

                                    /* =========================
                                       NOVAS PROPS (CADERNOS)
                                       Você precisa implementar esses botões no QuestionCard.
                                       ========================= */
                                    cadernoStatus={status}
                                    onToggleCadernoErros={() => toggleCaderno(q.id, "ERROS")}
                                    onToggleCadernoAcertos={() => toggleCaderno(q.id, "ACERTOS")}
                                    cadernoLoading={{
                                        ERROS: !!cadernoBusy[`${q.id}-ERROS`],
                                        ACERTOS: !!cadernoBusy[`${q.id}-ACERTOS`],
                                    }}
                                />
                            );
                        })
                    )}
                </div>

                <Pagination total={questoes.length} perPage={perPage} page={page} setPage={setPage} />
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