// src/app/page.tsx
import { QuestionFilters } from "../components/QuestionFilters";
import { QuestionsList } from "../components/QuestionsList";

export default function Home() {
  return (
    <main className="container py-6 flex flex-col gap-6 md:gap-10">
      {/* Filtros de Busca */}
      <section className="card mb-2">
        <QuestionFilters />
      </section>


      {/* Lista de Questões */}
      <QuestionsList />
    </main>
  );
}
