import type { NextApiRequest, NextApiResponse } from "next";
import { supabase } from "@/lib/supabaseClient";
// Remova a linha abaixo se não quiser validar a assinatura HMAC (recomendado manter para produção)
// import crypto from "crypto";

// Defina aqui seu token igual ao do painel da Kiwify!
const KIWIFY_TOKEN = "lapn096tst4";

// // Função opcional para validar assinatura HMAC (caso queira máxima segurança)
// function validateSignature(body: any, signature: string | undefined) {
//     if (!signature) return false;
//     const hmac = crypto.createHmac("sha1", KIWIFY_TOKEN);
//     const digest = hmac.update(JSON.stringify(body)).digest("hex");
//     return signature === digest;
// }

export default async function handler(
    req: NextApiRequest,
    res: NextApiResponse
) {
    // Log para debug!
    console.log("Webhook recebido!", {
        query: req.query,
        headers: req.headers,
        body: req.body,
    });

    if (req.method !== "POST") {
        return res.status(405).json({ message: "Método não permitido" });
    }

    // Validação simples do token (pode tirar se usar apenas HMAC)
    const tokenRecebido =
        req.headers["x-kiwify-token"] ||
        req.headers["X-Kiwify-Token"] ||
        req.body.token;
    if (tokenRecebido !== KIWIFY_TOKEN) {
        return res.status(403).json({ message: "Token inválido!" });
    }

    // // Validação opcional de assinatura HMAC (pode comentar se não usar)
    // const signature = req.query.signature as string | undefined;
    // if (!validateSignature(req.body, signature)) {
    //     return res.status(400).json({ message: "Assinatura inválida" });
    // }

    // Pega o evento correto e o e-mail do comprador
    const event = req.body.webhook_event_type;
    const email = req.body.Customer?.email;

    if (!event || !email) {
        return res.status(400).json({ message: "Evento ou email ausente no payload" });
    }

    // Decide status conforme o evento
    let status: string | null = null;
    if (
        event === "order_approved" || // Compra aprovada
        event === "subscription_renewed" // Assinatura renovada
    ) {
        status = "ativo";
    } else if (
        event === "subscription_canceled" || // Assinatura cancelada
        event === "subscription_late" ||     // Assinatura atrasada
        event === "order_refunded" ||        // Reembolso
        event === "chargeback"               // Chargeback
    ) {
        status = "inativo";
    } else {
        return res.status(200).json({ message: "Evento ignorado" });
    }

    // Atualiza o status no Supabase pelo e-mail
    const { error } = await supabase
        .from("planos")
        .update({ status })
        .eq("email", email);

    if (error) {
        console.log("Erro ao atualizar Supabase:", error);
        return res.status(500).json({ message: "Erro ao atualizar status no Supabase", error });
    }

    console.log(`Status do plano de ${email} atualizado para ${status}`);
    return res.status(200).json({ message: "Status atualizado com sucesso" });
}
