"use client";
import React, { useMemo, useRef, useState } from "react";
import { supabase } from "../lib/supabaseClient";

/* ===================== UI ===================== */
function TesouraIcon({ className = "" }: { className?: string }) {
    return (
        <svg viewBox="0 0 20 20" fill="none" width={22} height={22} className={className + " pointer-events-none"}>
            <path d="M7.5 8.5L3 3M12.5 8.5L17 3M3 17l7-7 7 7" stroke="#9ca3af" strokeWidth={2} strokeLinecap="round" />
            <circle cx={4.5} cy={15.5} r={1.2} fill="#bbb" />
            <circle cx={15.5} cy={15.5} r={1.2} fill="#bbb" />
        </svg>
    );
}

type Option = { letter?: string; text: string };

interface QuestionCardProps {
    id: string;                // id da questão
    materiaId?: string | null; // pode vir vazio
    assuntoId?: string | null; // pode vir vazio
    materiaNome?: string | null; // fallback por nome
    assuntoNome?: string | null; // fallback por nome

    tags: string[];
    statement: string;
    options: Option[];
    correct: string;
    explanation: string;

    comentarios?: any[];
    erros?: any[];
    onNotificarErro?: (erroText: string) => void;
    onNovoComentario?: (comentario: string) => void;
}

/* ===================== HELPERS DE PERSISTÊNCIA ===================== */

/** Resolve IDs a partir das props. Se não houver ID, tenta buscar por nome no Supabase. */
async function ensureIds(
    uid: string,
    materiaId?: string | null,
    assuntoId?: string | null,
    materiaNome?: string | null,
    assuntoNome?: string | null,
    caches?: {
        matByName: Map<string, string>;
        assByName: Map<string, string>;
    }
): Promise<{ mid: string | null; aid: string | null }> {
    const matCache = caches?.matByName ?? new Map<string, string>();
    const assCache = caches?.assByName ?? new Map<string, string>();

    let mid: string | null = materiaId ?? null;
    let aid: string | null = assuntoId ?? null;

    // resolve matéria por nome
    if (!mid && materiaNome) {
        const key = materiaNome.trim().toLowerCase();
        if (key) {
            if (matCache.has(key)) {
                mid = matCache.get(key)!;
            } else {
                const { data } = await supabase
                    .from("materias")
                    .select("id")
                    .eq("user_id", uid) // uid é string
                    .ilike("nome", key) // key garantido como string
                    .limit(1)
                    .maybeSingle();
                if (data?.id) {
                    mid = data.id as string;
                    matCache.set(key, mid);
                }
            }
        }
    }

    // resolve assunto por nome (ajuda ter a matéria)
    if (!aid && assuntoNome) {
        const raw = assuntoNome.trim().toLowerCase();
        if (raw) {
            const cacheKey = (mid ?? "_no_materia_") + "|" + raw;
            if (assCache.has(cacheKey)) {
                aid = assCache.get(cacheKey)!;
            } else {
                let query = supabase.from("assuntos").select("id").eq("user_id", uid);
                if (mid) {
                    // TS garante string aqui com cast após o guard
                    query = query.eq("materia_id", mid as string);
                }
                const { data } = await query.ilike("nome", raw).limit(1).maybeSingle();
                if (data?.id) {
                    aid = data.id as string;
                    assCache.set(cacheKey, aid);
                }
            }
        }
    }

    return { mid: mid ?? null, aid: aid ?? null };
}

