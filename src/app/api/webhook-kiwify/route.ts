import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

const KIWIFY_TOKEN = process.env.KIWIFY_TOKEN;

type PlanoStatus = "ativo" | "inativo" | "pendente";

type KiwifyPayload = {
    webhook_event_type?: string;
    order_status?: string;
    order_id?: string;
    subscription_id?: string;
    next_payment?: string;
    access_until?: string;
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
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
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

function getEventStatus(event: string, orderStatus?: string | null): PlanoStatus | null {
    switch (event) {
        case "compra_aprovada":
            return orderStatus === "paid" || !orderStatus ? "ativo" : "pendente";

        case "subscription_renewed":
            return "ativo";

        case "subscription_late":
            return "pendente";

        case "subscription_canceled":
        case "compra_reembolsada":
        case "chargeback":
        case "compra_recusada":
            return "inativo";

        default:
            return null;
    }
}

function safeEqualHex(a: string, b: string) {
    try {
        const bufA = Buffer.from(a, "hex");
        const bufB = Buffer.from(b, "hex");
        return bufA.length === bufB.length && crypto.timingSafeEqual(bufA, bufB);
    } catch {
        return false;
    }
}

export async function POST(req: NextRequest) {
    try {
        if (!KIWIFY_TOKEN) {
            console.error("KIWIFY_TOKEN não configurado");
            return NextResponse.json({ message: "Configuração inválida" }, { status: 500 });
        }

        const { searchParams } = new URL(req.url);
        const signature = searchParams.get("signature") || "";

        const rawBody = await req.text();

        const expectedSignature = crypto
            .createHmac("sha1", KIWIFY_TOKEN)
            .update(rawBody)
            .digest("hex");

        if (!signature || !safeEqualHex(signature, expectedSignature)) {
            return NextResponse.json({ message: "Assinatura inválida" }, { status: 401 });
        }

        let payload: KiwifyPayload;
        try {
            const parsed = JSON.parse(rawBody);
            payload = ((parsed as any)?.body || parsed) as KiwifyPayload;
        } catch {
            return NextResponse.json({ message: "JSON inválido" }, { status: 400 });
        }

        const event = payload.webhook_event_type?.trim();
        const email = payload.Customer?.email?.trim().toLowerCase() || null;
        const orderStatus = payload.order_status?.trim() || null;
        const orderId = payload.order_id?.trim() || null;
        const subscriptionId =
            payload.subscription_id?.trim() ||
            payload.Subscription?.subscription_id?.trim() ||
            null;

        if (!event || !email) {
            return NextResponse.json(
                { message: "Evento ou email ausente" },
                { status: 400 }
            );
        }

        const status = getEventStatus(event, orderStatus);
        if (!status) {
            return NextResponse.json({ message: "Evento ignorado" }, { status: 200 });
        }

        // Idempotência: usa order_id quando existir; senão usa subscription_id + event
        const uniqueEventKey =
            orderId || (subscriptionId ? `${subscriptionId}:${event}` : `${email}:${event}`);

        const { error: idempotencyError } = await supabaseAdmin
            .from("kiwify_events")
            .insert([
                {
                    event_key: uniqueEventKey,
                    order_id: orderId,
                    subscription_id: subscriptionId,
                    event,
                    email,
                },
            ]);

        if (idempotencyError) {
            return NextResponse.json(
                { message: "Evento duplicado (ignorado)" },
                { status: 200 }
            );
        }

        const nextPaymentIso = parseKiwifyDate(
            payload.next_payment || payload.Subscription?.next_payment || null
        );

        const accessUntilIso = parseKiwifyDate(
            payload.access_until || payload.Subscription?.access_until || null
        );

        const valorPago = pickFirstMoney(
            payload.valor_liquido,
            payload.amount_liquid,
            payload.net_amount,
            payload.Commissions?.net_amount,
            payload.valor_pago,
            payload.paid_amount,
            payload.amount_paid,
            payload.amount,
            payload.total,
            payload.order_amount,
            payload.product_amount,
            payload.price,
            payload.Product?.price,
            payload.Commissions?.charge_amount
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

        const { error: upsertError } = await supabaseAdmin
            .from("planos")
            .upsert([planoPayload], { onConflict: "email" });

        if (upsertError) {
            console.error("Erro ao atualizar plano:", upsertError.message);
            return NextResponse.json(
                { message: "Erro ao atualizar plano" },
                { status: 500 }
            );
        }

        return NextResponse.json({ message: "OK" }, { status: 200 });
    } catch (error) {
        console.error("Erro inesperado no webhook Kiwify:", error);
        return NextResponse.json({ message: "Erro interno" }, { status: 500 });
    }
}

export async function GET() {
    return new NextResponse(
        JSON.stringify({ message: "Método não permitido" }),
        {
            status: 405,
            headers: {
                "Content-Type": "application/json",
                Allow: "POST",
            },
        }
    );
}