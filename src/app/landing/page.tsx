'use client';

import React, { useState } from "react";
import { supabase } from "@/lib/supabaseClient";

const GEMINI_API_KEY = "AIzaSyC-3CWT9uBxdEw8qdmZ9Vma0F6-iV0To88";
const GEMINI_URL = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent";

// PROMPT para Gemini: padroniza explicação se existir, senão gera.
const PROMPT_PREFIX = `
Receba a seguinte questão de concurso e extraia os campos:
instituicao, cargo, disciplina, assunto, modalidade, banca, enunciado, alternativas, correta, explicacao
Retorne como objeto JSON, exemplo:
{
  "instituicao": "...",
  "cargo": "...",
  "disciplina": "...",
  "assunto": "...",
  "modalidade": "...",
  "banca": "...",
  "enunciado": "...",
  "alternativas": { "A": "...", "B": "...", "C": "...", "D": "...", "E": "..." },
  "correta": "...",
  "explicacao": "..."
}
Se a questão já possuir explicação ou comentário, REESCREVA esse comentário de forma clara, didática e formal, corrigindo eventuais erros, mas sem inventar novas informações.
Se não houver explicação, GERE uma explicação didática para o gabarito.
Apenas responda com o JSON. NÃO inclua explicação extra, markdown, texto antes ou depois.

Questão:
`;

// Força a modalidade a ser só "Multipla Escolha" ou "Certo ou Errado"
function detectarModalidade(alternativas: any, enunciado: string): string {
    if (!alternativas) return "Multipla Escolha";
    const letras = Object.keys(alternativas).filter(l => alternativas[l]?.trim());
    // Se só tem A e B, e fala em certo/errado/verdadeiro/falso, ou alternativas são "Certo", "Errado"...
    if (letras.length === 2 && (
        /certo.*errado|errado.*certo|verdadeiro.*falso|falso.*verdadeiro/i.test(enunciado) ||
        (alternativas['A'] && alternativas['B'] &&
            (/certo|errado|verdadeiro|falso/i.test(alternativas['A'] + alternativas['B'])))
    )) {
        return "Certo ou Errado";
    }
    // Se tem pelo menos 3 opções (A, B, C...) já trata como multipla escolha
    if (letras.length >= 3) {
        return "Multipla Escolha";
    }
    // Valor padrão
    return "Multipla Escolha";
}

export default function NovaQuestaoGemini() {
    const [input, setInput] = useState("");
    const [loading, setLoading] = useState(false);
    const [erro, setErro] = useState("");
    const [msg, setMsg] = useState("");
    const [respostaJson, setRespostaJson] = useState<any>(null);

    async function handleProcessarQuestao() {
        setLoading(true);
        setErro("");
        setMsg("");
        setRespostaJson(null);
        try {
            const res = await fetch(GEMINI_URL, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "X-goog-api-key": GEMINI_API_KEY,
                },
                body: JSON.stringify({
                    contents: [{ parts: [{ text: PROMPT_PREFIX + input }] }]
                })
            });

            if (!res.ok) throw new Error("Falha ao chamar a API do Gemini.");
            const data = await res.json();
            let jsonStr = (
                data.candidates?.[0]?.content?.parts?.[0]?.text ||
                data.candidates?.[0]?.content?.text ||
                ""
            ).trim();

            // Limpa possíveis blocos markdown
            jsonStr = jsonStr.replace(/```json|```/g, "").trim();
            let obj = null;
            try {
                obj = JSON.parse(jsonStr);
            } catch {
                setErro("Erro ao ler resposta da IA. Tente editar a questão e tente novamente.");
                setLoading(false);
                return;
            }

            // FORÇA modalidade para nunca ser outro valor além dos permitidos:
            obj.modalidade = detectarModalidade(obj.alternativas, obj.enunciado);

            setRespostaJson(obj);

            // Validação básica dos campos obrigatórios
            if (!obj.enunciado || !obj.correta || !obj.alternativas) {
                setErro("Faltou campo obrigatório na resposta da IA!");
                setLoading(false);
                return;
            }

            // Insere no Supabase!
            const { error } = await supabase.from("questoes").insert([obj]);
            if (error) {
                setErro("Erro ao inserir no banco: " + error.message);
                setLoading(false);
                return;
            }
            setMsg("Questão cadastrada com sucesso!");
            setInput("");
        } catch (e: any) {
            setErro(e.message || "Erro inesperado.");
        }
        setLoading(false);
    }

    return (
        <div className="bg-white rounded-2xl shadow-xl p-8 max-w-2xl mx-auto border border-[#e4e8f3] my-6">
            <h2 className="text-xl font-extrabold text-[#232939] mb-4 text-center">Cadastrar Questão Automática (com Gemini)</h2>
            <textarea
                className="w-full h-32 p-2 border rounded mb-4"
                placeholder="Cole a questão aqui (enunciado, alternativas, correta, explicação se quiser)..."
                value={input}
                onChange={e => setInput(e.target.value)}
            />
            <button
                className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-semibold"
                onClick={handleProcessarQuestao}
                disabled={loading || !input}
            >
                {loading ? "Processando..." : "Gerar e Cadastrar"}
            </button>
            {erro && <div className="text-red-600 mt-4">{erro}</div>}
            {msg && <div className="text-green-700 mt-4">{msg}</div>}
            {respostaJson && (
                <div className="bg-gray-100 rounded-xl p-4 mt-6 text-xs font-mono whitespace-pre-wrap">
                    <b>Resposta da IA (JSON):</b>
                    <pre>{JSON.stringify(respostaJson, null, 2)}</pre>
                </div>
            )}
            <div className="mt-8 text-xs text-gray-400">
                Powered by Gemini API + Supabase
            </div>
        </div>
    );
}
