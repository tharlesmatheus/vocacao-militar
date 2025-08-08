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
    const textoAE =
        (alternativas['A'] ?? "") + " " + (alternativas['B'] ?? "") + " " + (enunciado ?? "");

    if (
        letras.length === 2 &&
        /certo.*errado|errado.*certo|verdadeiro.*falso|falso.*verdadeiro|C\/E|V\/F/i.test(textoAE)
    ) {
        return "Certo ou Errado";
    }
    if (letras.length >= 3) {
        return "Multipla Escolha";
    }
    return "Multipla Escolha";
}

/**
 * Separa questões por marcadores comuns no início da linha ou do texto:
 * - "1)", "1.", "1-", "1–", "1—", "1:"
 * - "QUESTÃO 1", "Questão 1", "Questao 1", "Q 1", "Nº 1", "No 1"
 */
function separarQuestoes(texto: string): string[] {
    if (!texto) return [];

    const clean = texto.replace(/\r\n?/g, "\n");

    // Regex compacta (UMA linha). NADA de comentários dentro do literal.
    const marcadorRegex = /(^|\n)\s*(?:(?:QUEST[ÃA]O|Quest[ãa]o|Questao|Q|N[ºo]?)\s*\d{1,3}|\d{1,3}\s*[\)\.\-–—:])\s*/g;

    const starts: number[] = [];
    let m: RegExpExecArray | null;

    while ((m = marcadorRegex.exec(clean)) !== null) {
        const idx = m.index + (clean[m.index] === "\n" ? 1 : 0);
        starts.push(idx);
    }

    // Nenhum marcador → provavelmente 1 questão só
    if (starts.length === 0) {
        const unico = clean.trim();
        return unico.length > 0 ? [unico] : [];
    }

    // Recorta blocos entre marcadores consecutivos
    const blocos: string[] = [];
    for (let i = 0; i < starts.length; i++) {
        const ini = starts[i];
        const fim = i + 1 < starts.length ? starts[i + 1] : clean.length;
        const bloco = clean.slice(ini, fim).trim();
        if (bloco.length >= 20) blocos.push(bloco);
    }
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

            const questoesProntas: any[] = [];
            const falhas: any[] = [];

            // Processa sequencialmente para evitar saturar a API
            for (let [i, questaoTxt] of questoesSeparadas.entries()) {
                const prompt = PROMPT_PREFIX + questaoTxt;
                try {
                    const res = await fetch(GEMINI_URL, {
                        method: "POST",
                        headers: {
                            "Content-Type": "application/json",
                            "X-goog-api-key": GEMINI_API_KEY,
                        },
                        body: JSON.stringify({
                            contents: [{ parts: [{ text: prompt }] }],
                        }),
                    });

                    if (!res.ok) throw new Error(`Erro na IA (questão ${i + 1})`);

                    const data = await res.json();

                    let jsonStr =
                        (data?.candidates?.[0]?.content?.parts?.[0]?.text ??
                            data?.candidates?.[0]?.content?.text ??
                            ""
                        ).trim();

                    // Limpa cercas de markdown, se vierem
                    jsonStr = jsonStr.replace(/```json|```/g, "").trim();

                    // Tenta achar JSON mesmo se vier “embrulhado”
                    // Ex.: bla bla { ...json... } bla
                    const firstBrace = jsonStr.indexOf("{");
                    const lastBrace = jsonStr.lastIndexOf("}");
                    if (firstBrace !== -1 && lastBrace !== -1) {
                        jsonStr = jsonStr.slice(firstBrace, lastBrace + 1);
                    }

                    const obj = JSON.parse(jsonStr);

                    obj.modalidade = detectarModalidade(obj.alternativas, obj.enunciado);

                    // Validação mínima
                    if (!obj.enunciado || !obj.correta || !obj.alternativas) {
                        throw new Error("Faltou campo obrigatório");
                    }

                    questoesProntas.push(obj);
                } catch (e: any) {
                    falhas.push({
                        questao: i + 1,
                        erro: e?.message || "Erro inesperado",
                        texto: questaoTxt,
                    });
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

            setResultados([
                ...questoesProntas.map((q) => ({ status: "OK", ...q })),
                ...falhas.map((f) => ({ status: "ERRO", ...f })),
            ]);
        } catch (e: any) {
            setErro(e?.message || "Erro inesperado.");
        } finally {
            setLoading(false);
        }
    }

    return (
        <div className="bg-white rounded-2xl shadow-xl p-8 max-w-3xl mx-auto border border-[#e4e8f3] my-6">
            <h2 className="text-xl font-extrabold text-[#232939] mb-4 text-center">
                Cadastrar Múltiplas Questões (IA + Supabase)
            </h2>

            <textarea
                className="w-full h-40 p-2 border rounded mb-4"
                placeholder={`Cole várias questões, separadas por "1)", "1.", "1-", "1:", "QUESTÃO 3", etc...`}
                value={input}
                onChange={(e) => setInput(e.target.value)}
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
                        {resultados.filter((r) => r.status === "OK").length} salva(s) |{" "}
                        {resultados.filter((r) => r.status === "ERRO").length} falha(s)
                    </div>
                </div>
            )}

            <div className="mt-8 text-xs text-gray-400">Powered by Gemini API + Supabase</div>
        </div>
    );
}
