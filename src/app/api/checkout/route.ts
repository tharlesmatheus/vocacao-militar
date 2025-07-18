// src/app/api/checkout/route.ts
import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
    apiVersion: "2025-06-30.basil",
});

export async function POST(req: NextRequest) {
    try {
        const { userId, email } = await req.json();

        // Validação básica
        if (!userId || !email) {
            return NextResponse.json({ error: "Dados inválidos." }, { status: 400 });
        }

        // Cria a sessão de checkout Stripe
        const session = await stripe.checkout.sessions.create({
            payment_method_types: ["card"],
            mode: "subscription",
            customer_email: email,
            line_items: [
                {
                    price: process.env.STRIPE_PRICE_ID!,
                    quantity: 1,
                },
            ],
            metadata: {
                user_id: userId, // use snake_case
            },
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
