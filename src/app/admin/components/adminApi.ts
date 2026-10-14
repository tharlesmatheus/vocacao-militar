"use client";

import { supabase } from "@/lib/supabaseClient";

/** Chama as rotas /api/admin/* com o token do administrador logado. */
export async function adminApi<T = any>(caminho: string, init: RequestInit = {}): Promise<T> {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token ?? "";
    const r = await fetch(caminho, {
        ...init,
        headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
            ...(init.headers ?? {}),
        },
    });
    const corpo = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(corpo?.error || `Erro ${r.status}`);
    return corpo as T;
}

export const dataHora = (iso?: string | null) =>
    iso ? new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }) : "—";

export const dataCurta = (iso?: string | null) =>
    iso ? new Date(iso).toLocaleDateString("pt-BR") : "—";

export const reais = (v?: number | null) =>
    typeof v === "number" ? v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) : "—";

export const cartao = "rounded-2xl border border-[#e4e8f3] bg-white p-5 shadow-sm";
export const botao = "rounded-lg px-3 py-1.5 text-sm font-semibold transition disabled:opacity-50";
export const entrada = "rounded-lg border border-[#d6dcec] bg-white px-3 py-2 text-sm text-[#232939] outline-none focus:ring-2 focus:ring-[#6a88d7]";
