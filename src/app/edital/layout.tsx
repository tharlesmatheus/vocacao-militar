"use client";
import { Carregando } from "@/components/app/Carregando";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../lib/supabaseClient";

export default function ProtectedLayout({ children }: { children: React.ReactNode }) {
    const router = useRouter();
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        supabase.auth.getUser().then(({ data }) => {
            if (!data.user) {
                router.replace("/auth");
            } else if (data.user.app_metadata?.is_admin !== true) {
                // Edital está em reformulação: por enquanto só o administrador usa.
                router.replace("/");
            } else {
                setLoading(false);
            }
        });
    }, [router]);

    if (loading) {
        return (
            <Carregando />
        );
    }

    return <>{children}</>;
}
