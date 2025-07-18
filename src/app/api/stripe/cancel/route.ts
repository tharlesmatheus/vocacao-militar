import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
    apiVersion: "2025-06-30.basil",
});

export async function POST(req: NextRequest) {
    const { userId } = await req.json();

    // Busca o stripe_subscription_id na tabela planos
    const { data, error } = await supabaseAdmin
        .from("planos")
        .select("stripe_subscription_id")
        .eq("user_id", userId)
        .single();

    if (error || !data?.stripe_subscription_id) {
        return NextResponse.json({ error: "Assinatura não encontrada." }, { status: 400 });
    }

    // Cancela assinatura no Stripe (o usuário mantém acesso até o fim do período já pago)
    await stripe.subscriptions.update(data.stripe_subscription_id, {
        cancel_at_period_end: true,
    });

    return NextResponse.json({ success: true });
}
