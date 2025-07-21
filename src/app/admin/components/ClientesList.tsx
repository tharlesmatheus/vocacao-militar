"use client";
import React, { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

export default function ClientesList() {
    const [users, setUsers] = useState<any[]>([]);
    const [planos, setPlanos] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        async function fetchData() {
            setLoading(true);
            const { data: usersData } = await supabase.from("users").select("*");
            const { data: planosData } = await supabase.from("planos").select("*");
            setUsers(usersData || []);
            setPlanos(planosData || []);
            setLoading(false);
        }
        fetchData();
    }, []);

    function statusPlano(user_id: string) {
        const plano = planos.find((p) => p.user_id === user_id && p.status === "ativo");
        return plano ? "Ativo" : "Inativo";
    }

    if (loading) return <div>Carregando...</div>;

    return (
        <div className="bg-white rounded-2xl p-6 shadow">
            <h2 className="text-xl font-bold mb-4">Clientes ({users.length})</h2>
            <table className="w-full text-sm">
                <thead>
                    <tr className="text-left text-[#5d5f6d]">
                        <th className="p-2">Nome</th>
                        <th className="p-2">E-mail</th>
                        <th className="p-2">CPF</th>
                        <th className="p-2">Telefone</th>
                        <th className="p-2">Plano</th>
                        <th className="p-2">Criado em</th>
                    </tr>
                </thead>
                <tbody>
                    {users.map((u) => (
                        <tr key={u.id} className="border-b last:border-none hover:bg-[#f3f6fa] transition">
                            <td className="p-2">{u.nome}</td>
                            <td className="p-2">{u.email}</td>
                            <td className="p-2">{u.cpf}</td>
                            <td className="p-2">{u.telefone}</td>
                            <td className="p-2">
                                <span
                                    className={`px-3 py-1 rounded-full text-xs font-bold ${statusPlano(u.id) === "Ativo"
                                            ? "bg-green-100 text-green-700"
                                            : "bg-red-100 text-red-700"
                                        }`}
                                >
                                    {statusPlano(u.id)}
                                </span>
                            </td>
                            <td className="p-2">
                                {u.created_at && new Date(u.created_at).toLocaleDateString("pt-BR")}
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}
