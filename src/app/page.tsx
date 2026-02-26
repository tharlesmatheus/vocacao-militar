"use client";

/* =====================================================================================
 * NOTAS DO REVISOR:
 * - Mantida a estrutura geral do componente e o fluxo de autenticação/redirecionamento.
 * - Correções principais:
 *   1) Evitar "setState" após unmount com AbortController + flag de montagem.
 *   2) Garantir que o loading seja finalizado também em cenários de erro inesperado
 *      (sem mudar o comportamento esperado: usuários não autenticados ainda são
 *      redirecionados para /auth).
 *   3) Sanitização leve do nome para evitar caracteres estranhos e reduzir risco de
 *      exibição de texto com espaços excessivos (React já faz escape, então não há XSS,
 *      mas melhora qualidade do dado).
 * - Melhoria de performance/legibilidade:
 *   - Remoção de imports não utilizados.
 *   - Extração de helpers pequenos e claros, comentados.
 *   - Uso de useMemo mantido para evitar recomputação de strings (embora barato).
 * ===================================================================================== */

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Home,
  BarChart2,
  BookOpen,
  FileText,
  History,
  CalendarDays,
  User,
  CreditCard,
  HelpCircle,
  Brain,
} from "lucide-react";

// ✅ Cliente Supabase do projeto (mantido)
import { supabase } from "@/lib/supabaseClient";

/**
 * Tipo de item do menu principal do dashboard.
 * - name: rótulo exibido no card
 * - href: rota alvo do Link
 * - icon: componente de ícone (lucide-react)
 * - badge: selo opcional (ex.: "novo")
 * - subtitle: texto auxiliar abaixo do título
 */
type MenuItem = {
  name: string;
  href: string;
  icon: React.ElementType;
  badge?: string;
  subtitle?: string;
};

/**
 * Tipo de grupo de menu.
 * - category: título/label do grupo
 * - items: lista de itens pertencentes ao grupo
 */
type MenuGroup = {
  category: string;
  items: MenuItem[];
};

/**
 * Normaliza/sanitiza um nome para exibição:
 * - Remove espaços duplicados
 * - Faz trim
 * - Limita tamanho para evitar UI quebrada por strings enormes
 *
 * Regras de negócio/contexto:
 * - Apenas melhora a qualidade do dado para UI; não altera lógica de autenticação.
 *
 * @param name Nome bruto (pode vir de metadados do usuário)
 * @returns Nome "limpo" para exibição
 */
function sanitizeDisplayName(name: string): string {
  const cleaned = (name ?? "").replace(/\s+/g, " ").trim();

  // Limite defensivo para não estourar layout em casos extremos (sem mudar o fluxo do app).
  // Se isso for indesejado, remova o slice, mas é uma proteção comum para UI.
  return cleaned.length > 60 ? `${cleaned.slice(0, 60)}…` : cleaned;
}

/**
 * Coloca a primeira letra do nome em maiúscula (caso exista).
 * - Não tenta "title case" completo para não alterar demais a aparência original.
 *
 * @param name Nome já sanitizado
 * @returns Nome com primeira letra em maiúscula, ou string vazia
 */
function capitalizeFirst(name: string): string {
  if (!name) return "";
  return name.charAt(0).toUpperCase() + name.slice(1);
}

/**
 * Componente principal do Dashboard.
 * Responsabilidades:
 * - Validar sessão do usuário no client via Supabase
 * - Redirecionar para /auth se não houver usuário autenticado
 * - Exibir saudação, data do dia e cards de navegação (menu)
 *
 * Observações importantes:
 * - Por ser "use client", a validação ocorre no browser.
 * - Mantém o comportamento anterior: se não autenticado -> router.replace("/auth").
 */
