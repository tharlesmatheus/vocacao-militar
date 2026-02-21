"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../lib/supabaseClient";
import { QuestionFilters } from "../components/QuestionFilters";
import { QuestionsList } from "../components/QuestionsList";

export default function Home() {
  const router = useRouter();
  const [filters, setFilters] = useState({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (!data.user) {
        router.replace("/auth");
      } else {
        setLoading(false);
      }
    });
  }, [router]);

  if (loading) {
    return (
      <main className="min-h-[100dvh] flex items-center justify-center px-4">
        <span className="text-lg text-foreground">Carregando...</span>
      </main>
    );
  }

  return (
    <main
      className="
        min-h-[100dvh]
        w-full max-w-full overflow-x-hidden
        px-4 sm:px-6 lg:px-8
        py-6
        md:pl-[260px]
      "
    >
      {/* wrapper para limitar largura e padronizar */}
      <div className="mx-auto w-full max-w-6xl flex flex-col gap-6 md:gap-10">
        {/* Filtros de Busca */}
        <section className="card">
          <QuestionFilters onFiltrar={setFilters} />
        </section>

        {/* Lista de Questões */}
        <QuestionsList filters={filters} />
      </div>
    </main>
  );
}