import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";

// *** NÃO exponha essa key! Deixe ela só no .env do backend/server! ***
const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

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

    // ASSINATURA CRIADA/ATUALIZADA
    if (
        event.type === "customer.subscription.created" ||
        event.type === "customer.subscription.updated"
    ) {
        const subscription = event.data.object as Stripe.Subscription;
        const customerId = subscription.customer as string;

        // Recupera customer do Stripe para pegar o user_id salvo no metadata
        const customer = await stripe.customers.retrieve(customerId) as Stripe.Customer;
        const user_id = customer.metadata?.user_id;

        // Pega o período final (próximo pagamento)
        const currentPeriodEnd = (subscription as any).current_period_end as number | undefined;
        const proximo_pagamento = currentPeriodEnd
            ? new Date(currentPeriodEnd * 1000).toISOString()
            : null;

        if (!user_id) {
            console.warn("Stripe Customer não tem user_id no metadata!", { customerId });
            return NextResponse.json({ received: true });
        }

        // Upsert no Supabase
        const { error } = await supabase.from("planos").upsert(
            {
                user_id,
                status: subscription.status === "active" ? "ativo" : "pendente",
                stripe_customer_id: customerId,
                stripe_subscription_id: subscription.id,
                proximo_pagamento,
            },
            { onConflict: "user_id" }
        );
        if (error) {
            console.error("Erro ao atualizar/cadastrar plano:", error);
        }
    }

    // ASSINATURA CANCELADA
    if (event.type === "customer.subscription.deleted") {
        const subscription = event.data.object as Stripe.Subscription;
        const customerId = subscription.customer as string;
        const customer = await stripe.customers.retrieve(customerId) as Stripe.Customer;
        const user_id = customer.metadata?.user_id;

        if (!user_id) {
            console.warn("Stripe Customer não tem user_id no metadata!", { customerId });
            return NextResponse.json({ received: true });
        }

        const { error } = await supabase
            .from("planos")
            .update({
                status: "inativo",
            })
            .eq("user_id", user_id);

        if (error) {
            console.error("Erro ao atualizar status inativo:", error);
        }
    }

    // DEBUG opcional
    if (event.type === "checkout.session.completed") {
        const session = event.data.object as Stripe.Checkout.Session;
        console.log("checkout.session.completed", session.id, session.metadata);
    }

    return NextResponse.json({ received: true }, { status: 200 });
}
