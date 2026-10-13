import { NextRequest, NextResponse } from "next/server";
import type { User } from "@supabase/supabase-js";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

/*
 * Rota administrativa: usa a service role (ignora RLS), então TODA chamada
 * precisa provar que vem de um administrador.
 *
 * - O token do usuário vem no header Authorization: Bearer <access_token>.
 * - "Administrador" = app_metadata.is_admin === true. O app_metadata só pode
 *   ser alterado com a service role; o user_metadata o próprio usuário altera
 *   pelo navegador, por isso NÃO serve para controle de acesso.
 */

const EMAIL_ACERVO = "acervo@vocacao.interno";
const CAMPOS_EDITAVEIS = ["nome", "telefone", "cpf"] as const;

function erro(mensagem: string, status: number) {
    return NextResponse.json({ error: mensagem }, { status, headers: { "Cache-Control": "no-store" } });
}

async function exigirAdmin(req: NextRequest): Promise<{ admin: User } | { resposta: NextResponse }> {
    const authorization = req.headers.get("authorization") ?? "";
    const token = authorization.startsWith("Bearer ") ? authorization.slice(7).trim() : "";
    if (!token) return { resposta: erro("Não autenticado.", 401) };

    const { data, error } = await supabaseAdmin.auth.getUser(token);
    if (error || !data.user) return { resposta: erro("Sessão inválida.", 401) };
    if (data.user.app_metadata?.is_admin !== true) return { resposta: erro("Acesso restrito ao administrador.", 403) };

    return { admin: data.user };
}

export async function GET(req: NextRequest) {
    const auth = await exigirAdmin(req);
    if ("resposta" in auth) return auth.resposta;

    const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 1000 });
    if (error) return erro(error.message, 500);

    // A conta técnica do acervo não é um cliente.
    return NextResponse.json(data.users.filter((u) => u.email !== EMAIL_ACERVO), {
        headers: { "Cache-Control": "no-store" },
    });
}

export async function PUT(req: NextRequest) {
    const auth = await exigirAdmin(req);
    if ("resposta" in auth) return auth.resposta;

    const body = await req.json().catch(() => null);
    const id = typeof body?.id === "string" ? body.id : "";
    if (!id) return erro("Informe o id do cliente.", 400);

    // Só os campos de cadastro podem ser alterados por aqui (nunca permissões).
    const recebido = (body?.user_metadata ?? {}) as Record<string, unknown>;
    const limpos: Record<string, string> = {};
    for (const campo of CAMPOS_EDITAVEIS) {
        if (typeof recebido[campo] === "string") limpos[campo] = (recebido[campo] as string).trim().slice(0, 200);
    }

    const atual = await supabaseAdmin.auth.admin.getUserById(id);
    if (atual.error || !atual.data.user) return erro("Cliente não encontrado.", 404);
    if (atual.data.user.email === EMAIL_ACERVO) return erro("Esta conta não pode ser alterada.", 400);

    const { data, error } = await supabaseAdmin.auth.admin.updateUserById(id, {
        user_metadata: { ...(atual.data.user.user_metadata ?? {}), ...limpos },
    });
    if (error) return erro(error.message, 500);
    return NextResponse.json({ data });
}

export async function DELETE(req: NextRequest) {
    const auth = await exigirAdmin(req);
    if ("resposta" in auth) return auth.resposta;

    const body = await req.json().catch(() => null);
    const id = typeof body?.id === "string" ? body.id : "";
    if (!id) return erro("Informe o id do cliente.", 400);
    if (id === auth.admin.id) return erro("Você não pode excluir a própria conta por aqui.", 400);

    const alvo = await supabaseAdmin.auth.admin.getUserById(id);
    if (alvo.error || !alvo.data.user) return erro("Cliente não encontrado.", 404);
    if (alvo.data.user.email === EMAIL_ACERVO) return erro("A conta do acervo não pode ser excluída.", 400);
    if (alvo.data.user.app_metadata?.is_admin === true) return erro("Não é possível excluir outro administrador.", 400);

    const { error } = await supabaseAdmin.auth.admin.deleteUser(id);
    if (error) return erro(error.message, 500);
    return NextResponse.json({ ok: true });
}
