"use client";
import React, { useState, useRef } from "react";
import { supabase } from "../lib/supabaseClient";

type Option = { letter: string; text: string };

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

    const textareaRef = useRef<HTMLTextAreaElement>(null);

    React.useEffect(() => {
        if (showModal) {
            setTimeout(() => textareaRef.current?.focus(), 100);
        }
    }, [showModal]);

    // Função de compartilhamento
    const compartilharQuestao = () => {
        // Monta o texto de compartilhamento
        const texto =
            `${statement}

${options.map(opt => `${opt.letter}) ${opt.text}`).join('\n')}

Conheça a melhor plataforma de questões comentadas para concursos policiais:
https://vocacaomilitar.com.br`;

        if (navigator.share) {
            // Usa a API Web Share se disponível
            navigator.share({
                title: "Questão para Concursos Policiais",
                text: texto,
                url: "https://vocacaomilitar.com.br"
            });
        } else {
            // Fallback: copia o texto para área de transferência
            navigator.clipboard.writeText(texto);
            alert("Texto copiado para a área de transferência!");
        }
    };

    // Notificar erro
    const enviarErro = async () => {
        if (!errorText.trim()) return;
        setLoadingErro(true);

        const novoErro = {
            mensagem: errorText,
            data: new Date().toISOString()
        };
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

        const novoComentario = {
            texto: comentarioText,
            data: new Date().toISOString()
        };
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
                {options.map((opt) => {
                    const isSelected = selected === opt.letter;
                    const isCorrect = correct === opt.letter;
                    let btnClass =
                        "flex items-center w-full px-4 py-2 rounded-lg text-left font-medium border transition-all text-[15px]";
                    if (showResult && isSelected) {
                        btnClass += isCorrect
                            ? " bg-green-50 border-green-600 text-green-900"
                            : " bg-red-50 border-red-400 text-red-900";
                    } else if (isSelected) {
                        btnClass += " bg-[#e9effd] border-[#6a88d7] text-[#232939]";
                    } else {
                        btnClass += " bg-white border-[#e3e8f3] hover:bg-[#f6faff]";
                    }
                    return (
                        <button
                            key={opt.letter}
                            type="button"
                            className={btnClass}
                            disabled={showResult}
                            onClick={() => setSelected(opt.letter)}
                        >
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
                                {opt.letter}
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
                    onClick={() => setShowResult(true)}
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

            {/* Explicação */}
            {showResult && selected && (
                <div className="bg-[#e8f7ea] rounded-lg p-4 mt-2 text-green-900 text-sm">
                    <span className="font-bold text-green-700">Explicação:</span>
                    <p className="mt-1">{explanation}</p>
                </div>
            )}

            {/* Comentários - Expande */}
            {showComentarios && (
                <div className="bg-[#f3f5fa] rounded-xl px-4 py-3 mt-3 text-[#232939]">
                    <div className="font-bold mb-2">Comentários</div>
                    {/* Caixa para novo comentário */}
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
                    {/* Lista de comentários */}
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
