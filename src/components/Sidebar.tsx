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
    Brain, // ✅ Questões
} from "lucide-react";
import { useState } from "react";
import { supabase } from "../lib/supabaseClient";

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
            // ✅ Questões primeiro na categoria ESTUDO
            { name: "Questões", href: "/questoes", icon: Brain },
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
        ],
    },
];

export function Sidebar() {
    const pathname = usePathname();
    const router = useRouter();

    const [open, setOpen] = useState(false);
    const [collapsed, setCollapsed] = useState(false);

    const isActive = (href: string) =>
        href === "/" ? pathname === "/" : pathname.startsWith(href);

    async function logout() {
        await supabase.auth.signOut();
        router.push("/auth");
    }

    return (
        <>
            {/* MOBILE BUTTON */}
            <button
                className="fixed top-5 left-4 z-50 md:hidden bg-sidebar rounded-lg p-2 border border-sidebar-border shadow"
                onClick={() => setOpen(true)}
                aria-label="Abrir menu"
            >
                <MenuIcon className="w-6 h-6 text-sidebar-foreground" />
            </button>

            {/* SIDEBAR */}
            <aside
                className={`
          fixed top-0 left-0 z-40
          h-[100dvh]
          bg-sidebar border-r border-sidebar-border
          flex flex-col
          transition-all duration-300
          ${collapsed ? "w-[88px]" : "w-[260px]"}
          ${open ? "translate-x-0" : "-translate-x-full md:translate-x-0"}
        `}
            >
                {/* CLOSE MOBILE */}
                <button
                    className="absolute top-5 right-3 md:hidden p-2"
                    onClick={() => setOpen(false)}
                    aria-label="Fechar menu"
                >
                    <CloseIcon className="w-6 h-6 text-sidebar-foreground" />
                </button>

                {/* HEADER */}
                <div className="px-5 pt-7 pb-4 flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-sidebar-primary flex items-center justify-center font-bold text-sidebar-primary-foreground">
                        TM
                    </div>

                    {!collapsed && (
                        <div className="leading-tight">
                            <p className="text-[10px] uppercase text-muted-foreground">
                                Gratuito
                            </p>
                            <p className="text-[14px] font-semibold text-sidebar-foreground">
                                Tharles Matheus
                            </p>
                        </div>
                    )}
                </div>

                <div className="mx-5 border-b border-sidebar-border" />

                {/* MENU */}
                <nav className="px-3 py-4 space-y-5">
                    {MENU.map((group) => (
                        <div key={group.category}>
                            {!collapsed && (
                                <p className="px-3 mb-2 text-[10px] uppercase tracking-widest text-muted-foreground">
                                    {group.category}
                                </p>
                            )}

                            <div className="space-y-1">
                                {group.items.map((item) => {
                                    const Icon = item.icon;
                                    const active = isActive(item.href);

                                    return (
                                        <Link
                                            key={item.name}
                                            href={item.href}
                                            onClick={() => setOpen(false)}
                                            className={`flex items-center rounded-lg transition ${collapsed ? "justify-center py-2" : "gap-3 px-4 py-2"
                                                } ${active
                                                    ? "bg-muted text-sidebar-foreground font-semibold"
                                                    : "text-muted-foreground hover:bg-muted hover:text-sidebar-foreground"
                                                }`}
                                        >
                                            <Icon size={18} />
                                            {!collapsed && (
                                                <span className="text-[14px]">{item.name}</span>
                                            )}
                                        </Link>
                                    );
                                })}
                            </div>
                        </div>
                    ))}
                </nav>

                {/* FOOTER — SOBE NO MOBILE */}
                <div className="mt-auto px-5 pt-3 pb-[calc(12px+env(safe-area-inset-bottom))]">
                    <div className="border-t border-sidebar-border mb-3" />

                    <button className="flex items-center gap-3 w-full py-2 rounded-lg text-muted-foreground hover:bg-muted hover:text-sidebar-foreground transition">
                        <HelpCircle size={18} />
                        {!collapsed && <span className="text-[14px]">Ajuda</span>}
                    </button>

                    <button
                        onClick={logout}
                        className="flex items-center gap-3 w-full py-2 rounded-lg text-red-500 hover:bg-red-500/10 transition"
                    >
                        <LogOut size={18} />
                        {!collapsed && <span className="text-[14px]">Sair da Conta</span>}
                    </button>
                </div>
            </aside>

            {open && (
                <div
                    className="fixed inset-0 z-30 bg-black/30 md:hidden"
                    onClick={() => setOpen(false)}
                />
            )}
        </>
    );
}