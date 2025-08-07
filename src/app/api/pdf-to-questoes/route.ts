import { NextRequest, NextResponse } from "next/server";
import pdf from "pdf-parse";
import formidable from "formidable";
import fs from "fs/promises";

export const config = {
    api: { bodyParser: false }
};

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
    return texto
        .split(/(?:^|\n)(?:\d{1,2}\)|QUESTÃO ?\d{1,2}|Questão ?\d{1,2})[\.: \-]*/i)
        .map(q => q.trim())
        .filter(q => q.length > 20);
}

export async function POST(req: NextRequest) {
    try {
        const form = new (formidable as any).IncomingForm();
        const data = await new Promise<any>((resolve, reject) => {
            form.parse(req as any, (err: any, fields: any, files: any) => {
                if (err) reject(err);
                else resolve({ fields, files });
            });
        });

        const file = data.files?.file;
        if (!file) return NextResponse.json({ error: "Arquivo não enviado" }, { status: 400 });

        const buffer = await fs.readFile(file.filepath);
        const pdfData = await pdf(buffer);
        const texto = pdfData.text;

        const questoes = separarQuestoes(texto);
        if (!questoes.length) {
            return NextResponse.json({ error: "Nenhuma questão detectada no PDF" }, { status: 400 });
        }

        let questoesProntas: any[] = [];
        let falhas: any[] = [];
        for (let [i, questaoTxt] of questoes.entries()) {
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
        return NextResponse.json({ questoesProntas, falhas });
    } catch (e: any) {
        return NextResponse.json({ error: e.message || "Erro inesperado" }, { status: 500 });
    }
}
