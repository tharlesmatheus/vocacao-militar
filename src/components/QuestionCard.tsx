"use client";
import React, { useState, useRef } from "react";
import { supabase } from "../lib/supabaseClient";

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
    id: string;
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

async function atualizarEstatisticasQuestao(acertou: boolean) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data, error } = await supabase
        .from("estatisticas")
        .select("*")
        .eq("user_id", user.id)
        .single();
    if (error || !data) {
        await supabase.from("estatisticas").insert([{
            user_id: user.id,
            questoes_respondidas: 1,
            taxa_acerto: acertou ? 100 : 0,
            tempo_estudado: "00:00:00",
            progresso_semanal: [{ dia: new Date().toLocaleDateString("pt-BR"), questoes: 1 }],
            atualizado_em: new Date().toISOString(),
        }]);
        return;
    }
    const novasQuestoes = (data.questoes_respondidas ?? 0) + 1;
    const acertosAnteriores = Math.round((data.taxa_acerto ?? 0) / 100 * (data.questoes_respondidas ?? 0));
    const novosAcertos = acertosAnteriores + (acertou ? 1 : 0);
    const taxa_acerto = Math.round((novosAcertos / novasQuestoes) * 100);

    const hoje = new Date().toLocaleDateString("pt-BR");
    let progresso = Array.isArray(data.progresso_semanal) ? [...data.progresso_semanal] : [];
    const idx = progresso.findIndex((d: any) => d.dia === hoje);
    if (idx > -1) progresso[idx].questoes += 1;
    else progresso.push({ dia: hoje, questoes: 1 });

    await supabase
        .from("estatisticas")
        .update({
            questoes_respondidas: novasQuestoes,
            taxa_acerto,
            progresso_semanal: progresso,
            atualizado_em: new Date().toISOString(),
        })
        .eq("user_id", user.id);
}

export function QuestionCard({
    id,
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

    React.useEffect(() => {
        if (showModal) setTimeout(() => textareaRef.current?.focus(), 100);
    }, [showModal]);

    const showFeedback = (msg: string) => {
        setFeedbackMsg(msg);
        setTimeout(() => setFeedbackMsg(null), 3000);
    };

    const toggleEliminada = (idx: number) => {
        setEliminadas((prev) =>
            prev.includes(idx)
                ? prev.filter((i) => i !== idx)
                : [...prev, idx]
        );
    };

    const compartilharQuestao = () => {
        const texto =
            `${statement}\n\n${options.map((opt) => opt.text).join('\n')}\n\nConheça a melhor plataforma de questões comentadas para concursos policiais:\n`;
        if (navigator.share) {
            navigator.share({
                title: "Questão para Concursos Policiais",
                text: texto,
                url: "https://vocacaomilitar.com.br"
            });
        } else {
            navigator.clipboard.writeText(texto);
            alert("Texto copiado para a área de transferência!");
        }
    };

    const enviarErro = async () => {
        if (!errorText.trim()) return;
        setLoadingErro(true);
        const { data: { user } } = await supabase.auth.getUser();
        let userName = user?.user_metadata?.full_name || user?.user_metadata?.name || user?.email || "Usuário";
        const novoErro = { mensagem: errorText, data: new Date().toISOString(), usuario: userName };
        const novosErros = [...(erros || []), novoErro];
        const { error } = await supabase
            .from("questoes")
            .update({ erros: novosErros })
            .eq("id", id);
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
        const { data: { user } } = await supabase.auth.getUser();
        let userName = user?.user_metadata?.full_name || user?.user_metadata?.name || user?.email || "Usuário";
        const novoComentario = { texto: comentarioText, data: new Date().toISOString(), usuario: userName };
        const novosComentarios = [...comentariosState, novoComentario];
        const { error } = await supabase
            .from("questoes")
            .update({ comentarios: novosComentarios })
            .eq("id", id);
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
                <div className="fixed top-6 left-1/2 -translate-x-1/2 bg-primary text-primary-foreground rounded-lg px-6 py-3 text-sm shadow-lg z-[200] animate-fade-in">
                    {feedbackMsg}
                </div>
            )}

            {/* Tags */}
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
            {/* Enunciado */}
            <h2 className="text-base sm:text-lg font-bold mb-5 text-foreground">
                {statement}
            </h2>
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
                        } else if (isCorrect && selected !== correct) {
                            btnClass += " bg-green-50 border-green-600 text-green-900";
                        } else if (isSelected && selected === correct) {
                            btnClass += " bg-green-50 border-green-600 text-green-900";
                        } else {
                            btnClass += " bg-card border-border";
                        }
                    } else if (isSelected) {
                        btnClass += " bg-primary/10 border-primary text-foreground";
                    } else {
                        btnClass += " bg-card border-border hover:bg-muted";
                    }
                    if (eliminada) {
                        btnClass += " text-muted-foreground opacity-60 line-through";
                    }
                    return (
                        <button
                            key={value}
                            type="button"
                            className={btnClass}
                            disabled={showResult}
                            onClick={() => setSelected(value)}
                        >
                            <span
                                onClick={e => { e.stopPropagation(); toggleEliminada(idx); }}
                                title={eliminada ? "Restaurar alternativa" : "Eliminar alternativa"}
                                className={`mr-3 transition cursor-pointer rounded-full p-1 hover:bg-muted border border-transparent hover:border-border ${eliminada ? "opacity-40" : ""}`}
                            >
                                <TesouraIcon />
                            </span>
                            <span className={`mr-3 w-7 h-7 flex items-center justify-center rounded-full text-sm font-bold
                                ${showResult && isSelected
                                    ? isCorrect
                                        ? "bg-green-600 text-white"
                                        : "bg-destructive text-white"
                                    : isSelected
                                        ? "bg-primary text-primary-foreground"
                                        : "bg-muted text-foreground"
                                }
                                `}>
                                {value}
                            </span>
                            <span className="text-foreground text-[15px]">{opt.text}</span>
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
                        if (selected) {
                            await atualizarEstatisticasQuestao(selected === correct);
                        }
                    }}
                    disabled={!selected || showResult}
                >
                    Conferir Resposta
                </button>
                <button
                    className="bg-card border border-border text-muted-foreground py-2 px-5 rounded-xl text-sm transition hover:bg-muted font-medium"
                    type="button"
                    onClick={() => setShowComentarios(v => !v)}
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
                <div className="bg-green-50 dark:bg-green-950 rounded-lg p-4 mt-2 text-green-900 dark:text-green-200 text-sm">
                    <span className="font-bold text-green-700 dark:text-green-300">Explicação:</span>
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
                            onChange={e => setComentarioText(e.target.value)}
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
                        <h3 className="font-bold text-lg text-foreground mb-3">
                            Notificar erro na questão
                        </h3>
                        <textarea
                            ref={textareaRef}
                            rows={4}
                            className="w-full border border-border rounded-lg px-3 py-2 mb-3 text-sm text-foreground bg-card resize-none outline-none focus:ring-2 focus:ring-primary"
                            placeholder="Descreva o erro encontrado..."
                            value={errorText}
                            onChange={e => setErrorText(e.target.value)}
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
