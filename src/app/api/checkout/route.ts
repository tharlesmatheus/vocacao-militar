// src/app/api/checkout/route.ts
import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
    apiVersion: "2025-06-30.basil",
});

export async function POST(req: NextRequest) {
    try {
        const { userId, email } = await req.json();

        if (!userId || !email) {
            return NextResponse.json({ error: "Dados inválidos." }, { status: 400 });
        }

        // 1. Buscar cliente Stripe existente
        let customers = await stripe.customers.list({
            email,
            limit: 1
        });

        let customer: Stripe.Customer | undefined = customers.data[0];

        if (!customer) {
            // 2. Se não existe, criar (com o user_id no metadata!)
            customer = await stripe.customers.create({
                email,
                metadata: { user_id: userId }
            });
        } else if (customer.metadata?.user_id !== userId) {
            // 3. Se existe mas sem metadata correta, atualize
            await stripe.customers.update(customer.id, {
                metadata: { user_id: userId }
            });
        }

        // 4. Crie a sessão de checkout com o customer E o metadata!
        const session = await stripe.checkout.sessions.create({
            payment_method_types: ["card"],
            mode: "subscription",
            customer: customer.id,
            line_items: [
                {
                    price: process.env.STRIPE_PRICE_ID!,
                    quantity: 1,
                },
            ],
            // 👇 ISSO É FUNDAMENTAL!
            metadata: { user_id: userId },
            success_url: `${process.env.NEXT_PUBLIC_SITE_URL}/plano?success=1`,
            cancel_url: `${process.env.NEXT_PUBLIC_SITE_URL}/plano?canceled=1`,
        });

        return NextResponse.json({ url: session.url });
    } catch (error: any) {
        console.error("Erro no checkout:", error);
        return NextResponse.json(
            { error: error.message ?? "Erro desconhecido" },
            { status: 500 }
        );
    }
}
