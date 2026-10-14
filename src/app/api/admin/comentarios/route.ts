import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { exigirAdmin, respostaAdmin } from "@/lib/servidor/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CAMPOS =
    "id,questao_id,autor_tipo,autor_nome,texto,status,revisar,created_at," +
    "questoes(enunciado,alternativas,correta,disciplina,assunto,banca,modalidade)";

/**
 * GET   /api/admin/comentarios  -> fila de moderação:
 *         revisar:    comentários da plataforma marcados pela IA (possível problema no gabarito)
 *         denunciados: comentários com denúncia não resolvida
 * PATCH /api/admin/comentarios  { id, acao: "aprovar" | "ocultar" | "editar" | "regenerar", texto? }
 */
export async function GET(req: Request) {
    const auth = await exigirAdmin(req);
    if ("resposta" in auth) return auth.resposta;

    const [revisar, denuncias] = await Promise.all([
        supabaseAdmin
            .from("questao_comentarios")
            .select(CAMPOS)
            .eq("revisar", true)
            .neq("status", "oculto")
            .order("created_at", { ascending: false })
            .limit(50),
        supabaseAdmin
            .from("questao_comentario_denuncias")
            .select("comentario_id,motivo,created_at")
            .eq("resolvida", false)
            .order("created_at", { ascending: false })
            .limit(500),
    ]);
    if (revisar.error) return respostaAdmin({ error: revisar.error.message }, 500);
    if (denuncias.error) return respostaAdmin({ error: denuncias.error.message }, 500);

    const porComentario = new Map<string, { total: number; motivos: string[] }>();
    for (const d of denuncias.data ?? []) {
        const atual = porComentario.get(d.comentario_id) ?? { total: 0, motivos: [] };
        atual.total += 1;
        if (d.motivo) atual.motivos.push(d.motivo);
        porComentario.set(d.comentario_id, atual);
    }

    let denunciados: unknown[] = [];
    const ids = [...porComentario.keys()].slice(0, 100);
    if (ids.length) {
        const { data, error } = await supabaseAdmin.from("questao_comentarios").select(CAMPOS).in("id", ids);
        if (error) return respostaAdmin({ error: error.message }, 500);
        denunciados = (data ?? [])
            .map((c: any) => ({ ...c, denuncias: porComentario.get(c.id) }))
            .sort((a: any, b: any) => (b.denuncias?.total ?? 0) - (a.denuncias?.total ?? 0));
    }

    return respostaAdmin({ revisar: revisar.data ?? [], denunciados });
}

export async function PATCH(req: Request) {
    const auth = await exigirAdmin(req);
    if ("resposta" in auth) return auth.resposta;

    const body = await req.json().catch(() => null);
    const id = typeof body?.id === "string" ? body.id : "";
    const acao = String(body?.acao ?? "");
    if (!id) return respostaAdmin({ error: "Informe o comentário." }, 400);

    const resolverDenuncias = () =>
        supabaseAdmin.from("questao_comentario_denuncias").update({ resolvida: true }).eq("comentario_id", id);

    if (acao === "aprovar") {
        const { error } = await supabaseAdmin.from("questao_comentarios").update({ revisar: false, status: "publicado" }).eq("id", id);
        if (error) return respostaAdmin({ error: error.message }, 500);
        await resolverDenuncias();
        return respostaAdmin({ ok: true });
    }

    if (acao === "ocultar") {
        const { error } = await supabaseAdmin.from("questao_comentarios").update({ status: "oculto", revisar: false }).eq("id", id);
        if (error) return respostaAdmin({ error: error.message }, 500);
        await resolverDenuncias();
        return respostaAdmin({ ok: true });
    }

    if (acao === "editar") {
        const texto = typeof body?.texto === "string" ? body.texto.trim() : "";
        if (texto.length < 20 || texto.length > 6000) return respostaAdmin({ error: "O texto deve ter entre 20 e 6000 caracteres." }, 400);
        const { error } = await supabaseAdmin
            .from("questao_comentarios")
            .update({ texto, revisar: false, status: "publicado", modelo: "editado-admin" })
            .eq("id", id);
        if (error) return respostaAdmin({ error: error.message }, 500);
        await resolverDenuncias();
        return respostaAdmin({ ok: true });
    }

    if (acao === "regenerar") {
        // Apaga o comentário da plataforma; o próximo aluno que abrir "Ver comentários" gera um novo.
        const { error } = await supabaseAdmin
            .from("questao_comentarios")
            .delete()
            .eq("id", id)
            .eq("autor_tipo", "PLATAFORMA");
        if (error) return respostaAdmin({ error: error.message }, 500);
        return respostaAdmin({ ok: true });
    }

    return respostaAdmin({ error: "Ação inválida." }, 400);
}
