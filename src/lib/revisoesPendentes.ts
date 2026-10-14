"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

export type MetodoRevisao = "CADERNO" | "FLASHCARD" | "RESUMO";

function hojeLocal(): string {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/**
 * IDs dos itens (resumo, flashcard, item de caderno) com revisão vencida
 * hoje ou antes, pela mesma regra do painel (next_review <= hoje).
 */
export function usePendentesRevisao(metodo: MetodoRevisao): Set<string> {
    const [ids, setIds] = useState<Set<string>>(() => new Set());

    useEffect(() => {
        let ativo = true;
        (async () => {
            const { data: auth } = await supabase.auth.getUser();
            if (!auth.user) return;
            const { data, error } = await supabase
                .from("review_progress")
                .select("item_id,next_review")
                .eq("user_id", auth.user.id)
                .eq("method", metodo)
                .lte("next_review", hojeLocal());
            if (!ativo || error) return;
            setIds(new Set((data ?? []).map((r: { item_id: string }) => String(r.item_id))));
        })();
        return () => {
            ativo = false;
        };
    }, [metodo]);

    return ids;
}
