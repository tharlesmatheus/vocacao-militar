'use client';

import React, { useState } from "react";
import { supabase } from "@/lib/supabaseClient";

// ... seu PROMPT_PREFIX e funções detectarModalidade/separarQuestoes exatamente como estão

const GEMINI_API_KEY = "AIzaSyC-3CWT9uBxdEw8qdmZ9Vma0F6-iV0To88";
const GEMINI_URL = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent";

const PROMPT_PREFIX = `
// ... (mantenha seu prompt original aqui)
`;

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

function separarQuestoes(texto: string): string[] {
    const blocos = texto
        .split(/(?:^|\n)(?:\d{1,2}\)|QUESTÃO ?\d{1,2}|Questão ?\d{1,2})[\.: \-]*/i)
        .map(q => q.trim())
        .filter(q => q.length > 20);
    return blocos;
}

export default function NovaQuestaoGeminiLote() {
    const [input, setInput] = useState("");
    const [loading, setLoading] = useState(false);
    const [erro, setErro] = useState("");
    const [msg, setMsg] = useState("");
    const [resultados, setResultados] = useState<any[]>([]);
    const [pdfLoading, setPdfLoading] = useState(false);

    async function handleProcessarLote() {
        setLoading(true);
        setErro(""); setMsg(""); setResultados([]);
        try {
            const questoesSeparadas = separarQuestoes(input);

            if (!questoesSeparadas.length) {
                setErro("Não foi possível detectar múltiplas questões. Confira o formato!");
                setLoading(false);
                return;
            }

            let questoesProntas: any[] = [];
            let falhas: any[] = [];

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
                    if (!obj.enunciado || !obj.correta || !obj.alternativas) {
                        throw new Error("Faltou campo obrigatório");
                    }
                    questoesProntas.push(obj);
                } catch (e: any) {
                    falhas.push({ questao: i + 1, erro: e.message || "Erro inesperado", texto: questaoTxt });
                }
            }

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

    // NOVO: upload PDF
    async function handlePDF(e: React.FormEvent) {
        e.preventDefault();
        setPdfLoading(true);
        setErro(""); setMsg(""); setResultados([]);
        const fileInput = (e.target as any).arquivo;
        if (!fileInput?.files?.[0]) {
            setErro("Selecione um PDF!");
            setPdfLoading(false);
            return;
        }
        const formData = new FormData();
        formData.append("file", fileInput.files[0]);
        const resp = await fetch("/api/pdf-to-questoes", {
            method: "POST",
            body: formData,
        });
        const json = await resp.json();
        if (json.error) {
            setErro("Erro: " + json.error);
            setPdfLoading(false);
            return;
        }
        if (json.questoesProntas?.length) {
            const { error } = await supabase.from("questoes").insert(json.questoesProntas);
            if (error) {
                setErro("Erro ao salvar no banco: " + error.message);
                setPdfLoading(false);
                return;
            }
            setMsg(`Foram cadastradas ${json.questoesProntas.length} questão(ões) do PDF!`);
        }
        setResultados([
            ...(json.questoesProntas || []).map((q: any) => ({ status: "OK", ...q })),
            ...(json.falhas || []).map((f: any) => ({ status: "ERRO", ...f }))
        ]);
        setPdfLoading(false);
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
                className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-semibold mr-2"
                onClick={handleProcessarLote}
                disabled={loading || !input}
            >
                {loading ? "Processando..." : "Processar e Cadastrar Todas"}
            </button>
            {/* Upload PDF */}
            <form onSubmit={handlePDF} className="inline-block ml-2">
                <input type="file" name="arquivo" accept="application/pdf" className="inline-block border p-2 rounded" />
                <button
                    className="ml-2 px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 font-semibold"
                    type="submit"
                    disabled={pdfLoading}
                >
                    {pdfLoading ? "Processando PDF..." : "Processar PDF"}
                </button>
            </form>
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
