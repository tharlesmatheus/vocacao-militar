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
            const { data, error } = await supabase.rpc("assinatura_ativa");
            if (!cancelado) setAtiva(!error && data === true);
        })();
        return () => {
            cancelado = true;
        };
    }, []);

    return ativa;
}
