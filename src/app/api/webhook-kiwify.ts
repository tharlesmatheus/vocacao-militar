import type { NextApiRequest, NextApiResponse } from "next";
import { supabase } from "@/lib/supabaseClient";

// Defina aqui seu token exatamente como está na Kiwify!
const KIWIFY_TOKEN = "lapn096tst4";

export default async function handler(
    req: NextApiRequest,
    res: NextApiResponse
) {
    if (req.method !== "POST") {
        return res.status(405).json({ message: "Método não permitido" });
    }

    // Pega o token enviado pelo webhook
    const tokenRecebido =
        req.headers["x-kiwify-token"] ||
        req.headers["X-Kiwify-Token"] ||
        req.body.token;

    if (tokenRecebido !== KIWIFY_TOKEN) {
        return res.status(403).json({ message: "Token inválido!" });
    }

    const { event, data } = req.body;

    if (!event || !data) {
        return res.status(400).json({ message: "Dados ausentes" });
    }

    const email = data?.buyer?.email;
    if (!email) {
        return res.status(400).json({ message: "Email do comprador não encontrado no payload" });
    }

    let status = null;
    if (event === "compra_aprovada" || event === "assinatura_renovada") {
        status = "ativo";
    } else if (
        event === "assinatura_cancelada" ||
        event === "assinatura_atrasada" ||
        event === "reembolso" ||
        event === "chargeback"
    ) {
        status = "inativo";
    } else {
        return res.status(200).json({ message: "Evento ignorado" });
    }

    const { error } = await supabase
        .from("planos")
        .update({ status })
        .eq("email", email);

    if (error) {
        return res.status(500).json({ message: "Erro ao atualizar status no Supabase", error });
    }

    return res.status(200).json({ message: "Status atualizado com sucesso" });
}
