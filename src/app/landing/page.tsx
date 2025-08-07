'use client';

import React, { useState } from "react";

const GEMINI_API_KEY = "AIzaSyC-3CWT9uBxdEw8qdmZ9Vma0F6-iV0To88";
const GEMINI_URL = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent";

const PROMPT_PREFIX = `
Sua tarefa é receber uma questão de concurso (em português), extrair os campos especificados e retornar exatamente uma linha CSV com esses campos, na ordem e formato abaixo. NÃO inclua cabeçalho, NÃO explique nada, NÃO pule linhas. Apenas retorne a linha CSV conforme o exemplo.
Os campos são: instituicao,cargo,disciplina,assunto,modalidade,banca,enunciado,alternativas,correta,explicacao
- TODOS os campos devem estar entre aspas duplas (inclusive alternativas e explicacao).
- O campo "alternativas" deve estar em formato JSON com aspas duplas escapadas, exemplo: "{""A"":""Texto A"",""B"":""Texto B"",""C"":""Texto C"",""D"":""Texto D"",""E"":""Texto E""}"
- Se já houver explicação, use-a; se não houver, gere uma explicação didática.
- NÃO inclua quebras de linha, texto extra ou espaços fora dos campos.
- NÃO inclua cabeçalho, nem qualquer outra linha além da linha CSV.
- TODOS os campos devem ser preenchidos, mesmo que algum texto seja curto.

Agora, processe a questão abaixo e retorne apenas uma linha CSV como no exemplo acima.

`;

export default function Page() {
    const [input, setInput] = useState("");
    const [csv, setCsv] = useState("");
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");

    async function handleGenerate() {
        setLoading(true);
        setError("");
        setCsv("");
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

            if (!res.ok) {
                throw new Error("Falha ao chamar a API do Gemini.");
            }
            const data = await res.json();
            const csvText =
                data.candidates?.[0]?.content?.parts?.[0]?.text ||
                data.candidates?.[0]?.content?.text ||
                "Erro ao obter resposta.";

            setCsv(csvText.trim());
        } catch (e: any) {
            setError(e.message || "Erro inesperado.");
        }
        setLoading(false);
    }

    return (
        <main className="flex flex-col items-center justify-center min-h-screen p-4 bg-gray-100">
            <div className="w-full max-w-2xl bg-white shadow-xl rounded-2xl p-6">
                <h1 className="text-2xl font-bold mb-4">Gerador de CSV para Supabase (Questões + Gemini)</h1>
                <textarea
                    className="w-full h-40 p-2 border rounded mb-4"
                    placeholder="Cole a questão aqui (com enunciado, alternativas, etc)..."
                    value={input}
                    onChange={e => setInput(e.target.value)}
                />
                <button
                    className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-semibold"
                    onClick={handleGenerate}
                    disabled={loading || !input}
                >
                    {loading ? "Gerando..." : "Gerar CSV"}
                </button>
                {error && (
                    <div className="text-red-600 mt-4">{error}</div>
                )}
                {csv && (
                    <div className="mt-6">
                        <label className="block font-semibold mb-2">Linha CSV gerada:</label>
                        <textarea
                            className="w-full h-32 p-2 border rounded bg-gray-50"
                            value={csv}
                            readOnly
                            onFocus={e => e.target.select()}
                        />
                        <div className="text-xs text-gray-500 mt-2">
                            Copie e cole essa linha no seu CSV ou no Supabase.
                        </div>
                    </div>
                )}
            </div>
            <div className="mt-8 text-xs text-gray-400">
                Powered by Gemini API | Next.js | by ChatGPT
            </div>
        </main>
    );
}
