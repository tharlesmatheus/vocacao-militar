"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import ClientesList from "./components/ClientesList";
import QuestoesList from "./components/QuestoesList";
import NovoClienteForm from "./components/NovoClienteForm";
import NovaQuestaoForm from "./components/NovaQuestaoForm";
import { User, BookOpen, PlusCircle } from "lucide-react";

export default function AdminDashboard() {
    const router = useRouter();
    const [loading, setLoading] = useState(true);
    const [tab, setTab] = useState("clientes");

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
                <div className="text-xl">Carregando...</div>
            </div>
        );
    }

    return (
        <div className="w-full max-w-6xl mx-auto px-2 py-8">
            <h1 className="text-3xl font-bold mb-8 text-center">Painel Administrativo</h1>
            <div className="flex gap-2 mb-6 justify-center">
                <button onClick={() => setTab("clientes")} className={`px-4 py-2 rounded-full font-bold flex items-center gap-2 ${tab === "clientes" ? "bg-blue-600 text-white" : "bg-gray-100"}`}>
                    <User /> Clientes
                </button>
                <button onClick={() => setTab("questoes")} className={`px-4 py-2 rounded-full font-bold flex items-center gap-2 ${tab === "questoes" ? "bg-blue-600 text-white" : "bg-gray-100"}`}>
                    <BookOpen /> Questões
                </button>
                <button onClick={() => setTab("novo-cliente")} className={`px-4 py-2 rounded-full font-bold flex items-center gap-2 ${tab === "novo-cliente" ? "bg-blue-600 text-white" : "bg-gray-100"}`}>
                    <PlusCircle /> Novo Cliente
                </button>
                <button onClick={() => setTab("nova-questao")} className={`px-4 py-2 rounded-full font-bold flex items-center gap-2 ${tab === "nova-questao" ? "bg-blue-600 text-white" : "bg-gray-100"}`}>
                    <PlusCircle /> Nova Questão
                </button>
            </div>
            {tab === "clientes" && <ClientesList />}
            {tab === "questoes" && <QuestoesList />}
            {tab === "novo-cliente" && <NovoClienteForm />}
            {tab === "nova-questao" && <NovaQuestaoForm />}
        </div>
    );
}
