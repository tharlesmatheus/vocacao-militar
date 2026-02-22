"use client";

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

// ✅ caminho mais comum
import { supabase } from "@/lib/supabaseClient";

type MenuItem = {
  name: string;
  href: string;
  icon: React.ElementType;
  badge?: string;
  subtitle?: string;
};

type MenuGroup = {
  category: string;
  items: MenuItem[];
};

export default function DashboardPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [userName, setUserName] = useState<string>("");

  useEffect(() => {
    let mounted = true;

    (async () => {
      const { data, error } = await supabase.auth.getUser();

      if (!mounted) return;

      if (error || !data.user) {
        router.replace("/auth");
        return;
      }

      const fullName =
        (data.user.user_metadata?.full_name as string | undefined) ||
        (data.user.user_metadata?.name as string | undefined) ||
        (data.user.email ? data.user.email.split("@")[0] : "") ||
        "";

      setUserName(fullName);
      setLoading(false);
    })();

    return () => {
      mounted = false;
    };
  }, [router]);

  const todayLabel = useMemo(() => {
    const d = new Date();
    return d.toLocaleDateString("pt-BR", {
      weekday: "long",
      day: "2-digit",
      month: "long",
    });
  }, []);

  const greeting = useMemo(() => {
    const hour = new Date().getHours();
    if (hour < 12) return "Bom dia";
    if (hour < 18) return "Boa tarde";
    return "Boa noite";
  }, []);

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

  if (loading) {
    return (
      <main className="min-h-screen flex items-center justify-center px-4">
        <span className="text-lg text-foreground">Carregando...</span>
      </main>
    );
  }

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
                      {userName.charAt(0).toUpperCase() + userName.slice(1)}
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
                const Icon = item.icon;

                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className="group relative rounded-2xl border border-border bg-card p-5 shadow-sm transition hover:shadow-md hover:-translate-y-[1px]"
                  >
                    {item.badge ? (
                      <span className="absolute right-4 top-4 rounded-full bg-muted px-3 py-1 text-xs text-muted-foreground">
                        {item.badge}
                      </span>
                    ) : null}

                    <div className="flex items-start gap-4">
                      <div className="h-12 w-12 rounded-2xl border border-border bg-muted flex items-center justify-center">
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