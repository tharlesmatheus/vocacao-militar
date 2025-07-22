"use client";
import { useEffect, useState } from "react";

export default function ClientesList() {
    const [clientes, setClientes] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [editId, setEditId] = useState<string | null>(null);
    const [editData, setEditData] = useState<any>({});
    const [msg, setMsg] = useState("");

    useEffect(() => {
        fetchClientes();
    }, []);

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

    if (loading) return <div className="p-8 text-center">Carregando clientes...</div>;

    return (
        <div className="overflow-x-auto">
            {msg && <div className="mb-2 text-red-600">{msg}</div>}
            <table className="w-full min-w-[800px] bg-white rounded-2xl shadow mb-4">
                <thead>
                    <tr className="bg-gray-100 text-gray-600">
                        <th className="p-3 text-left">Nome</th>
                        <th className="p-3 text-left">E-mail</th>
                        <th className="p-3 text-left">Telefone</th>
                        <th className="p-3 text-left">CPF</th>
                        <th className="p-3 text-left">Criado em</th>
                        <th className="p-3 text-center">Ações</th>
                    </tr>
                </thead>
                <tbody>
                    {clientes.length === 0 && (
                        <tr>
                            <td colSpan={6} className="p-4 text-center text-gray-500">
                                Nenhum cliente cadastrado.
                            </td>
                        </tr>
                    )}
                    {clientes.map((cliente) =>
                        editId === cliente.id ? (
                            <tr key={cliente.id} className="border-b bg-yellow-50">
                                <td className="p-3">
                                    <input className="rounded border px-2 py-1 w-full" value={editData.nome}
                                        onChange={e => setEditData({ ...editData, nome: e.target.value })} />
                                </td>
                                <td className="p-3">{cliente.email}</td>
                                <td className="p-3">
                                    <input className="rounded border px-2 py-1 w-full" value={editData.telefone}
                                        onChange={e => setEditData({ ...editData, telefone: e.target.value })} />
                                </td>
                                <td className="p-3">
                                    <input className="rounded border px-2 py-1 w-full" value={editData.cpf}
                                        onChange={e => setEditData({ ...editData, cpf: e.target.value })} />
                                </td>
                                <td className="p-3">{new Date(cliente.created_at).toLocaleDateString()}</td>
                                <td className="p-3 flex gap-2 justify-center">
                                    <button className="bg-green-600 text-white px-3 py-1 rounded font-bold hover:bg-green-700" onClick={() => handleSave(cliente)}>
                                        Salvar
                                    </button>
                                    <button className="bg-gray-300 text-gray-700 px-3 py-1 rounded font-bold hover:bg-gray-400" onClick={() => setEditId(null)}>
                                        Cancelar
                                    </button>
                                </td>
                            </tr>
                        ) : (
                            <tr key={cliente.id} className="border-b hover:bg-gray-50 transition">
                                <td className="p-3">{cliente.user_metadata?.nome || "-"}</td>
                                <td className="p-3">{cliente.email}</td>
                                <td className="p-3">{cliente.user_metadata?.telefone || "-"}</td>
                                <td className="p-3">{cliente.user_metadata?.cpf || "-"}</td>
                                <td className="p-3">{new Date(cliente.created_at).toLocaleDateString()}</td>
                                <td className="p-3 flex gap-2 justify-center">
                                    <button className="bg-blue-600 text-white px-2 py-1 rounded hover:bg-blue-700" onClick={() => handleEdit(cliente)}>
                                        Editar
                                    </button>
                                    <button className="bg-red-600 text-white px-2 py-1 rounded hover:bg-red-700" onClick={() => handleDelete(cliente)}>
                                        Excluir
                                    </button>
                                </td>
                            </tr>
                        )
                    )}
                </tbody>
            </table>
        </div>
    );
}
