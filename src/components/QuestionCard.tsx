"use client";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "../lib/supabaseClient";

/* ===================== UI ===================== */
function TesouraIcon({ className = "" }: { className?: string }) {
    return (
        <svg
            viewBox="0 0 20 20"
            fill="none"
            width={22}
            height={22}
            className={className + " pointer-events-none"}
        >
            <path
                d="M7.5 8.5L3 3M12.5 8.5L17 3M3 17l7-7 7 7"
                stroke="#9ca3af"
                strokeWidth={2}
                strokeLinecap="round"
            />
            <circle cx={4.5} cy={15.5} r={1.2} fill="#bbb" />
            <circle cx={15.5} cy={15.5} r={1.2} fill="#bbb" />
        </svg>
    );
}

type Option = { letter?: string; text: string };

type CadernoTipo = "ERROS" | "ACERTOS";
export type CadernoStatus = { ERROS: boolean; ACERTOS: boolean };

interface QuestionCardProps {
    id: string;

    // ideal: passe os IDs reais aqui
    materiaId?: string | null;
    assuntoId?: string | null;
    // fallback por nome (se você preferir passar nomes)
    materiaNome?: string | null;
    assuntoNome?: string | null;

    tags: string[];
    statement: string;
    options: Option[];
    correct: string;
    explanation: string;

    comentarios?: any[];
    erros?: any[];
    onNotificarErro?: (erroText: string) => void;
    onNovoComentario?: (comentario: string) => void;

    /* ===================== NOVO: CADERNOS ===================== */
    // Se o pai (QuestionsList) passar, o card só exibe e chama callbacks.
    // Se não passar, o card faz tudo sozinho via Supabase.
    cadernoStatus?: CadernoStatus;
    cadernoLoading?: { ERROS?: boolean; ACERTOS?: boolean };
    onToggleCadernoErros?: () => void | Promise<void>;
    onToggleCadernoAcertos?: () => void | Promise<void>;

    /**
     * Usado quando o usuário erra a questão.
     * Diferente de toggle: deve apenas garantir que a questão esteja
     * no Caderno de Erros, sem risco de removê-la se já existir.
     */
    onGarantirCadernoErros?: () => void | Promise<void>;
}

/* ===================== HELPERS ===================== */
// tenta extrair nomes de "Matéria: X" / "Assunto: Y" nas tags
function parseFromTags(tags: string[]) {
    let matName: string | null = null;
    let assName: string | null = null;
    for (const t of tags) {
        const txt = (t || "").toLowerCase();
        if (!matName && (txt.startsWith("matéria:") || txt.startsWith("materia:"))) {
            matName = t.split(":")[1]?.trim() || null;
        }
        if (!assName && txt.startsWith("assunto:")) {
            assName = t.split(":")[1]?.trim() || null;
        }
    }
    return { matName, assName };
}

/** Resolve IDs a partir de IDs (se já vierem), ou de nomes (props/tags). */
async function ensureIds(
    uid: string,
    materiaId?: string | null,
    assuntoId?: string | null,
    materiaNome?: string | null,
    assuntoNome?: string | null,
    tags?: string[],
    caches?: { matByName: Map<string, string>; assByName: Map<string, string> }
): Promise<{ mid: string | null; aid: string | null }> {
    const matCache = caches?.matByName ?? new Map<string, string>();
    const assCache = caches?.assByName ?? new Map<string, string>();

    let mid: string | null = materiaId ?? null;
    let aid: string | null = assuntoId ?? null;

    // nomes vindos por props ou parseados das tags
    let matName = (materiaNome || null)?.trim() || null;
    let assName = (assuntoNome || null)?.trim() || null;
    if ((!matName || !assName) && tags?.length) {
        const p = parseFromTags(tags);
        if (!matName && p.matName) matName = p.matName;
        if (!assName && p.assName) assName = p.assName;
    }

    // resolve matéria por nome
    if (!mid && matName) {
        const key = matName.toLowerCase();
        if (matCache.has(key)) {
            mid = matCache.get(key)!;
        } else {
            const { data } = await supabase
                .from("materias")
                .select("id")
                .eq("user_id", uid)
                .ilike("nome", key)
                .limit(1)
                .maybeSingle();
            if (data?.id) {
                mid = data.id as string;
                matCache.set(key, mid);
            }
        }
    }

    // resolve assunto por nome (ajuda ter a matéria)
    if (!aid && assName) {
        const raw = assName.toLowerCase();
        const cacheKey = (mid ?? "_no_materia_") + "|" + raw;
        if (assCache.has(cacheKey)) {
            aid = assCache.get(cacheKey)!;
        } else {
            let query = supabase.from("assuntos").select("id").eq("user_id", uid);
            if (mid) query = query.eq("materia_id", mid as string);
            const { data } = await query.ilike("nome", raw).limit(1).maybeSingle();
            if (data?.id) {
                aid = data.id as string;
                assCache.set(cacheKey, aid);
            }
        }
    }

    return { mid: mid ?? null, aid: aid ?? null };
}

