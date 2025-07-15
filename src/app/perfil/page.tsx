"use client";

import { useState } from "react";
import { User2, Mail, Lock } from "lucide-react";

export default function PerfilPage() {
    const [editando, setEditando] = useState(false);
    const [nome, setNome] = useState("Aluno");
    const [email, setEmail] = useState("usuario@email.com");
    const [telefone, setTelefone] = useState("(11) 99999-9999");
    const [senhaAtual, setSenhaAtual] = useState("");
    const [novaSenha, setNovaSenha] = useState("");
    const [msg, setMsg] = useState("");

    const estatisticas = [
        { label: "Membro desde", valor: "Janeiro 2024" },
        { label: "Questões respondidas", valor: 156 },
        { label: "Taxa de acerto", valor: "78%" },
        { label: "Tempo total de estudo", valor: "42h 15min" },
        { label: "Conquistas desbloqueadas", valor: "8 de 15" },
        { label: "Posição no ranking", valor: "#42" },
    ];

    function handleSalvar(e: React.FormEvent) {
        e.preventDefault();
        setMsg("Dados atualizados com sucesso!");
        setEditando(false);
        setSenhaAtual("");
        setNovaSenha("");
        setTimeout(() => setMsg(""), 2500);
    }

    return (
        <div className="w-full max-w-5xl mx-auto px-2 sm:px-4 md:px-8 py-8 flex flex-col gap-6">
            
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-7">
                {/* Informações Pessoais */}
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
                        >
                            {editando ? "Cancelar" : "Editar"}
                        </button>
                    </div>
                    <div className="mb-3">
                        <label className="block text-sm font-medium text-[#425179] dark:text-[#b1bad3] mb-1">Nome Completo</label>
                        <input
                            type="text"
                            className="w-full px-3 py-2 rounded-lg bg-[#f5f7fa] dark:bg-[#23293a] border border-[#E3E8F3] dark:border-[#353a50] text-[#232939] dark:text-white outline-none focus:ring-2 focus:ring-[#6a88d7] text-sm font-medium transition"
                            value={nome}
                            onChange={e => setNome(e.target.value)}
                            disabled={!editando}
                        />
                    </div>
                    <div className="mb-3">
                        <label className="block text-sm font-medium text-[#425179] dark:text-[#b1bad3] mb-1">Email</label>
                        <input
                            type="email"
                            className="w-full px-3 py-2 rounded-lg bg-[#f5f7fa] dark:bg-[#23293a] border border-[#E3E8F3] dark:border-[#353a50] text-[#232939] dark:text-white outline-none focus:ring-2 focus:ring-[#6a88d7] text-sm font-medium transition"
                            value={email}
                            onChange={e => setEmail(e.target.value)}
                            disabled={!editando}
                        />
                    </div>
                    <div className="mb-3">
                        <label className="block text-sm font-medium text-[#425179] dark:text-[#b1bad3] mb-1">Telefone</label>
                        <input
                            type="tel"
                            className="w-full px-3 py-2 rounded-lg bg-[#f5f7fa] dark:bg-[#23293a] border border-[#E3E8F3] dark:border-[#353a50] text-[#232939] dark:text-white outline-none focus:ring-2 focus:ring-[#6a88d7] text-sm font-medium transition"
                            value={telefone}
                            onChange={e => setTelefone(e.target.value)}
                            disabled={!editando}
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
                                placeholder="Senha atual"
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
                        >
                            Salvar Alterações
                        </button>
                    )}
                    {msg && (
                        <div className="text-green-500 text-sm mt-2">{msg}</div>
                    )}
                </form>

                {/* Estatísticas */}
                <div className="bg-white dark:bg-[#181F2C] rounded-2xl border border-[#E3E8F3] dark:border-[#232939] p-6 flex flex-col shadow">
                    <div className="flex items-center gap-2 mb-5">
                        <Mail className="w-5 h-5 text-[#6a88d7]" />
                        <h2 className="font-bold text-lg text-[#232939] dark:text-white">
                            Estatísticas do Perfil
                        </h2>
                    </div>
                    <ul className="divide-y divide-[#e3e8f3] dark:divide-[#232939]">
                        {estatisticas.map((item, idx) => (
                            <li
                                key={idx}
                                className="flex items-center justify-between py-3 text-[#425179] dark:text-[#b1bad3] text-sm"
                            >
                                <span>{item.label}</span>
                                <span className="font-bold text-[#232939] dark:text-white">{item.valor}</span>
                            </li>
                        ))}
                    </ul>
                </div>
            </div>
        </div>
    );
}
