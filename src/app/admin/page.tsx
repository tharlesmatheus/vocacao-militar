"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import AdminResumo from "./components/AdminResumo";
import AdminVendas from "./components/AdminVendas";
import AdminModeracao from "./components/AdminModeracao";
import AdminAcervo from "./components/AdminAcervo";
import ClientesList from "./components/ClientesList";
import NovoClienteForm from "./components/NovoClienteForm";

const ABAS: Record<string, { titulo: string; componente: () => React.ReactElement }> = {
    resumo: { titulo: "Visão geral", componente: () => <AdminResumo /> },
    vendas: { titulo: "Vendas e assinaturas", componente: () => <AdminVendas /> },
    moderacao: { titulo: "Moderação de comentários", componente: () => <AdminModeracao /> },
    questoes: { titulo: "Questões do acervo", componente: () => <AdminAcervo /> },
    clientes: { titulo: "Clientes", componente: () => <ClientesList /> },
    "novo-cliente": { titulo: "Novo cliente", componente: () => <NovoClienteForm /> },
};

function ConteudoAba() {
    const params = useSearchParams();
    const id = params.get("tab") ?? "resumo";
    const aba = ABAS[id] ?? ABAS.resumo;
    return (
        <>
            <h1 className="mb-6 text-2xl font-extrabold text-foreground md:text-3xl">{aba.titulo}</h1>
            {/* key força remontar ao trocar de aba */}
            <div key={id}>{aba.componente()}</div>
        </>
    );
}

export default function AdminDashboard() {
    const router = useRouter();
    const [liberado, setLiberado] = useState(false);

    useEffect(() => {
        let ativo = true;
        (async () => {
            const { data: { user } } = await supabase.auth.getUser();
            // app_metadata só o servidor altera; user_metadata o próprio usuário altera.
            if (!user) {
                router.replace("/admin/login");
                return;
            }
            // Aluno logado que abre /admin volta para o app, sem perder a sessão.
            if (user.app_metadata?.is_admin !== true) {
                router.replace("/");
                return;
            }
            if (ativo) setLiberado(true);
        })();
        return () => { ativo = false; };
    }, [router]);

    if (!liberado) {
        return (
            <div className="flex h-screen w-full items-center justify-center bg-muted">
                <div className="animate-pulse text-xl">Carregando...</div>
            </div>
        );
    }

    return (
        <div className="flex min-h-screen w-full flex-col items-center px-2 pb-8">
            <section className="mb-8 mt-8 w-full max-w-6xl flex-1">
                <Suspense fallback={<div className="animate-pulse text-muted-foreground">Carregando...</div>}>
                    <ConteudoAba />
                </Suspense>
            </section>
            <footer className="mt-auto w-full pt-4 text-center text-xs text-muted-foreground">
                &copy; {new Date().getFullYear()} Vocação Militar - Área Administrativa
            </footer>
        </div>
    );
}