/* ===================== PERSISTÊNCIA ===================== */
async function atualizarEstatisticasQuestao(
    acertou: boolean,
    materiaId?: string | null,
    assuntoId?: string | null
) {
    const { data: auth } = await supabase.auth.getUser();
    const user = auth?.user;
    if (!user?.id) return;

    const { data, error } = await supabase
        .from("estatisticas")
        .select(
            "id, questoes_respondidas, taxa_acerto, progresso_semanal, acc_por_materia, acc_por_assunto"
        )
        .eq("user_id", user.id as string)
        .maybeSingle();

    const hoje = new Date().toLocaleDateString("pt-BR");

    const bump = (obj: Record<string, any>, key?: string | null, ok?: boolean) => {
        if (!key) return obj; // sem chave, não mexe
        const cur = obj[key] ?? { total: 0, corretas: 0 };
        return {
            ...obj,
            [key]: {
                total: (cur.total ?? 0) + 1,
                corretas: (cur.corretas ?? 0) + (ok ? 1 : 0),
            },
        };
    };

    if (error || !data) {
        await supabase.from("estatisticas").insert({
            user_id: user.id as string,
            questoes_respondidas: 1,
            taxa_acerto: acertou ? 100 : 0,
            tempo_estudado: "00:00:00",
            progresso_semanal: [{ dia: hoje, questoes: 1 }],
            acc_por_materia: materiaId
                ? { [materiaId]: { total: 1, corretas: acertou ? 1 : 0 } }
                : {},
            acc_por_assunto: assuntoId
                ? { [assuntoId]: { total: 1, corretas: acertou ? 1 : 0 } }
                : {},
            atualizado_em: new Date().toISOString(),
        });
        return;
    }

    const novasQuestoes = (data.questoes_respondidas ?? 0) + 1;
    const acertosAnt = Math.round(
        (((data.taxa_acerto ?? 0) / 100) * (data.questoes_respondidas ?? 0)) as number
    );
    const novosAcertos = acertosAnt + (acertou ? 1 : 0);
    const taxa_acerto = Math.round((novosAcertos / novasQuestoes) * 100);

    let progresso = Array.isArray(data.progresso_semanal) ? [...data.progresso_semanal] : [];
    const idx = progresso.findIndex((d: any) => d.dia === hoje);
    if (idx > -1) progresso[idx].questoes += 1;
    else progresso.push({ dia: hoje, questoes: 1 });

    const acc_por_materia = bump(data.acc_por_materia ?? {}, materiaId, acertou);
    const acc_por_assunto = bump(data.acc_por_assunto ?? {}, assuntoId, acertou);

    await supabase
        .from("estatisticas")
        .update({
            questoes_respondidas: novasQuestoes,
            taxa_acerto,
            progresso_semanal: progresso,
            acc_por_materia,
            acc_por_assunto,
            atualizado_em: new Date().toISOString(),
        })
        .eq("id", data.id as string);
}

