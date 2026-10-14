"use client";

import { supabase } from "@/lib/supabaseClient";

/** Chama uma rota /api/* do app com o token do aluno logado. Lança Error com a mensagem do servidor. */
export async function apiAluno<T = any>(caminho: string, init: RequestInit = {}): Promise<T> {
    const { data } = await supabase.auth.getSession();
    const r = await fetch(caminho, {
        ...init,
        headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${data.session?.access_token ?? ""}`,
            ...(init.headers ?? {}),
        },
    });
    const corpo = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(corpo?.error || `Erro ${r.status}`);
    return corpo as T;
}
