import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { supabase } from "@/lib/supabaseClient";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
    apiVersion: "2025-06-30.basil",
});

export async function POST(req: NextRequest) {
    const { userId } = await req.json();

    // Busca o stripe_customer_id na tabela planos
    const { data, error } = await supabase
        .from("planos")
        .select("stripe_customer_id")
        .eq("user_id", userId)
        .single();

    if (error || !data?.stripe_customer_id) {
        return NextResponse.json({ error: "Usuário sem assinatura ativa." }, { status: 400 });
    }

    // Cria a sessão do portal Stripe
    const session = await stripe.billingPortal.sessions.create({
        customer: data.stripe_customer_id,
        return_url: process.env.NEXT_PUBLIC_SITE_URL + "/plano",
    });

    return NextResponse.json({ url: session.url });
}
