"use client";

import { useState, useEffect } from "react";
import { User2, Lock } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";

export default function PerfilPage() {
    const [editando, setEditando] = useState(false);
    const [nome, setNome] = useState("");
    const [email, setEmail] = useState("");
    const [telefone, setTelefone] = useState("");
    const [criadoEm, setCriadoEm] = useState("");
    const [senhaAtual, setSenhaAtual] = useState("");
    const [novaSenha, setNovaSenha] = useState("");
    const [msg, setMsg] = useState("");
    const [loading, setLoading] = useState(true);

    // Carrega dados do usuário ao abrir página
    useEffect(() => {
        async function fetchUser() {
            setLoading(true);
            const { data: { user } } = await supabase.auth.getUser();
            if (user) {
                setNome(user.user_metadata?.nome ?? "");
                setEmail(user.email ?? "");
                setTelefone(user.phone ?? user.user_metadata?.telefone ?? "");
                setCriadoEm(
                    user.created_at
                        ? new Date(user.created_at).toLocaleDateString("pt-BR", { month: "long", year: "numeric" })
                        : ""
                );
            }
            setLoading(false);
        }
        fetchUser();
    }, []);

    async function handleSalvar(e: React.FormEvent) {
        e.preventDefault();
        setMsg("");
        setLoading(true);

        // Atualiza nome/telefone no user_metadata
        const updates: any = { data: { nome, telefone } };

        // Atualiza telefone raiz (caso usuário queira receber código via SMS etc)
        if (telefone) updates.phone = telefone;

        const { error } = await supabase.auth.updateUser(updates);
        if (error) {
            setMsg("Erro ao atualizar dados: " + error.message);
            setLoading(false);
            return;
        }

        // Atualiza senha se informado
        if (senhaAtual && novaSenha) {
            const { error: errSenha } = await supabase.auth.updateUser({ password: novaSenha });
            if (errSenha) {
                setMsg("Erro ao atualizar senha: " + errSenha.message);
                setLoading(false);
                return;
            }
        }

        setMsg("Dados atualizados com sucesso!");
        setEditando(false);
        setSenhaAtual("");
        setNovaSenha("");
        setLoading(false);
        setTimeout(() => setMsg(""), 2500);
    }

    return (
        <div className="w-full max-w-2xl mx-auto px-2 sm:px-4 md:px-8 py-8 flex flex-col gap-6">
            <form
                onSubmit={handleSalvar}
                className="bg-white dark:bg-[#181F2C] rounded-2xl border border-[#E3E8F3] dark:border-[#232939] p-6 flex flex-col relative shadow"
            >
                <div className="flex items-center mb-6 gap-2">
                    <User2 className="w-6 h-6 text-[#6a88d7]" />
                    <h2 className="font-bold text-lg text-[#232939] dark:text-white">
                        Informações Pessoais
                    </h2>
                    <button
                        type="button"
                        className="ml-auto bg-[#6a88d7] hover:bg-[#5272b4] text-white rounded-lg px-4 py-1 font-semibold text-sm transition"
                        onClick={() => setEditando((v) => !v)}
                        disabled={loading}
                    >
                        {editando ? "Cancelar" : "Editar"}
                    </button>
                </div>

                {/* Membro desde */}
                <div className="mb-3">
                    <label className="block text-sm font-medium text-[#425179] dark:text-[#b1bad3] mb-1">
                        Membro desde
                    </label>
                    <input
                        type="text"
                        className="w-full px-3 py-2 rounded-lg bg-[#f5f7fa] dark:bg-[#23293a] border border-[#E3E8F3] dark:border-[#353a50] text-[#232939] dark:text-white outline-none text-sm font-medium transition"
                        value={criadoEm}
                        disabled
                    />
                </div>
                {/* Nome */}
                <div className="mb-3">
                    <label className="block text-sm font-medium text-[#425179] dark:text-[#b1bad3] mb-1">
                        Nome Completo
                    </label>
                    <input
                        type="text"
                        className="w-full px-3 py-2 rounded-lg bg-[#f5f7fa] dark:bg-[#23293a] border border-[#E3E8F3] dark:border-[#353a50] text-[#232939] dark:text-white outline-none focus:ring-2 focus:ring-[#6a88d7] text-sm font-medium transition"
                        value={nome}
                        onChange={e => setNome(e.target.value)}
                        disabled={!editando || loading}
                        autoComplete="name"
                    />
                </div>
                {/* Email */}
                <div className="mb-3">
                    <label className="block text-sm font-medium text-[#425179] dark:text-[#b1bad3] mb-1">
                        Email
                    </label>
                    <input
                        type="email"
                        className="w-full px-3 py-2 rounded-lg bg-[#f5f7fa] dark:bg-[#23293a] border border-[#E3E8F3] dark:border-[#353a50] text-[#232939] dark:text-white outline-none text-sm font-medium transition"
                        value={email}
                        disabled // Email não pode ser alterado pelo usuário diretamente
                    />
                </div>
                {/* Telefone */}
                <div className="mb-3">
                    <label className="block text-sm font-medium text-[#425179] dark:text-[#b1bad3] mb-1">
                        Telefone
                    </label>
                    <input
                        type="tel"
                        className="w-full px-3 py-2 rounded-lg bg-[#f5f7fa] dark:bg-[#23293a] border border-[#E3E8F3] dark:border-[#353a50] text-[#232939] dark:text-white outline-none focus:ring-2 focus:ring-[#6a88d7] text-sm font-medium transition"
                        value={telefone}
                        onChange={e => setTelefone(e.target.value)}
                        disabled={!editando || loading}
                        autoComplete="tel"
                    />
                </div>
                {/* Troca de Senha */}
                {editando && (
                    <div className="mb-3">
                        <label className="block text-sm font-medium text-[#425179] dark:text-[#b1bad3] mb-1 flex items-center gap-2">
                            <Lock className="w-4 h-4" /> Trocar Senha
                        </label>
                        <input
                            type="password"
                            placeholder="Senha atual (não obrigatório)"
                            className="w-full px-3 py-2 mb-2 rounded-lg bg-[#f5f7fa] dark:bg-[#23293a] border border-[#E3E8F3] dark:border-[#353a50] text-[#232939] dark:text-white outline-none focus:ring-2 focus:ring-[#6a88d7] text-sm font-medium transition"
                            value={senhaAtual}
                            onChange={e => setSenhaAtual(e.target.value)}
                            autoComplete="current-password"
                        />
                        <input
                            type="password"
                            placeholder="Nova senha"
                            className="w-full px-3 py-2 rounded-lg bg-[#f5f7fa] dark:bg-[#23293a] border border-[#E3E8F3] dark:border-[#353a50] text-[#232939] dark:text-white outline-none focus:ring-2 focus:ring-[#6a88d7] text-sm font-medium transition"
                            value={novaSenha}
                            onChange={e => setNovaSenha(e.target.value)}
                            autoComplete="new-password"
                        />
                    </div>
                )}
                {/* Salvar */}
                {editando && (
                    <button
                        type="submit"
                        className="mt-2 bg-[#6a88d7] hover:bg-[#5272b4] text-white rounded-lg px-5 py-2 font-bold text-sm transition"
                        disabled={loading}
                    >
                        {loading ? "Salvando..." : "Salvar Alterações"}
                    </button>
                )}
                {msg && (
                    <div className="text-green-500 text-sm mt-2">{msg}</div>
                )}
            </form>
        </div>
    );
}
