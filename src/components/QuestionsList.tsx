"use client";

import React, { useEffect, useState } from "react";
import { QuestionCard } from "./QuestionCard";
import { Pagination } from "./Pagination";
import { supabase } from "../lib/supabaseClient";
import { rotuloBanca, rotuloModalidade } from "@/lib/rotulos";

/* ========== Tipos ========== */
type Filters = {
    origem?: string;
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
    user_id?: string | null;
    edital_id?: string | null;
    materia_id?: string | null;
    assunto_id?: string | null;
    instituicao: string;
    cargo: string;
    disciplina: string;
    assunto: string;
    modalidade: string;
    banca: string;
    ano?: number | null;
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
    const [total, setTotal] = useState(0);
    const [erroLista, setErroLista] = useState("");

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

    // Volta para a primeira página quando os filtros mudam.
    useEffect(() => {
        setPage(1);
    }, [filters]);

    /*
     * Busca SÓ a página atual no banco (minhas questões + banco de questões).
     * Com dezenas de milhares de questões no acervo, não dá para baixar tudo
     * e paginar no navegador. O RLS decide o que cada aluno pode ver;
     * "Excluir respondidas" é resolvido no banco com question_attempts.
     */
    useEffect(() => {
        if (!userId) return;
        let cancelled = false;

        (async () => {
            setLoading(true);
            setErroLista("");

            try {
                const ou = (v?: string) => (v && v.trim() ? v : null);
                const { data, error } = await supabase.rpc("listar_questoes", {
                    p_origem: ou(filters.origem),
                    p_instituicao: ou(filters.instituicao),
                    p_cargo: ou(filters.cargo),
                    p_disciplina: ou(filters.disciplina),
                    p_assunto: ou(filters.assunto),
                    p_modalidade: ou(filters.modalidade),
                    p_banca: ou(filters.banca),
                    p_excluir_respondidas: !!filters.excluirRespondidas,
                    p_limite: perPage,
                    p_offset: (page - 1) * perPage,
                });

                if (error) throw error;

                const resultado = (data ?? {}) as { total?: number; itens?: Questao[] };

                if (!cancelled) {
                    setQuestoes(resultado.itens ?? []);
                    setTotal(resultado.total ?? 0);
                }
            } catch (e: any) {
                if (!cancelled) {
                    setQuestoes([]);
                    setTotal(0);
                    setErroLista(
                        "Não foi possível carregar as questões" +
                        (e?.message ? `: ${e.message}` : ".")
                    );
                }
            } finally {
                if (!cancelled) {
                    setLoading(false);
                }
            }
        })();

        return () => {
            cancelled = true;
        };
    }, [filters, userId, page, perPage]);

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

    // A paginação é feita no banco: "questoes" já é a página atual.
    const paginated = questoes;

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


    /**
     * Garante que a questão esteja em um caderno sem usar comportamento de toggle.
     * É usado quando uma resposta errada precisa entrar automaticamente
     * no Caderno de Erros.
     */
    async function garantirNoCaderno(
        questaoId: string,
        tipo: CadernoTipo
    ) {
        if (!userId) {
            setCadernoError("Faça login para adicionar aos cadernos.");
            return;
        }

        const key = `${questaoId}-${tipo}`;

        if (cadernosByQuestao?.[questaoId]?.[tipo]) {
            return;
        }

        setCadernoBusy((m) => ({ ...m, [key]: true }));
        setCadernoError("");

        try {
            const { error } = await supabase
                .from("caderno_itens")
                .upsert(
                    {
                        user_id: userId,
                        questao_id: questaoId,
                        tipo,
                    },
                    {
                        onConflict: "user_id,questao_id,tipo",
                    }
                );

            if (error) throw error;

            setCadernosByQuestao((m) => ({
                ...m,
                [questaoId]: {
                    ...(m[questaoId] ?? {
                        ERROS: false,
                        ACERTOS: false,
                    }),
                    [tipo]: true,
                },
            }));
        } catch (e: any) {
            setCadernoError(
                e?.message ||
                "Erro ao adicionar automaticamente ao caderno."
            );
        } finally {
            setCadernoBusy((m) => ({ ...m, [key]: false }));
        }
    }

    return (
        <div className="mt-2">
            <div className="bg-card rounded-xl p-8 shadow-xl mb-8 transition-colors border border-border">
                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 border-b border-border pb-3 mb-4">
                    <span className="text-sm font-medium text-muted-foreground tracking-tight">
                        Questões encontradas
                    </span>
                    <div className="flex items-center gap-4">
                        <span className="text-muted-foreground text-xs">
                            Mostrando {paginated.length} de {total.toLocaleString("pt-BR")} questões
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

                {erroLista && (
                    <div className="text-red-600 dark:text-red-400 text-sm mb-4">{erroLista}</div>
                )}

                {cadernoError && (
                    <div className="text-red-600 dark:text-red-400 text-sm mb-4">{cadernoError}</div>
                )}

                <div className="flex flex-col gap-7">
                    {loading ? (
                        <div className="text-muted-foreground py-8 text-center">
                            Carregando questões...
                        </div>
                    ) : paginated.length === 0 ? (
                        <div className="min-h-[120px] flex items-center justify-center text-muted-foreground">
                            Nenhuma questão encontrada.
                        </div>
                    ) : (
                        paginated.map((q, indice) => {
                            const status = cadernosByQuestao[q.id] ?? { ERROS: false, ACERTOS: false };

                            return (
                                <QuestionCard
                                    key={q.id}
                                    id={q.id}
                                    numero={(page - 1) * perPage + indice + 1}
                                    total={total}
                                    materiaId={q.materia_id ?? null}
                                    assuntoId={q.assunto_id ?? null}
                                    materiaNome={q.disciplina}
                                    assuntoNome={q.assunto}
                                    tags={[
                                        q.instituicao,
                                        q.cargo,
                                        q.disciplina,
                                        q.assunto,
                                        rotuloModalidade(q.modalidade),
                                        rotuloBanca(q.banca),
                                        q.ano ? String(q.ano) : "",
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
                                    onGarantirCadernoErros={() =>
                                        garantirNoCaderno(q.id, "ERROS")
                                    }
                                    cadernoLoading={{
                                        ERROS: !!cadernoBusy[`${q.id}-ERROS`],
                                        ACERTOS: !!cadernoBusy[`${q.id}-ACERTOS`],
                                    }}
                                />
                            );
                        })
                    )}
                </div>

                <Pagination total={total} perPage={perPage} page={page} setPage={setPage} />
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