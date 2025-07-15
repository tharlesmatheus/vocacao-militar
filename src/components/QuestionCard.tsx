"use client";
import React, { useState, useRef } from "react";

type Option = { letter: string; text: string };

interface QuestionCardProps {
    tags: string[];
    statement: string;
    options: Option[];
    correct: string;
    explanation: string;
}

export function QuestionCard({
    tags,
    statement,
    options,
    correct,
    explanation,
}: QuestionCardProps) {
    const [selected, setSelected] = useState<string | null>(null);
    const [showResult, setShowResult] = useState(false);
    const [showModal, setShowModal] = useState(false);
    const [errorText, setErrorText] = useState("");
    const textareaRef = useRef<HTMLTextAreaElement>(null);

    React.useEffect(() => {
        if (showModal) {
            setTimeout(() => textareaRef.current?.focus(), 100);
        }
    }, [showModal]);

    return (
        <div className="bg-white dark:bg-[#181F2C] rounded-2xl p-7 mb-6 shadow border border-[#e3e8f3] dark:border-[#232939] max-w-6xl w-full mx-auto transition-all font-inter">
            {/* Tags */}
            <div className="flex flex-wrap gap-2 mb-5">
                {tags.map((tag, i) => (
                    <span
                        key={i}
                        className="bg-[#f3f5fa] dark:bg-[#22273a] text-[#425179] dark:text-white text-xs font-semibold rounded px-3 py-1"
                    >
                        {tag}
                    </span>
                ))}
            </div>
            {/* Enunciado */}
            <h2 className="text-base sm:text-lg font-bold mb-5 text-[#181F2C] dark:text-white">
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
                            ? " bg-green-50 border-green-600 text-green-900 dark:bg-[#172e22] dark:text-white dark:border-green-500"
                            : " bg-red-50 border-red-400 text-red-900 dark:bg-[#291919] dark:text-white dark:border-red-500";
                    } else if (isSelected) {
                        btnClass += " bg-[#e9effd] border-[#6a88d7] text-[#232939] dark:bg-[#243155] dark:border-[#6a88d7] dark:text-white";
                    } else {
                        btnClass += " bg-white dark:bg-[#1d2233] border-[#e3e8f3] dark:border-[#232939] hover:bg-[#f6faff] dark:hover:bg-[#232939]";
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
                                        : "bg-[#f3f5fa] dark:bg-[#22273a] text-[#232939] dark:text-white"
                                }
                            `}>
                                {opt.letter}
                            </span>
                            <span className="text-[#232939] dark:text-white text-[15px]">{opt.text}</span>
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
                    className="bg-white dark:bg-[#181F2C] border border-[#e3e8f3] dark:border-[#232939] text-[#425179] dark:text-white py-2 px-5 rounded-xl text-sm transition hover:bg-[#f3f5fa] dark:hover:bg-[#232939] font-medium"
                    type="button"
                >
                    Comentários (12)
                </button>
                <button
                    className="bg-white dark:bg-[#181F2C] border border-[#e3e8f3] dark:border-[#232939] text-[#425179] dark:text-white py-2 px-5 rounded-xl text-sm transition hover:bg-[#f3f5fa] dark:hover:bg-[#232939] font-medium"
                    type="button"
                >
                    Compartilhar
                </button>
                <button
                    className="bg-white dark:bg-[#181F2C] border border-[#ffd3c4] text-[#e2735e] py-2 px-5 rounded-xl text-sm transition hover:bg-[#fff6f5] dark:hover:bg-[#291919] font-medium"
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
                <div className="bg-[#e8f7ea] dark:bg-[#282e3d] rounded-lg p-4 mt-2 text-green-900 dark:text-white text-sm">
                    <span className="font-bold text-green-700 dark:text-green-400">Explicação:</span>
                    <p className="mt-1">{explanation}</p>
                </div>
            )}

            {/* MODAL NOTIFICAR ERRO */}
            {showModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm">
                    <div className="bg-white dark:bg-[#232939] rounded-xl p-7 max-w-md w-full shadow-2xl border border-[#e3e8f3] dark:border-[#444] relative">
                        <button
                            onClick={() => setShowModal(false)}
                            className="absolute top-2 right-2 rounded-full hover:bg-[#f3f5fa] dark:hover:bg-[#29314c] p-1 text-[#425179] dark:text-white font-bold"
                            aria-label="Fechar"
                        >
                            ×
                        </button>
                        <h3 className="font-bold text-lg text-[#232939] dark:text-white mb-3">
                            Notificar erro na questão
                        </h3>
                        <textarea
                            ref={textareaRef}
                            rows={4}
                            className="w-full border border-[#e3e8f3] dark:border-[#444] rounded-lg px-3 py-2 mb-3 text-sm text-[#232939] dark:text-white bg-[#f9fafb] dark:bg-[#181F2C] resize-none outline-none focus:ring-2 focus:ring-[#6a88d7]"
                            placeholder="Descreva o erro encontrado..."
                            value={errorText}
                            onChange={e => setErrorText(e.target.value)}
                        />
                        <button
                            onClick={() => {
                                setShowModal(false);
                                setErrorText("");
                            }}
                            className="bg-[#6a88d7] hover:bg-[#5272b4] text-white font-bold px-5 py-2 rounded-lg text-sm w-full transition"
                            disabled={!errorText.trim()}
                        >
                            Enviar Notificação
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
