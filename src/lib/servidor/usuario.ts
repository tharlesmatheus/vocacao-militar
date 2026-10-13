import type { User } from "@supabase/supabase-js";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

/**
 * Valida o token enviado pelo navegador (Authorization: Bearer <access_token>)
 * e devolve o usuário. Só para rotas de servidor.
 */
export async function usuarioDaRequisicao(req: Request): Promise<User | null> {
    const authorization = req.headers.get("authorization") ?? "";
    const token = authorization.startsWith("Bearer ") ? authorization.slice(7).trim() : "";
    if (!token) return null;

    const { data, error } = await supabaseAdmin.auth.getUser(token);
    if (error || !data.user) return null;
    return data.user;
}

/** Assinatura ativa (ou administrador), pela mesma regra usada no RLS do banco. */
export async function temAssinaturaAtiva(userId: string): Promise<boolean> {
    const { data, error } = await supabaseAdmin.rpc("assinatura_ativa_de", { p_user: userId });
    if (error) {
        console.error("Falha ao verificar assinatura:", error.message);
        return false;
    }
    return data === true;
}
