"use client";
import React, { useState, useRef } from "react";
import { supabase } from "../lib/supabaseClient";

// Tesoura SVG (inline, para não depender de biblioteca externa)
function TesouraIcon({ className = "" }: { className?: string }) {
    return (
        <svg viewBox="0 0 20 20" fill="none" width={22} height={22}
            className={className + " pointer-events-none"}
        >
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

    const textareaRef = useRef<HTMLTextAreaElement>(null);

    React.useEffect(() => {
        if (showModal) setTimeout(() => textareaRef.current?.focus(), 100);
    }, [showModal]);

    // Eliminar/restaurar alternativa
    const toggleEliminada = (idx: number) => {
        setEliminadas((prev) =>
            prev.includes(idx)
                ? prev.filter((i) => i !== idx)
                : [...prev, idx]
        );
    };

    // Função de compartilhamento
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

    // Notificar erro
    const enviarErro = async () => {
        if (!errorText.trim()) return;
        setLoadingErro(true);
        const novoErro = { mensagem: errorText, data: new Date().toISOString() };
        const novosErros = [...(erros || []), novoErro];
        const { error } = await supabase
            .from("questoes")
            .update({ erros: novosErros })
            .eq("id", id);
        setLoadingErro(false);
        if (!error) {
            setShowModal(false);
            setErrorText("");
            if (onNotificarErro) onNotificarErro(errorText);
        } else {
            alert("Erro ao salvar notificação.");
        }
    };

    // Adicionar novo comentário
    const enviarComentario = async () => {
        if (!comentarioText.trim()) return;
        setLoadingComentario(true);
        const novoComentario = { texto: comentarioText, data: new Date().toISOString() };
        const novosComentarios = [...(comentarios || []), novoComentario];
        const { error } = await supabase
            .from("questoes")
            .update({ comentarios: novosComentarios })
            .eq("id", id);
        setLoadingComentario(false);
        if (!error) {
            setComentarioText("");
            if (onNovoComentario) onNovoComentario(comentarioText);
        } else {
            alert("Erro ao salvar comentário.");
        }
    };

    // --------- Lógica para exibir alternativas ---------
    const qtdAlternativas = options.length;
    const letras = ["A", "B", "C", "D", "E"];

    return (
        <div className="bg-white rounded-2xl p-7 mb-6 shadow border border-[#e3e8f3] max-w-6xl w-full mx-auto transition-all font-inter">
            {/* Tags */}
            <div className="flex flex-wrap gap-2 mb-5">
                {tags.map((tag, i) => (
                    <span
                        key={i}
                        className="bg-[#f3f5fa] text-[#425179] text-xs font-semibold rounded px-3 py-1"
                    >
                        {tag}
                    </span>
                ))}
            </div>
            {/* Enunciado */}
            <h2 className="text-base sm:text-lg font-bold mb-5 text-[#181F2C]">
                {statement}
            </h2>
            {/* Alternativas */}
            <div className="flex flex-col gap-2 mb-5">
                {options.map((opt, idx) => {
                    const value = opt.letter || letras[idx];
                    const isSelected = selected === value;
                    const isCorrect = correct === value;
                    const eliminada = eliminadas.includes(idx);

                    // Lógica para mostrar contorno verde na correta se o usuário errar:
                    let btnClass =
                        "flex items-center w-full px-4 py-2 rounded-lg text-left font-medium border transition-all text-[15px] relative group";

                    if (showResult) {
                        if (isSelected && selected !== correct) {
                            // O usuário ERROU esta opção
                            btnClass += " bg-red-50 border-red-400 text-red-900";
                        } else if (isCorrect && selected !== correct) {
                            // Mostrar contorno verde NA CORRETA, pois o usuário ERROU
                            btnClass += " bg-green-50 border-green-600 text-green-900";
                        } else if (isSelected && selected === correct) {
                            // Acertou: só verde na selecionada
                            btnClass += " bg-green-50 border-green-600 text-green-900";
                        } else {
                            btnClass += " bg-white border-[#e3e8f3]";
                        }
                    } else if (isSelected) {
                        btnClass += " bg-[#e9effd] border-[#6a88d7] text-[#232939]";
                    } else {
                        btnClass += " bg-white border-[#e3e8f3] hover:bg-[#f6faff]";
                    }
                    if (eliminada) {
                        btnClass += " text-gray-400 opacity-60 line-through";
                    }
                    return (
                        <button
                            key={value}
                            type="button"
                            className={btnClass}
                            disabled={showResult}
                            onClick={() => setSelected(value)}
                        >
                            {/* Botão eliminar */}
                            <span
                                onClick={e => { e.stopPropagation(); toggleEliminada(idx); }}
                                title={eliminada ? "Restaurar alternativa" : "Eliminar alternativa"}
                                className={`mr-3 transition cursor-pointer rounded-full p-1 hover:bg-gray-100 border border-transparent hover:border-gray-200
                                        ${eliminada ? "opacity-40" : ""}
                                    `}
                            >
                                <TesouraIcon />
                            </span>
                            <span className={`mr-3 w-7 h-7 flex items-center justify-center rounded-full text-sm font-bold
                                    ${showResult && isSelected
                                    ? isCorrect
                                        ? "bg-green-600 text-white"
                                        : "bg-red-500 text-white"
                                    : isSelected
                                        ? "bg-[#6a88d7] text-white"
                                        : "bg-[#f3f5fa] text-[#232939]"
                                }
                                `}>
                                {value}
                            </span>
                            <span className="text-[#232939] text-[15px]">{opt.text}</span>
                        </button>
                    );
                })}
            </div>
            {/* Ações */}
            <div className="flex flex-wrap gap-2 mb-4">
                <button
                    className="bg-[#6a88d7] hover:bg-[#5272b4] text-white font-bold py-2 px-5 rounded-xl text-sm transition"
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
                    className="bg-white border border-[#e3e8f3] text-[#425179] py-2 px-5 rounded-xl text-sm transition hover:bg-[#f3f5fa] font-medium"
                    type="button"
                    onClick={() => setShowComentarios(v => !v)}
                >
                    Comentários ({comentarios?.length ?? 0})
                </button>
                <button
                    className="bg-white border border-[#e3e8f3] text-[#425179] py-2 px-5 rounded-xl text-sm transition hover:bg-[#f3f5fa] font-medium"
                    type="button"
                    onClick={compartilharQuestao}
                >
                    Compartilhar
                </button>
                <button
                    className="bg-white border border-[#ffd3c4] text-[#e2735e] py-2 px-5 rounded-xl text-sm transition hover:bg-[#fff6f5] font-medium"
                    type="button"
                    onClick={() => setShowModal(true)}
                >
                    Notificar Erro
                </button>
                {showResult && (
                    <button
                        className="ml-2 text-xs text-[#6a88d7] underline"
                        onClick={() => {
                            setShowResult(false);
                            setSelected(null);
                        }}
                    >
                        Próxima Questão
                    </button>
                )}
            </div>

            {/* Explicação + alternativa correta */}
            {showResult && selected && (
                <div className="bg-[#e8f7ea] rounded-lg p-4 mt-2 text-green-900 text-sm">
                    {/* Mostra alternativa correta se errou */}
                    {selected !== correct && (
                        <div className="mb-2 text-red-700 font-semibold">
                            Resposta correta:{" "}
                            <span className="bg-green-600 text-white px-2 py-1 rounded-lg font-bold mx-1">{correct}</span>
                            - {
                                options.find((opt, idx) => (opt.letter || letras[idx]) === correct)?.text
                            }
                        </div>
                    )}
                    <span className="font-bold text-green-700">Explicação:</span>
                    <p className="mt-1">{explanation}</p>
                </div>
            )}

            {/* Comentários */}
            {showComentarios && (
                <div className="bg-[#f3f5fa] rounded-xl px-4 py-3 mt-3 text-[#232939]">
                    <div className="font-bold mb-2">Comentários</div>
                    <div className="mb-3 flex items-end gap-2">
                        <textarea
                            rows={2}
                            className="w-full border border-[#e3e8f3] rounded-lg px-3 py-2 text-sm text-[#232939] bg-[#f9fafb] resize-none outline-none focus:ring-2 focus:ring-[#6a88d7]"
                            placeholder="Digite um comentário..."
                            value={comentarioText}
                            onChange={e => setComentarioText(e.target.value)}
                            disabled={loadingComentario}
                        />
                        <button
                            className="bg-[#6a88d7] hover:bg-[#5272b4] text-white font-bold px-4 py-2 rounded-lg text-sm transition"
                            onClick={enviarComentario}
                            disabled={loadingComentario || !comentarioText.trim()}
                        >
                            {loadingComentario ? "Enviando..." : "Comentar"}
                        </button>
                    </div>
                    {comentarios?.length ? (
                        <ul className="flex flex-col gap-2">
                            {comentarios.map((com, i) => (
                                <li key={i} className="bg-white rounded-lg px-3 py-2 border text-sm">
                                    {com?.texto || com?.mensagem || JSON.stringify(com)}
                                    {com?.data && (
                                        <span className="block text-[11px] text-gray-400 mt-1">
                                            {new Date(com.data).toLocaleString()}
                                        </span>
                                    )}
                                </li>
                            ))}
                        </ul>
                    ) : (
                        <div className="text-sm text-[#65749b]">Nenhum comentário ainda.</div>
                    )}
                </div>
            )}

            {/* MODAL NOTIFICAR ERRO */}
            {showModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm">
                    <div className="bg-white rounded-xl p-7 max-w-md w-full shadow-2xl border border-[#e3e8f3] relative">
                        <button
                            onClick={() => setShowModal(false)}
                            className="absolute top-2 right-2 rounded-full hover:bg-[#f3f5fa] p-1 text-[#425179] font-bold"
                            aria-label="Fechar"
                        >
                            ×
                        </button>
                        <h3 className="font-bold text-lg text-[#232939] mb-3">
                            Notificar erro na questão
                        </h3>
                        <textarea
                            ref={textareaRef}
                            rows={4}
                            className="w-full border border-[#e3e8f3] rounded-lg px-3 py-2 mb-3 text-sm text-[#232939] bg-[#f9fafb] resize-none outline-none focus:ring-2 focus:ring-[#6a88d7]"
                            placeholder="Descreva o erro encontrado..."
                            value={errorText}
                            onChange={e => setErrorText(e.target.value)}
                        />
                        <button
                            onClick={enviarErro}
                            className="bg-[#6a88d7] hover:bg-[#5272b4] text-white font-bold px-5 py-2 rounded-lg text-sm w-full transition"
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