async function registrarResolucao(
    questaoId: string,
    correta: boolean,
    materiaId?: string | null,
    assuntoId?: string | null
) {
    const { data: auth } = await supabase.auth.getUser();
    const user = auth?.user;
    if (!user?.id) return;

    await supabase.from("resolucoes").insert({
        user_id: user.id as string,
        questao_id: questaoId,
        correta,
        materia_id: materiaId ?? null,
        assunto_id: assuntoId ?? null,
        created_at: new Date().toISOString(),
    });
}

/**
 * Fonte de verdade para as estatísticas por período.
 * Cada clique em "Conferir Resposta" gera uma tentativa real,
 * permitindo filtrar por 7/30/90 dias, período personalizado ou todo o histórico.
 */
async function registrarQuestionAttempt(
    userId: string,
    questaoId: string,
    correta: boolean
) {
    const { error } = await supabase
        .from("question_attempts")
        .insert({
            user_id: userId,
            questao_id: questaoId,
            resultado: correta ? "ACERTO" : "ERRO",
            is_revisao: false,
        });

    if (error) {
        throw new Error(
            `Não foi possível registrar a tentativa: ${error.message}`
        );
    }
}

/* ===================== NOVO: CADERNOS (fallback interno) ===================== */
/**
 * Requer tabela: caderno_itens(user_id, questao_id, tipo) com UNIQUE(user_id,questao_id,tipo)
 * tipo em ('ERROS','ACERTOS')
 */
async function getUserId(): Promise<string | null> {
    const { data } = await supabase.auth.getUser();
    return data?.user?.id ?? null;
}

async function fetchCadernoStatusForQuestao(userId: string, questaoId: string): Promise<CadernoStatus> {
    const { data, error } = await supabase
        .from("caderno_itens")
        .select("tipo")
        .eq("user_id", userId)
        .eq("questao_id", questaoId);

    if (error) return { ERROS: false, ACERTOS: false };

    const st: CadernoStatus = { ERROS: false, ACERTOS: false };
    (data ?? []).forEach((row: any) => {
        const t = row.tipo as CadernoTipo;
        if (t === "ERROS" || t === "ACERTOS") st[t] = true;
    });
    return st;
}

async function addToCaderno(userId: string, questaoId: string, tipo: CadernoTipo) {
    const { error } = await supabase
        .from("caderno_itens")
        .upsert({ user_id: userId, questao_id: questaoId, tipo }, { onConflict: "user_id,questao_id,tipo" });
    if (error) throw error;
}

async function removeFromCaderno(userId: string, questaoId: string, tipo: CadernoTipo) {
    const { error } = await supabase
        .from("caderno_itens")
        .delete()
        .eq("user_id", userId)
        .eq("questao_id", questaoId)
        .eq("tipo", tipo);
    if (error) throw error;
}

