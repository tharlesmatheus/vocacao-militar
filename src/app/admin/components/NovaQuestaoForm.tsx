"use client";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

export default function NovaQuestaoForm() {
    const [questao, setQuestao] = useState<any>({ alternativas: {} });
    const [msg, setMsg] = useState("");
    const [lista, setLista] = useState<any>({ instituicao: [], cargo: [], disciplina: [], assunto: [], modalidade: [], banca: [] });

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

    // Pesquisa rápida nos selects
    function AutoSelect({ label, name }: { label: string; name: string }) {
        const [search, setSearch] = useState(questao[name] || "");
        const options = (lista[name] || []).filter((o: string) => o?.toLowerCase().includes(search.toLowerCase()));

        // Atualiza o campo no questao apenas ao sair do input (onBlur) ou ao escolher uma opção (onChange), mas não ao digitar a cada letra
        return (
            <div className="flex flex-col gap-1 flex-1 min-w-[180px]">
                <label className="font-semibold">{label}</label>
                <input
                    className="rounded px-4 py-2 border bg-gray-50"
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
        <div className="bg-white rounded-2xl p-6 shadow max-w-2xl mx-auto">
            <h2 className="text-xl font-bold mb-4">Adicionar Nova Questão</h2>
            <form className="flex flex-col gap-3" onSubmit={handleNovaQuestao}>
                <div className="flex flex-wrap gap-4">
                    <AutoSelect label="Instituição" name="instituicao" />
                    <AutoSelect label="Cargo" name="cargo" />
                </div>
                <div className="flex flex-wrap gap-4">
                    <AutoSelect label="Disciplina" name="disciplina" />
                    <AutoSelect label="Assunto" name="assunto" />
                </div>
                <div className="flex flex-wrap gap-4">
                    <AutoSelect label="Modalidade" name="modalidade" />
                    <AutoSelect label="Banca" name="banca" />
                </div>
                <textarea
                    required
                    placeholder="Enunciado"
                    className="rounded px-4 py-2 border bg-gray-50"
                    value={questao.enunciado || ""}
                    onChange={e => setQuestao({ ...questao, enunciado: e.target.value })}
                />
                <div className="flex gap-2">
                    <input className="rounded px-4 py-2 border flex-1" placeholder="Alternativa A"
                        value={questao.alternativas?.A || ""}
                        onChange={e => setQuestao({ ...questao, alternativas: { ...questao.alternativas, A: e.target.value } })} />
                    <input className="rounded px-4 py-2 border flex-1" placeholder="Alternativa B"
                        value={questao.alternativas?.B || ""}
                        onChange={e => setQuestao({ ...questao, alternativas: { ...questao.alternativas, B: e.target.value } })} />
                    <input className="rounded px-4 py-2 border flex-1" placeholder="Alternativa C"
                        value={questao.alternativas?.C || ""}
                        onChange={e => setQuestao({ ...questao, alternativas: { ...questao.alternativas, C: e.target.value } })} />
                    <input className="rounded px-4 py-2 border flex-1" placeholder="Alternativa D"
                        value={questao.alternativas?.D || ""}
                        onChange={e => setQuestao({ ...questao, alternativas: { ...questao.alternativas, D: e.target.value } })} />
                </div>
                <div className="flex gap-2">
                    <input className="rounded px-4 py-2 border flex-1" placeholder="Alternativa E"
                        value={questao.alternativas?.E || ""}
                        onChange={e => setQuestao({ ...questao, alternativas: { ...questao.alternativas, E: e.target.value } })} />
                    <input className="rounded px-4 py-2 border flex-1" placeholder="Correta (A-E)"
                        maxLength={1}
                        value={questao.correta || ""}
                        onChange={e => setQuestao({ ...questao, correta: e.target.value.toUpperCase().replace(/[^A-E]/g, "") })}
                    />
                </div>
                <textarea
                    placeholder="Explicação/Comentário (opcional)"
                    className="rounded px-4 py-2 border bg-gray-50"
                    value={questao.explicacao || ""}
                    onChange={e => setQuestao({ ...questao, explicacao: e.target.value })}
                />
                <div className="flex gap-4 mt-2">
                    <button type="submit" className="bg-blue-600 text-white px-6 py-2 rounded font-bold hover:bg-blue-700">
                        Adicionar Questão
                    </button>
                    <button type="button" className="bg-gray-200 text-[#232939] px-6 py-2 rounded font-bold hover:bg-gray-300"
                        onClick={() => setQuestao({ alternativas: {} })}>
                        Limpar Campos
                    </button>
                </div>
                {msg && <div className={`text-center mt-2 ${msg.startsWith("Erro") ? "text-red-500" : "text-green-700"}`}>{msg}</div>}
            </form>
        </div>
    );
}
