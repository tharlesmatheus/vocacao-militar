"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";

const UTM_CHAVES = ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term", "src"];

function mascaraTelefone(valor: string) {
    const d = valor.replace(/\D/g, "").slice(0, 11);
    if (d.length <= 2) return d ? `(${d}` : "";
    if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
    if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
    return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

const campoClass =
    "w-full rounded-xl border border-border bg-card px-4 py-3 text-base text-foreground outline-none focus:ring-2 focus:ring-primary";

/**
 * Formulário antes do checkout: grava o lead e leva para a Kiwify com os
 * dados já preenchidos. O id do lead vai junto (sck) para ligar a compra à conta.
 */
export function FormularioAssinatura({ preco }: { preco: string }) {
    const [nome, setNome] = useState("");
    const [email, setEmail] = useState("");
    const [telefone, setTelefone] = useState("");
    const [aceiteTermos, setAceiteTermos] = useState(false);
    const [aceiteContato, setAceiteContato] = useState(false); // LGPD: consentimento não vem marcado
    const [empresa, setEmpresa] = useState(""); // armadilha para robôs (campo invisível)
    const [enviando, setEnviando] = useState(false);
    const [erro, setErro] = useState("");
    const [token, setToken] = useState<string | null>(null);

    // Se a pessoa já tem conta e está logada, preenche com os dados dela.
    useEffect(() => {
        (async () => {
            const { data } = await supabase.auth.getSession();
            const s = data.session;
            if (!s) return;
            setToken(s.access_token);
            setEmail(s.user.email ?? "");
            setNome(String(s.user.user_metadata?.nome ?? ""));
        })();
    }, []);

    async function enviar(e: React.FormEvent) {
        e.preventDefault();
        setErro("");

        if (!aceiteTermos) {
            setErro("Para continuar, aceite os Termos de Uso e a Política de Privacidade.");
            return;
        }

        setEnviando(true);
        try {
            const params = new URLSearchParams(window.location.search);
            const utm: Record<string, string> = {};
            UTM_CHAVES.forEach((k) => {
                const v = params.get(k);
                if (v) utm[k] = v;
            });

            const r = await fetch("/api/leads", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    ...(token ? { Authorization: `Bearer ${token}` } : {}),
                },
                body: JSON.stringify({
                    nome,
                    email,
                    telefone,
                    aceite_termos: aceiteTermos,
                    aceite_contato: aceiteContato,
                    utm,
                    empresa,
                }),
            });
            const corpo = await r.json().catch(() => ({}));
            if (!r.ok || !corpo.url) throw new Error(corpo.error || "Não foi possível continuar. Tente novamente.");

            window.location.href = corpo.url;
        } catch (e: any) {
            setErro(e?.message || "Não foi possível continuar. Tente novamente.");
            setEnviando(false);
        }
    }

    return (
        <form onSubmit={enviar} className="flex flex-col gap-3" noValidate>
            <input
                className={campoClass}
                placeholder="Seu nome"
                autoComplete="name"
                value={nome}
                onChange={(e) => setNome(e.target.value)}
                required
                aria-label="Nome"
            />
            <input
                className={campoClass}
                type="email"
                placeholder="Seu melhor e-mail"
                autoComplete="email"
                inputMode="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                aria-label="E-mail"
            />
            <input
                className={campoClass}
                type="tel"
                placeholder="WhatsApp com DDD"
                autoComplete="tel"
                inputMode="tel"
                value={telefone}
                onChange={(e) => setTelefone(mascaraTelefone(e.target.value))}
                aria-label="Telefone"
            />

            {/* Invisível para pessoas; robôs preenchem e são descartados. */}
            <input
                type="text"
                tabIndex={-1}
                autoComplete="off"
                value={empresa}
                onChange={(e) => setEmpresa(e.target.value)}
                className="hidden"
                aria-hidden="true"
            />

            <label className="flex items-start gap-2 text-sm text-muted-foreground">
                <input
                    type="checkbox"
                    className="mt-1 h-4 w-4 accent-primary"
                    checked={aceiteTermos}
                    onChange={(e) => setAceiteTermos(e.target.checked)}
                />
                <span>
                    Li e aceito os{" "}
                    <Link href="/termos" target="_blank" className="underline text-foreground">Termos de Uso</Link>{" "}
                    e a{" "}
                    <Link href="/privacidade" target="_blank" className="underline text-foreground">Política de Privacidade</Link>.
                </span>
            </label>
            <label className="flex items-start gap-2 text-sm text-muted-foreground">
                <input
                    type="checkbox"
                    className="mt-1 h-4 w-4 accent-primary"
                    checked={aceiteContato}
                    onChange={(e) => setAceiteContato(e.target.checked)}
                />
                <span>Quero receber avisos de concursos e dicas de estudo por e-mail ou WhatsApp.</span>
            </label>

            {erro && <div className="text-sm text-red-600">{erro}</div>}

            <button
                type="submit"
                disabled={enviando}
                className="mt-1 rounded-xl bg-primary px-6 py-4 text-base font-bold text-primary-foreground shadow-lg transition hover:opacity-90 disabled:opacity-60"
            >
                {enviando ? "Abrindo pagamento seguro..." : `Assinar por ${preco}/mês`}
            </button>
            <p className="text-center text-xs text-muted-foreground">
                Pagamento seguro pela Kiwify • Cartão ou Pix automático • Cancele quando quiser
            </p>
        </form>
    );
}

export default FormularioAssinatura;
