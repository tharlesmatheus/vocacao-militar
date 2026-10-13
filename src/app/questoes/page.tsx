"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

import { supabase } from "@/lib/supabaseClient";
import { QuestionFilters } from "@/components/QuestionFilters";
import { QuestionsList } from "@/components/QuestionsList";
import { useAssinatura } from "@/lib/useAssinatura";

type Filters = Parameters<
    NonNullable<React.ComponentProps<typeof QuestionFilters>["onFiltrar"]>
>[0];

export default function QuestoesPage() {
    const router = useRouter();
    const [loading, setLoading] = useState(true);
    const [filters, setFilters] = useState<Filters>(() => ({} as Filters));
    const assinaturaAtiva = useAssinatura();

    useEffect(() => {
        let mounted = true;

        (async () => {
            const { data, error } = await supabase.auth.getUser();

            if (!mounted) return;

            if (error || !data.user) {
                router.replace("/auth");
                return;
            }

            setLoading(false);
        })();

        return () => {
            mounted = false;
        };
    }, [router]);

    if (loading) {
        return (
            <main className="min-h-screen flex items-center justify-center px-4">
                <span className="text-lg text-foreground">Carregando...</span>
            </main>
        );
    }

    return (
        <main className="w-full px-4 sm:px-6 lg:px-8 py-6 md:py-10">
            <div className="mx-auto w-full max-w-6xl flex flex-col gap-6 md:gap-10">
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span className="text-primary">⌂</span>
                    <span>/</span>
                    <span>Estudo</span>
                    <span>/</span>
                    <span className="text-foreground">Questões</span>
                </div>

                {assinaturaAtiva === false && (
                    <section className="rounded-2xl border border-primary/30 bg-primary/10 p-5 text-sm flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                        <span className="text-foreground">
                            O banco de questões e os comentários fazem parte da assinatura. Sem ela, aparecem só as questões cadastradas por você.
                        </span>
                        <Link href="/perfil" className="bg-primary text-primary-foreground font-semibold px-4 py-2 rounded-lg text-center whitespace-nowrap">
                            Assinar agora
                        </Link>
                    </section>
                )}

                <section className="card">
                    <QuestionFilters onFiltrar={(f) => setFilters(f)} />
                </section>

                <QuestionsList filters={filters} />
            </div>
        </main>
    );
}
