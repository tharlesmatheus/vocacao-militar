import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

const KIWIFY_TOKEN = process.env.KIWIFY_TOKEN!;

type KiwifyPayload = {
    webhook_event_type?: string;
    order_status?: string;
    order_id?: string;
    subscription_id?: string;
    next_payment?: string;
    access_until?: string;

    // Alguns payloads podem trazer valores nesses campos
    amount?: number | string;
    net_amount?: number | string;
    total?: number | string;
    order_amount?: number | string;
    product_amount?: number | string;
    paid_amount?: number | string;
    price?: number | string;
    amount_paid?: number | string;
    amount_liquid?: number | string;
    valor_pago?: number | string;
    valor_liquido?: number | string;

    Customer?: {
        email?: string;
    };

    Subscription?: {
        subscription_id?: string;
        next_payment?: string;
        access_until?: string;
    };

    Commissions?: {
        charge_amount?: number | string;
        net_amount?: number | string;
    };

    Product?: {
        price?: number | string;
    };
};

function parseKiwifyDate(value?: string | null) {
    if (!value) return null;
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return null;
    return d.toISOString();
}

function parseMoney(value: unknown): number | null {
    if (value === null || value === undefined || value === "") return null;

    if (typeof value === "number") {
        return Number.isFinite(value) ? value : null;
    }

    if (typeof value === "string") {
        const cleaned = value.replace(",", ".").replace(/[^\d.-]/g, "");
        if (!cleaned) return null;

        const parsed = Number(cleaned);
        return Number.isNaN(parsed) ? null : parsed;
    }

    return null;
}

function pickFirstMoney(...values: unknown[]): number | null {
    for (const value of values) {
        const parsed = parseMoney(value);
        if (parsed !== null) return parsed;
    }
    return null;
}

export async function POST(req: NextRequest) {
    try {
        const { searchParams } = new URL(req.url);
        const signature = searchParams.get("signature") || "";

        const rawBody = await req.text();

        const expected = crypto
            .createHmac("sha1", KIWIFY_TOKEN)
            .update(rawBody)
            .digest("hex");

        if (!signature || signature !== expected) {
            console.error("Webhook Kiwify: assinatura inválida");
            return NextResponse.json({ message: "Assinatura inválida" }, { status: 400 });
        }

        let payload: unknown;
        try {
            payload = JSON.parse(rawBody);
        } catch (err) {
            console.error("Webhook Kiwify: JSON inválido", err);
            return NextResponse.json({ message: "JSON inválido" }, { status: 400 });
        }

        const body = ((payload as any)?.body || payload) as KiwifyPayload;

        const event = body.webhook_event_type;
        const email = body.Customer?.email?.trim().toLowerCase() || null;
        const orderStatus = body.order_status;
        const orderId = body.order_id || null;
        const subscriptionId =
            body.subscription_id || body.Subscription?.subscription_id || null;

        if (!event || !email) {
            console.error("Webhook Kiwify: evento ou email ausente", { event, email, body });
            return NextResponse.json({ message: "Evento ou email ausente" }, { status: 400 });
        }

        if (orderId) {
            const { error: evErr } = await supabaseAdmin
                .from("kiwify_events")
                .insert([{ order_id: orderId, event }]);

            if (evErr) {
                console.warn("Evento já processado ou erro de idempotência:", evErr.message);
                return NextResponse.json(
                    { message: "Evento duplicado (ignorado)" },
                    { status: 200 }
                );
            }
        }

        let status: "ativo" | "inativo" | "pendente" | null = null;

        if (event === "order_approved") {
            status = orderStatus === "paid" ? "ativo" : "pendente";
        } else if (event === "subscription_renewed") {
            status = "ativo";
        } else if (event === "subscription_late") {
            status = "pendente";
        } else if (
            event === "subscription_canceled" ||
            event === "order_refunded" ||
            event === "chargeback"
        ) {
            status = "inativo";
        } else {
            return NextResponse.json({ message: "Evento ignorado" }, { status: 200 });
        }

        const nextPaymentIso = parseKiwifyDate(
            body.next_payment || body.Subscription?.next_payment || null
        );

        const accessUntilIso = parseKiwifyDate(
            body.access_until || body.Subscription?.access_until || null
        );

        // Prioriza valor líquido quando existir
        const valorPago = pickFirstMoney(
            body.valor_liquido,
            body.amount_liquid,
            body.net_amount,
            body.Commissions?.net_amount,
            body.valor_pago,
            body.paid_amount,
            body.amount_paid,
            body.amount,
            body.total,
            body.order_amount,
            body.product_amount,
            body.price,
            body.Product?.price,
            body.Commissions?.charge_amount
        );

        const planoPayload = {
            email,
            status,
            subscription_id: subscriptionId,
            proximo_pagamento: nextPaymentIso,
            access_until: accessUntilIso,
            valor_pago: valorPago,
            updated_at: new Date().toISOString(),
        };

        const { error } = await supabaseAdmin
            .from("planos")
            .upsert([planoPayload], { onConflict: "email" });

        if (error) {
            console.error("Erro ao atualizar tabela planos:", error);
            return NextResponse.json(
                { message: "Erro ao atualizar plano", error: error.message },
                { status: 500 }
            );
        }

        console.log("Webhook Kiwify processado com sucesso:", {
            email,
            event,
            status,
            orderId,
            subscriptionId,
            proximo_pagamento: nextPaymentIso,
            access_until: accessUntilIso,
            valor_pago: valorPago,
        });

        return NextResponse.json({ message: "OK" }, { status: 200 });
    } catch (error: any) {
        console.error("Erro inesperado no webhook Kiwify:", error);
        return NextResponse.json(
            { message: "Erro interno", error: error?.message ?? "unknown" },
            { status: 500 }
        );
    }
}

export async function GET() {
    return NextResponse.json({ message: "Método não permitido" }, { status: 405 });
}