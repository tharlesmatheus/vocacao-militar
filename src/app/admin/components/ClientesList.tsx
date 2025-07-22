"use client";
import { useEffect, useState } from "react";

export default function ClientesList() {
    const [clientes, setClientes] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [editId, setEditId] = useState<string | null>(null);
    const [editData, setEditData] = useState<any>({});
    const [msg, setMsg] = useState("");

    useEffect(() => { fetchClientes(); }, []);

    async function fetchClientes() {
        setLoading(true);
        setMsg("");
        const resp = await fetch("/api/admin-users");
        const data = await resp.json();
        setClientes(data);
        setLoading(false);
    }

    function handleEdit(cliente: any) {
        setEditId(cliente.id);
        setEditData({
            nome: cliente.user_metadata?.nome || "",
            telefone: cliente.user_metadata?.telefone || "",
            cpf: cliente.user_metadata?.cpf || "",
        });
    }

    async function handleSave(cliente: any) {
        setMsg("");
        const res = await fetch("/api/admin-users", {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                id: cliente.id,
                user_metadata: editData,
            }),
        });
        const { error } = await res.json();
        if (!error) {
            setEditId(null);
            fetchClientes();
        } else {
            setMsg("Erro ao salvar: " + error);
        }
    }

    async function handleDelete(cliente: any) {
        if (!confirm("Tem certeza que deseja excluir este cliente?")) return;
        setMsg("");
        const res = await fetch("/api/admin-users", {
            method: "DELETE",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ id: cliente.id }),
        });
        const { error } = await res.json();
        if (!error) fetchClientes();
        else setMsg("Erro ao excluir: " + error);
    }

    return (
        <div className="max-w-5xl mx-auto">
            <div className="bg-white rounded-2xl shadow-xl border border-[#e4e8f3] p-7 mt-4">
                <h2 className="text-xl md:text-2xl font-extrabold text-[#232939] mb-5 text-center">
                    Clientes Cadastrados
                </h2>
                {msg && <div className="mb-2 text-red-600 text-center">{msg}</div>}
                <div className="overflow-x-auto">
                    <table className="w-full min-w-[700px] border-separate border-spacing-0">
                        <thead>
                            <tr className="bg-[#f3f6fa] text-[#4e5a7b] text-[16px]">
                                <th className="px-4 py-3 font-bold text-left rounded-tl-2xl">Nome</th>
                                <th className="px-4 py-3 font-bold text-left">E-mail</th>
                                <th className="px-4 py-3 font-bold text-left">Telefone</th>
                                <th className="px-4 py-3 font-bold text-left">CPF</th>
                                <th className="px-4 py-3 font-bold text-left">Criado em</th>
                                <th className="px-4 py-3 font-bold text-center rounded-tr-2xl">Ações</th>
                            </tr>
                        </thead>
                        <tbody>
                            {loading ? (
                                <tr>
                                    <td colSpan={6} className="px-4 py-8 text-center text-[#a3adc7]">
                                        Carregando clientes...
                                    </td>
                                </tr>
                            ) : clientes.length === 0 ? (
                                <tr>
                                    <td colSpan={6} className="px-4 py-8 text-center text-[#a3adc7]">
                                        Nenhum cliente cadastrado.
                                    </td>
                                </tr>
                            ) : (
                                clientes.map((cliente) =>
                                    editId === cliente.id ? (
                                        <tr key={cliente.id} className="bg-[#fffde7] border-b border-[#e4e8f3] last:border-0">
                                            <td className="px-4 py-3">
                                                <input
                                                    className="rounded-lg border px-3 py-2 w-full"
                                                    value={editData.nome}
                                                    onChange={e => setEditData({ ...editData, nome: e.target.value })}
                                                />
                                            </td>
                                            <td className="px-4 py-3 text-[#7b8497]">{cliente.email}</td>
                                            <td className="px-4 py-3">
                                                <input
                                                    className="rounded-lg border px-3 py-2 w-full"
                                                    value={editData.telefone}
                                                    onChange={e => setEditData({ ...editData, telefone: e.target.value })}
                                                />
                                            </td>
                                            <td className="px-4 py-3">
                                                <input
                                                    className="rounded-lg border px-3 py-2 w-full"
                                                    value={editData.cpf}
                                                    onChange={e => setEditData({ ...editData, cpf: e.target.value })}
                                                />
                                            </td>
                                            <td className="px-4 py-3 text-[#7b8497]">
                                                {new Date(cliente.created_at).toLocaleDateString()}
                                            </td>
                                            <td className="px-4 py-3 flex gap-2 justify-center">
                                                <button className="bg-green-600 text-white px-4 py-2 rounded-lg font-bold hover:bg-green-700 transition"
                                                    onClick={() => handleSave(cliente)}>
                                                    Salvar
                                                </button>
                                                <button className="bg-gray-300 text-gray-700 px-4 py-2 rounded-lg font-bold hover:bg-gray-400 transition"
                                                    onClick={() => setEditId(null)}>
                                                    Cancelar
                                                </button>
                                            </td>
                                        </tr>
                                    ) : (
                                        <tr key={cliente.id} className="border-b border-[#e4e8f3] last:border-0 hover:bg-[#f7f9fb] transition">
                                            <td className="px-4 py-3 font-semibold">{cliente.user_metadata?.nome || "-"}</td>
                                            <td className="px-4 py-3 text-[#3d4762]">{cliente.email}</td>
                                            <td className="px-4 py-3">{cliente.user_metadata?.telefone || "-"}</td>
                                            <td className="px-4 py-3">{cliente.user_metadata?.cpf || "-"}</td>
                                            <td className="px-4 py-3 text-[#7b8497]">
                                                {new Date(cliente.created_at).toLocaleDateString()}
                                            </td>
                                            <td className="px-4 py-3 flex gap-2 justify-center">
                                                <button className="bg-blue-600 text-white px-4 py-2 rounded-lg font-bold hover:bg-blue-700 transition"
                                                    onClick={() => handleEdit(cliente)}>
                                                    Editar
                                                </button>
                                                <button className="bg-red-600 text-white px-4 py-2 rounded-lg font-bold hover:bg-red-700 transition"
                                                    onClick={() => handleDelete(cliente)}>
                                                    Excluir
                                                </button>
                                            </td>
                                        </tr>
                                    )
                                )
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}
