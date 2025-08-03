import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabaseClient";

const KIWIFY_TOKEN = "lapn096tst4";

export async function POST(req: NextRequest) {
    const json = await req.json();
    const body = json.body || json; // PEGA O OBJETO CERTO!
    console.log("Webhook recebido!", body);

    // (Se quiser, ative a validação do token!)
    // const tokenRecebido = req.headers.get("x-kiwify-token") || req.headers.get("X-Kiwify-Token") || body.token;
    // if (tokenRecebido !== KIWIFY_TOKEN) {
    //     return NextResponse.json({ message: "Token inválido!" }, { status: 403 });
    // }

    const event = body.webhook_event_type;
    const email = body.Customer?.email;

    if (!event || !email) {
        return NextResponse.json({ message: "Evento ou email ausente no payload" }, { status: 400 });
    }

    let status: string | null = null;
    if (
        event === "order_approved" ||
        event === "subscription_renewed"
    ) {
        status = "ativo";
    } else if (
        event === "subscription_canceled" ||
        event === "subscription_late" ||
        event === "order_refunded" ||
        event === "chargeback"
    ) {
        status = "inativo";
    } else {
        return NextResponse.json({ message: "Evento ignorado" });
    }

    // upsert usando string no onConflict
    const { error } = await supabase
        .from("planos")
        .upsert(
            [{ email, status }],
            { onConflict: 'email' } // <- aqui o ajuste!
        );

    if (error) {
        console.log("Erro ao atualizar Supabase:", error);
        return NextResponse.json({ message: "Erro ao atualizar status no Supabase", error }, { status: 500 });
    }

    console.log(`Status do plano de ${email} atualizado/criado para ${status}`);
    return NextResponse.json({ message: "Status atualizado/criado com sucesso" });
}

export function GET() {
    return NextResponse.json({ message: "Método não permitido" }, { status: 405 });
}
