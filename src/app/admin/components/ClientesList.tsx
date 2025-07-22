"use client";
import { useEffect, useState } from "react";

export default function ClientesList() {
    const [clientes, setClientes] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        async function fetchClientes() {
            setLoading(true);
            const resp = await fetch("/api/admin-users");
            const data = await resp.json();
            setClientes(data);
            setLoading(false);
        }
        fetchClientes();
    }, []);

    if (loading) return <div className="p-8 text-center">Carregando clientes...</div>;

    return (
        <div className="overflow-x-auto">
            <table className="w-full min-w-[800px] bg-white rounded-2xl shadow mb-4">
                <thead>
                    <tr className="bg-gray-100 text-gray-600">
                        <th className="p-3 text-left">Nome</th>
                        <th className="p-3 text-left">E-mail</th>
                        <th className="p-3 text-left">Telefone</th>
                        <th className="p-3 text-left">CPF</th>
                        <th className="p-3 text-left">Criado em</th>
                    </tr>
                </thead>
                <tbody>
                    {clientes.length === 0 && (
                        <tr>
                            <td colSpan={5} className="p-4 text-center text-gray-500">
                                Nenhum cliente cadastrado.
                            </td>
                        </tr>
                    )}
                    {clientes.map((cliente) => (
                        <tr key={cliente.id} className="border-b hover:bg-gray-50 transition">
                            <td className="p-3">{cliente.user_metadata?.nome || "-"}</td>
                            <td className="p-3">{cliente.email}</td>
                            <td className="p-3">{cliente.user_metadata?.telefone || "-"}</td>
                            <td className="p-3">{cliente.user_metadata?.cpf || "-"}</td>
                            <td className="p-3">{new Date(cliente.created_at).toLocaleDateString()}</td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}
