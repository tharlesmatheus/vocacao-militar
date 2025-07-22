"use client";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { Pencil, X, Check, Trash } from "lucide-react";

export default function QuestoesList() {
    const [questoes, setQuestoes] = useState<any[]>([]);
    const [search, setSearch] = useState("");
    const [editId, setEditId] = useState<number | null>(null);
    const [editQuestao, setEditQuestao] = useState<any>({});
    const [loading, setLoading] = useState(true);
    const [msg, setMsg] = useState("");
    const [camposUnicos, setCamposUnicos] = useState<any>({});

    // Carrega questões e valores únicos dos campos (para selects tipo filtro)
    useEffect(() => {
        fetchQuestoes();
        fetchCampos();
    }, []);

    async function fetchQuestoes() {
        setLoading(true);
        let query = supabase.from("questoes").select("*").order("id", { ascending: false });
        if (search) query = query.ilike("enunciado", `%${search}%`);
        const { data } = await query;
        setQuestoes(data || []);
        setLoading(false);
    }

    async function fetchCampos() {
        // Pega valores únicos para selects inteligentes
        const { data } = await supabase.from("questoes")
            .select("instituicao, cargo, disciplina, assunto, modalidade, banca");
        if (!data) return;
        function uniq(arr: string[]) { return [...new Set(arr.filter(Boolean))]; }
        setCamposUnicos({
            instituicao: uniq(data.map(q => q.instituicao)),
            cargo: uniq(data.map(q => q.cargo)),
            disciplina: uniq(data.map(q => q.disciplina)),
            assunto: uniq(data.map(q => q.assunto)),
            modalidade: uniq(data.map(q => q.modalidade)),
            banca: uniq(data.map(q => q.banca)),
        });
    }

    function startEdit(q: any) {
        setEditId(q.id);
        setEditQuestao({ ...q });
    }

    async function handleSave() {
        setMsg("");
        // Garantir alternativas em formato jsonb
        const toSave = { ...editQuestao, alternativas: editQuestao.alternativas };
        const { error } = await supabase.from("questoes").update(toSave).eq("id", editId);
        if (error) setMsg("Erro ao salvar: " + error.message);
        else {
            setEditId(null);
            fetchQuestoes();
        }
    }

    async function handleDelete(id: number) {
        if (!confirm("Deseja remover esta questão?")) return;
        const { error } = await supabase.from("questoes").delete().eq("id", id);
        if (!error) fetchQuestoes();
        else setMsg("Erro ao excluir: " + error.message);
    }

    function CampoSelect({ campo, label }: { campo: string, label: string }) {
        const options = camposUnicos[campo] || [];
        return (
            <div className="flex flex-col gap-1 flex-1 min-w-[150px]">
                <label className="font-semibold">{label}</label>
                <select
                    className="rounded px-4 py-2 border bg-gray-50"
                    value={editQuestao[campo] || ""}
                    onChange={e => setEditQuestao({ ...editQuestao, [campo]: e.target.value })}
                >
                    <option value="">Selecione</option>
                    {options.map((opt: string, i: number) =>
                        <option key={i} value={opt}>{opt}</option>
                    )}
                </select>
            </div>
        );
    }

    function CampoInput({ campo, label, type = "text" }: { campo: string, label: string, type?: string }) {
        return (
            <div className="flex flex-col gap-1 flex-1 min-w-[150px]">
                <label className="font-semibold">{label}</label>
                <input
                    type={type}
                    className="rounded px-4 py-2 border bg-gray-50"
                    value={editQuestao[campo] || ""}
                    onChange={e => setEditQuestao({ ...editQuestao, [campo]: e.target.value })}
                />
            </div>
        );
    }

    function CampoAlternativa({ letra }: { letra: string }) {
        return (
            <div className="flex flex-col gap-1 flex-1 min-w-[90px]">
                <label className="font-semibold">{letra}</label>
                <input
                    className="rounded px-2 py-2 border bg-gray-50"
                    value={editQuestao.alternativas?.[letra] || ""}
                    onChange={e =>
                        setEditQuestao({
                            ...editQuestao,
                            alternativas: { ...editQuestao.alternativas, [letra]: e.target.value },
                        })}
                />
            </div>
        );
    }

    return (
        <div className="mb-6">
            <div className="flex flex-col sm:flex-row gap-2 items-center mb-4">
                <input
                    className="rounded border px-4 py-2 flex-1 min-w-[220px]"
                    placeholder="Buscar questão por enunciado..."
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    onKeyDown={e => e.key === "Enter" && fetchQuestoes()}
                />
                <button
                    className="bg-blue-600 text-white px-4 py-2 rounded font-bold hover:bg-blue-700"
                    onClick={fetchQuestoes}
                >
                    Buscar
                </button>
            </div>

            {msg && <div className="mb-2 text-center text-red-600">{msg}</div>}

            <div className="flex flex-col gap-6">
                {loading && <div className="p-4 text-center">Carregando questões...</div>}
                {!loading && questoes.length === 0 && (
                    <div className="p-4 text-center text-gray-500">Nenhuma questão encontrada.</div>
                )}
                {!loading && questoes.map(q =>
                    editId === q.id ? (
                        <div key={q.id} className="bg-white rounded-2xl shadow p-4 mb-2 border-2 border-blue-300 max-w-4xl mx-auto">
                            <div className="flex flex-wrap gap-4 mb-2">
                                <CampoSelect campo="instituicao" label="Instituição" />
                                <CampoSelect campo="cargo" label="Cargo" />
                                <CampoSelect campo="disciplina" label="Disciplina" />
                                <CampoSelect campo="assunto" label="Assunto" />
                            </div>
                            <div className="flex flex-wrap gap-4 mb-2">
                                <CampoSelect campo="modalidade" label="Modalidade" />
                                <CampoSelect campo="banca" label="Banca" />
                            </div>
                            <div className="flex flex-col gap-1 mb-2">
                                <label className="font-semibold">Enunciado</label>
                                <textarea
                                    className="rounded border px-4 py-2 bg-gray-50 w-full"
                                    value={editQuestao.enunciado || ""}
                                    onChange={e => setEditQuestao({ ...editQuestao, enunciado: e.target.value })}
                                />
                            </div>
                            <div className="flex flex-wrap gap-4 mb-2">
                                {["A", "B", "C", "D", "E"].map(letra =>
                                    <CampoAlternativa key={letra} letra={letra} />
                                )}
                                <CampoInput campo="correta" label="Correta" />
                            </div>
                            <div className="flex flex-col gap-1 mb-2">
                                <label className="font-semibold">Explicação</label>
                                <textarea
                                    className="rounded border px-4 py-2 bg-gray-50 w-full"
                                    value={editQuestao.explicacao || ""}
                                    onChange={e => setEditQuestao({ ...editQuestao, explicacao: e.target.value })}
                                />
                            </div>
                            <div className="flex gap-4 justify-end mt-2">
                                <button className="bg-green-600 text-white px-6 py-2 rounded font-bold flex items-center gap-1 hover:bg-green-700" onClick={handleSave}>
                                    <Check size={18} /> Salvar
                                </button>
                                <button className="bg-gray-200 text-[#232939] px-6 py-2 rounded font-bold flex items-center gap-1 hover:bg-gray-300" onClick={() => setEditId(null)}>
                                    <X size={18} /> Cancelar
                                </button>
                            </div>
                        </div>
                    ) : (
                        <div key={q.id} className="bg-white rounded-2xl shadow flex flex-col md:flex-row items-start md:items-center justify-between p-4 mb-2 max-w-4xl mx-auto border hover:border-blue-400 transition">
                            <div className="flex-1">
                                <div className="font-bold text-base text-blue-800 mb-1">#{q.id}</div>
                                <div className="text-md font-semibold mb-1">{q.enunciado?.slice(0, 120)}{q.enunciado?.length > 120 ? "..." : ""}</div>
                                <div className="text-sm text-gray-500">
                                    {q.instituicao} | {q.cargo} | {q.disciplina} | {q.assunto}
                                </div>
                            </div>
                            <div className="flex gap-2 mt-2 md:mt-0">
                                <button onClick={() => startEdit(q)} className="bg-blue-600 text-white px-4 py-2 rounded font-bold flex items-center gap-1 hover:bg-blue-700">
                                    <Pencil size={16} /> Editar
                                </button>
                                <button onClick={() => handleDelete(q.id)} className="bg-red-600 text-white px-4 py-2 rounded font-bold flex items-center gap-1 hover:bg-red-700">
                                    <Trash size={16} /> Excluir
                                </button>
                            </div>
                        </div>
                    )
                )}
            </div>
        </div>
    );
}
