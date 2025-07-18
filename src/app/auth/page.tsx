"use client";
import { useState } from "react";
import { supabase } from "../../lib/supabaseClient"; // ajuste o caminho se necessário!

export default function AuthPage() {
    const [mode, setMode] = useState<"login" | "register">("login");
    const [email, setEmail] = useState("");
    const [senha, setSenha] = useState("");
    const [nome, setNome] = useState("");
    const [loading, setLoading] = useState(false);

    // Login com Google
    async function handleLoginGoogle() {
        setLoading(true);
        const { error } = await supabase.auth.signInWithOAuth({
            provider: "google",
            options: {
                redirectTo: typeof window !== "undefined"
                    ? window.location.origin + "/"
                    : undefined,
            }
        });
        setLoading(false);
        if (error) {
            alert("Erro ao logar com Google: " + error.message);
        }
        // O Supabase cuida do redirecionamento após o OAuth
    }

    // Login email/senha
    async function handleLogin(e: React.FormEvent) {
        e.preventDefault();
        setLoading(true);
        const { error } = await supabase.auth.signInWithPassword({
            email,
            password: senha,
        });
        setLoading(false);
        if (error) {
            alert("Erro ao entrar: " + error.message);
        } else {
            window.location.href = "/"; // Redireciona para home
        }
    }

    // Cadastro email/senha
    async function handleRegister(e: React.FormEvent) {
        e.preventDefault();
        setLoading(true);
        const { error } = await supabase.auth.signUp({
            email,
            password: senha,
            options: { data: { nome } }
        });
        setLoading(false);
        if (error) {
            alert("Erro ao cadastrar: " + error.message);
        } else {
            alert("Cadastro realizado! Confira seu email.");
            setMode("login");
            // Se quiser já logar após cadastro e redirecionar, basta logar aqui e redirecionar.
            // window.location.href = "/";
        }
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
                        type="button"
                    >Entrar</button>
                    <button
                        className={`flex-1 py-2 rounded-r-xl font-bold text-sm transition 
                            ${mode === "register" ? "bg-[#6a88d7] text-white" : "bg-[#f3f6fa] text-[#232939]"}`}
                        onClick={() => setMode("register")}
                        type="button"
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
                        disabled={loading}
                    >
                        {loading ? "Aguarde..." : mode === "login" ? "Entrar" : "Cadastrar"}
                    </button>
                </form>
                <button
                    type="button"
                    onClick={handleLoginGoogle}
                    className="w-full mt-2 py-2 bg-[#efefef] hover:bg-[#e2e2e2] text-[#232939] font-bold rounded-lg shadow flex items-center justify-center gap-2 transition"
                    disabled={loading}
                >
                    <svg viewBox="0 0 48 48" className="w-5 h-5" style={{ marginRight: 6 }}>
                        <g>
                            <path fill="#4285F4" d="M44.5 20H24v8.5h11.7C34.1 33 29.5 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c2.7 0 5.2.9 7.1 2.5l6.4-6.4C34.3 5.1 29.4 3 24 3 12.4 3 3 12.4 3 24s9.4 21 21 21c10.5 0 20-7.5 20-21 0-1.3-.1-2.3-.3-3z" />
                            <path fill="#34A853" d="M6.3 14.7l7 5.1C15.1 17.1 19.2 14 24 14c2.7 0 5.2.9 7.1 2.5l6.4-6.4C34.3 5.1 29.4 3 24 3c-7.7 0-14.2 4.8-17.7 11.7z" />
                            <path fill="#FBBC05" d="M24 44c5.5 0 10.2-1.8 13.6-4.9l-6.3-5.2c-2.2 1.5-5.2 2.4-8.3 2.4-5.1 0-9.4-3.4-10.9-8H6.2C9.7 39.2 16.2 44 24 44z" />
                            <path fill="#EA4335" d="M44.5 20H24v8.5h11.7C34.1 33 29.5 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c2.7 0 5.2.9 7.1 2.5l6.4-6.4C34.3 5.1 29.4 3 24 3 12.4 3 3 12.4 3 24s9.4 21 21 21c10.5 0 20-7.5 20-21 0-1.3-.1-2.3-.3-3z" />
                        </g>
                    </svg>
                    Entrar com Google
                </button>
                <div className="mt-5 text-xs text-[#7b8bb0] text-center">
                    Ao entrar, você concorda com nossos <a href="#" className="underline">Termos de Uso</a>
                </div>
            </div>
        </div>
    );
}
