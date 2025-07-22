import type { NextApiRequest, NextApiResponse } from "next";
import { createClient } from "@supabase/supabase-js";

// Use a Service Role Key somente aqui!
const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    // Permitir só GET
    if (req.method !== "GET") return res.status(405).end();

    // Opcional: validar se o usuário é admin (exemplo simples)
    // (Em produção, valide o JWT/cookie do admin)
    // Aqui está aberto só para simplificar!

    const { data, error } = await supabase.auth.admin.listUsers();
    if (error) return res.status(500).json({ error: error.message });

    // Pode filtrar/sanitizar se quiser (exemplo: retornar só nome, email, etc)
    res.status(200).json(data.users);
}
