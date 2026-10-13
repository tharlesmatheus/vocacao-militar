import { NextResponse } from "next/server";

// Pagamentos agora são feitos pela Kiwify (ver /api/webhook-kiwify).
// Esta rota do Stripe foi desativada para não haver duas fontes alterando a tabela planos.
function desativada() {
    return NextResponse.json({ error: "Rota desativada: pagamentos são processados pela Kiwify." }, { status: 410 });
}

export const GET = desativada;
export const POST = desativada;
