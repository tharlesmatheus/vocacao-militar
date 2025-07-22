"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import ClientesList from "./components/ClientesList";
import QuestoesList from "./components/QuestoesList";
import NovoClienteForm from "./components/NovoClienteForm";
import NovaQuestaoForm from "./components/NovaQuestaoForm";
import { User, BookOpen, PlusCircle, LogOut } from "lucide-react";

export default function AdminDashboard() {
    const router = useRouter();
    const [loading, setLoading] = useState(true);
    const [tab, setTab] = useState<"clientes" | "questoes" | "novo-cliente" | "nova-questao">("clientes");

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

    async function handleLogout() {
        await supabase.auth.signOut();
        router.replace("/admin/login");
    }

    if (loading) {
        return (
            <div className="w-full h-screen flex items-center justify-center bg-[#f3f6fa]">
                <div className="animate-pulse text-xl">Carregando...</div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-[#f3f6fa] flex flex-col items-center px-2 pb-8">
            <div className="w-full max-w-6xl mt-8 mb-2 flex items-center justify-between gap-4 flex-wrap">
                <h1 className="text-2xl md:text-3xl font-extrabold text-[#232939] text-center flex-1">
                    Painel Administrativo
                </h1>
                <button
                    onClick={handleLogout}
                    className="flex items-center gap-1 px-4 py-2 rounded-full bg-gray-200 text-[#232939] hover:bg-red-600 hover:text-white font-bold transition"
                    title="Sair do painel"
                >
                    <LogOut className="w-5 h-5" /> Sair
                </button>
            </div>

            <nav className="flex flex-wrap gap-2 w-full max-w-6xl mb-6 justify-center">
                <TabButton icon={<User />} label="Clientes" active={tab === "clientes"} onClick={() => setTab("clientes")} />
                <TabButton icon={<BookOpen />} label="Questões" active={tab === "questoes"} onClick={() => setTab("questoes")} />
                <TabButton icon={<PlusCircle />} label="Novo Cliente" active={tab === "novo-cliente"} onClick={() => setTab("novo-cliente")} />
                <TabButton icon={<PlusCircle />} label="Nova Questão" active={tab === "nova-questao"} onClick={() => setTab("nova-questao")} />
            </nav>

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

// Componente para os botões das abas
function TabButton({ icon, label, active, onClick }: {
    icon: React.ReactNode, label: string, active: boolean, onClick: () => void
}) {
    return (
        <button
            onClick={onClick}
            className={`flex items-center gap-2 px-4 py-2 rounded-full font-semibold text-sm
        transition border 
        ${active
                    ? "bg-blue-600 border-blue-600 text-white shadow"
                    : "bg-gray-100 border-gray-200 text-[#232939] hover:bg-blue-100"}
      `}
            style={{ minWidth: 120 }}
        >
            {icon} {label}
        </button>
    );
}
