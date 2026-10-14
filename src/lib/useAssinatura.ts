"use client";

import { useEffect, useState } from "react";
import { supabase } from "./supabaseClient";

/**
 * true/false conforme a assinatura do usuário logado (administrador conta como ativo);
 * null enquanto carrega. É só para a interface: quem bloqueia de verdade é o banco (RLS).
 */
export function useAssinatura(): boolean | null {
    const [ativa, setAtiva] = useState<boolean | null>(null);

    useEffect(() => {
        let cancelado = false;
        (async () => {
            // Falha de rede não pode virar "não assinante" (mostraria a tela de assinar
            // para quem paga): tenta de novo antes de desistir.
            for (let tentativa = 0; tentativa < 3; tentativa++) {
                const { data, error } = await supabase.rpc("assinatura_ativa");
                if (cancelado) return;
                if (!error) {
                    setAtiva(data === true);
                    return;
                }
                await new Promise((r) => setTimeout(r, 1500 * (tentativa + 1)));
            }
            if (!cancelado) setAtiva(false);
        })();
        return () => {
            cancelado = true;
        };
    }, []);

    return ativa;
}
