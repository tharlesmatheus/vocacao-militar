"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

import { supabase } from "@/lib/supabaseClient";
import { QuestionFilters } from "@/components/QuestionFilters";
import { QuestionsList } from "@/components/QuestionsList";
import { useAssinatura } from "@/lib/useAssinatura";
import { rotuloMeta, usePerfilAluno } from "@/lib/perfilAluno";
import { Crosshair } from "lucide-react";

type Filters = Parameters<
    NonNullable<React.ComponentProps<typeof QuestionFilters>["onFiltrar"]>
>[0];

export default function QuestoesPage() {
    const router = useRouter();
    const [loading, setLoading] = useState(true);
    const [filters, setFilters] = useState<Filters | null>(null);
    const assinaturaAtiva = useAssinatura();
    const { perfil, carregando: carregandoPerfil } = usePerfilAluno();
    const [semMeta, setSemMeta] = useState(false);

    // Com meta definida, a lista já abre filtrada por ela (dá para ver tudo).
    const filtrosMeta = useMemo<Filters>(
        () => (perfil?.meta_instituicao && !semMeta
            ? ({ instituicao: perfil.meta_instituicao, cargo: perfil.meta_cargo ?? "" } as Filters)
            : ({} as Filters)),
        [perfil, semMeta]
    );

    useEffect(() => {
        if (!carregandoPerfil) setFilters(filtrosMeta);
    }, [carregandoPerfil, filtrosMeta]);

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

    if (loading || !filters) {
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

                {perfil?.meta_instituicao && (
                    <section className="flex flex-col gap-3 rounded-lg border border-primary/40 bg-primary/10 px-4 py-3 text-sm sm:flex-row sm:items-center sm:justify-between">
                        <span className="flex items-center gap-2 text-foreground">
                            <Crosshair className="h-4 w-4 shrink-0 text-primary" aria-hidden />
                            {semMeta ? "Mostrando todas as questões." : <>Treinando para <strong>{rotuloMeta(perfil.meta_instituicao, perfil.meta_cargo)}</strong></>}
                        </span>
                        <span className="flex gap-4">
                            <button type="button" className="font-semibold text-primary underline" onClick={() => setSemMeta((v) => !v)}>
                                {semMeta ? "Voltar para a minha meta" : "Ver todas as questões"}
                            </button>
                            <Link href="/meta" className="font-semibold text-primary underline">Trocar meta</Link>
                        </span>
                    </section>
                )}

                <section className="card">
                    <QuestionFilters onFiltrar={(f) => setFilters(f)} iniciais={filtrosMeta} />
                </section>

                <QuestionsList filters={filters} />
            </div>
        </main>
    );
}
