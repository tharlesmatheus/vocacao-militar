"use client";
import React, { useState, useEffect } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useRouter } from "next/navigation";

export default function CriarAdminPage() {
    const [podeCriar, setPodeCriar] = useState<boolean | null>(null);
    const [form, setForm] = useState({
        email: "",
        senha: "",
        cpf: "",
        nome: "",
    });
    const [msg, setMsg] = useState("");
    const router = useRouter();

    useEffect(() => {
        // Verifica se já existe algum admin cadastrado
        async function checkAdmin() {
            // Precisa buscar por usuários que tenham is_admin no metadata
            const { data, error } = await supabase.rpc("buscar_admins");
            // Se existe algum, não pode criar outro por aqui
            setPodeCriar(data?.length === 0);
        }
        checkAdmin();
    }, []);

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        setMsg("Enviando...");
        const { email, senha, cpf, nome } = form;

        // Cria usuário no Supabase Auth
        const { data, error } = await supabase.auth.signUp({
            email,
            password: senha,
            options: {
                data: {
                    cpf,
                    nome,
                    is_admin: true,
                },
            },
        });

        if (error) {
            setMsg("Erro: " + error.message);
            return;
        }

        setMsg(
            "Admin criado! Verifique o e-mail para ativar a conta. AGORA APAGUE ESSA TELA por segurança."
        );
        setForm({ email: "", senha: "", cpf: "", nome: "" });
    }

    if (podeCriar === null) {
        return <div className="p-8 text-center">Verificando...</div>;
    }
    if (!podeCriar) {
        return (
            <div className="p-8 text-center text-red-600 font-bold">
                Já existe um admin cadastrado! Bloqueie ou exclua esta rota imediatamente.
            </div>
        );
    }

    return (
        <div className="min-h-screen flex items-center justify-center bg-[#f3f6fa]">
            <form
                className="bg-white p-8 rounded-2xl shadow-md max-w-sm w-full space-y-6"
                onSubmit={handleSubmit}
            >
                <h1 className="text-2xl font-bold text-center mb-2">Criar Primeiro Admin</h1>
                <input
                    type="text"
                    required
                    placeholder="Nome"
                    className="w-full rounded px-4 py-2 border"
                    value={form.nome}
                    onChange={e => setForm({ ...form, nome: e.target.value })}
                />
                <input
                    type="email"
                    required
                    placeholder="E-mail"
                    className="w-full rounded px-4 py-2 border"
                    value={form.email}
                    onChange={e => setForm({ ...form, email: e.target.value })}
                />
                <input
                    type="password"
                    required
                    placeholder="Senha"
                    className="w-full rounded px-4 py-2 border"
                    value={form.senha}
                    onChange={e => setForm({ ...form, senha: e.target.value })}
                />
                <input
                    type="text"
                    required
                    placeholder="CPF"
                    className="w-full rounded px-4 py-2 border"
                    value={form.cpf}
                    onChange={e => setForm({ ...form, cpf: e.target.value })}
                    maxLength={14}
                />
                {msg && <div className="text-center text-green-700 text-sm">{msg}</div>}
                <button
                    type="submit"
                    className="w-full bg-blue-600 text-white font-bold rounded py-2 hover:bg-blue-700 transition"
                >
                    Criar Admin
                </button>
            </form>
        </div>
    );
}
