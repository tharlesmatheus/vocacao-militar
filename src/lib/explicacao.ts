"use client";

import { supabase } from "@/lib/supabaseClient";

/**
 * Pede ao servidor para preparar a explicação da questão em segundo plano,
 * antes de o aluno abrir "Comentários". Se já existe, o servidor responde na hora;
 * se outro aluno já está gerando, também. Erros são ignorados: ao abrir os
 * comentários o fluxo normal tenta de novo e mostra a mensagem certa.
 */
const pedidas = new Set<string>();

export function prepararExplicacao(questaoId: string) {
    if (!questaoId || pedidas.has(questaoId)) return;
    pedidas.add(questaoId);
    void (async () => {
        try {
            const { data } = await supabase.auth.getSession();
            const token = data.session?.access_token;
            if (!token) return;
            await fetch(`/api/questoes/${questaoId}/comentario`, {
                method: "POST",
                headers: { Authorization: `Bearer ${token}` },
                keepalive: true,
            });
        } catch {
            pedidas.delete(questaoId);
        }
    })();
}