export default function DashboardPage() {
  const router = useRouter();

  // Estado de carregamento inicial (enquanto checamos autenticação)
  const [loading, setLoading] = useState(true);

  // Nome do usuário para saudação (vindo do metadata/email)
  const [userName, setUserName] = useState<string>("");

  /**
   * Efeito: valida usuário autenticado via Supabase.
   *
   * Fluxo:
   * - Chama supabase.auth.getUser()
   * - Se falhar ou não houver usuário: redireciona para /auth
   * - Caso exista usuário: monta um "nome de exibição" e seta estado
   *
   * Pontos de atenção:
   * - Evitar setState após unmount: usamos flag "mounted" e AbortController.
   * - Mesmo em erro inesperado, mantemos o redirect para /auth (comportamento esperado),
   *   mas garantimos encerrar loading para evitar tela travada caso o redirect não ocorra.
   */
  useEffect(() => {
    let mounted = true;

    // AbortController aqui é defensivo: embora getUser não aceite signal em todas as versões,
    // ele serve como padrão para cancelamento e para sinalizarmos intenção de "cleanup".
    const controller = new AbortController();

    (async () => {
      try {
        const { data, error } = await supabase.auth.getUser();

        // Se o componente já desmontou, não faz nada.
        if (!mounted || controller.signal.aborted) return;

        // Mantém regra original: sem usuário autenticado -> redirect
        if (error || !data?.user) {
          router.replace("/auth");
          return;
        }

        // Extração segura do nome (prioridade: full_name -> name -> parte do email -> vazio)
        const meta = data.user.user_metadata ?? {};
        const rawFullName =
          (meta.full_name as string | undefined) ||
          (meta.name as string | undefined) ||
          (data.user.email ? data.user.email.split("@")[0] : "") ||
          "";

        // Sanitiza para exibição (UI)
        const displayName = sanitizeDisplayName(rawFullName);

        setUserName(displayName);
        setLoading(false);
      } catch {
        // Erro inesperado: mantém o comportamento seguro (forçar fluxo de autenticação)
        // sem vazar detalhes sensíveis em logs.
        if (!mounted || controller.signal.aborted) return;

        router.replace("/auth");

        // Importante: encerra loading para não "travar" a tela caso o roteamento falhe
        // por algum motivo (ex.: rota inexistente, erro do Next em runtime, etc.).
        setLoading(false);
      }
    })();

    return () => {
      mounted = false;
      controller.abort();
    };
  }, [router]);

  /**
   * Label do dia atual (pt-BR) para UI.
   * - useMemo evita recomputação em re-renders (custo baixo, mas ok).
   * - Saída exemplo: "quarta-feira, 25 de fevereiro"
   */
  const todayLabel = useMemo(() => {
    const d = new Date();
    return d.toLocaleDateString("pt-BR", {
      weekday: "long",
      day: "2-digit",
      month: "long",
    });
  }, []);

  /**
   * Saudação baseada na hora local do usuário.
   * Regras:
   * - < 12 => Bom dia
   * - < 18 => Boa tarde
   * - >= 18 => Boa noite
   */
  const greeting = useMemo(() => {
    const hour = new Date().getHours();
    if (hour < 12) return "Bom dia";
    if (hour < 18) return "Boa tarde";
    return "Boa noite";
  }, []);

  /**
   * Menu do dashboard.
   * - Mantido como useMemo para evitar recriações desnecessárias.
   * - Estrutura e rotas mantidas conforme código original.
   */
  const MENU: MenuGroup[] = useMemo(
    () => [
      {
        category: "PRINCIPAL",
        items: [
          {
            name: "Dashboard",
            href: "/",
            icon: Home,
            subtitle: "Visão geral do seu progresso",
          },
          {
            name: "Estatísticas",
            href: "/estatisticas",
            icon: BarChart2,
            subtitle: "Acompanhe seu desempenho",
          },
        ],
      },
      {
        category: "ESTUDO",
        items: [
          {
            name: "Questões",
            href: "/questoes",
            icon: Brain,
            subtitle: "Resolva e filtre questões",
            badge: "novo",
          },
          {
            name: "Edital",
            href: "/edital",
            icon: BookOpen,
            subtitle: "Organize seu conteúdo",
          },
          {
            name: "Resumos",
            href: "/resumos",
            icon: FileText,
            subtitle: "Revise por tópicos",
          },
          {
            name: "Revisão",
            href: "/revisao",
            icon: History,
            subtitle: "Revisões programadas",
          },
          {
            name: "Cronograma",
            href: "/cronograma",
            icon: CalendarDays,
            subtitle: "Planeje sua rotina",
          },
        ],
      },
      {
        category: "CONFIGURAÇÕES",
        items: [
          {
            name: "Meu Perfil",
            href: "/perfil",
            icon: User,
            subtitle: "Dados da conta",
          },
          {
            name: "Meu Plano",
            href: "/plano",
            icon: CreditCard,
            subtitle: "Assinatura e cobrança",
          },
          {
            name: "Ajuda",
            href: "/ajuda",
            icon: HelpCircle,
            subtitle: "Dúvidas e suporte",
          },
        ],
      },
    ],
    []
  );

  /**
   * Tela de carregamento.
   * - Mantém o comportamento original, com UI simples.
   */
  if (loading) {
    return (
      <main className="min-h-screen flex items-center justify-center px-4">
        <span className="text-lg text-foreground">Carregando...</span>
      </main>
    );
  }

  /**
   * Render principal:
   * - Cabeçalho com saudação + nome
   * - Breadcrumb simples (estático)
   * - Cartão com data do dia
   * - Grid de cards de navegação por grupo
   */
  return (
    <main className="w-full px-4 sm:px-6 lg:px-8 py-6 md:py-10">
      <div className="mx-auto w-full max-w-6xl flex flex-col gap-8">
        <section className="flex flex-col gap-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-foreground">
                {greeting}
                {userName ? (
                  <>
                    ,{" "}
                    <span className="text-primary">
                      {capitalizeFirst(userName)}
                    </span>
                    !
                  </>
                ) : (
                  "!"
                )}{" "}
                <span className="inline-block align-middle">🌤️</span>
              </h1>

              <p className="mt-1 text-sm sm:text-base text-muted-foreground">
                Continue sua jornada de estudos
              </p>

              <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
                <span className="text-primary">⌂</span>
                <span>/</span>
                <span>Dashboard</span>
              </div>
            </div>

            <div className="shrink-0 rounded-xl border border-border bg-card px-4 py-3 text-sm text-muted-foreground flex items-center gap-2">
              <span className="inline-block">📅</span>
              {/* "capitalize" aplica CSS; label já vem em pt-BR */}
              <span className="capitalize">{todayLabel}</span>
            </div>
          </div>
        </section>

        {MENU.map((group) => (
          <section key={group.category} className="flex flex-col gap-3">
            <h2 className="text-xs uppercase tracking-widest text-muted-foreground">
              {group.category}
            </h2>

            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
              {group.items.map((item) => {
                // Ícone é um componente React (lucide)
                const Icon = item.icon;

                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className="group relative rounded-2xl border border-border bg-card p-5 shadow-sm transition hover:shadow-md hover:-translate-y-[1px]"
                  >
                    {/* Badge opcional (mantido) */}
                    {item.badge ? (
                      <span className="absolute right-4 top-4 rounded-full bg-muted px-3 py-1 text-xs text-muted-foreground">
                        {item.badge}
                      </span>
                    ) : null}

                    <div className="flex items-start gap-4">
                      <div className="h-12 w-12 rounded-2xl border border-border bg-muted flex items-center justify-center">
                        {/* Ícone decorativo. Se quiser melhorar acessibilidade, pode-se adicionar aria-hidden */}
                        <Icon className="h-5 w-5 text-foreground" />
                      </div>

                      <div className="flex-1">
                        <p className="text-lg font-semibold text-foreground group-hover:text-primary transition">
                          {item.name}
                        </p>
                        <p className="text-sm text-muted-foreground mt-1">
                          {item.subtitle ?? "Acessar"}
                        </p>
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          </section>
        ))}
      </div>
    </main>
  );
}