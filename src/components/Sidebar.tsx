"use client";

/* =====================================================================================
 * NOTAS DO REVISOR:
 * - Adicionado novo item de menu: "Tempo de estudo" apontando para /tempo-de-estudo
 * - Mantida a estrutura do componente e o comportamento existente (desktop/mobile, colapso, logout).
 * - Adicionado ícone Clock (lucide-react) para representar tempo/cronômetro.
 * ===================================================================================== */

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
    HelpCircle,
    LogOut,
    Menu as MenuIcon,
    X as CloseIcon,
    Brain,
    ChevronLeft,
    ChevronRight,
    Clock, // ✅ Ícone para "Tempo de estudo"
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
            { name: "Questões", href: "/questoes", icon: Brain },
            { name: "Edital", href: "/edital", icon: BookOpen },
            { name: "Resumos", href: "/resumos", icon: FileText },
            { name: "Revisão", href: "/revisao", icon: History },
            { name: "Cronograma", href: "/cronograma", icon: CalendarDays },

            // ✅ NOVO: Tempo de estudo
            // Observação: esta rota deve existir em: src/app/tempo-de-estudo/page.tsx
            { name: "Tempo de estudo", href: "/tempo-de-estudo", icon: Clock },
        ],
    },
    {
        category: "CONFIGURAÇÕES",
        items: [{ name: "Meu Perfil", href: "/perfil", icon: User }],
    },
];

type SidebarProps = {
    collapsed: boolean;
    onCollapsedChange: (value: boolean) => void;
};

export function Sidebar({ collapsed, onCollapsedChange }: SidebarProps) {
    const pathname = usePathname();
    const router = useRouter();

    const [open, setOpen] = useState(false); // mobile drawer

    /**
     * Verifica se um item do menu está ativo pela URL atual.
     * - Para "/" exige igualdade exata
     * - Para outros caminhos usa startsWith
     */
    const isActive = (href: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href));

    /**
     * Faz logout via Supabase e redireciona para /auth.
     * Observação:
     * - Mantido simples (sem logs sensíveis).
     */
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
                {/* DESKTOP COLLAPSE BUTTON */}
                <button
                    type="button"
                    onClick={() => onCollapsedChange(!collapsed)}
                    aria-label={collapsed ? "Expandir menu" : "Encolher menu"}
                    className={`
            hidden md:flex
            absolute top-20 -right-4 z-50
            h-8 w-8 items-center justify-center
            rounded-full
            border border-sidebar-border
            bg-sidebar
            shadow
            hover:bg-muted
            transition
          `}
                >
                    {collapsed ? (
                        <ChevronRight className="h-4 w-4 text-sidebar-foreground" />
                    ) : (
                        <ChevronLeft className="h-4 w-4 text-sidebar-foreground" />
                    )}
                </button>

                {/* CLOSE MOBILE */}
                <button
                    className="absolute top-5 right-3 md:hidden p-2"
                    onClick={() => setOpen(false)}
                    aria-label="Fechar menu"
                >
                    <CloseIcon className="w-6 h-6 text-sidebar-foreground" />
                </button>

                {/* HEADER */}
                <div className={`pt-7 pb-4 flex items-center gap-3 ${collapsed ? "px-4" : "px-5"}`}>
                    <div className="w-10 h-10 rounded-full bg-sidebar-primary flex items-center justify-center font-bold text-sidebar-primary-foreground">
                        TM
                    </div>

                    {!collapsed && (
                        <div className="leading-tight">
                            <p className="text-[10px] uppercase text-muted-foreground">Gratuito</p>
                            <p className="text-[14px] font-semibold text-sidebar-foreground">Tharles Matheus</p>
                        </div>
                    )}
                </div>

                <div className={`border-b border-sidebar-border ${collapsed ? "mx-4" : "mx-5"}`} />

                {/* MENU */}
                <nav className={`${collapsed ? "px-2" : "px-3"} py-4 space-y-5`}>
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
                                            title={collapsed ? item.name : undefined}
                                            className={`flex items-center rounded-lg transition ${collapsed ? "justify-center py-2" : "gap-3 px-4 py-2"
                                                } ${active
                                                    ? "bg-muted text-sidebar-foreground font-semibold"
                                                    : "text-muted-foreground hover:bg-muted hover:text-sidebar-foreground"
                                                }`}
                                        >
                                            <Icon size={18} />
                                            {!collapsed && <span className="text-[14px]">{item.name}</span>}
                                        </Link>
                                    );
                                })}
                            </div>
                        </div>
                    ))}
                </nav>

                {/* FOOTER */}
                <div
                    className={`mt-auto pt-3 pb-[calc(12px+env(safe-area-inset-bottom))] ${collapsed ? "px-4" : "px-5"
                        }`}
                >
                    <div className="border-t border-sidebar-border mb-3" />

                    <button
                        className={`flex items-center rounded-lg text-muted-foreground hover:bg-muted hover:text-sidebar-foreground transition w-full ${collapsed ? "justify-center py-2" : "gap-3 px-4 py-2"
                            }`}
                        title={collapsed ? "Ajuda" : undefined}
                        type="button"
                    >
                        <HelpCircle size={18} />
                        {!collapsed && <span className="text-[14px]">Ajuda</span>}
                    </button>

                    <button
                        onClick={logout}
                        className={`flex items-center rounded-lg text-red-500 hover:bg-red-500/10 transition w-full ${collapsed ? "justify-center py-2" : "gap-3 px-4 py-2"
                            }`}
                        title={collapsed ? "Sair da Conta" : undefined}
                        type="button"
                    >
                        <LogOut size={18} />
                        {!collapsed && <span className="text-[14px]">Sair da Conta</span>}
                    </button>
                </div>
            </aside>

            {/* MOBILE OVERLAY */}
            {open && (
                <div className="fixed inset-0 z-30 bg-black/30 md:hidden" onClick={() => setOpen(false)} />
            )}
        </>
    );
}