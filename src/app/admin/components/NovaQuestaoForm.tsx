"use client";
import React, { useState } from "react";
import { supabase } from "@/lib/supabaseClient";

export default function NovaQuestaoForm() {
    const [questao, setQuestao] = useState<any>({
        alternativas: {},
    });
    const [msg, setMsg] = useState("");

    async function handleNovaQuestao(e: React.FormEvent) {
        e.preventDefault();
        setMsg("");
        if (!questao.enunciado || !questao.correta || !questao.alternativas) {
            setMsg("Preencha todos os campos obrigatórios!");
            return;
        }
        const { error } = await supabase.from("questoes").insert([questao]);
        if (error) return setMsg("Erro ao adicionar questão: " + error.message);
        setMsg("Questão adicionada!");
        setQuestao({ alternativas: {} });
    }

    return (
        <div className="bg-white rounded-2xl p-6 shadow max-w-lg mx-auto">
            <h2 className="text-xl font-bold mb-4">Adicionar Nova Questão</h2>
            <form className="flex flex-col gap-3" onSubmit={handleNovaQuestao}>
                <input
                    required
                    placeholder="Instituição"
                    className="rounded px-4 py-2 border"
                    value={questao.instituicao || ""}
                    onChange={(e) =>
                        setQuestao({ ...questao, instituicao: e.target.value })
                    }
                />
                <input
                    required
                    placeholder="Cargo"
                    className="rounded px-4 py-2 border"
                    value={questao.cargo || ""}
                    onChange={(e) => setQuestao({ ...questao, cargo: e.target.value })}
                />
                <input
                    required
                    placeholder="Disciplina"
                    className="rounded px-4 py-2 border"
                    value={questao.disciplina || ""}
                    onChange={(e) =>
                        setQuestao({ ...questao, disciplina: e.target.value })
                    }
                />
                <input
                    required
                    placeholder="Assunto"
                    className="rounded px-4 py-2 border"
                    value={questao.assunto || ""}
                    onChange={(e) => setQuestao({ ...questao, assunto: e.target.value })}
                />
                <input
                    required
                    placeholder="Modalidade"
                    className="rounded px-4 py-2 border"
                    value={questao.modalidade || ""}
                    onChange={(e) =>
                        setQuestao({ ...questao, modalidade: e.target.value })
                    }
                />
                <input
                    required
                    placeholder="Banca"
                    className="rounded px-4 py-2 border"
                    value={questao.banca || ""}
                    onChange={(e) => setQuestao({ ...questao, banca: e.target.value })}
                />
                <textarea
                    required
                    placeholder="Enunciado"
                    className="rounded px-4 py-2 border"
                    value={questao.enunciado || ""}
                    onChange={(e) =>
                        setQuestao({ ...questao, enunciado: e.target.value })
                    }
                />
                <div className="flex flex-col gap-1">
                    <label className="font-semibold">Alternativas</label>
                    {["A", "B", "C", "D", "E"].map((letra) => (
                        <input
                            key={letra}
                            placeholder={`Alternativa ${letra}`}
                            className="rounded px-4 py-2 border"
                            value={questao.alternativas?.[letra] || ""}
                            onChange={(e) =>
                                setQuestao({
                                    ...questao,
                                    alternativas: { ...questao.alternativas, [letra]: e.target.value },
                                })
                            }
                        />
                    ))}
                </div>
                <input
                    required
                    placeholder="Alternativa Correta (A, B, C, D ou E)"
                    className="rounded px-4 py-2 border"
                    value={questao.correta || ""}
                    onChange={(e) =>
                        setQuestao({ ...questao, correta: e.target.value.toUpperCase() })
                    }
                />
                <textarea
                    placeholder="Explicação"
                    className="rounded px-4 py-2 border"
                    value={questao.explicacao || ""}
                    onChange={(e) =>
                        setQuestao({ ...questao, explicacao: e.target.value })
                    }
                />
                <button
                    type="submit"
                    className="bg-blue-600 text-white rounded font-bold py-2 hover:bg-blue-700 transition"
                >
                    Adicionar
                </button>
                {msg && <div className="text-green-700 font-bold mt-2">{msg}</div>}
            </form>
        </div>
    );
}
