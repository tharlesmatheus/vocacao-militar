"use client";
import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import ClientesList from "./components/ClientesList";
import QuestoesList from "./components/QuestoesList";
import NovoClienteForm from "./components/NovoClienteForm";
import NovaQuestaoForm from "./components/NovaQuestaoForm";
import { User, BookOpen, PlusCircle } from "lucide-react";

export default function AdminDashboard() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const [loading, setLoading] = useState(true);

    // Agora pegamos o tab pela URL, default = "clientes"
    const [tab, setTab] = useState("clientes");

    useEffect(() => {
        const t = searchParams.get("tab");
        setTab(t || "clientes");
    }, [searchParams]);

    // Proteção da rota admin
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
            <div className="w-full h-screen flex items-center justify-center bg-[#f3f6fa]">
                <div className="animate-pulse text-xl">Carregando...</div>
            </div>
        );
    }

    // Navegação alterando a URL (para funcionar com Sidebar)
    function handleTabChange(tabName: string) {
        router.replace(`/admin?tab=${tabName}`);
    }

    return (
        <div className="w-full min-h-screen flex flex-col items-center px-2 pb-8">
            <div className="w-full max-w-6xl mt-8 mb-2 flex items-center justify-between gap-4 flex-wrap">
                <h1 className="text-2xl md:text-3xl font-extrabold text-[#232939] text-center flex-1">
                    Painel Administrativo
                </h1>
            </div>
            <section className="w-full max-w-6xl bg-white rounded-2xl shadow-lg px-2 sm:px-4 py-6 mb-8 flex-1 min-h-[60vh]">
                {tab === "clientes" && <ClientesList />}
                {tab === "questoes" && <QuestoesList />}
                {tab === "novo-cliente" && <NovoClienteForm />}
                {tab === "nova-questao" && <NovaQuestaoForm />}
            </section>
            <footer className="w-full text-center text-xs text-[#a3adc7] mt-auto pt-4">
                &copy; {new Date().getFullYear()} Vocação Militar - Área Administrativa
            </footer>
        </div>
    );
}