/** Atualiza a tabela `estatisticas` (globais + JSON por matéria/assunto). */
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
        .select("id, questoes_respondidas, taxa_acerto, progresso_semanal, acc_por_materia, acc_por_assunto")
        .eq("user_id", user.id as string)
        .maybeSingle();

    const hoje = new Date().toLocaleDateString("pt-BR");
    const bump = (obj: Record<string, any>, key?: string | null, ok?: boolean) => {
        if (!key) return obj;
        const cur = obj[key] ?? { total: 0, corretas: 0 };
        return { ...obj, [key]: { total: (cur.total ?? 0) + 1, corretas: (cur.corretas ?? 0) + (ok ? 1 : 0) } };
    };

    if (error || !data) {
        await supabase.from("estatisticas").insert({
            user_id: user.id as string,
            questoes_respondidas: 1,
            taxa_acerto: acertou ? 100 : 0,
            tempo_estudado: "00:00:00",
            progresso_semanal: [{ dia: hoje, questoes: 1 }],
            acc_por_materia: materiaId ? { [materiaId]: { total: 1, corretas: acertou ? 1 : 0 } } : {},
            acc_por_assunto: assuntoId ? { [assuntoId]: { total: 1, corretas: acertou ? 1 : 0 } } : {},
            atualizado_em: new Date().toISOString(),
        });
        return;
    }

    const novasQuestoes = (data.questoes_respondidas ?? 0) + 1;
    const acertosAnt = Math.round(((data.taxa_acerto ?? 0) / 100) * (data.questoes_respondidas ?? 0));
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

/** Registra a resolução na tabela `resolucoes` (usada para estatísticas por período). */
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

