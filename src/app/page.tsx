// src/app/page.tsx
"use client";
import { useState } from "react";
import { QuestionFilters } from "../components/QuestionFilters";
import { QuestionsList } from "../components/QuestionsList";

export default function Home() {
  const [filters, setFilters] = useState({}); // Estado dos filtros

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
