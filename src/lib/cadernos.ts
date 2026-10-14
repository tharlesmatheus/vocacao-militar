"use client";

import { supabase } from "@/lib/supabaseClient";

export type CadernoTipo = "ERROS" | "ACERTOS";

/** Nome exibido de cada caderno. O valor 'ACERTOS' no banco é o "Acertei no chute". */
export const NOME_CADERNO: Record<CadernoTipo, string> = {
    ERROS: "Caderno de erros",
    ACERTOS: "Acertei no chute",
};

export type ItemCaderno = {
    questao_id: string;
    tipo: CadernoTipo;
    created_at: string;
    acertos_seguidos: number;
    recuperada_em: string | null;
    ultima_tentativa_em: string | null;
    disciplina: string;
    assunto: string;
};

export type ResumoCadernos = {
    erros_ativos: number;
    recuperadas: number;
    erros_total: number;
    chute: number;
    para_revisar: number;
};

function chunk<T>(arr: T[], n: number) {
    const out: T[][] = [];
    for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
    return out;
}

/** Todos os itens dos cadernos do aluno, já com disciplina e assunto da questão. */
export async function carregarItensCaderno(): Promise<ItemCaderno[]> {
    const { data: auth } = await supabase.auth.getUser();
    const uid = auth.user?.id;
    if (!uid) throw new Error("Faça login para ver seus cadernos.");

    // As colunas de treino vêm da migração 20261018; sem ela, segue sem o progresso.
    let linhas: any[] = [];
    const completo = await supabase
        .from("caderno_itens")
        .select("questao_id,tipo,created_at,acertos_seguidos,recuperada_em,ultima_tentativa_em")
        .eq("user_id", uid);
    if (completo.error) {
        const simples = await supabase.from("caderno_itens").select("questao_id,tipo,created_at").eq("user_id", uid);
        if (simples.error) throw simples.error;
        linhas = simples.data ?? [];
    } else {
        linhas = completo.data ?? [];
    }

    const ids = Array.from(new Set(linhas.map((l) => String(l.questao_id))));
    const info = new Map<string, { disciplina: string; assunto: string }>();
    for (const parte of chunk(ids, 500)) {
        const { data, error } = await supabase.rpc("questoes_por_ids", { p_ids: parte }).select("id,disciplina,assunto");
        if (error) throw error;
        for (const q of (data ?? []) as any[]) {
            info.set(String(q.id), {
                disciplina: String(q.disciplina ?? "").trim() || "Sem disciplina",
                assunto: String(q.assunto ?? "").trim() || "Sem assunto",
            });
        }
    }

    return linhas
        .filter((l) => info.has(String(l.questao_id))) // questão apagada/oculta: some do caderno
        .map((l) => ({
            questao_id: String(l.questao_id),
            tipo: l.tipo === "ACERTOS" ? "ACERTOS" : "ERROS",
            created_at: l.created_at,
            acertos_seguidos: Number(l.acertos_seguidos ?? 0),
            recuperada_em: l.recuperada_em ?? null,
            ultima_tentativa_em: l.ultima_tentativa_em ?? null,
            ...info.get(String(l.questao_id))!,
        }));
}

/** Itens que ainda precisam de treino: erros não recuperados; chutes, todos. */
export function itensAtivos(itens: ItemCaderno[], tipo: CadernoTipo) {
    return itens.filter((i) => i.tipo === tipo && (tipo === "ACERTOS" || !i.recuperada_em));
}

export async function carregarResumoCadernos(itens: ItemCaderno[]): Promise<ResumoCadernos> {
    const { data, error } = await supabase.rpc("resumo_cadernos");
    if (!error && data) {
        const d = data as Record<string, number>;
        return {
            erros_ativos: Number(d.erros_ativos ?? 0),
            recuperadas: Number(d.recuperadas ?? 0),
            erros_total: Number(d.erros_total ?? 0),
            chute: Number(d.chute ?? 0),
            para_revisar: Number(d.para_revisar ?? 0),
        };
    }
    // Sem a migração: calcula o possível com o que já temos.
    const erros = itens.filter((i) => i.tipo === "ERROS");
    return {
        erros_ativos: erros.filter((i) => !i.recuperada_em).length,
        recuperadas: erros.filter((i) => i.recuperada_em).length,
        erros_total: erros.length,
        chute: itens.filter((i) => i.tipo === "ACERTOS").length,
        para_revisar: 0,
    };
}

export function plural(n: number, um: string, varios: string) {
    return `${n.toLocaleString("pt-BR")} ${n === 1 ? um : varios}`;
}
