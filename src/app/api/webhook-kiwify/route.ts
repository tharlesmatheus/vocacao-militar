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
    Customer?: {
        email?: string;
    };
    Subscription?: {
        subscription_id?: string;
    };
};

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

        let payload: any;
        try {
            payload = JSON.parse(rawBody);
        } catch (err) {
            console.error("Webhook Kiwify: JSON inválido", err);
            return NextResponse.json({ message: "JSON inválido" }, { status: 400 });
        }

        const body: KiwifyPayload = payload?.body || payload;

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

        const nextPaymentIso = body.next_payment
            ? new Date(body.next_payment).toISOString()
            : null;

        const accessUntilIso = body.access_until
            ? new Date(body.access_until).toISOString()
            : null;

        const { error } = await supabaseAdmin
            .from("planos")
            .upsert(
                [
                    {
                        email,
                        status,
                        subscription_id: subscriptionId,
                        proximo_pagamento: nextPaymentIso,
                        access_until: accessUntilIso,
                        updated_at: new Date().toISOString(),
                    },
                ],
                { onConflict: "email" }
            );

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