import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { supabase } from "@/lib/supabaseClient";

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

    // 1. Nova assinatura criada
    if (
        event.type === "customer.subscription.created" ||
        event.type === "customer.subscription.updated"
    ) {
        const subscription = event.data.object as Stripe.Subscription;
        const customerId = subscription.customer as string;

        // Pega o customer no Stripe (onde tá o user_id salvo como metadata)
        const customer = await stripe.customers.retrieve(customerId) as Stripe.Customer;
        const user_id = customer.metadata?.user_id;

        if (!user_id) {
            console.warn("Stripe Customer não tem user_id no metadata!", { customerId });
            return NextResponse.json({ received: true });
        }

        await supabase.from("planos").upsert(
            {
                user_id,
                status: subscription.status === "active" ? "ativo" : "pendente",
                stripe_customer_id: customerId,
                stripe_subscription_id: subscription.id,
                proximo_pagamento: (subscription as any).current_period_end
                    ? new Date((subscription as any).current_period_end * 1000).toISOString()
                    : null,
            },
            { onConflict: "user_id" }
        );
    }

    // 2. Assinatura cancelada
    if (event.type === "customer.subscription.deleted") {
        const subscription = event.data.object as Stripe.Subscription;
        const customerId = subscription.customer as string;
        const customer = await stripe.customers.retrieve(customerId) as Stripe.Customer;
        const user_id = customer.metadata?.user_id;

        if (!user_id) {
            console.warn("Stripe Customer não tem user_id no metadata!", { customerId });
            return NextResponse.json({ received: true });
        }

        await supabase
            .from("planos")
            .update({
                status: "inativo",
            })
            .eq("user_id", user_id);
    }

    // Só loga, útil para debug
    if (event.type === "checkout.session.completed") {
        const session = event.data.object as Stripe.Checkout.Session;
        console.log("checkout.session.completed", session.id, session.metadata);
    }

    return NextResponse.json({ received: true }, { status: 200 });
}
