import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { supabase } from "@/lib/supabaseClient";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
    apiVersion: "2025-06-30.basil",
});

export async function POST(req: NextRequest) {
    const { userId } = await req.json();

    // Log para debug
    console.log("PORTAL: userId recebido:", userId);

    // Busca o stripe_customer_id na tabela planos
    const { data, error } = await supabase
        .from("planos")
        .select("stripe_customer_id, status")
        .eq("user_id", userId)
        .single();

    console.log("PORTAL: resultado do supabase", { data, error });

    if (error) {
        return NextResponse.json({ error: "Erro ao buscar assinatura." }, { status: 400 });
    }

    if (!data?.stripe_customer_id) {
        return NextResponse.json({ error: "Usuário sem assinatura ativa." }, { status: 400 });
    }

    // Cria a sessão do portal Stripe
    const session = await stripe.billingPortal.sessions.create({
        customer: data.stripe_customer_id,
        return_url: process.env.NEXT_PUBLIC_SITE_URL + "/plano",
    });

    return NextResponse.json({ url: session.url });
}
