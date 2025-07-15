"use client";
import { useState } from "react";

export default function AuthPage() {
    const [mode, setMode] = useState<"login" | "register">("login");
    const [email, setEmail] = useState("");
    const [senha, setSenha] = useState("");
    const [nome, setNome] = useState(""); // só para cadastro

    // Troque depois pelo backend real!
    function handleLogin(e: React.FormEvent) {
        e.preventDefault();
        alert("Fazer login com: " + email);
    }

    function handleRegister(e: React.FormEvent) {
        e.preventDefault();
        alert("Cadastrar: " + nome + ", " + email);
    }

    return (
        <div className="flex min-h-screen bg-[#f8fafc] items-center justify-center px-4">
            <div className="bg-white shadow-xl border border-[#e3e8f3] rounded-2xl p-8 max-w-xs w-full flex flex-col items-center">
                <div className="mb-6 text-center">
                    <div className="text-2xl font-black text-[#232939] mb-1">Vocação Militar</div>
                    <div className="text-xs text-[#7b8bb0]">Acesse sua conta</div>
                </div>
                <div className="flex w-full mb-4">
                    <button
                        className={`flex-1 py-2 rounded-l-xl font-bold text-sm transition 
                            ${mode === "login" ? "bg-[#6a88d7] text-white" : "bg-[#f3f6fa] text-[#232939]"}`}
                        onClick={() => setMode("login")}
                    >Entrar</button>
                    <button
                        className={`flex-1 py-2 rounded-r-xl font-bold text-sm transition 
                            ${mode === "register" ? "bg-[#6a88d7] text-white" : "bg-[#f3f6fa] text-[#232939]"}`}
                        onClick={() => setMode("register")}
                    >Cadastrar</button>
                </div>
                <form
                    onSubmit={mode === "login" ? handleLogin : handleRegister}
                    className="w-full flex flex-col gap-3"
                >
                    {mode === "register" && (
                        <input
                            type="text"
                            required
                            placeholder="Nome completo"
                            className="px-4 py-2 rounded border border-[#e3e8f3] bg-[#f9fafb] outline-none text-sm"
                            value={nome}
                            onChange={e => setNome(e.target.value)}
                        />
                    )}
                    <input
                        type="email"
                        required
                        placeholder="Email"
                        className="px-4 py-2 rounded border border-[#e3e8f3] bg-[#f9fafb] outline-none text-sm"
                        value={email}
                        onChange={e => setEmail(e.target.value)}
                    />
                    <input
                        type="password"
                        required
                        placeholder="Senha"
                        className="px-4 py-2 rounded border border-[#e3e8f3] bg-[#f9fafb] outline-none text-sm"
                        value={senha}
                        onChange={e => setSenha(e.target.value)}
                    />
                    <button
                        type="submit"
                        className="w-full mt-2 py-2 bg-[#6a88d7] hover:bg-[#5272b4] text-white font-bold rounded-lg shadow transition"
                    >
                        {mode === "login" ? "Entrar" : "Cadastrar"}
                    </button>
                </form>
                <div className="mt-5 text-xs text-[#7b8bb0] text-center">
                    Ao entrar, você concorda com nossos <a href="#" className="underline">Termos de Uso</a>
                </div>
            </div>
        </div>
    );
}
