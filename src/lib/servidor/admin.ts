import { NextResponse } from "next/server";
import type { User } from "@supabase/supabase-js";
import { usuarioDaRequisicao } from "./usuario";

/** Resposta JSON sem cache (dados administrativos nunca devem ficar em cache). */
export function respostaAdmin(corpo: unknown, status = 200) {
    return NextResponse.json(corpo, { status, headers: { "Cache-Control": "no-store" } });
}

/**
 * Exige um administrador (app_metadata.is_admin === true, que só o servidor altera).
 * Uso: const auth = await exigirAdmin(req); if ("resposta" in auth) return auth.resposta;
 */
export async function exigirAdmin(req: Request): Promise<{ admin: User } | { resposta: NextResponse }> {
    const usuario = await usuarioDaRequisicao(req);
    if (!usuario) return { resposta: respostaAdmin({ error: "Não autenticado." }, 401) };
    if (usuario.app_metadata?.is_admin !== true) {
        return { resposta: respostaAdmin({ error: "Acesso restrito ao administrador." }, 403) };
    }
    return { admin: usuario };
}

export function inteiro(valor: string | null, padrao: number, min: number, max: number) {
    const n = Number.parseInt(valor ?? "", 10);
    return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : padrao;
}
