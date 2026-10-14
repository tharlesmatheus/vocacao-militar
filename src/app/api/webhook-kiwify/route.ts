import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

/*
 * Webhook da Kiwify -> tabela planos.
 *
 * Cadastro na Kiwify (Apps > Webhooks):
 *   URL:    https://<seu-dominio>/api/webhook-kiwify
 *   Token:  o mesmo valor da variável KIWIFY_TOKEN na Vercel
 *   Eventos: compra_aprovada, compra_recusada, compra_reembolsada, chargeback,
 *            subscription_canceled, subscription_late, subscription_renewed
 *
 * Regras de acesso (ver public.assinatura_ativa_de no banco):
 *   - aprovada/renovada  -> ativo até access_until
 *   - atrasada           -> pendente, mantém o acesso até access_until
 *   - cancelada          -> inativo, mantém o acesso até o fim do período pago
 *   - reembolso/chargeback -> inativo e acesso cortado na hora
 *   - recusada           -> só registra (uma tentativa recusada não derruba plano ativo)
 *
 * Confiabilidade:
 *   - Idempotência pelo hash do corpo: reenvio idêntico da Kiwify é ignorado.
 *   - Eventos fora de ordem (mais antigos que o último aplicado) não sobrescrevem o plano,
 *     exceto reembolso e chargeback, que sempre valem.
 *   - Se der erro ao gravar, o evento é desfeito e respondemos 500 para a Kiwify reenviar.
 */

const KIWIFY_TOKEN = process.env.KIWIFY_TOKEN;
const DIAS_PADRAO_PERIODO = 35; // usado só se a Kiwify não informar a data do próximo pagamento

type Payload = Record<string, any>;

type Plano = {
    email: string;
    status: string | null;
    access_until: string | null;
    ultimo_evento_em: string | null;
};

const EVENTOS_DEFINITIVOS = new Set(["compra_reembolsada", "chargeback"]);

// A Kiwify envia o tipo do evento em inglês no corpo (ex.: "order_approved"),
// embora o painel mostre os nomes em português. Aceitamos os dois.
const ALIASES_EVENTO: Record<string, string> = {
    order_approved: "compra_aprovada",
    order_paid: "compra_aprovada",
    order_refunded: "compra_reembolsada",
    refunded: "compra_reembolsada",
    order_rejected: "compra_recusada",
    order_refused: "compra_recusada",
    chargeback: "chargeback",
    order_chargeback: "chargeback",
    subscription_canceled: "subscription_canceled",
    subscription_cancelled: "subscription_canceled",
    subscription_late: "subscription_late",
    subscription_renewed: "subscription_renewed",
};

function data(valor: unknown): string | null {
    if (!valor || typeof valor !== "string") return null;
    const v = valor.trim();
    // "2026-10-14 02:26" (sem fuso) vem no horário de Brasília; ISO com Z/offset é usado como está.
    const iso = /[T].*(Z|[+-]\d{2}:?\d{2})$/.test(v)
        ? v
        : /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}(:\d{2})?$/.test(v)
            ? v.replace(" ", "T") + (v.length === 16 ? ":00" : "") + "-03:00"
            : v;
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/** A Kiwify manda valores em centavos (ex.: charge_amount 2580 = R$ 25,80). */
function centavosParaReais(...valores: unknown[]): number | null {
    const v = dinheiro(...valores);
    return v === null ? null : Math.round(v) / 100;
}

function dinheiro(...valores: unknown[]): number | null {
    for (const v of valores) {
        if (typeof v === "number" && Number.isFinite(v)) return v;
        if (typeof v === "string") {
            const n = Number(v.replace(",", ".").replace(/[^\d.-]/g, ""));
            if (v.trim() && Number.isFinite(n)) return n;
        }
    }
    return null;
}

function assinaturaValida(rawBody: string, assinatura: string, token: string) {
    const esperada = crypto.createHmac("sha1", token).update(rawBody).digest("hex");
    try {
        const a = Buffer.from(assinatura, "hex");
        const b = Buffer.from(esperada, "hex");
        return a.length === b.length && crypto.timingSafeEqual(a, b);
    } catch {
        return false;
    }
}

function json(corpo: unknown, status: number) {
    return NextResponse.json(corpo, { status, headers: { "Cache-Control": "no-store" } });
}

