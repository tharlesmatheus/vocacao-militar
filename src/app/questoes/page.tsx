"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { supabase } from "@/lib/supabaseClient";
import { QuestionFilters } from "@/components/QuestionFilters";
import { QuestionsList } from "@/components/QuestionsList";

type Filters = Parameters<
    NonNullable<React.ComponentProps<typeof QuestionFilters>["onFiltrar"]>
>[0];

export default function QuestoesPage() {
    const router = useRouter();
    const [loading, setLoading] = useState(true);

    // ✅ state com tipo inferido do próprio QuestionFilters
    const [filters, setFilters] = useState<Filters>(() => ({} as Filters));

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

                <section className="card">
                    {/* ✅ wrapper resolve o conflito do Dispatch */}
                    <QuestionFilters onFiltrar={(f) => setFilters(f)} />
                </section>

                <QuestionsList filters={filters} />
            </div>
        </main>
    );
}