/* ===================== COMPONENTE ===================== */
export function QuestionCard({
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
}: QuestionCardProps) {
    const [selected, setSelected] = useState<string | null>(null);
    const [showResult, setShowResult] = useState(false);
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

    // caches locais p/ resolver nomes -> ids sem bater no banco toda hora
    const caches = useMemo(
        () => ({
            matByName: new Map<string, string>(),
            assByName: new Map<string, string>(),
        }),
        []
    );

    React.useEffect(() => {
        if (showModal) setTimeout(() => textareaRef.current?.focus(), 100);
    }, [showModal]);

    const showFeedback = (msg: string) => {
        setFeedbackMsg(msg);
        setTimeout(() => setFeedbackMsg(null), 2200);
    };

    const toggleEliminada = (idx: number) => {
        setEliminadas((prev) => (prev.includes(idx) ? prev.filter((i) => i !== idx) : [...prev, idx]));
    };

    const compartilharQuestao = () => {
        const texto = `${statement}\n\n${options.map((opt) => opt.text).join("\n")}\n\nConheça a melhor plataforma de questões comentadas para concursos policiais:\n`;
        if (navigator.share) {
            navigator.share({ title: "Questão", text: texto, url: "https://vocacaomilitar.com.br" });
        } else {
            navigator.clipboard.writeText(texto);
            alert("Texto copiado para a área de transferência!");
        }
    };

    const enviarErro = async () => {
        if (!errorText.trim()) return;
        setLoadingErro(true);
        const { data: auth } = await supabase.auth.getUser();
        const user = auth?.user;
        const userName =
            user?.user_metadata?.full_name || user?.user_metadata?.name || user?.email || "Usuário";
        const novoErro = { mensagem: errorText, data: new Date().toISOString(), usuario: userName };
        const novosErros = [...(erros || []), novoErro];
        const { error } = await supabase.from("questoes").update({ comentarios: novosErros }).eq("id", id);
        setLoadingErro(false);
        if (!error) {
            setShowModal(false);
            setErrorText("");
            showFeedback("Erro notificado com sucesso!");
            onNotificarErro?.(errorText);
        } else {
            alert("Erro ao salvar notificação.");
        }
    };

    const enviarComentario = async () => {
        if (!comentarioText.trim()) return;
        setLoadingComentario(true);
        const { data: auth } = await supabase.auth.getUser();
        const user = auth?.user;
        const userName =
            user?.user_metadata?.full_name || user?.user_metadata?.name || user?.email || "Usuário";
        const novoComentario = { texto: comentarioText, data: new Date().toISOString(), usuario: userName };
        const novosComentarios = [...comentariosState, novoComentario];
        const { error } = await supabase.from("questoes").update({ comentarios: novosComentarios }).eq("id", id);
        setLoadingComentario(false);
        if (!error) {
            setComentarioText("");
            setComentariosState(novosComentarios);
            showFeedback("Comentário enviado!");
            onNovoComentario?.(comentarioText);
        } else {
            alert("Erro ao salvar comentário.");
        }
    };

    const letras = ["A", "B", "C", "D", "E"];

    return (
        <div className="bg-card rounded-2xl p-7 mb-6 shadow border border-border max-w-6xl w-full mx-auto transition-all font-inter relative">
            {/* FEEDBACK TOAST */}
            {feedbackMsg && (
                <div className="fixed top-6 left-1/2 -translate-x-1/2 bg-primary text-primary-foreground rounded-lg px-6 py-3 text-sm shadow-lg z-[200]">
                    {feedbackMsg}
                </div>
            )}

            {/* Tags */}
            <div className="flex flex-wrap gap-2 mb-5">
                {tags.map((tag, i) => (
                    <span key={i} className="bg-accent text-accent-foreground text-xs font-semibold rounded px-3 py-1">
                        {tag}
                    </span>
                ))}
            </div>

            {/* Enunciado */}
            <h2 className="text-base sm:text-lg font-bold mb-5 text-foreground">{statement}</h2>

            {/* Alternativas */}
            <div className="flex flex-col gap-2 mb-5">
                {options.map((opt, idx) => {
                    const value = opt.letter || letras[idx];
                    const isSelected = selected === value;
                    const isCorrect = correct === value;
                    const eliminada = eliminadas.includes(idx);

                    let btnClass =
                        "flex items-center w-full px-4 py-2 rounded-lg text-left font-medium border transition-all text-[15px] relative group";

                    if (showResult) {
                        if (isSelected && selected !== correct) {
                            btnClass += " bg-destructive/10 border-destructive text-destructive";
                        } else if (isCorrect) {
                            btnClass += " bg-green-100/60 border-green-300 text-green-900";
                        } else {
                            btnClass += " bg-card border-border";
                        }
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
                                className={`mr-3 transition cursor-pointer rounded-full p-1 hover:bg-muted border border-transparent hover:border-border ${eliminada ? "opacity-40" : ""}`}
                            >
                                <TesouraIcon />
                            </span>
                            <span
                                className={`
                  mr-3 w-7 h-7 flex items-center justify-center rounded-full text-sm font-bold
                  ${showResult && isCorrect
                                        ? "bg-green-600 text-white"
                                        : showResult && isSelected && selected !== correct
                                            ? "bg-destructive text-white"
                                            : isSelected
                                                ? "bg-primary text-primary-foreground"
                                                : "bg-muted text-foreground"
                                    }
                `}
                            >
                                {value}
                            </span>
                            <span className="text-[15px]">{opt.text}</span>
                        </button>
                    );
                })}
            </div>

            {/* Ações */}
            <div className="flex flex-wrap gap-2 mb-4">
                <button
                    className="bg-primary hover:bg-primary/90 text-primary-foreground font-bold py-2 px-5 rounded-xl text-sm transition"
                    onClick={async () => {
                        setShowResult(true);
                        if (!selected) return;

                        const correta = selected === correct;

                        // garante IDs (usa os que vieram, senão tenta por nome)
                        const { data: auth } = await supabase.auth.getUser();
                        const uid: string | undefined = auth?.user?.id ?? undefined;

                        let resolvedMid: string | null = materiaId ?? null;
                        let resolvedAid: string | null = assuntoId ?? null;

                        if (uid) {
                            const resolved = await ensureIds(
                                uid,
                                materiaId ?? null,
                                assuntoId ?? null,
                                materiaNome ?? null,
                                assuntoNome ?? null,
                                caches
                            );
                            resolvedMid = resolved.mid;
                            resolvedAid = resolved.aid;
                        }

                        await Promise.all([
                            registrarResolucao(id, correta, resolvedMid, resolvedAid),
                            atualizarEstatisticasQuestao(correta, resolvedMid, resolvedAid),
                        ]);

                        showFeedback(correta ? "Você acertou! ✅" : "Resposta incorreta. 😉");
                    }}
                    disabled={!selected || showResult}
                >
                    Conferir Resposta
                </button>

                <button
                    className="bg-card border border-border text-muted-foreground py-2 px-5 rounded-xl text-sm transition hover:bg-muted font-medium"
                    type="button"
                    onClick={() => setShowComentarios((v) => !v)}
                >
                    Comentários ({comentariosState.length ?? 0})
                </button>

                <button
                    className="bg-card border border-border text-muted-foreground py-2 px-5 rounded-xl text-sm transition hover:bg-muted font-medium"
                    type="button"
                    onClick={compartilharQuestao}
                >
                    Compartilhar
                </button>

                <button
                    className="bg-card border border-destructive text-destructive py-2 px-5 rounded-xl text-sm transition hover:bg-destructive/10 font-medium"
                    type="button"
                    onClick={() => setShowModal(true)}
                >
                    Notificar Erro
                </button>

                {showResult && (
                    <button
                        className="ml-2 text-xs text-primary underline"
                        onClick={() => {
                            setShowResult(false);
                            setSelected(null);
                        }}
                    >
                        Próxima Questão
                    </button>
                )}
            </div>

            {/* Explicação */}
            {showResult && selected && (
                <div className="bg-green-100/60 rounded-lg p-4 mt-2 text-green-900 text-sm">
                    <span className="font-bold text-green-700">Explicação:</span>
                    <p className="mt-1">{explanation}</p>
                </div>
            )}

            {/* Comentários */}
            {showComentarios && (
                <div className="bg-muted rounded-xl px-4 py-3 mt-3 text-foreground">
                    <div className="font-bold mb-2">Comentários</div>
                    <div className="mb-3 flex items-end gap-2">
                        <textarea
                            rows={2}
                            className="w-full border border-border rounded-lg px-3 py-2 text-sm text-foreground bg-card resize-none outline-none focus:ring-2 focus:ring-primary"
                            placeholder="Digite um comentário..."
                            value={comentarioText}
                            onChange={(e) => setComentarioText(e.target.value)}
                            disabled={loadingComentario}
                        />
                        <button
                            className="bg-primary hover:bg-primary/90 text-primary-foreground font-bold px-4 py-2 rounded-lg text-sm transition"
                            onClick={enviarComentario}
                            disabled={loadingComentario || !comentarioText.trim()}
                        >
                            {loadingComentario ? "Enviando..." : "Comentar"}
                        </button>
                    </div>
                    {comentariosState.length ? (
                        <ul className="flex flex-col gap-2">
                            {comentariosState.map((com, i) => (
                                <li key={i} className="bg-card rounded-lg px-3 py-2 border text-sm">
                                    <span className="font-bold text-primary mr-2">{com?.usuario || "Usuário"}</span>
                                    {com?.texto || com?.mensagem || JSON.stringify(com)}
                                    {com?.data && (
                                        <span className="block text-[11px] text-muted-foreground mt-1">
                                            {new Date(com.data).toLocaleString()}
                                        </span>
                                    )}
                                </li>
                            ))}
                        </ul>
                    ) : (
                        <div className="text-sm text-muted-foreground">Nenhum comentário ainda.</div>
                    )}
                </div>
            )}

            {/* MODAL NOTIFICAR ERRO */}
            {showModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm">
                    <div className="bg-card rounded-xl p-7 max-w-md w-full shadow-2xl border border-border relative">
                        <button
                            onClick={() => setShowModal(false)}
                            className="absolute top-2 right-2 rounded-full hover:bg-muted p-1 text-muted-foreground font-bold"
                            aria-label="Fechar"
                        >
                            ×
                        </button>
                        <h3 className="font-bold text-lg text-foreground mb-3">Notificar erro na questão</h3>
                        <textarea
                            ref={textareaRef}
                            rows={4}
                            className="w-full border border-border rounded-lg px-3 py-2 mb-3 text-sm text-foreground bg-card resize-none outline-none focus:ring-2 focus:ring-primary"
                            placeholder="Descreva o erro encontrado..."
                            value={errorText}
                            onChange={(e) => setErrorText(e.target.value)}
                        />
                        <button
                            onClick={enviarErro}
                            className="bg-primary hover:bg-primary/90 text-primary-foreground font-bold px-5 py-2 rounded-lg text-sm w-full transition"
                            disabled={loadingErro || !errorText.trim()}
                        >
                            {loadingErro ? "Enviando..." : "Enviar Notificação"}
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
