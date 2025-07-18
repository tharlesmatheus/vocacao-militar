import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { supabase } from "@/lib/supabaseClient";

// ATENÇÃO: use a versão correta igual ao seu painel ou igual ao que o TypeScript pede!
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
    apiVersion: "2025-06-30.basil",
});

const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET!;

export async function POST(req: NextRequest) {
    const sig = req.headers.get("stripe-signature")!;
    const buf = await req.arrayBuffer();
    let event: Stripe.Event;

    try {
        event = stripe.webhooks.constructEvent(
            Buffer.from(buf),
            sig,
            endpointSecret
        );
    } catch (err: any) {
        console.error("Webhook signature verification failed.", err.message);
        return NextResponse.json({ error: err.message }, { status: 400 });
    }

    if (event.type === "checkout.session.completed") {
        const session = event.data.object as Stripe.Checkout.Session;
        const user_id = session.metadata?.user_id;

        if (user_id) {
            await supabase.from("planos").upsert(
                {
                    user_id,
                    status: "ativo",
                    proximo_pagamento: session.expires_at
                        ? new Date(session.expires_at * 1000).toISOString()
                        : null,
                },
                { onConflict: "user_id" }
            );
        }
    }

    if (event.type === "customer.subscription.deleted") {
        const subscription = event.data.object as Stripe.Subscription;
        const user_id = subscription.metadata?.user_id;

        if (user_id) {
            await supabase
                .from("planos")
                .update({
                    status: "inativo",
                })
                .eq("user_id", user_id);
        }
    }

    return NextResponse.json({ received: true }, { status: 200 });
}
