import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { exigirAdmin, inteiro, respostaAdmin } from "@/lib/servidor/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const POR_PAGINA = 25;

/**
 * GET /api/admin/vendas?tipo=planos|leads|eventos&pagina=1&busca=texto
 */
export async function GET(req: Request) {
    const auth = await exigirAdmin(req);
    if ("resposta" in auth) return auth.resposta;

    const url = new URL(req.url);
    const tipo = url.searchParams.get("tipo") || "planos";
    const pagina = inteiro(url.searchParams.get("pagina"), 1, 1, 10_000);
    const busca = (url.searchParams.get("busca") || "").trim().toLowerCase().replace(/[%,()]/g, "");
    const de = (pagina - 1) * POR_PAGINA;
    const ate = de + POR_PAGINA - 1;

    if (tipo === "planos") {
        let q = supabaseAdmin
            .from("planos")
            .select("email,status,access_until,proximo_pagamento,valor_pago,ultimo_evento,ultimo_evento_em,subscription_id,updated_at", { count: "exact" })
            .order("updated_at", { ascending: false, nullsFirst: false })
            .range(de, ate);
        if (busca) q = q.ilike("email", `%${busca}%`);
        const { data, count, error } = await q;
        if (error) return respostaAdmin({ error: error.message }, 500);
        return respostaAdmin({ itens: data ?? [], total: count ?? 0, porPagina: POR_PAGINA });
    }

    if (tipo === "leads") {
        let q = supabaseAdmin
            .from("leads")
            .select("id,nome,email,telefone,status,aceite_contato,utm,created_at,convertido_em", { count: "exact" })
            .order("created_at", { ascending: false })
            .range(de, ate);
        if (busca) q = q.or(`email.ilike.%${busca}%,nome.ilike.%${busca}%`);
        const { data, count, error } = await q;
        if (error) return respostaAdmin({ error: error.message }, 500);
        return respostaAdmin({ itens: data ?? [], total: count ?? 0, porPagina: POR_PAGINA });
    }

    if (tipo === "eventos") {
        let q = supabaseAdmin
            .from("kiwify_events")
            .select("id,created_at,event,email,order_id,aplicado,motivo", { count: "exact" })
            .order("created_at", { ascending: false })
            .range(de, ate);
        if (busca) q = q.ilike("email", `%${busca}%`);
        const { data, count, error } = await q;
        if (error) return respostaAdmin({ error: error.message }, 500);
        return respostaAdmin({ itens: data ?? [], total: count ?? 0, porPagina: POR_PAGINA });
    }

    return respostaAdmin({ error: "Tipo inválido." }, 400);
}