export async function POST(req: NextRequest) {
    if (!KIWIFY_TOKEN) {
        console.error("KIWIFY_TOKEN não configurado");
        return json({ message: "Configuração inválida" }, 500);
    }

    const rawBody = await req.text();
    const assinatura = new URL(req.url).searchParams.get("signature") || "";
    if (!assinatura || !assinaturaValida(rawBody, assinatura, KIWIFY_TOKEN)) {
        return json({ message: "Assinatura inválida" }, 401);
    }

    let p: Payload;
    try {
        const parsed = JSON.parse(rawBody);
        p = (parsed?.body || parsed) as Payload;
    } catch {
        return json({ message: "JSON inválido" }, 400);
    }

    const eventoBruto = String(p.webhook_event_type ?? "").trim().toLowerCase();
    const evento = ALIASES_EVENTO[eventoBruto] ?? eventoBruto;
    const email = String(p.Customer?.email ?? "").trim().toLowerCase();
    if (!evento || !email) return json({ message: "Evento ou e-mail ausente" }, 400);

    const orderId = String(p.order_id ?? "").trim() || null;
    const subscriptionId = String(p.subscription_id ?? p.Subscription?.id ?? p.Subscription?.subscription_id ?? "").trim() || null;
    const orderStatus = String(p.order_status ?? "").trim() || null;
    const quando = data(p.updated_at) || data(p.approved_date) || data(p.created_at) || new Date().toISOString();

    // 1) Idempotência: o mesmo corpo reenviado é ignorado.
    const eventKey = crypto.createHash("sha256").update(rawBody).digest("hex");
    const { error: erroEvento } = await supabaseAdmin.from("kiwify_events").insert({
        event_key: eventKey,
        order_id: orderId,
        subscription_id: subscriptionId,
        event: eventoBruto, // guarda o nome original enviado pela Kiwify
        email,
        payload: p,
    });
    if (erroEvento) {
        if (erroEvento.code === "23505") return json({ message: "Evento já processado" }, 200);
        console.error("Erro ao registrar evento Kiwify:", erroEvento.message);
        return json({ message: "Erro ao registrar evento" }, 500);
    }

    const finalizar = async (aplicado: boolean, motivo: string) => {
        await supabaseAdmin.from("kiwify_events").update({ aplicado, motivo }).eq("event_key", eventKey);
        return json({ message: motivo }, 200);
    };

    try {
        const { data: atual } = await supabaseAdmin
            .from("planos")
            .select("email,status,access_until,ultimo_evento_em")
            .eq("email", email)
            .maybeSingle<Plano>();

        // 2) Eventos fora de ordem não sobrescrevem um estado mais novo.
        if (!EVENTOS_DEFINITIVOS.has(evento) && atual?.ultimo_evento_em && quando < atual.ultimo_evento_em) {
            return await finalizar(false, "Evento mais antigo que o último aplicado");
        }

        const proximo = data(p.next_payment) || data(p.Subscription?.next_payment) || null;
        const ate = data(p.access_until) || data(p.Subscription?.access_until) || proximo;
        const periodoPadrao = new Date(Date.now() + DIAS_PADRAO_PERIODO * 86400_000).toISOString();

        let status: string;
        let accessUntil: string | null;

        switch (evento) {
            case "compra_aprovada":
                if (orderStatus && orderStatus !== "paid") return await finalizar(false, `Pedido ${orderStatus}`);
                status = "ativo";
                accessUntil = ate || periodoPadrao;
                break;
            case "subscription_renewed":
                status = "ativo";
                accessUntil = ate || periodoPadrao;
                break;
            case "subscription_late":
                status = "pendente";
                accessUntil = atual?.access_until ?? ate;
                break;
            case "subscription_canceled":
                status = "inativo";
                accessUntil = ate || atual?.access_until || null; // acesso até o fim do período pago
                break;
            case "compra_reembolsada":
            case "chargeback":
                status = "inativo";
                accessUntil = new Date().toISOString(); // corta na hora
                break;
            case "compra_recusada":
                return await finalizar(false, "Pagamento recusado registrado (plano não alterado)");
            default:
                return await finalizar(false, "Evento ignorado");
        }

        const { data: userId } = await supabaseAdmin.rpc("usuario_id_por_email", { p_email: email });

        const { error: erroPlano } = await supabaseAdmin.from("planos").upsert(
            [{
                email,
                user_id: userId ?? null,
                status,
                subscription_id: subscriptionId,
                proximo_pagamento: proximo,
                access_until: accessUntil,
                valor_pago: centavosParaReais(p.Commissions?.charge_amount, p.Commissions?.product_base_price),
                ultimo_evento: evento,
                ultimo_evento_em: quando,
                updated_at: new Date().toISOString(),
            }],
            { onConflict: "email" }
        );
        if (erroPlano) throw new Error(erroPlano.message);

        return await finalizar(true, "OK");
    } catch (e) {
        console.error("Erro ao aplicar evento Kiwify:", e);
        // Desfaz o registro para que o reenvio da Kiwify seja processado.
        await supabaseAdmin.from("kiwify_events").delete().eq("event_key", eventKey);
        return json({ message: "Erro interno" }, 500);
    }
}

export async function GET() {
    return json({ message: "Método não permitido" }, 405);
}
