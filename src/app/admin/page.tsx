"use client";
import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import ClientesList from "./components/ClientesList";
import QuestoesList from "./components/QuestoesList";
import NovoClienteForm from "./components/NovoClienteForm";
import NovaQuestaoForm from "./components/NovaQuestaoForm";

export default function AdminDashboard() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const tab = searchParams.get("tab") || "clientes";
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        async function checkAuth() {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user || !user.user_metadata?.is_admin) {
                await supabase.auth.signOut();
                router.replace("/admin/login");
                return;
            }
            setLoading(false);
        }
        checkAuth();
    }, [router]);

    if (loading) {
        return (
            <div className="w-full h-[70vh] flex items-center justify-center bg-[#f3f6fa]">
                <div className="animate-pulse text-xl">Carregando...</div>
            </div>
        );
    }

    return (
        <section className="w-full h-full">
            {tab === "clientes" && <ClientesList />}
            {tab === "questoes" && <QuestoesList />}
            {tab === "novo-cliente" && <NovoClienteForm />}
            {tab === "nova-questao" && <NovaQuestaoForm />}
        </section>
    );
}
