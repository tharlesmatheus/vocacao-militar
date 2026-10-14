"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

/** Linha de public.aluno_perfil (migração 20261017). */
export type PerfilAluno = {
    user_id: string;
    meta_instituicao: string | null;
    meta_cargo: string | null;
    meta_definida_em: string | null;
    boas_vindas_ocultas_em: string | null;
    created_at: string;
};

export type PainelMeta = {
    instituicao: string | null;
    cargo: string | null;
    total: number;
    respondidas: number;
    acertos: number;
    disciplinas: { disciplina: string; total: number; respondidas: number; acertos: number }[];
};

/** "PM BA" + "Soldado" -> "PM BA • Soldado"; sem cargo -> "PM BA • todos os cargos". */
export function rotuloMeta(instituicao?: string | null, cargo?: string | null): string {
    if (!instituicao) return "";
    return `${instituicao} • ${cargo || "todos os cargos"}`;
}

/**
 * Perfil do aluno logado. `perfil === null` com `carregando === false` significa
 * que o aluno nunca passou pela escolha de meta (primeiro acesso).
 */
export function usePerfilAluno() {
    const [perfil, setPerfil] = useState<PerfilAluno | null>(null);
    const [carregando, setCarregando] = useState(true);
    const [erro, setErro] = useState("");

    const recarregar = useCallback(async () => {
        setCarregando(true);
        const { data: auth } = await supabase.auth.getUser();
        if (!auth.user) {
            setPerfil(null);
            setCarregando(false);
            return;
        }
        const { data, error } = await supabase
            .from("aluno_perfil")
            .select("user_id,meta_instituicao,meta_cargo,meta_definida_em,boas_vindas_ocultas_em,created_at")
            .eq("user_id", auth.user.id)
            .maybeSingle<PerfilAluno>();
        // Tabela ainda não criada (migração não rodada): segue sem meta, sem quebrar a tela.
        if (error) setErro(error.message);
        setPerfil(data ?? null);
        setCarregando(false);
    }, []);

    useEffect(() => {
        recarregar();
    }, [recarregar]);

    return { perfil, carregando, erro, recarregar };
}

/** Grava (ou limpa, com null) a meta do aluno. */
export async function salvarMeta(instituicao: string | null, cargo: string | null) {
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) throw new Error("Faça login novamente.");
    const { error } = await supabase.from("aluno_perfil").upsert(
        {
            user_id: auth.user.id,
            meta_instituicao: instituicao,
            meta_cargo: instituicao ? cargo : null,
            meta_definida_em: instituicao ? new Date().toISOString() : null,
        },
        { onConflict: "user_id" }
    );
    if (error) throw new Error(error.message);
}

export async function ocultarBoasVindas() {
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) return;
    await supabase
        .from("aluno_perfil")
        .upsert({ user_id: auth.user.id, boas_vindas_ocultas_em: new Date().toISOString() }, { onConflict: "user_id" });
}

export async function carregarPainelMeta(): Promise<PainelMeta | null> {
    const { data, error } = await supabase.rpc("painel_meta");
    if (error || !data) return null;
    const p = data as PainelMeta;
    return p.instituicao ? p : null;
}
