"use client";
import React, { useState } from "react";
import { QuestionCard } from "./QuestionCard";
import { Pagination } from "./Pagination";

// Exemplo de 5 questões para teste da paginação
const mockQuestoes = [
    {
        id: 1,
        categorias: ["Direito Constitucional", "Direitos Fundamentais", "PM-SP", "2023", "Médio"],
        enunciado: "Segundo a Constituição Federal de 1988, sobre os direitos e garantias fundamentais, é correto afirmar que:",
        alternativas: [
            "Os direitos fundamentais aplicam-se apenas aos brasileiros natos",
            "A casa é asilo inviolável do indivíduo, não podendo ser adentrada em qualquer hipótese",
            "É livre a manifestação do pensamento, sendo vedado o anonimato",
            "A lei não pode estabelecer pena de morte em nenhuma hipótese",
            "O direito de propriedade é absoluto e não admite limitações"
        ],
        correta: 2,
        explicacao: "Conforme o artigo 5º, IV da CF/88, é livre a manifestação do pensamento, sendo vedado o anonimato. Esta é uma garantia fundamental que protege a liberdade de expressão, mas exige a identificação do emissor da opinião."
    },
    {
        id: 2,
        categorias: ["Matemática", "Álgebra", "ESA", "2022", "Fácil"],
        enunciado: "Qual é o valor de x na equação 2x + 6 = 10?",
        alternativas: [
            "1",
            "2",
            "3",
            "4",
            "5"
        ],
        correta: 1,
        explicacao: "2x + 6 = 10 ⇒ 2x = 4 ⇒ x = 2."
    },
    {
        id: 3,
        categorias: ["História", "Brasil República", "ENEM", "2020", "Difícil"],
        enunciado: "Em que ano ocorreu a Proclamação da República no Brasil?",
        alternativas: [
            "1822",
            "1889",
            "1891",
            "1930",
            "1964"
        ],
        correta: 1,
        explicacao: "A Proclamação da República no Brasil ocorreu em 1889."
    },
    {
        id: 4,
        categorias: ["Geografia", "Clima", "PM-MG", "2021", "Médio"],
        enunciado: "Qual é o bioma predominante na região Centro-Oeste do Brasil?",
        alternativas: [
            "Mata Atlântica",
            "Amazônia",
            "Cerrado",
            "Caatinga",
            "Pampas"
        ],
        correta: 2,
        explicacao: "O Cerrado é o bioma predominante na região Centro-Oeste."
    },
    {
        id: 5,
        categorias: ["Física", "Mecânica", "Colégio Naval", "2023", "Fácil"],
        enunciado: "Qual a unidade de medida da força no Sistema Internacional?",
        alternativas: [
            "Joule",
            "Pascal",
            "Newton",
            "Watt",
            "Metro"
        ],
        correta: 2,
        explicacao: "No Sistema Internacional, a unidade de força é o Newton (N)."
    }
];

const parseOptions = (alternativas: string[]) => {
    const letras = ["A", "B", "C", "D", "E"];
    return alternativas.map((alt, i) => ({
        letter: letras[i],
        text: alt,
    }));
};

export function QuestionsList() {
    const [page, setPage] = useState(1);
    const [perPage, setPerPage] = useState(3); // Para testar melhor, começa em 3 por página

    // Paginação real
    const start = (page - 1) * perPage;
    const end = start + perPage;
    const paginated = mockQuestoes.slice(start, end);

    return (
        <div className="mt-2">
            <div className="bg-white rounded-2xl p-8 shadow-xl mb-8 transition-colors border border-[#e3e8f3]">
                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 border-b border-[#e3e8f3] pb-3 mb-4">
                    <span className="text-sm font-medium text-[#8694ad] tracking-tight">
                        Questões encontradas
                    </span>
                    <div className="flex items-center gap-4">
                        <span className="text-[#65749b] text-xs">
                            Mostrando {paginated.length} de {mockQuestoes.length} questões
                        </span>
                        <select
                            className="bg-[#f3f5fa] border border-[#e3e8f3] rounded px-3 py-1 text-xs text-[#232939]"
                            value={perPage}
                            onChange={e => { setPerPage(Number(e.target.value)); setPage(1); }}
                        >
                            <option value={3}>3 por página</option>
                            <option value={5}>5 por página</option>
                            <option value={10}>10 por página</option>
                        </select>
                    </div>
                </div>

                <div className="flex flex-col gap-7">
                    {paginated.length === 0 ? (
                        <div className="min-h-[120px] flex items-center justify-center text-[#a8b1c6]">
                            Nenhuma questão encontrada.
                        </div>
                    ) : (
                        paginated.map((q) =>
                            <QuestionCard
                                key={q.id}
                                tags={q.categorias}
                                statement={q.enunciado}
                                options={parseOptions(q.alternativas)}
                                correct={["A", "B", "C", "D", "E"][q.correta]}
                                explanation={q.explicacao}
                            />
                        )
                    )}
                </div>

                {/* Paginação aqui embaixo */}
                <Pagination
                    total={mockQuestoes.length}
                    perPage={perPage}
                    page={page}
                    setPage={setPage}
                />
            </div>
        </div>
    );
}
