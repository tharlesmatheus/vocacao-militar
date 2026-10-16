import { NextResponse } from "next/server";
import crypto from "crypto";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { usuarioDaRequisicao } from "@/lib/servidor/usuario";
import { CHECKOUT_URL } from "@/lib/plano";

/*
 * POST /api/leads
 * Recebe o formulário da página pública, grava o lead e devolve a URL do
 * checkout da Kiwify com os dados preenchidos e sck=<id do lead>.
 *
 * Os nomes dos parâmetros de preenchimento do checkout ficam em
 * PARAMETROS_CHECKOUT para ajuste fácil caso a Kiwify use outros nomes.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Link do checkout: um lugar só, em lib/plano.ts.
const PARAMETROS_CHECKOUT = { nome: "name", email: "email", telefone: "phone" } as const;
const LIMITE_POR_IP = 5;          // envios
const JANELA_LIMITE_MIN = 10;     // minutos
const UTM_CHAVES = ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term", "src"] as const;

function erro(mensagem: string, status: number) {
    return NextResponse.json({ error: mensagem }, { status, headers: { "Cache-Control": "no-store" } });
}

function texto(v: unknown, max: number) {
    return typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "";
}

export async function POST(req: Request) {
    let body: Record<string, unknown>;
    try {
        body = await req.json();
    } catch {
        return erro("Dados inválidos.", 400);
    }

    // Campo invisível: robôs costumam preencher; pessoas não.
    if (texto(body.empresa, 50)) return NextResponse.json({ url: CHECKOUT_URL });

    const nome = texto(body.nome, 120);
    const email = texto(body.email, 200).toLowerCase();
    let telefone = texto(body.telefone, 30).replace(/\D/g, "");
    if (telefone.length === 13 && telefone.startsWith("55")) telefone = telefone.slice(2);

    if (nome.length < 2) return erro("Informe seu nome.", 400);
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return erro("Informe um e-mail válido.", 400);
    if (telefone && (telefone.length < 10 || telefone.length > 11)) return erro("Informe um telefone com DDD.", 400);
    if (body.aceite_termos !== true) return erro("É preciso aceitar os Termos de Uso e a Política de Privacidade.", 400);

    // Limite de envios por IP (o IP não é guardado, só um hash).
    const ip = (req.headers.get("x-forwarded-for") || "").split(",")[0].trim() || "desconhecido";
    const ipHash = crypto.createHash("sha256").update(`${ip}|${process.env.SUPABASE_SERVICE_ROLE_KEY ?? ""}`).digest("hex").slice(0, 32);
    const desde = new Date(Date.now() - JANELA_LIMITE_MIN * 60_000).toISOString();
    const { count } = await supabaseAdmin
        .from("leads")
        .select("id", { count: "exact", head: true })
        .eq("ip_hash", ipHash)
        .gte("created_at", desde);
    if ((count ?? 0) >= LIMITE_POR_IP) return erro("Muitas tentativas. Aguarde alguns minutos.", 429);

    const utmEntrada = (typeof body.utm === "object" && body.utm) ? body.utm as Record<string, unknown> : {};
    const utm: Record<string, string> = {};
    for (const chave of UTM_CHAVES) {
        const v = texto(utmEntrada[chave], 120);
        if (v) utm[chave] = v;
    }

    // Se a pessoa já está logada, a compra fica ligada direto à conta dela.
    const usuario = await usuarioDaRequisicao(req).catch(() => null);

    const { data: lead, error } = await supabaseAdmin
        .from("leads")
        .insert({
            nome,
            email,
            telefone: telefone || null,
            aceite_termos_em: new Date().toISOString(),
            aceite_contato: body.aceite_contato === true,
            user_id: usuario?.id ?? null,
            utm,
            ip_hash: ipHash,
        })
        .select("id")
        .single();
    if (error || !lead) {
        console.error("Erro ao gravar lead:", error?.message);
        return erro("Não foi possível continuar agora. Tente novamente.", 500);
    }

    const url = new URL(CHECKOUT_URL);
    url.searchParams.set(PARAMETROS_CHECKOUT.nome, nome);
    url.searchParams.set(PARAMETROS_CHECKOUT.email, email);
    if (telefone) url.searchParams.set(PARAMETROS_CHECKOUT.telefone, telefone);
    url.searchParams.set("sck", lead.id);
    for (const [chave, valor] of Object.entries(utm)) url.searchParams.set(chave, valor);

    return NextResponse.json({ url: url.toString() }, { headers: { "Cache-Control": "no-store" } });
}
