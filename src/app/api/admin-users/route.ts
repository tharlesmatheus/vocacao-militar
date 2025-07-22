import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET() {
    const { data, error } = await supabase.auth.admin.listUsers();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data.users);
}

export async function PUT(req: NextRequest) {
    const body = await req.json();
    const { id, user_metadata } = body;
    const { data, error } = await supabase.auth.admin.updateUserById(id, { user_metadata });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ data });
}

export async function DELETE(req: NextRequest) {
    const body = await req.json();
    const { id } = body;
    const { error } = await supabase.auth.admin.deleteUser(id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
}
