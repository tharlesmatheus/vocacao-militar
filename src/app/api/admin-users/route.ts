import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET(request: NextRequest) {
    // (Opcional) Validação de permissão aqui!
    const { data, error } = await supabase.auth.admin.listUsers();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data.users);
}
