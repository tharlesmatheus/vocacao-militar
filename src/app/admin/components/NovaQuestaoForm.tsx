"use client";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

export default function NovaQuestaoForm() {
    const [questao, setQuestao] = useState<any>({ alternativas: {} });
    const [msg, setMsg] = useState("");
    const [lista, setLista] = useState<any>({
        instituicao: [], cargo: [], disciplina: [], assunto: [], modalidade: [], banca: []
    });

    // Carrega todas as opções já usadas no banco
    useEffect(() => {
        async function fetchData() {
            const { data, error } = await supabase
                .from("questoes")
                .select("instituicao, cargo, disciplina, assunto, modalidade, banca");
            if (!error && data) {
                const uniq = (arr: string[]) => [...new Set(arr.filter(Boolean))];
                setLista({
                    instituicao: uniq(data.map(q => q.instituicao)),
                    cargo: uniq(data.map(q => q.cargo)),
                    disciplina: uniq(data.map(q => q.disciplina)),
                    assunto: uniq(data.map(q => q.assunto)),
                    modalidade: uniq(data.map(q => q.modalidade)),
                    banca: uniq(data.map(q => q.banca)),
                });
            }
        }
        fetchData();
    }, []);

    // Componente para selects inteligentes
    function AutoSelect({ label, name }: { label: string; name: string }) {
        const [search, setSearch] = useState(questao[name] || "");
        const options = (lista[name] || []).filter((o: string) => o?.toLowerCase().includes(search.toLowerCase()));

        return (
            <div className="flex flex-col gap-1">
                <label className="text-[15px] font-semibold mb-1">{label}</label>
                <input
                    className="rounded-xl px-4 py-2 border border-[#e4e8f3] bg-gray-50 text-base outline-[#7c90d7] transition"
                    placeholder={`Digite ou selecione`}
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    onBlur={() => setQuestao((q: any) => ({ ...q, [name]: search }))}
                    list={name + "-list"}
                />
                <datalist id={name + "-list"}>
                    {options.map((o: string, i: number) =>
                        <option key={i} value={o} />
                    )}
                </datalist>
            </div>
        );
    }

    async function handleNovaQuestao(e: any) {
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
        <div className="bg-white rounded-2xl shadow-xl p-8 max-w-2xl mx-auto border border-[#e4e8f3]">
            <h2 className="text-2xl font-extrabold text-[#232939] mb-7 text-center">Adicionar Nova Questão</h2>
            <form className="flex flex-col gap-5" onSubmit={handleNovaQuestao}>
                {/* Grid dos campos principais */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <AutoSelect label="Instituição" name="instituicao" />
                    <AutoSelect label="Cargo" name="cargo" />
                    <AutoSelect label="Disciplina" name="disciplina" />
                    <AutoSelect label="Assunto" name="assunto" />
                    <AutoSelect label="Modalidade" name="modalidade" />
                    <AutoSelect label="Banca" name="banca" />
                </div>

                <div>
                    <label className="text-[15px] font-semibold mb-1 block">Enunciado</label>
                    <textarea
                        required
                        placeholder="Digite o enunciado da questão"
                        className="rounded-xl px-4 py-3 border border-[#e4e8f3] bg-gray-50 text-base w-full min-h-[60px] outline-[#7c90d7]"
                        value={questao.enunciado || ""}
                        onChange={e => setQuestao({ ...questao, enunciado: e.target.value })}
                    />
                </div>

                {/* Grid de alternativas */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <input
                        className="rounded-xl px-4 py-2 border border-[#e4e8f3] bg-gray-50 text-base"
                        placeholder="Alternativa A"
                        value={questao.alternativas?.A || ""}
                        onChange={e => setQuestao({ ...questao, alternativas: { ...questao.alternativas, A: e.target.value } })}
                    />
                    <input
                        className="rounded-xl px-4 py-2 border border-[#e4e8f3] bg-gray-50 text-base"
                        placeholder="Alternativa B"
                        value={questao.alternativas?.B || ""}
                        onChange={e => setQuestao({ ...questao, alternativas: { ...questao.alternativas, B: e.target.value } })}
                    />
                    <input
                        className="rounded-xl px-4 py-2 border border-[#e4e8f3] bg-gray-50 text-base"
                        placeholder="Alternativa C"
                        value={questao.alternativas?.C || ""}
                        onChange={e => setQuestao({ ...questao, alternativas: { ...questao.alternativas, C: e.target.value } })}
                    />
                    <input
                        className="rounded-xl px-4 py-2 border border-[#e4e8f3] bg-gray-50 text-base"
                        placeholder="Alternativa D"
                        value={questao.alternativas?.D || ""}
                        onChange={e => setQuestao({ ...questao, alternativas: { ...questao.alternativas, D: e.target.value } })}
                    />
                    <input
                        className="rounded-xl px-4 py-2 border border-[#e4e8f3] bg-gray-50 text-base"
                        placeholder="Alternativa E"
                        value={questao.alternativas?.E || ""}
                        onChange={e => setQuestao({ ...questao, alternativas: { ...questao.alternativas, E: e.target.value } })}
                    />
                    <input
                        className="rounded-xl px-4 py-2 border border-[#e4e8f3] bg-gray-50 text-base"
                        placeholder="Correta (A-E)"
                        maxLength={1}
                        value={questao.correta || ""}
                        onChange={e => setQuestao({ ...questao, correta: e.target.value.toUpperCase().replace(/[^A-E]/g, "") })}
                    />
                </div>

                <div>
                    <label className="text-[15px] font-semibold mb-1 block">Explicação/Comentário (opcional)</label>
                    <textarea
                        placeholder="Explicação para o gabarito ou comentário extra"
                        className="rounded-xl px-4 py-3 border border-[#e4e8f3] bg-gray-50 text-base w-full min-h-[48px] outline-[#7c90d7]"
                        value={questao.explicacao || ""}
                        onChange={e => setQuestao({ ...questao, explicacao: e.target.value })}
                    />
                </div>

                {/* Botões */}
                <div className="flex flex-col sm:flex-row gap-3 mt-3">
                    <button
                        type="submit"
                        className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-xl font-extrabold transition text-base w-full sm:w-auto"
                    >
                        Adicionar Questão
                    </button>
                    <button
                        type="button"
                        className="bg-gray-200 hover:bg-gray-300 text-[#232939] px-6 py-3 rounded-xl font-bold transition text-base w-full sm:w-auto"
                        onClick={() => setQuestao({ alternativas: {} })}
                    >
                        Limpar Campos
                    </button>
                </div>
                {msg && (
                    <div className={`text-center mt-2 ${msg.startsWith("Erro") ? "text-red-500" : "text-green-700"}`}>
                        {msg}
                    </div>
                )}
            </form>
        </div>
    );
}
