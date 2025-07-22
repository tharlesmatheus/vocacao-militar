"use client";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { Pencil } from "lucide-react";

export default function QuestoesList() {
    const [questoes, setQuestoes] = useState<any[]>([]);
    const [search, setSearch] = useState("");
    const [editId, setEditId] = useState<string | null>(null);
    const [editQuestao, setEditQuestao] = useState<any>({});
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetchQuestoes();
    }, []);

    async function fetchQuestoes() {
        setLoading(true);
        let query = supabase.from("questoes").select("*").order("id", { ascending: false });
        if (search) {
            query = query.ilike("enunciado", `%${search}%`);
        }
        const { data, error } = await query;
        setQuestoes(data || []);
        setLoading(false);
    }

    function handleEdit(questao: any) {
        setEditId(questao.id);
        setEditQuestao({ ...questao });
    }

    async function handleSave() {
        const { error } = await supabase.from("questoes").update(editQuestao).eq("id", editId);
        if (!error) {
            setEditId(null);
            fetchQuestoes();
        }
    }

    return (
        <div className="mb-6">
            <div className="flex flex-col sm:flex-row gap-2 items-center mb-4">
                <input
                    className="rounded border px-4 py-2 flex-1 min-w-[250px]"
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
            <div className="overflow-x-auto">
                <table className="w-full min-w-[700px] bg-white rounded-2xl shadow">
                    <thead>
                        <tr className="bg-gray-100 text-gray-600">
                            <th className="p-3 text-left">ID</th>
                            <th className="p-3 text-left">Enunciado</th>
                            <th className="p-3 text-left">Disciplina</th>
                            <th className="p-3 text-left">Assunto</th>
                            <th className="p-3 text-left">Editar</th>
                        </tr>
                    </thead>
                    <tbody>
                        {loading && (
                            <tr>
                                <td colSpan={5} className="p-4 text-center text-gray-500">
                                    Carregando questões...
                                </td>
                            </tr>
                        )}
                        {!loading && questoes.length === 0 && (
                            <tr>
                                <td colSpan={5} className="p-4 text-center text-gray-500">
                                    Nenhuma questão encontrada.
                                </td>
                            </tr>
                        )}
                        {questoes.map((q) =>
                            editId === q.id ? (
                                <tr key={q.id} className="border-b bg-yellow-50">
                                    <td className="p-3">{q.id}</td>
                                    <td className="p-3">
                                        <textarea
                                            className="rounded border px-2 py-1 w-full"
                                            value={editQuestao.enunciado || ""}
                                            onChange={e =>
                                                setEditQuestao({ ...editQuestao, enunciado: e.target.value })
                                            }
                                        />
                                    </td>
                                    <td className="p-3">
                                        <input
                                            className="rounded border px-2 py-1 w-full"
                                            value={editQuestao.disciplina || ""}
                                            onChange={e =>
                                                setEditQuestao({ ...editQuestao, disciplina: e.target.value })
                                            }
                                        />
                                    </td>
                                    <td className="p-3">
                                        <input
                                            className="rounded border px-2 py-1 w-full"
                                            value={editQuestao.assunto || ""}
                                            onChange={e =>
                                                setEditQuestao({ ...editQuestao, assunto: e.target.value })
                                            }
                                        />
                                    </td>
                                    <td className="p-3 flex gap-2">
                                        <button
                                            onClick={handleSave}
                                            className="bg-green-600 text-white px-3 py-1 rounded font-bold hover:bg-green-700"
                                        >
                                            Salvar
                                        </button>
                                        <button
                                            onClick={() => setEditId(null)}
                                            className="bg-gray-300 text-gray-700 px-3 py-1 rounded font-bold hover:bg-gray-400"
                                        >
                                            Cancelar
                                        </button>
                                    </td>
                                </tr>
                            ) : (
                                <tr key={q.id} className="border-b hover:bg-gray-50 transition">
                                    <td className="p-3">{q.id}</td>
                                    <td className="p-3">{q.enunciado?.slice(0, 90)}{q.enunciado?.length > 90 ? "..." : ""}</td>
                                    <td className="p-3">{q.disciplina}</td>
                                    <td className="p-3">{q.assunto}</td>
                                    <td className="p-3">
                                        <button
                                            onClick={() => handleEdit(q)}
                                            className="bg-blue-600 text-white px-2 py-1 rounded hover:bg-blue-700 flex items-center gap-1"
                                        >
                                            <Pencil size={16} /> Editar
                                        </button>
                                    </td>
                                </tr>
                            )
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
