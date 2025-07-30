"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../lib/supabaseClient";
import { QuestionFilters } from "../components/QuestionFilters";
import { QuestionsList } from "../components/QuestionsList";

export default function Home() {
  const router = useRouter();
  const [filters, setFilters] = useState({}); // Estado dos filtros
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
      <main className="flex min-h-screen items-center justify-center">
        <span className="text-lg text-foreground">Carregando...</span>
      </main>
    );
  }

  return (
    <main className="container py-6 flex flex-col gap-6 md:gap-10">
      {/* Filtros de Busca */}
      <section className="card mb-2">
        <QuestionFilters onFiltrar={setFilters} />
      </section>

      {/* Lista de Questões */}
      <QuestionsList filters={filters} />
    </main>
  );
}
