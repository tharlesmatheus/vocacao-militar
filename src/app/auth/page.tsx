"use client";
import { eventoPixel } from "@/lib/pixel";
import { useState } from "react";
import { ShieldCheck } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { erroAuth } from "@/lib/errosAuth";

type Modo = "login" | "register" | "recuperar";

const campo =
    "w-full rounded-lg border border-border bg-muted px-4 py-2.5 text-sm text-foreground outline-none focus:ring-2 focus:ring-primary";

export default function AuthPage() {
    const [mode, setMode] = useState<Modo>("login");
    const [email, setEmail] = useState("");
    const [senha, setSenha] = useState("");
    const [nome, setNome] = useState("");
    const [loading, setLoading] = useState(false);
    const [erro, setErro] = useState("");
    const [aviso, setAviso] = useState("");

    function trocar(m: Modo) {
        setMode(m);
        setErro("");
        setAviso("");
    }

    async function handleLoginGoogle() {
        setErro("");
        setLoading(true);
        const { error } = await supabase.auth.signInWithOAuth({
            provider: "google",
            options: { redirectTo: window.location.origin + "/" },
        });
        // Sem erro, o navegador sai desta página para o Google.
        if (error) {
            setLoading(false);
            setErro(erroAuth(error.message));
        }
    }

    async function handleLogin(e: React.FormEvent) {
        e.preventDefault();
        setErro("");
        setLoading(true);
        const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password: senha });
        if (error) {
            setLoading(false);
            setErro(erroAuth(error.message));
            return;
        }
        window.location.href = "/";
    }

    async function handleRegister(e: React.FormEvent) {
        e.preventDefault();
        setErro("");
        if (senha.length < 8) return setErro("A senha precisa ter pelo menos 8 caracteres.");
        setLoading(true);
        const { error } = await supabase.auth.signUp({
            email: email.trim(),
            password: senha,
            options: { data: { nome: nome.trim() } },
        });
        setLoading(false);
        if (error) return setErro(erroAuth(error.message));
        eventoPixel("CompleteRegistration");
        setMode("login");
        setAviso("Cadastro feito! Confirme pelo link que enviamos para o seu e-mail (veja também o spam) e depois entre.");
    }

    async function handleRecuperar(e: React.FormEvent) {
        e.preventDefault();
        setErro("");
        setLoading(true);
        const { error } = await supabase.auth.resetPasswordForEmail(email.trim().toLowerCase(), {
            redirectTo: `${window.location.origin}/definir-senha`,
        });
        setLoading(false);
        if (error) return setErro(erroAuth(error.message));
        setAviso("Se este e-mail tiver cadastro, você vai receber um link para criar uma nova senha. Veja também o spam.");
    }

    const enviar = mode === "login" ? handleLogin : mode === "register" ? handleRegister : handleRecuperar;
    const rotuloBotao = loading
        ? "Aguarde..."
        : mode === "login" ? "Entrar" : mode === "register" ? "Cadastrar" : "Enviar link";

    return (
        <div className="flex min-h-screen w-full items-center justify-center bg-background px-4">
            <div className="relative flex w-full max-w-xs flex-col items-center overflow-hidden rounded-lg border border-border bg-card p-8 shadow-xl">
                <span aria-hidden className="absolute inset-x-0 top-0 h-[3px] bg-primary" />
                <div className="mb-6 text-center">
                    <ShieldCheck className="mx-auto mb-2 h-10 w-10 text-primary" aria-hidden />
                    <h1 className="mb-1 font-titulo text-3xl font-extrabold uppercase tracking-wide text-foreground">
                        Vocação <span className="text-primary">Militar</span>
                    </h1>
                    <p className="text-xs text-muted-foreground">
                        {mode === "recuperar" ? "Recuperar acesso" : "Acesse sua conta"}
                    </p>
                </div>

                {mode !== "recuperar" && (
                    <div className="mb-4 flex w-full" role="tablist">
                        <button
                            className={`flex-1 rounded-l-xl py-2 text-sm font-bold transition ${mode === "login" ? "bg-primary text-primary-foreground" : "bg-muted text-foreground"}`}
                            onClick={() => trocar("login")}
                            type="button"
                            role="tab"
                            aria-selected={mode === "login"}
                        >Entrar</button>
                        <button
                            className={`flex-1 rounded-r-xl py-2 text-sm font-bold transition ${mode === "register" ? "bg-primary text-primary-foreground" : "bg-muted text-foreground"}`}
                            onClick={() => trocar("register")}
                            type="button"
                            role="tab"
                            aria-selected={mode === "register"}
                        >Cadastrar</button>
                    </div>
                )}

                {mode === "recuperar" && (
                    <p className="mb-4 text-center text-sm text-muted-foreground">
                        Informe o e-mail da sua conta. Enviaremos um link para você criar uma nova senha.
                    </p>
                )}

                <form onSubmit={enviar} className="flex w-full flex-col gap-3">
                    {mode === "register" && (
                        <label className="flex flex-col gap-1">
                            <span className="sr-only">Nome completo</span>
                            <input type="text" required autoComplete="name" placeholder="Nome completo" className={campo} value={nome} onChange={(e) => setNome(e.target.value)} />
                        </label>
                    )}
                    <label className="flex flex-col gap-1">
                        <span className="sr-only">E-mail</span>
                        <input type="email" required autoComplete="email" placeholder="E-mail" className={campo} value={email} onChange={(e) => setEmail(e.target.value)} />
                    </label>
                    {mode !== "recuperar" && (
                        <label className="flex flex-col gap-1">
                            <span className="sr-only">Senha</span>
                            <input
                                type="password"
                                required
                                autoComplete={mode === "login" ? "current-password" : "new-password"}
                                placeholder={mode === "register" ? "Senha (mínimo 8 caracteres)" : "Senha"}
                                className={campo}
                                value={senha}
                                onChange={(e) => setSenha(e.target.value)}
                            />
                        </label>
                    )}

                    {mode === "login" && (
                        <button type="button" onClick={() => trocar("recuperar")} className="self-end text-xs font-semibold text-primary hover:underline">
                            Esqueci minha senha
                        </button>
                    )}

                    {erro && (
                        <p role="alert" className="rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-700 dark:text-red-300">{erro}</p>
                    )}
                    {aviso && (
                        <p role="status" className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-800 dark:text-emerald-300">{aviso}</p>
                    )}

                    <button
                        type="submit"
                        className="mt-1 w-full rounded-lg bg-primary py-2.5 font-bold text-primary-foreground shadow transition hover:bg-primary/90 disabled:opacity-60"
                        disabled={loading}
                    >
                        {rotuloBotao}
                    </button>
                </form>

                {mode === "recuperar" ? (
                    <button type="button" onClick={() => trocar("login")} className="mt-4 text-sm font-semibold text-primary hover:underline">
                        Voltar para o login
                    </button>
                ) : (
                    <button
                        type="button"
                        onClick={handleLoginGoogle}
                        className="mt-2 flex w-full items-center justify-center gap-2 rounded-lg border border-border bg-muted py-2.5 font-bold text-foreground shadow transition hover:bg-muted/70 disabled:opacity-60"
                        disabled={loading}
                    >
                        <svg viewBox="0 0 48 48" className="h-5 w-5" aria-hidden>
                            <g>
                                <path fill="#4285F4" d="M44.5 20H24v8.5h11.7C34.1 33 29.5 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c2.7 0 5.2.9 7.1 2.5l6.4-6.4C34.3 5.1 29.4 3 24 3 12.4 3 3 12.4 3 24s9.4 21 21 21c10.5 0 20-7.5 20-21 0-1.3-.1-2.3-.3-3z" />
                                <path fill="#34A853" d="M6.3 14.7l7 5.1C15.1 17.1 19.2 14 24 14c2.7 0 5.2.9 7.1 2.5l6.4-6.4C34.3 5.1 29.4 3 24 3c-7.7 0-14.2 4.8-17.7 11.7z" />
                                <path fill="#FBBC05" d="M24 44c5.5 0 10.2-1.8 13.6-4.9l-6.3-5.2c-2.2 1.5-5.2 2.4-8.3 2.4-5.1 0-9.4-3.4-10.9-8H6.2C9.7 39.2 16.2 44 24 44z" />
                                <path fill="#EA4335" d="M44.5 20H24v8.5h11.7C34.1 33 29.5 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c2.7 0 5.2.9 7.1 2.5l6.4-6.4C34.3 5.1 29.4 3 24 3 12.4 3 3 12.4 3 24s9.4 21 21 21c10.5 0 20-7.5 20-21 0-1.3-.1-2.3-.3-3z" />
                            </g>
                        </svg>
                        Entrar com Google
                    </button>
                )}

                <div className="mt-5 text-center text-xs text-muted-foreground">
                    Ao entrar, você concorda com nossos <a href="/termos" className="underline">Termos de Uso</a> e a{" "}
                    <a href="/privacidade" className="underline">Política de Privacidade</a>
                </div>
                <div className="mt-3 text-center text-sm text-foreground">
                    Ainda não é assinante? <a href="/assinar" className="font-semibold underline">Conheça a Vocação Militar</a>
                </div>
            </div>
        </div>
    );
}
