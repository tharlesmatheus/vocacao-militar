"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";

/*
 * Destino do e-mail enviado depois da compra ("defina sua senha") e também do
 * "esqueci minha senha". O Supabase coloca a sessão na URL; o cliente a lê
 * automaticamente e aqui o aluno só escolhe a senha.
 */

const campoClass =
    "w-full rounded-xl border border-border bg-card px-4 py-3 text-base text-foreground outline-none focus:ring-2 focus:ring-primary";

export default function DefinirSenhaPage() {
    const [estado, setEstado] = useState<"carregando" | "pronto" | "sem-sessao" | "salvo">("carregando");
    const [email, setEmail] = useState("");
    const [senha, setSenha] = useState("");
    const [confirmacao, setConfirmacao] = useState("");
    const [erro, setErro] = useState("");
    const [salvando, setSalvando] = useState(false);
    const [emailReenvio, setEmailReenvio] = useState("");
    const [reenviado, setReenviado] = useState(false);

    useEffect(() => {
        let ativo = true;

        const aplicar = (userEmail?: string | null) => {
            if (!ativo) return;
            setEmail(userEmail ?? "");
            setEstado("pronto");
        };

        const { data: sub } = supabase.auth.onAuthStateChange((_evento, sessao) => {
            if (sessao?.user) aplicar(sessao.user.email);
        });

        (async () => {
            const { data } = await supabase.auth.getSession();
            if (data.session?.user) return aplicar(data.session.user.email);
            // Dá um tempo para o cliente processar o token que veio na URL.
            setTimeout(async () => {
                const { data: d2 } = await supabase.auth.getSession();
                if (!ativo) return;
                if (d2.session?.user) aplicar(d2.session.user.email);
                else setEstado("sem-sessao");
            }, 1500);
        })();

        return () => {
            ativo = false;
            sub.subscription.unsubscribe();
        };
    }, []);

    async function salvar(e: React.FormEvent) {
        e.preventDefault();
        setErro("");
        if (senha.length < 8) return setErro("A senha precisa ter pelo menos 8 caracteres.");
        if (senha !== confirmacao) return setErro("As senhas não conferem.");

        setSalvando(true);
        const { error } = await supabase.auth.updateUser({ password: senha });
        setSalvando(false);
        if (error) return setErro(error.message);

        setEstado("salvo");
        setTimeout(() => (window.location.href = "/"), 1500);
    }

    async function reenviar(e: React.FormEvent) {
        e.preventDefault();
        setErro("");
        const { error } = await supabase.auth.resetPasswordForEmail(emailReenvio.trim().toLowerCase(), {
            redirectTo: `${window.location.origin}/definir-senha`,
        });
        if (error) return setErro(error.message);
        setReenviado(true);
    }

    return (
        <div className="w-full max-w-md rounded-3xl border border-border bg-card p-8 shadow-xl">
            <h1 className="mb-1 text-2xl font-extrabold text-foreground">Crie sua senha</h1>

            {estado === "carregando" && <p className="text-muted-foreground">Validando seu link...</p>}

            {estado === "pronto" && (
                <form onSubmit={salvar} className="mt-4 flex flex-col gap-3">
                    {email && <p className="text-sm text-muted-foreground">Conta: <b className="text-foreground">{email}</b></p>}
                    <input
                        className={campoClass}
                        type="password"
                        placeholder="Nova senha (mínimo 8 caracteres)"
                        autoComplete="new-password"
                        value={senha}
                        onChange={(e) => setSenha(e.target.value)}
                    />
                    <input
                        className={campoClass}
                        type="password"
                        placeholder="Repita a senha"
                        autoComplete="new-password"
                        value={confirmacao}
                        onChange={(e) => setConfirmacao(e.target.value)}
                    />
                    {erro && <p className="text-sm text-red-600">{erro}</p>}
                    <button
                        type="submit"
                        disabled={salvando}
                        className="rounded-xl bg-primary px-6 py-3 font-bold text-primary-foreground disabled:opacity-60"
                    >
                        {salvando ? "Salvando..." : "Salvar e começar a estudar"}
                    </button>
                </form>
            )}

            {estado === "salvo" && <p className="mt-4 text-green-700">Senha criada! Entrando na plataforma...</p>}

            {estado === "sem-sessao" && (
                <div className="mt-4 flex flex-col gap-3">
                    <p className="text-muted-foreground">
                        Este link expirou ou já foi usado. Informe seu e-mail para receber um novo.
                    </p>
                    {reenviado ? (
                        <p className="text-green-700">Pronto! Confira sua caixa de entrada (e o spam).</p>
                    ) : (
                        <form onSubmit={reenviar} className="flex flex-col gap-3">
                            <input
                                className={campoClass}
                                type="email"
                                placeholder="Seu e-mail"
                                value={emailReenvio}
                                onChange={(e) => setEmailReenvio(e.target.value)}
                            />
                            {erro && <p className="text-sm text-red-600">{erro}</p>}
                            <button type="submit" className="rounded-xl bg-primary px-6 py-3 font-bold text-primary-foreground">
                                Enviar novo link
                            </button>
                        </form>
                    )}
                    <Link href="/auth" className="text-center text-sm underline text-muted-foreground">Voltar para o login</Link>
                </div>
            )}
        </div>
    );
}
