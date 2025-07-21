"use client";
import React, { useState } from "react";
import { supabase } from "@/lib/supabaseClient";

export default function NovoClienteForm() {
    const [novoCliente, setNovoCliente] = useState({
        nome: "",
        email: "",
        senha: "",
        cpf: "",
        telefone: "",
    });
    const [msg, setMsg] = useState("");

    async function handleNovoCliente(e: React.FormEvent) {
        e.preventDefault();
        setMsg("");
        const { nome, email, senha, cpf, telefone } = novoCliente;
        // Cuidado: Para produção, crie endpoint API seguro (não use signUp direto no client com Service Role!)
        const { error } = await supabase.auth.signUp({
            email,
            password: senha,
            options: {
                data: { nome, cpf, telefone, is_admin: false },
            },
        });
        if (error) return setMsg("Erro ao criar cliente: " + error.message);
        setMsg("Cliente criado! Peça para ativar o e-mail.");
        setNovoCliente({ nome: "", email: "", senha: "", cpf: "", telefone: "" });
    }

    return (
        <div className="bg-white rounded-2xl p-6 shadow max-w-lg mx-auto">
            <h2 className="text-xl font-bold mb-4">Adicionar Novo Cliente</h2>
            <form className="flex flex-col gap-4" onSubmit={handleNovoCliente}>
                <input
                    required
                    placeholder="Nome completo"
                    className="rounded px-4 py-2 border"
                    value={novoCliente.nome}
                    onChange={(e) =>
                        setNovoCliente({ ...novoCliente, nome: e.target.value })
                    }
                />
                <input
                    required
                    type="email"
                    placeholder="E-mail"
                    className="rounded px-4 py-2 border"
                    value={novoCliente.email}
                    onChange={(e) =>
                        setNovoCliente({ ...novoCliente, email: e.target.value })
                    }
                />
                <input
                    required
                    type="password"
                    placeholder="Senha"
                    className="rounded px-4 py-2 border"
                    value={novoCliente.senha}
                    onChange={(e) =>
                        setNovoCliente({ ...novoCliente, senha: e.target.value })
                    }
                />
                <input
                    required
                    placeholder="CPF"
                    className="rounded px-4 py-2 border"
                    value={novoCliente.cpf}
                    onChange={(e) =>
                        setNovoCliente({ ...novoCliente, cpf: e.target.value })
                    }
                />
                <input
                    required
                    placeholder="Telefone"
                    className="rounded px-4 py-2 border"
                    value={novoCliente.telefone}
                    onChange={(e) =>
                        setNovoCliente({ ...novoCliente, telefone: e.target.value })
                    }
                />
                <button
                    type="submit"
                    className="bg-blue-600 text-white rounded font-bold py-2 hover:bg-blue-700 transition"
                >
                    Adicionar
                </button>
                {msg && <div className="text-green-700 font-bold mt-2">{msg}</div>}
            </form>
        </div>
    );
}
