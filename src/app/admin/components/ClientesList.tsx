"use client";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

export default function ClientesList() {
    const [clientes, setClientes] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        async function fetchClientes() {
            // Busca usuários do Auth (via função RPC)
            const { data: users, error } = await supabase.rpc("listar_usuarios");
            if (users) {
                // Buscar planos ativos (tabela planos)
                const { data: planos } = await supabase.from("planos").select("*");
                const clientesComPlano = users.map((user: any) => {
                    const plano = planos?.find((p: any) => p.user_id === user.id);
                    return {
                        ...user,
                        planoAtivo: plano ? plano.nome_plano : "Nenhum",
                        dataPlano: plano ? plano.inicio_vigencia : null,
                    };
                });
                setClientes(clientesComPlano);
            }
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
                        <th className="p-3 text-left">Plano</th>
                        <th className="p-3 text-left">Início Plano</th>
                        <th className="p-3 text-left">Criado em</th>
                    </tr>
                </thead>
                <tbody>
                    {clientes.length === 0 && (
                        <tr>
                            <td colSpan={7} className="p-4 text-center text-gray-500">
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
                            <td className="p-3">{cliente.planoAtivo}</td>
                            <td className="p-3">{cliente.dataPlano ? new Date(cliente.dataPlano).toLocaleDateString() : "-"}</td>
                            <td className="p-3">{new Date(cliente.created_at).toLocaleDateString()}</td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}
