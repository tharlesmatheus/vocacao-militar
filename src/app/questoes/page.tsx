"use client";
import { useEstudoAutomatico } from "@/lib/tempoAtivo";
import { Carregando } from "@/components/app/Carregando";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

import { supabase } from "@/lib/supabaseClient";
import { QuestionFilters } from "@/components/QuestionFilters";
import { QuestionsList } from "@/components/QuestionsList";
import { useAssinatura } from "@/lib/useAssinatura";
import { ChamadaAssinatura } from "@/components/app/ChamadaAssinatura";
import { CabecalhoPagina } from "@/components/app/Pagina";
import { rotuloMeta, usePerfilAluno } from "@/lib/perfilAluno";
import { Crosshair } from "lucide-react";

type Filters = Parameters<
    NonNullable<React.ComponentProps<typeof QuestionFilters>["onFiltrar"]>
>[0];

export default function QuestoesPage() {
    useEstudoAutomatico("questoes");
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

    /*
     * Link vindo de fora (ex.: "Resolver questões" do Edital) abre com
     * ?instituicao=&cargo=&disciplina=&assunto= e passa na frente da meta.
     */
    const [filtrosLink] = useState<Filters | null>(() => {
        if (typeof window === "undefined") return null;
        const p = new URLSearchParams(window.location.search);
        const f: Record<string, string> = {};
        for (const k of ["instituicao", "cargo", "disciplina", "assunto", "banca"]) {
            const v = p.get(k)?.trim();
            if (v) f[k] = v.slice(0, 200);
        }
        return Object.keys(f).length ? (f as Filters) : null;
    });

    useEffect(() => {
        if (carregandoPerfil) return;
        setFilters(filtrosLink && !semMeta ? filtrosLink : filtrosMeta);
    }, [carregandoPerfil, filtrosMeta, filtrosLink, semMeta]);

    // O aviso da meta acompanha os filtros de verdade (ex.: "Limpar filtros" sai da meta).
    const naMeta = !!perfil?.meta_instituicao
        && filters?.instituicao === perfil.meta_instituicao
        && (filters?.cargo ?? "") === (perfil.meta_cargo ?? "");

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
            <Carregando />
        );
    }

    return (
        <div className="w-full">
            <div className="flex w-full flex-col gap-6">
                <CabecalhoPagina
                    titulo="Questões"
                    descricao="Resolva, marque no caderno de erros e veja o comentário de cada questão."
                    acoes={
                        <Link href="/simulados" className="rounded-lg border border-border bg-card px-4 py-2 text-sm font-semibold text-foreground hover:bg-muted">
                            Fazer um simulado
                        </Link>
                    }
                />

                {/* Sem assinatura não há o que listar: mostra o que ela libera. */}
                {assinaturaAtiva === null && (
                    <div className="animate-pulse py-10 text-center text-muted-foreground">Carregando…</div>
                )}
                {assinaturaAtiva === false && <ChamadaAssinatura />}

                {assinaturaAtiva && perfil?.meta_instituicao && (
                    <section className="flex flex-col gap-3 rounded-lg border border-primary/40 bg-primary/10 px-4 py-3 text-sm sm:flex-row sm:items-center sm:justify-between">
                        <span className="flex items-center gap-2 text-foreground">
                            <Crosshair className="h-4 w-4 shrink-0 text-primary" aria-hidden />
                            {naMeta ? <>Treinando para <strong>{rotuloMeta(perfil.meta_instituicao, perfil.meta_cargo)}</strong></> : "Mostrando questões fora da sua meta."}
                        </span>
                        <span className="flex gap-4">
                            <button
                                type="button"
                                className="font-semibold text-primary underline"
                                onClick={() => {
                                    if (naMeta) {
                                        setSemMeta(true);
                                    } else {
                                        setSemMeta(false);
                                        setFilters({ instituicao: perfil.meta_instituicao, cargo: perfil.meta_cargo ?? "" } as Filters);
                                    }
                                }}
                            >
                                {naMeta ? "Ver todas as questões" : "Voltar para a minha meta"}
                            </button>
                            <Link href="/meta" className="font-semibold text-primary underline">Trocar meta</Link>
                        </span>
                    </section>
                )}

                {assinaturaAtiva && (
                    <>
                        <section>
                            <QuestionFilters onFiltrar={(f) => setFilters(f)} iniciais={filters ?? undefined} />
                        </section>

                        <QuestionsList filters={filters} />
                    </>
                )}
            </div>
        </div>
    );
}
