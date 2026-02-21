"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
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
    LogOut,
    Menu as MenuIcon,
    X as CloseIcon,
    ChevronLeft,
    ChevronRight,
} from "lucide-react";
import { useState } from "react";
import { supabase } from "../lib/supabaseClient";

/* ================= MENU AGRUPADO ================= */

const MENU = [
    {
        category: "PRINCIPAL",
        items: [
            { name: "Dashboard", href: "/", icon: Home },
            { name: "Estatísticas", href: "/estatisticas", icon: BarChart2 },
        ],
    },
    {
        category: "ESTUDO",
        items: [
            { name: "Edital", href: "/edital", icon: BookOpen },
            { name: "Resumos", href: "/resumos", icon: FileText },
            { name: "Revisão", href: "/revisao", icon: History },
            { name: "Cronograma", href: "/cronograma", icon: CalendarDays },
        ],
    },
    {
        category: "CONFIGURAÇÕES",
        items: [
            { name: "Meu Perfil", href: "/perfil", icon: User },
            { name: "Meu Plano", href: "/plano", icon: CreditCard },
        ],
    },
];

export function Sidebar() {
    const pathname = usePathname();
    const router = useRouter();

    const [open, setOpen] = useState(false);
    const [collapsed, setCollapsed] = useState(false);

    const isActive = (href: string) => {
        if (href === "/") return pathname === "/";
        return pathname.startsWith(href);
    };

    async function logout() {
        await supabase.auth.signOut();
        router.push("/auth");
    }

    return (
        <>
            {/* ================= BOTÃO MOBILE ================= */}
            <button
                className="fixed top-5 left-4 z-40 md:hidden bg-sidebar rounded-lg p-2 shadow border border-sidebar-border"
                onClick={() => setOpen(true)}
            >
                <MenuIcon className="w-6 h-6 text-sidebar-foreground" />
            </button>

            {/* ================= SIDEBAR ================= */}
            <aside
                className={`
          bg-sidebar border-r border-sidebar-border
          min-h-screen flex flex-col
          transition-all duration-300
          ${collapsed ? "w-[88px]" : "w-[260px]"}
          md:sticky md:top-0
          ${open
                        ? "fixed left-0 top-0 h-screen z-30"
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

                {/* ================= PERFIL ================= */}
                <div
                    className={`px-4 mb-6 flex items-center ${collapsed ? "justify-center" : "gap-3"
                        }`}
                >
                    <div className="w-11 h-11 rounded-full bg-sidebar-primary flex items-center justify-center font-bold text-sidebar-primary-foreground">
                        TM
                    </div>

                    {!collapsed && (
                        <div>
                            <p className="text-xs text-muted-foreground uppercase">
                                Gratuito
                            </p>
                            <p className="font-semibold text-sidebar-foreground">
                                Tharles Matheus
                            </p>
                        </div>
                    )}
                </div>

                <div className="mx-4 border-b border-sidebar-border mb-4" />

                {/* ================= MENU ================= */}
                <nav className="flex flex-col flex-1 px-3 overflow-y-auto">
                    {MENU.map((group) => (
                        <div key={group.category} className="mb-6">
                            {!collapsed && (
                                <p className="px-3 mb-2 text-xs tracking-widest text-muted-foreground uppercase">
                                    {group.category}
                                </p>
                            )}

                            <div className="flex flex-col gap-1">
                                {group.items.map((item) => {
                                    const active = isActive(item.href);
                                    const Icon = item.icon;

                                    return (
                                        <Link
                                            key={item.name}
                                            href={item.href}
                                            onClick={() => setOpen(false)}
                                            className={`
                        group flex items-center rounded-xl transition-all
                        ${collapsed
                                                    ? "justify-center py-3"
                                                    : "gap-3 px-4 py-3"
                                                }
                        ${active
                                                    ? "bg-muted text-sidebar-foreground font-semibold"
                                                    : "text-muted-foreground hover:bg-muted hover:text-sidebar-foreground"
                                                }
                      `}
                                        >
                                            <Icon size={20} />

                                            {!collapsed && (
                                                <span className="text-[15px]">
                                                    {item.name}
                                                </span>
                                            )}

                                            {/* tooltip colapsado */}
                                            {collapsed && (
                                                <span className="absolute left-[78px] opacity-0 group-hover:opacity-100 pointer-events-none transition bg-sidebar border border-sidebar-border shadow-lg px-3 py-1.5 rounded-lg text-sm whitespace-nowrap">
                                                    {item.name}
                                                </span>
                                            )}
                                        </Link>
                                    );
                                })}
                            </div>
                        </div>
                    ))}
                </nav>

                {/* ================= RODAPÉ ================= */}
                <div className="px-4 pb-6">
                    <div className="border-t border-sidebar-border mb-4" />

                    {/* AJUDA */}
                    <button className="flex items-center gap-3 w-full px-3 py-3 rounded-xl text-muted-foreground hover:bg-muted hover:text-sidebar-foreground transition">
                        <HelpCircle size={20} />
                        {!collapsed && <span>Ajuda</span>}
                    </button>

                    {/* SAIR */}
                    <button
                        onClick={logout}
                        className="flex items-center gap-3 w-full px-3 py-3 rounded-xl text-red-500 hover:bg-red-500/10 transition"
                    >
                        <LogOut size={20} />
                        {!collapsed && <span>Sair da Conta</span>}
                    </button>
                </div>

                {/* ================= COLAPSAR ================= */}
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

            {/* ================= BACKDROP MOBILE ================= */}
            {open && (
                <div
                    className="fixed inset-0 z-20 bg-black/30 md:hidden"
                    onClick={() => setOpen(false)}
                />
            )}
        </>
    );
}