import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { supabaseAdmin } from "@/lib/supabaseAdmin"; // use service_role

const KIWIFY_TOKEN = process.env.KIWIFY_TOKEN!;

export async function POST(req: NextRequest) {
    // 1) Pega signature da querystring
    const { searchParams } = new URL(req.url);
    const signature = searchParams.get("signature") || "";

    // 2) Lê body cru (IMPORTANTE p/ HMAC)
    const rawBody = await req.text();

    // 3) Valida assinatura HMAC SHA1 (como na doc)
    const expected = crypto
        .createHmac("sha1", KIWIFY_TOKEN)
        .update(rawBody)
        .digest("hex");

    if (!signature || signature !== expected) {
        return NextResponse.json({ message: "Assinatura inválida" }, { status: 400 });
    }

    // 4) Parse do JSON
    let payload: any;
    try {
        payload = JSON.parse(rawBody);
    } catch {
        return NextResponse.json({ message: "JSON inválido" }, { status: 400 });
    }

    // Alguns envios podem vir com { body: {...} }
    const body = payload.body || payload;

    const event = body.webhook_event_type;
    const email = body?.Customer?.email;
    const orderStatus = body?.order_status;
    const orderId = body?.order_id;
    const subscriptionId = body?.subscription_id || body?.Subscription?.subscription_id;

    if (!event || !email) {
        return NextResponse.json({ message: "Evento ou email ausente" }, { status: 400 });
    }

    // 5) (Recomendado) Idempotência básica: grava evento por order_id+event
    // Se você não quiser criar tabela de eventos agora, pule esta parte.
    // Ex.: tabela "kiwify_events" com unique(order_id, webhook_event_type)
    if (orderId) {
        const { error: evErr } = await supabaseAdmin
            .from("kiwify_events")
            .insert([{ order_id: orderId, event }]);

        if (evErr) {
            // Se violou unique, já processou antes -> responde 200
            // (ideal checar o código do erro do Postgres, mas dá pra aceitar assim)
            return NextResponse.json({ message: "Evento duplicado (ignorado)" }, { status: 200 });
        }
    }

    // 6) Decide status
    let status: "ativo" | "inativo" | null = null;

    if (event === "order_approved") {
        // garante que realmente foi pago
        status = orderStatus === "paid" ? "ativo" : "inativo";
    } else if (event === "subscription_renewed") {
        status = "ativo";
    } else if (
        event === "subscription_canceled" ||
        event === "order_refunded" ||
        event === "chargeback"
    ) {
        status = "inativo";
    } else if (event === "subscription_late") {
        // decisão de negócio: bloquear agora ou dar tolerância
        status = "inativo";
    } else {
        return NextResponse.json({ message: "Evento ignorado" }, { status: 200 });
    }

    // 7) Upsert por email (melhor )
    const { error } = await supabaseAdmin
        .from("planos")
        .upsert(
            [{
                email,
                status,
                subscription_id: subscriptionId ?? null,
                updated_at: new Date().toISOString(),
            }],
            { onConflict: "email" }
        );

    if (error) {
        return NextResponse.json({ message: "Erro Supabase", error }, { status: 500 });
    }

    return NextResponse.json({ message: "OK" }, { status: 200 });
}

export async function GET() {
    return NextResponse.json({ message: "Método não permitido" }, { status: 405 });
}