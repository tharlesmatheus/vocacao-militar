"use client";
import React, { useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useRouter } from "next/navigation";

export default function AdminLogin() {
    const [email, setEmail] = useState("");
    const [senha, setSenha] = useState("");
    const [cpf, setCpf] = useState("");
    const [erro, setErro] = useState("");
    const router = useRouter();

    async function handleLogin(e: React.FormEvent) {
        e.preventDefault();
        setErro("");

        // 1. Login com email/senha
        const { data, error } = await supabase.auth.signInWithPassword({
            email,
            password: senha,
        });

        if (error || !data.user) {
            setErro("E-mail ou senha incorretos.");
            return;
        }

        // 2. Verifica CPF e is_admin
        const user = data.user;
        if (!user.user_metadata?.is_admin) {
            setErro("Acesso restrito ao administrador.");
            await supabase.auth.signOut();
            return;
        }
        if (
            user.user_metadata?.cpf?.replace(/\D/g, "") !== cpf.replace(/\D/g, "")
        ) {
            setErro("CPF incorreto.");
            await supabase.auth.signOut();
            return;
        }

        // 3. Libera acesso
        router.push("/admin");
    }

    return (
        <div className="w-full h-screen flex items-center justify-center bg-[#f3f6fa]">
            <form className="bg-white p-8 rounded-2xl shadow-md max-w-sm w-full space-y-6" onSubmit={handleLogin}>
                <h1 className="text-2xl font-bold text-center">Login Admin</h1>
                <input
                    type="email"
                    required
                    placeholder="E-mail"
                    className="w-full rounded px-4 py-2 border"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                />
                <input
                    type="password"
                    required
                    placeholder="Senha"
                    className="w-full rounded px-4 py-2 border"
                    value={senha}
                    onChange={e => setSenha(e.target.value)}
                />
                <input
                    type="text"
                    required
                    placeholder="CPF"
                    className="w-full rounded px-4 py-2 border"
                    value={cpf}
                    onChange={e => setCpf(e.target.value)}
                    maxLength={14}
                />
                {erro && <div className="text-red-500 text-sm text-center">{erro}</div>}
                <button type="submit" className="w-full bg-blue-600 text-white font-bold rounded py-2 hover:bg-blue-700 transition">Entrar</button>
            </form>
        </div>
    );
}
