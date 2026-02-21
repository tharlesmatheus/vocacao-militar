"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
    Home,
    CalendarDays,
    BarChart2,
    BadgeCheck,
    User,
    CreditCard,
    Menu as MenuIcon,
    X as CloseIcon,
    BookOpen,
    FileText,
    History,
    ChevronLeft,
    ChevronRight,
} from "lucide-react";
import { useState } from "react";

const MENU = [
    { name: "Resolver Questões", href: "/", icon: Home },
    { name: "Cronograma Semanal", href: "/cronograma", icon: CalendarDays },
    { name: "Minhas Estatísticas", href: "/estatisticas", icon: BarChart2 },
    { name: "Minhas Conquistas", href: "/conquistas", icon: BadgeCheck },

    { name: "Edital", href: "/edital", icon: BookOpen },
    { name: "Resumos", href: "/resumos", icon: FileText },
    { name: "Revisão", href: "/revisao", icon: History },

    { name: "Meu Perfil", href: "/perfil", icon: User },
    { name: "Meu Plano", href: "/plano", icon: CreditCard },
];

export function Sidebar() {
    const pathname = usePathname();

    const [open, setOpen] = useState(false); // mobile
    const [collapsed, setCollapsed] = useState(false); // desktop

    const isActive = (href: string) => {
        if (href === "/") return pathname === "/";
        return pathname === href || pathname.startsWith(href + "/");
    };

    return (
        <>
            {/* BOTÃO MOBILE */}
            <button
                className="fixed top-5 left-4 z-40 md:hidden bg-sidebar rounded-lg p-2 shadow border border-sidebar-border"
                onClick={() => setOpen(true)}
            >
                <MenuIcon className="w-6 h-6 text-sidebar-foreground" />
            </button>

            {/* SIDEBAR */}
            <aside
                className={`
          z-30 font-sans
          bg-sidebar pt-6 pb-4 shadow-lg border-r border-sidebar-border
          min-h-screen flex flex-col
          transition-all duration-300 ease-in-out
          ${collapsed ? "w-[88px]" : "w-[260px]"}
          md:sticky md:top-0 md:left-0
          ${open
                        ? "fixed left-0 top-0 h-screen"
                        : "fixed -translate-x-full md:translate-x-0"
                    }
        `}
            >
                {/* FECHAR MOBILE */}
                <button
                    className="absolute top-5 right-3 md:hidden p-2"
                    onClick={() => setOpen(false)}
                >
                    <CloseIcon className="w-6 h-6 text-sidebar-foreground" />
                </button>

                {/* LOGO */}
                <div
                    className={`flex items-center mb-10 px-4 ${collapsed ? "justify-center" : "gap-3"
                        }`}
                >
                    <div className="w-11 h-11 rounded-xl bg-sidebar-primary flex items-center justify-center text-sidebar-primary-foreground font-black text-xl shadow">
                        VM
                    </div>

                    {!collapsed && (
                        <span className="font-black text-xl leading-6 text-sidebar-foreground tracking-tight">
                            Vocação
                            <br />
                            Militar
                        </span>
                    )}
                </div>

                {/* MENU */}
                <nav className="flex flex-col gap-1 flex-1 px-3">
                    {MENU.map((item) => {
                        const active = isActive(item.href);
                        const Icon = item.icon;

                        return (
                            <Link
                                key={item.name}
                                href={item.href}
                                onClick={() => setOpen(false)}
                                className={`
                  group relative flex items-center rounded-xl
                  transition-all duration-200
                  ${collapsed
                                        ? "justify-center py-3"
                                        : "gap-3 px-4 py-3"
                                    }
                  ${active
                                        ? "bg-muted text-sidebar-foreground font-bold"
                                        : "text-muted-foreground hover:bg-muted hover:text-sidebar-foreground"
                                    }
                `}
                            >
                                <Icon
                                    size={20}
                                    className={
                                        active
                                            ? "text-sidebar-foreground"
                                            : "text-muted-foreground group-hover:text-sidebar-foreground"
                                    }
                                />

                                {!collapsed && (
                                    <span className="text-[15px] font-semibold whitespace-pre-line">
                                        {item.name}
                                    </span>
                                )}

                                {/* Tooltip quando colapsado */}
                                {collapsed && (
                                    <span className="absolute left-[78px] opacity-0 group-hover:opacity-100 pointer-events-none transition bg-sidebar border border-sidebar-border shadow-lg px-3 py-1.5 rounded-lg text-sm whitespace-nowrap">
                                        {item.name}
                                    </span>
                                )}
                            </Link>
                        );
                    })}
                </nav>

                {/* BOTÃO COLAPSAR (DESKTOP) */}
                <button
                    onClick={() => setCollapsed((v) => !v)}
                    className="
            hidden md:flex
            absolute top-6 -right-3
            w-7 h-7
            items-center justify-center
            rounded-full
            bg-sidebar
            border border-sidebar-border
            shadow
            hover:bg-muted
          "
                >
                    {collapsed ? (
                        <ChevronRight size={16} />
                    ) : (
                        <ChevronLeft size={16} />
                    )}
                </button>
            </aside>

            {/* BACKDROP MOBILE */}
            {open && (
                <div
                    className="fixed inset-0 z-20 bg-black/30 md:hidden"
                    onClick={() => setOpen(false)}
                />
            )}
        </>
    );
}