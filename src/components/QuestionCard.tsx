"use client";
import { marcarDisciplina } from "@/lib/tempoAtivo";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import { ComentariosQuestao } from "./ComentariosQuestao";
import Link from "next/link";
import {
    BookmarkCheck,
    BookmarkPlus,
    CheckCircle2,
    ChevronDown,
    FileText,
    Layers3,
    MessageSquareText,
    Scissors,
    XCircle,
} from "lucide-react";
import { PainelMaterial, type TipoMaterial } from "./questao/PainelMaterial";
import { prepararExplicacao } from "@/lib/explicacao";

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

    /** "Questão 3 de 126" (opcional). */
    numero?: number;
    total?: number;
    /** Avisado depois de conferir (ex.: treino de erros passa para a próxima). */
    aoResponder?: (acertou: boolean) => void;
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
/** Botão secundário da barra de ações (destacado quando ativo). */
function acaoClass(ativo: boolean) {
    return `inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-semibold transition ${
        ativo ? "border-primary/50 bg-primary/10 text-primary" : "border-border bg-transparent text-foreground hover:bg-muted"
    }`;
}

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
        numero,
        total,
        aoResponder,
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
    const [menuCaderno, setMenuCaderno] = useState(false);
    const [painel, setPainel] = useState<TipoMaterial | null>(null);
    const [materialExistente, setMaterialExistente] = useState<{ FLASHCARD: boolean; RESUMO: boolean }>({ FLASHCARD: false, RESUMO: false });

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

    useEffect(() => {
        let cancelado = false;
        (async () => {
            const uid = await getUserId();
            if (!uid) return;
            const [fc, rs] = await Promise.all([
                supabase.from("flashcards").select("id", { count: "exact", head: true }).eq("user_id", uid).eq("questao_origem_id", id),
                supabase.from("resumos").select("id", { count: "exact", head: true }).eq("user_id", uid).eq("questao_origem_id", id),
            ]);
            if (!cancelado) setMaterialExistente({ FLASHCARD: (fc.count ?? 0) > 0, RESUMO: !rs.error && (rs.count ?? 0) > 0 });
        })();
        return () => {
            cancelado = true;
        };
    }, [id]);

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
                showFeedback(tipo === "ERROS" ? "Adicionada ao Caderno de erros" : "Salva em Acertei no chute");
            } else {
                await removeFromCaderno(uid, id, tipo);
                setLocalCadernoStatus((s) => ({ ...s, [tipo]: false }));
                showFeedback(tipo === "ERROS" ? "Removida do Caderno de erros" : "Removida de Acertei no chute");
            }
        } catch (e: any) {
            setCadernoMsg(e?.message || "Erro ao atualizar caderno.");
            setTimeout(() => setCadernoMsg(null), 2200);
        } finally {
            setLocalBusy((b) => ({ ...b, [tipo]: false }));
        }
    }


    // Etiquetas: disciplina › assunto em destaque; o resto numa linha discreta.
    const limpas = tags.map((t) => String(t ?? "").trim()).filter(Boolean);
    const principais = [materiaNome, assuntoNome].map((t) => String(t ?? "").trim()).filter(Boolean);
    const secundarias = limpas.filter((t) => !principais.includes(t));
    const acertou = showResult && selected === correct;
    const ce = options.length === 2 && options.every((o) => /^(C|E)$/.test(String(o.letter)));
    const rotuloCorreta = ce ? (correct === "C" ? "Certo" : "Errado") : correct;

    return (
        <article
            onPointerDown={() => marcarDisciplina({ nome: materiaNome })}
            onKeyDown={() => marcarDisciplina({ nome: materiaNome })}
            className="relative mx-auto mb-6 w-full rounded-xl border border-border border-l-4 border-l-primary bg-card p-5 shadow-sm sm:p-7">
            {feedbackMsg && (
                <div className="fixed left-1/2 top-6 z-[200] -translate-x-1/2 rounded-lg bg-foreground px-5 py-2.5 text-sm font-medium text-background shadow-lg" role="status">
                    {feedbackMsg}
                </div>
            )}

            {/* Cabeçalho: número, disciplina › assunto e linha de contexto */}
            <header className="mb-4 flex flex-col gap-1.5">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
                    {numero !== undefined && (
                        <span className="rounded-md bg-primary/10 px-2 py-0.5 text-xs font-bold text-primary">
                            Questão {numero}
                            {total ? ` de ${total.toLocaleString("pt-BR")}` : ""}
                        </span>
                    )}
                    {principais.length > 0 && (
                        <span className="font-semibold text-foreground">{principais.join(" › ")}</span>
                    )}
                </div>
                {secundarias.length > 0 && <div className="text-xs text-muted-foreground">{secundarias.join(" · ")}</div>}
            </header>

            {cadernoMsg && <div className="mb-4 text-sm text-red-600 dark:text-red-400">{cadernoMsg}</div>}

            {/* pre-line: mantém os parágrafos do enunciado (fonte, texto-base, comando). */}
            <h2 className="mb-5 whitespace-pre-line text-base font-medium leading-relaxed text-foreground sm:text-[17px]">{statement}</h2>

            <div className="mb-5 flex flex-col gap-2">
                {options.map((opt, idx) => {
                    const value = opt.letter || ["A", "B", "C", "D", "E"][idx];
                    const isSelected = selected === value;
                    const isCorrect = correct === value;
                    const eliminada = eliminadas.includes(idx);

                    let caixa = "border-border bg-card hover:bg-muted/60";
                    if (showResult && isCorrect) caixa = "border-emerald-500/50 bg-emerald-500/10";
                    else if (showResult && isSelected) caixa = "border-red-500/50 bg-red-500/10";
                    else if (showResult) caixa = "border-border bg-card";
                    else if (isSelected) caixa = "border-primary bg-primary/10";

                    let letra = "bg-muted text-foreground";
                    if (showResult && isCorrect) letra = "bg-emerald-600 text-white";
                    else if (showResult && isSelected) letra = "bg-red-600 text-white";
                    else if (isSelected) letra = "bg-primary text-primary-foreground";

                    return (
                        <div key={value} className={`group relative flex items-stretch rounded-lg border transition ${caixa}`}>
                            <button
                                type="button"
                                className={`flex min-w-0 flex-1 items-start gap-3 px-4 py-3 text-left text-[15px] leading-relaxed ${eliminada ? "text-muted-foreground line-through opacity-60" : "text-foreground"}`}
                                disabled={showResult}
                                onClick={() => setSelected(value)}
                                aria-pressed={isSelected}
                            >
                                {/* shrink-0: a letra não encolhe com alternativa longa (texto alinhado) */}
                                <span className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm font-bold ${letra}`}>
                                    {value}
                                </span>
                                <span className="min-w-0 pt-0.5">{opt.text}</span>
                            </button>
                            {!showResult && (
                                <button
                                    type="button"
                                    onClick={() => toggleEliminada(idx)}
                                    title={eliminada ? "Restaurar alternativa" : "Eliminar alternativa"}
                                    aria-label={eliminada ? `Restaurar alternativa ${value}` : `Eliminar alternativa ${value}`}
                                    className={`flex shrink-0 items-center px-3 text-muted-foreground transition hover:text-foreground sm:opacity-0 sm:group-hover:opacity-100 sm:focus:opacity-100 ${eliminada ? "sm:opacity-100 text-primary" : ""}`}
                                >
                                    <Scissors className="h-4 w-4" aria-hidden />
                                </button>
                            )}
                        </div>
                    );
                })}
            </div>

            {/* Resultado */}
            {showResult && (
                <div
                    className={`mb-4 flex flex-col gap-2 rounded-lg border px-4 py-3 text-sm ${acertou ? "border-emerald-500/40 bg-emerald-500/10" : "border-red-500/40 bg-red-500/10"}`}
                    role="status"
                >
                    <div className={`flex items-center gap-2 font-bold ${acertou ? "text-emerald-700 dark:text-emerald-300" : "text-red-700 dark:text-red-300"}`}>
                        {acertou ? <CheckCircle2 className="h-5 w-5" aria-hidden /> : <XCircle className="h-5 w-5" aria-hidden />}
                        {acertou ? "Você acertou!" : `Você errou. A resposta correta é ${rotuloCorreta}.`}
                    </div>
                    {acertou ? (
                        !effectiveStatus.ACERTOS && (
                            <div className="text-foreground">
                                Acertou no chute?{" "}
                                <button type="button" className="font-semibold text-primary underline" onClick={() => toggleLocal("ACERTOS")}>
                                    Guardar para treinar depois
                                </button>
                            </div>
                        )
                    ) : (
                        <div className="text-foreground">
                            Ela foi para o seu Caderno de erros.{" "}
                            {materialExistente.FLASHCARD ? (
                                <Link href="/flashcards" className="font-semibold text-primary underline">Ver seu flashcard</Link>
                            ) : (
                                <button type="button" className="font-semibold text-primary underline" onClick={() => setPainel("FLASHCARD")}>
                                    Criar um flashcard para não errar de novo
                                </button>
                            )}
                        </div>
                    )}
                </div>
            )}

            {/* Ações */}
            <div className="flex flex-wrap items-center gap-2">
                {!showResult && (
                    <button
                        type="button"
                        className="rounded-lg bg-primary px-5 py-2 text-sm font-bold text-primary-foreground transition hover:bg-primary/90 disabled:opacity-50"
                        onClick={async () => {
                        if (!selected || showResult || registrandoResposta) {
                            return;
                        }

                        setRegistrandoResposta(true);
                        setCadernoMsg(null);

                        try {
                            const correta = selected === correct;
                            // Errou: a explicação começa a ser preparada já, para estar pronta
                            // quando o aluno abrir "Comentários".
                            if (!correta) prepararExplicacao(id);

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

                            // Treino do caderno de erros: 2 acertos seguidos = questão recuperada.
                            try {
                                await supabase.rpc("registrar_treino_caderno", { p_questao: id, p_acertou: correta });
                            } catch {
                                /* migração ainda não aplicada: ignora */
                            }
                            aoResponder?.(correta);
                        } catch (e: any) {
                            setCadernoMsg(
                                e?.message ||
                                "Não foi possível registrar a resposta."
                            );
                        } finally {
                            setRegistrandoResposta(false);
                        }
                    }}
                        disabled={!selected || showResult || registrandoResposta}
                    >
                        {registrandoResposta ? "Registrando…" : "Conferir resposta"}
                    </button>
                )}

                {/* Caderno: um botão, duas opções */}
                <div className="relative">
                    <button
                        type="button"
                        onClick={() => setMenuCaderno((v) => !v)}
                        aria-expanded={menuCaderno}
                        className={acaoClass(effectiveStatus.ERROS || effectiveStatus.ACERTOS)}
                    >
                        {effectiveStatus.ERROS || effectiveStatus.ACERTOS ? <BookmarkCheck className="h-4 w-4" aria-hidden /> : <BookmarkPlus className="h-4 w-4" aria-hidden />}
                        {effectiveStatus.ERROS ? "No caderno de erros" : effectiveStatus.ACERTOS ? "No Acertei no chute" : "Caderno"}
                        <ChevronDown className="h-3.5 w-3.5 opacity-70" aria-hidden />
                    </button>
                    {menuCaderno && (
                        <>
                            <button type="button" className="fixed inset-0 z-10 cursor-default" aria-hidden tabIndex={-1} onClick={() => setMenuCaderno(false)} />
                            <div className="absolute left-0 top-full z-20 mt-1 w-60 rounded-lg border border-border bg-popover p-1 shadow-lg" role="menu">
                                {(["ERROS", "ACERTOS"] as CadernoTipo[]).map((t) => (
                                    <button
                                        key={t}
                                        type="button"
                                        role="menuitemcheckbox"
                                        aria-checked={effectiveStatus[t]}
                                        disabled={effectiveBusy[t]}
                                        onClick={async () => {
                                            setMenuCaderno(false);
                                            await toggleLocal(t);
                                        }}
                                        className="flex w-full items-center justify-between gap-3 rounded-md px-3 py-2 text-left text-sm text-foreground hover:bg-muted disabled:opacity-50"
                                    >
                                        <span>
                                            <span className="block font-medium">{t === "ERROS" ? "Caderno de erros" : "Acertei no chute"}</span>
                                            <span className="block text-xs text-muted-foreground">
                                                {t === "ERROS" ? "Para refazer até acertar" : "Acertou, mas com dúvida"}
                                            </span>
                                        </span>
                                        {effectiveStatus[t] && <BookmarkCheck className="h-4 w-4 shrink-0 text-primary" aria-label="Salva" />}
                                    </button>
                                ))}
                            </div>
                        </>
                    )}
                </div>

                <button
                    type="button"
                    onClick={() => setShowComentarios((v) => !v)}
                    onPointerEnter={() => prepararExplicacao(id)}
                    onFocus={() => prepararExplicacao(id)}
                    aria-expanded={showComentarios}
                    className={acaoClass(showComentarios)}
                >
                    <MessageSquareText className="h-4 w-4" aria-hidden /> Comentários
                </button>

                {materialExistente.FLASHCARD ? (
                    <Link href="/flashcards" className={acaoClass(true)}>
                        <Layers3 className="h-4 w-4" aria-hidden /> Ver flashcard
                    </Link>
                ) : (
                    <button type="button" onClick={() => setPainel("FLASHCARD")} className={acaoClass(false)}>
                        <Layers3 className="h-4 w-4" aria-hidden /> Flashcard
                    </button>
                )}

                {materialExistente.RESUMO ? (
                    <Link href="/resumos" className={acaoClass(true)}>
                        <FileText className="h-4 w-4" aria-hidden /> Ver resumo
                    </Link>
                ) : (
                    <button type="button" onClick={() => setPainel("RESUMO")} className={acaoClass(false)}>
                        <FileText className="h-4 w-4" aria-hidden /> Resumo
                    </button>
                )}
            </div>

            {showComentarios && (
                <div className="mt-4">
                    <ComentariosQuestao questaoId={id} />
                </div>
            )}

            {showResult && selected && explanation?.trim() && (
                <div className="mt-4 rounded-lg border border-border bg-muted/50 p-4 text-sm text-foreground">
                    <span className="font-bold">Explicação:</span>
                    <p className="mt-1 whitespace-pre-line">{explanation}</p>
                </div>
            )}

            <PainelMaterial
                questaoId={id}
                tipo={painel ?? "FLASHCARD"}
                aberto={painel !== null}
                aoFechar={() => setPainel(null)}
                aoSalvar={() => painel && setMaterialExistente((m) => ({ ...m, [painel]: true }))}
            />
        </article>
    );
}