'use client';

import React, { useState } from "react";
import { supabase } from "@/lib/supabaseClient";

const GEMINI_API_KEY = "AIzaSyC-3CWT9uBxdEw8qdmZ9Vma0F6-iV0To88";
const GEMINI_URL = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent";

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

// Detecção de modalidade (sempre força "Multipla Escolha" ou "Certo ou Errado")
function detectarModalidade(alternativas: any, enunciado: string): string {
    if (!alternativas) return "Multipla Escolha";
    const letras = Object.keys(alternativas).filter(l => alternativas[l]?.trim());
    if (letras.length === 2 && (
        /certo.*errado|errado.*certo|verdadeiro.*falso|falso.*verdadeiro/i.test(enunciado) ||
        (alternativas['A'] && alternativas['B'] &&
            (/certo|errado|verdadeiro|falso/i.test(alternativas['A'] + alternativas['B'])))
    )) {
        return "Certo ou Errado";
    }
    if (letras.length >= 3) {
        return "Multipla Escolha";
    }
    return "Multipla Escolha";
}

// Função para separar cada questão pelo padrão mais comum (ajuste o regex se precisar!)
function separarQuestoes(texto: string): string[] {
    // Tenta dividir por "1)", "2)", ... ou "QUESTÃO 1", etc.
    const blocos = texto
        .split(/(?:^|\n)(?:\d{1,2}\)|QUESTÃO ?\d{1,2}|Questão ?\d{1,2})[\.: \-]*/i)
        .map(q => q.trim())
        .filter(q => q.length > 20); // ignora blocos muito curtos
    return blocos;
}

export default function NovaQuestaoGeminiLote() {
    const [input, setInput] = useState("");
    const [loading, setLoading] = useState(false);
    const [erro, setErro] = useState("");
    const [msg, setMsg] = useState("");
    const [resultados, setResultados] = useState<any[]>([]);

    async function handleProcessarLote() {
        setLoading(true);
        setErro("");
        setMsg("");
        setResultados([]);
        try {
            const questoesSeparadas = separarQuestoes(input);

            if (!questoesSeparadas.length) {
                setErro("Não foi possível detectar múltiplas questões. Confira o formato!");
                setLoading(false);
                return;
            }

            let questoesProntas: any[] = [];
            let falhas: any[] = [];

            // Processa uma a uma (pode ser paralelizado, mas para não sobrecarregar a API, vai sequencial)
            for (let [i, questaoTxt] of questoesSeparadas.entries()) {
                const prompt = PROMPT_PREFIX + questaoTxt;
                let obj = null;
                try {
                    const res = await fetch(GEMINI_URL, {
                        method: "POST",
                        headers: {
                            "Content-Type": "application/json",
                            "X-goog-api-key": GEMINI_API_KEY,
                        },
                        body: JSON.stringify({
                            contents: [{ parts: [{ text: prompt }] }]
                        })
                    });
                    if (!res.ok) throw new Error(`Erro na IA (questão ${i + 1})`);
                    const data = await res.json();
                    let jsonStr = (
                        data.candidates?.[0]?.content?.parts?.[0]?.text ||
                        data.candidates?.[0]?.content?.text ||
                        ""
                    ).trim();
                    jsonStr = jsonStr.replace(/```json|```/g, "").trim();
                    obj = JSON.parse(jsonStr);
                    obj.modalidade = detectarModalidade(obj.alternativas, obj.enunciado);
                    // Validação mínima
                    if (!obj.enunciado || !obj.correta || !obj.alternativas) {
                        throw new Error("Faltou campo obrigatório");
                    }
                    questoesProntas.push(obj);
                } catch (e: any) {
                    falhas.push({ questao: i + 1, erro: e.message || "Erro inesperado", texto: questaoTxt });
                }
            }

            // Salva as válidas no banco
            if (questoesProntas.length) {
                const { error } = await supabase.from("questoes").insert(questoesProntas);
                if (error) {
                    setErro("Erro ao salvar no banco: " + error.message);
                    setLoading(false);
                    return;
                }
                setMsg(`Foram cadastradas ${questoesProntas.length} questão(ões) com sucesso!`);
            } else {
                setMsg("");
            }
            setResultados([...questoesProntas.map((q, i) => ({ status: "OK", ...q })),
            ...falhas.map(f => ({ status: "ERRO", ...f }))]);
        } catch (e: any) {
            setErro(e.message || "Erro inesperado.");
        }
        setLoading(false);
    }

    return (
        <div className="bg-white rounded-2xl shadow-xl p-8 max-w-3xl mx-auto border border-[#e4e8f3] my-6">
            <h2 className="text-xl font-extrabold text-[#232939] mb-4 text-center">Cadastrar Múltiplas Questões (IA + Supabase)</h2>
            <textarea
                className="w-full h-40 p-2 border rounded mb-4"
                placeholder={`Cole várias questões, separadas por "1)", "2)", "QUESTÃO 3", etc...`}
                value={input}
                onChange={e => setInput(e.target.value)}
            />
            <button
                className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-semibold"
                onClick={handleProcessarLote}
                disabled={loading || !input}
            >
                {loading ? "Processando..." : "Processar e Cadastrar Todas"}
            </button>
            {erro && <div className="text-red-600 mt-4">{erro}</div>}
            {msg && <div className="text-green-700 mt-4">{msg}</div>}
            {resultados.length > 0 && (
                <div className="bg-gray-100 rounded-xl p-4 mt-6 text-xs font-mono whitespace-pre-wrap max-h-[360px] overflow-auto">
                    <b>Resultado:</b>
                    <pre>{JSON.stringify(resultados, null, 2)}</pre>
                    <div className="mt-3 text-gray-500">
                        {resultados.filter(r => r.status === "OK").length} salva(s) | {resultados.filter(r => r.status === "ERRO").length} falha(s)
                    </div>
                </div>
            )}
            <div className="mt-8 text-xs text-gray-400">
                Powered by Gemini API + Supabase
            </div>
        </div>
    );
}
