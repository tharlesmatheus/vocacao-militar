"use client";

/* =====================================================================================
 * NOTAS DO REVISOR:
 * - Mantido o fluxo de autenticação/redirecionamento: se não autenticado -> /auth.
 * - Removido do UI:
 *   - Saudação "Bom dia/Boa tarde/Boa noite"
 *   - Nome no topo
 *   - Breadcrumb
 *   - Cartão de data
 *   - Cabeçalhos/categorias "PRINCIPAL / ESTUDO / CONFIGURAÇÕES"
 * - Mantidos SOMENTE os botões (cards) de ESTUDO pedidos:
 *   - Questões, Edital, Resumos, Revisão, Cronograma
 * - Ajuste de layout para celular:
 *   - Cards no estilo “banner” (gradiente + cantos arredondados), como sua 2ª imagem
 *   - Em mobile: 1 coluna com cards largos e bonitos
 *   - Em telas maiores: vira grid com 2-4 colunas conforme largura
 * - Acessibilidade/UX:
 *   - Cards com foco visível e hover suave
 *   - Badge “novo” mantido no card de Questões
 * ===================================================================================== */

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { BookOpen, CalendarDays, FileText, History, Brain } from "lucide-react";

// ✅ Cliente Supabase do projeto (mantido)
import { supabase } from "@/lib/supabaseClient";

/**
 * Tipo de item do menu principal do dashboard (cards).
 * - name: rótulo exibido no card
 * - href: rota alvo do Link
 * - icon: componente de ícone (lucide-react)
 * - badge: selo opcional (ex.: "novo")
 * - subtitle: texto auxiliar abaixo do título
 * - tone: classes Tailwind para gradiente e efeitos (estilo “banner”)
 */
type MenuItem = {
  name: string;
  href: string;
  icon: React.ElementType;
  badge?: string;
  subtitle?: string;
  tone: {
    from: string; // ex.: "from-indigo-500"
    to: string; // ex.: "to-violet-600"
    glow?: string; // ex.: "bg-white/10"
  };
};

/**
 * Componente principal do Dashboard (versão mobile-first).
 * Responsabilidades:
 * - Validar sessão no client via Supabase
 * - Redirecionar para /auth se não autenticado
 * - Exibir somente os cards de navegação (estilo da imagem)
 */
export default function DashboardPage() {
  const router = useRouter();

  // Estado de carregamento inicial (enquanto checamos autenticação)
  const [loading, setLoading] = useState(true);

  /**
   * Efeito: valida usuário autenticado via Supabase.
   * - Mantém comportamento original: se não autenticado -> router.replace("/auth")
   * - Evita setState após unmount via flag + AbortController (defensivo)
   */
  useEffect(() => {
    let mounted = true;
    const controller = new AbortController();

    (async () => {
      try {
        const { data, error } = await supabase.auth.getUser();

        if (!mounted || controller.signal.aborted) return;

        if (error || !data?.user) {
          router.replace("/auth");
          return;
        }

        setLoading(false);
      } catch {
        if (!mounted || controller.signal.aborted) return;

        router.replace("/auth");
        setLoading(false);
      }
    })();

    return () => {
      mounted = false;
      controller.abort();
    };
  }, [router]);

  /**
   * Menu (somente itens pedidos), com estilo “banner” (gradiente).
   * Observação:
   * - Os tons são intencionais para ficar “bonito e identificável” no celular.
   */
  const MENU: MenuItem[] = useMemo(
    () => [
      {
        name: "Questões",
        href: "/questoes",
        icon: Brain,
        subtitle: "Resolva e filtre questões",
        badge: "novo",
        tone: { from: "from-indigo-500", to: "to-violet-600", glow: "bg-white/10" },
      },
      {
        name: "Edital",
        href: "/edital",
        icon: BookOpen,
        subtitle: "Organize seu conteúdo",
        tone: { from: "from-pink-500", to: "to-rose-600", glow: "bg-white/10" },
      },
      {
        name: "Resumos",
        href: "/resumos",
        icon: FileText,
        subtitle: "Revise por tópicos",
        tone: { from: "from-amber-500", to: "to-orange-600", glow: "bg-white/10" },
      },
      {
        name: "Revisão",
        href: "/revisao",
        icon: History,
        subtitle: "Revisões programadas",
        tone: { from: "from-sky-500", to: "to-blue-600", glow: "bg-white/10" },
      },
      {
        name: "Cronograma",
        href: "/cronograma",
        icon: CalendarDays,
        subtitle: "Planeje sua rotina",
        tone: { from: "from-emerald-500", to: "to-teal-600", glow: "bg-white/10" },
      },
    ],
    []
  );

  /**
   * Tela de carregamento.
   * - Mantém simples e leve.
   */
  if (loading) {
    return (
      <main className="min-h-screen flex items-center justify-center px-4">
        <span className="text-lg text-foreground">Carregando...</span>
      </main>
    );
  }

  /**
   * UI principal:
   * - Sem cabeçalho grande (sem saudação, sem data), como você pediu.
   * - Cards estilo “banner”, mobile-first.
   */
  return (
    <main className="w-full px-4 sm:px-6 lg:px-8 py-5 md:py-8">
      <div className="mx-auto w-full max-w-6xl">
        {/* Grid responsivo:
            - mobile: 1 coluna (cards largos)
            - sm: 2 colunas
            - lg: 3 colunas
            - xl: 4 colunas (se quiser deixar mais “cheio” em desktop)
        */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {MENU.map((item) => {
            const Icon = item.icon;

            return (
              <Link
                key={item.href}
                href={item.href}
                className={`
                  relative overflow-hidden
                  rounded-2xl p-5
                  text-white
                  shadow-sm
                  transition
                  hover:shadow-md hover:-translate-y-[1px]
                  focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2
                  bg-gradient-to-r ${item.tone.from} ${item.tone.to}
                `}
              >
                {/* “Brilho” decorativo (bolhas) como na sua 2ª imagem */}
                <div
                  className={`
                    pointer-events-none absolute -right-10 -top-10 h-28 w-28 rounded-full ${item.tone.glow ?? "bg-white/10"}
                    blur-[1px]
                  `}
                  aria-hidden="true"
                />
                <div
                  className={`
                    pointer-events-none absolute -left-10 -bottom-10 h-24 w-24 rounded-full ${item.tone.glow ?? "bg-white/10"}
                    blur-[1px]
                  `}
                  aria-hidden="true"
                />

                {/* Badge opcional (mantido) */}
                {item.badge ? (
                  <span className="absolute right-4 top-4 rounded-full bg-white/20 px-3 py-1 text-xs font-semibold">
                    {item.badge}
                  </span>
                ) : null}

                {/* Ícone em “pílula” */}
                <div className="flex items-start justify-between gap-3">
                  <div className="h-12 w-12 rounded-2xl bg-white/15 flex items-center justify-center">
                    <Icon className="h-6 w-6 text-white" aria-hidden="true" />
                  </div>
                </div>

                {/* Textos */}
                <div className="mt-4">
                  <p className="text-lg font-extrabold tracking-tight">{item.name}</p>
                  <p className="mt-1 text-sm text-white/90">{item.subtitle ?? "Acessar"}</p>
                </div>
              </Link>
            );
          })}
        </div>
      </div>
    </main>
  );
}