/* ===================== COMPONENTE ===================== */
export function QuestionCard(props: QuestionCardProps) {
    const {
        id,
        materiaId,
        assuntoId,
        materiaNome,
        assuntoNome,
        tags,
        statement,
        options,
        correct,
        explanation,
        comentarios = [],
        erros = [],
        onNotificarErro,
        onNovoComentario,

        // NOVO
        cadernoStatus,
        cadernoLoading,
        onToggleCadernoErros,
        onToggleCadernoAcertos,
        onGarantirCadernoErros,
    } = props;

    const [selected, setSelected] = useState<string | null>(null);
    const [showResult, setShowResult] = useState(false);
    const [registrandoResposta, setRegistrandoResposta] =
        useState(false);
    const [showModal, setShowModal] = useState(false);
    const [showComentarios, setShowComentarios] = useState(false);
    const [errorText, setErrorText] = useState("");
    const [loadingErro, setLoadingErro] = useState(false);
    const [comentarioText, setComentarioText] = useState("");
    const [loadingComentario, setLoadingComentario] = useState(false);
    const [eliminadas, setEliminadas] = useState<number[]>([]);
    const [feedbackMsg, setFeedbackMsg] = useState<string | null>(null);
    const [comentariosState, setComentariosState] = useState<any[]>(comentarios || []);
    const textareaRef = useRef<HTMLTextAreaElement>(null);

    // fallback interno se o pai não controlar
    const [localCadernoStatus, setLocalCadernoStatus] = useState<CadernoStatus>({
        ERROS: false,
        ACERTOS: false,
    });
    const [localBusy, setLocalBusy] = useState<{ ERROS: boolean; ACERTOS: boolean }>({
        ERROS: false,
        ACERTOS: false,
    });
    const [cadernoMsg, setCadernoMsg] = useState<string | null>(null);

    const effectiveStatus = cadernoStatus ?? localCadernoStatus;
    const effectiveBusy = {
        ERROS: cadernoLoading?.ERROS ?? localBusy.ERROS,
        ACERTOS: cadernoLoading?.ACERTOS ?? localBusy.ACERTOS,
    };

    // caches locais
    const caches = useMemo(
        () => ({ matByName: new Map<string, string>(), assByName: new Map<string, string>() }),
        []
    );

    const showFeedback = (msg: string) => {
        setFeedbackMsg(msg);
        setTimeout(() => setFeedbackMsg(null), 2200);
    };

    const toggleEliminada = (idx: number) => {
        setEliminadas((prev) => (prev.includes(idx) ? prev.filter((i) => i !== idx) : [...prev, idx]));
    };

    // se o pai NÃO passar status, carregamos aqui
    useEffect(() => {
        let cancelled = false;

        (async () => {
            if (cadernoStatus) return; // pai controla
            const uid = await getUserId();
            if (!uid) return;
            const st = await fetchCadernoStatusForQuestao(uid, id);
            if (!cancelled) setLocalCadernoStatus(st);
        })();

        return () => {
            cancelled = true;
        };
    }, [id, cadernoStatus]);

    async function toggleLocal(tipo: CadernoTipo) {
        // se pai controla, só chama callback
        if (tipo === "ERROS" && onToggleCadernoErros) return onToggleCadernoErros();
        if (tipo === "ACERTOS" && onToggleCadernoAcertos) return onToggleCadernoAcertos();

        // fallback interno
        const uid = await getUserId();
        if (!uid) {
            setCadernoMsg("Faça login para usar os cadernos.");
            setTimeout(() => setCadernoMsg(null), 2200);
            return;
        }

        setCadernoMsg(null);
        setLocalBusy((b) => ({ ...b, [tipo]: true }));

        try {
            const atual = localCadernoStatus[tipo];
            if (!atual) {
                await addToCaderno(uid, id, tipo);
                setLocalCadernoStatus((s) => ({ ...s, [tipo]: true }));
                showFeedback(tipo === "ERROS" ? "Adicionada aos Erros ✅" : "Adicionada aos Acertos ✅");
            } else {
                await removeFromCaderno(uid, id, tipo);
                setLocalCadernoStatus((s) => ({ ...s, [tipo]: false }));
                showFeedback(tipo === "ERROS" ? "Removida dos Erros" : "Removida dos Acertos");
            }
        } catch (e: any) {
            setCadernoMsg(e?.message || "Erro ao atualizar caderno.");
            setTimeout(() => setCadernoMsg(null), 2200);
        } finally {
            setLocalBusy((b) => ({ ...b, [tipo]: false }));
        }
    }

    return (
        <div className="bg-card rounded-2xl p-7 mb-6 shadow border border-border max-w-6xl w-full mx-auto transition-all font-inter relative">
            {feedbackMsg && (
                <div className="fixed top-6 left-1/2 -translate-x-1/2 bg-primary text-primary-foreground rounded-lg px-6 py-3 text-sm shadow-lg z-[200]">
                    {feedbackMsg}
                </div>
            )}

            {cadernoMsg && (
                <div className="mb-4 text-sm text-red-600">{cadernoMsg}</div>
            )}

            <div className="flex flex-wrap gap-2 mb-5">
                {tags.map((tag, i) => (
                    <span
                        key={i}
                        className="bg-accent text-accent-foreground text-xs font-semibold rounded px-3 py-1"
                    >
                        {tag}
                    </span>
                ))}
            </div>

            <h2 className="text-base sm:text-lg font-bold mb-5 text-foreground">{statement}</h2>

            <div className="flex flex-col gap-2 mb-5">
                {options.map((opt, idx) => {
                    const value = opt.letter || ["A", "B", "C", "D", "E"][idx];
                    const isSelected = selected === value;
                    const isCorrect = correct === value;
                    const eliminada = eliminadas.includes(idx);

                    let btnClass =
                        "flex items-center w-full px-4 py-2 rounded-lg text-left font-medium border transition-all text-[15px] relative group";
                    if (showResult) {
                        if (isSelected && selected !== correct)
                            btnClass += " bg-destructive/10 border-destructive text-destructive";
                        else if (isCorrect) btnClass += " bg-green-100/60 border-green-300 text-green-900";
                        else btnClass += " bg-card border-border";
                    } else if (isSelected) {
                        btnClass += " bg-primary/10 border-primary text-foreground";
                    } else {
                        btnClass += " bg-card border-border hover:bg-muted";
                    }
                    if (eliminada) btnClass += " text-muted-foreground opacity-60 line-through";

                    return (
                        <button
                            key={value}
                            type="button"
                            className={btnClass}
                            disabled={showResult}
                            onClick={() => setSelected(value)}
                        >
                            <span
                                onClick={(e) => {
                                    e.stopPropagation();
                                    toggleEliminada(idx);
                                }}
                                title={eliminada ? "Restaurar alternativa" : "Eliminar alternativa"}
                                className={`mr-3 transition cursor-pointer rounded-full p-1 hover:bg-muted border border-transparent hover:border-border ${eliminada ? "opacity-40" : ""
                                    }`}
                            >
                                <TesouraIcon />
                            </span>

                            <span
                                className={`mr-3 w-7 h-7 flex items-center justify-center rounded-full text-sm font-bold
                ${showResult && isCorrect
                                        ? "bg-green-600 text-white"
                                        : showResult && isSelected && selected !== correct
                                            ? "bg-destructive text-white"
                                            : isSelected
                                                ? "bg-primary text-primary-foreground"
                                                : "bg-muted text-foreground"
                                    }`}
                            >
                                {value}
                            </span>

                            <span className="text-[15px]">{opt.text}</span>
                        </button>
                    );
                })}
            </div>

            <div className="flex flex-wrap gap-2 mb-4">
                <button
                    className="bg-primary hover:bg-primary/90 text-primary-foreground font-bold py-2 px-5 rounded-xl text-sm transition"
                    onClick={async () => {
                        if (!selected || showResult || registrandoResposta) {
                            return;
                        }

                        setRegistrandoResposta(true);
                        setCadernoMsg(null);

                        try {
                            const correta = selected === correct;

                            const { data: auth, error: authError } =
                                await supabase.auth.getUser();

                            const uid = auth?.user?.id;

                            if (authError || !uid) {
                                throw new Error(
                                    "Sua sessão expirou. Entre novamente para registrar a resposta."
                                );
                            }

                            let resolvedMid: string | null =
                                materiaId ?? null;

                            let resolvedAid: string | null =
                                assuntoId ?? null;

                            const resolved = await ensureIds(
                                uid,
                                materiaId ?? null,
                                assuntoId ?? null,
                                materiaNome ?? null,
                                assuntoNome ?? null,
                                tags,
                                caches
                            );

                            resolvedMid = resolved.mid;
                            resolvedAid = resolved.aid;

                            /*
                             * 1) QUESTION_ATTEMPTS é a fonte de verdade.
                             * Só mostramos o resultado depois que a tentativa
                             * foi persistida com sucesso.
                             */
                            await registrarQuestionAttempt(
                                uid,
                                id,
                                correta
                            );

                            setShowResult(true);

                            /*
                             * 2) Mantemos as estruturas antigas sincronizadas
                             * por compatibilidade com outras telas do sistema.
                             * Uma falha aqui não apaga a tentativa já registrada.
                             */
                            const secundarios =
                                await Promise.allSettled([
                                    registrarResolucao(
                                        id,
                                        correta,
                                        resolvedMid,
                                        resolvedAid
                                    ),
                                    atualizarEstatisticasQuestao(
                                        correta,
                                        resolvedMid,
                                        resolvedAid
                                    ),
                                ]);

                            const falhaSecundaria =
                                secundarios.some(
                                    (r) => r.status === "rejected"
                                );

                            /*
                             * 3) Errou => entra automaticamente no Caderno
                             * de Erros. O upsert impede duplicidade.
                             */
                            if (!correta) {
                                try {
                                    if (onGarantirCadernoErros) {
                                        await onGarantirCadernoErros();
                                    } else {
                                        await addToCaderno(
                                            uid,
                                            id,
                                            "ERROS"
                                        );

                                        setLocalCadernoStatus(
                                            (status) => ({
                                                ...status,
                                                ERROS: true,
                                            })
                                        );
                                    }
                                } catch (e: any) {
                                    setCadernoMsg(
                                        e?.message ||
                                        "A tentativa foi registrada, mas não foi possível adicionar ao Caderno de Erros."
                                    );
                                }
                            }

                            if (falhaSecundaria) {
                                setCadernoMsg(
                                    (atual) =>
                                        atual ||
                                        "A tentativa foi registrada nas estatísticas, mas uma sincronização secundária falhou."
                                );
                            }

                            showFeedback(
                                correta
                                    ? "Você acertou! ✅"
                                    : "Resposta incorreta. Enviada ao Caderno de Erros."
                            );
                        } catch (e: any) {
                            setCadernoMsg(
                                e?.message ||
                                "Não foi possível registrar a resposta."
                            );
                        } finally {
                            setRegistrandoResposta(false);
                        }
                    }}
                    disabled={
                        !selected ||
                        showResult ||
                        registrandoResposta
                    }
                >
                    {registrandoResposta
                        ? "Registrando..."
                        : "Conferir Resposta"}
                </button>

                {/* ===================== NOVO: BOTÕES CADERNOS ===================== */}
                <button
                    type="button"
                    onClick={() => toggleLocal("ERROS")}
                    disabled={effectiveBusy.ERROS}
                    className={`font-bold py-2 px-4 rounded-xl text-sm transition border
            ${effectiveStatus.ERROS
                            ? "bg-red-600 text-white border-red-600 hover:bg-red-700"
                            : "bg-transparent text-red-600 border-red-200 hover:bg-red-50"
                        }`}
                    title={effectiveStatus.ERROS ? "Remover do Caderno de Erros" : "Adicionar ao Caderno de Erros"}
                >
                    {effectiveBusy.ERROS ? "Salvando..." : effectiveStatus.ERROS ? "✓ Erros" : "+ Erros"}
                </button>

                <button
                    type="button"
                    onClick={() => toggleLocal("ACERTOS")}
                    disabled={effectiveBusy.ACERTOS}
                    className={`font-bold py-2 px-4 rounded-xl text-sm transition border
            ${effectiveStatus.ACERTOS
                            ? "bg-green-600 text-white border-green-600 hover:bg-green-700"
                            : "bg-transparent text-green-700 border-green-200 hover:bg-green-50"
                        }`}
                    title={
                        effectiveStatus.ACERTOS ? "Remover do Caderno de Acertos" : "Adicionar ao Caderno de Acertos"
                    }
                >
                    {effectiveBusy.ACERTOS ? "Salvando..." : effectiveStatus.ACERTOS ? "✓ Acertos" : "+ Acertos"}
                </button>

                {/* ... (comentários/compartilhar/erro iguais) */}
            </div>

            {showResult && selected && (
                <div className="bg-green-100/60 rounded-lg p-4 mt-2 text-green-900 text-sm">
                    <span className="font-bold text-green-700">Explicação:</span>
                    <p className="mt-1">{explanation}</p>
                </div>
            )}
        </div>
    );
}