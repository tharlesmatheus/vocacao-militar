"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ComponentType } from "react";
import { supabase } from "@/lib/supabaseClient";
import {
    BarChart2,
    BookOpen,
    Brain,
    CalendarDays,
    ChevronLeft,
    ChevronRight,
    Clock,
    Crosshair,
    FileText,
    History,
    Home,
    LogOut,
    Layers3,
    Menu,
    ShieldCheck,
    NotebookText,
    PlusCircle,
    Tags,
    Timer,
    Trophy,
    User,
    X,
} from "lucide-react";

type MenuItem = {
    name: string;
    href: string;
    /** Só aparece para administradores (a página também se protege sozinha). */
    adminOnly?: boolean;
    icon: ComponentType<{
        size?: number;
        className?: string;
    }>;
};

type MenuGroup = {
    category: string;
    items: MenuItem[];
};

export type SidebarProps = {
    collapsed?: boolean;
    onCollapsedChange?: (collapsed: boolean) => void;
};

const MENU: MenuGroup[] = [
    {
        category: "PRINCIPAL",
        items: [
            { name: "Painel", href: "/", icon: Home },
            { name: "Estatísticas", href: "/estatisticas", icon: BarChart2 },
            { name: "Conquistas", href: "/conquistas", icon: Trophy },
        ],
    },
    {
        category: "ESTUDO",
        items: [
            { name: "Cadastrar Questões", href: "/landing", icon: PlusCircle, adminOnly: true },
            { name: "Questões", href: "/questoes", icon: Brain },
            { name: "Simulados", href: "/simulados", icon: Timer },
            { name: "Cadernos", href: "/cadernos", icon: NotebookText },
            { name: "Flashcards", href: "/flashcards", icon: Layers3 },
            { name: "Edital", href: "/edital", icon: BookOpen, adminOnly: true },
            { name: "Resumos", href: "/resumos", icon: FileText },
            { name: "Revisão", href: "/revisao", icon: History },
            { name: "Cronograma", href: "/cronograma", icon: CalendarDays },
            { name: "Tempo de estudo", href: "/tempo-de-estudo", icon: Clock },
        ],
    },
    {
        category: "CONFIGURAÇÕES",
        items: [
            { name: "Minha meta", href: "/meta", icon: Crosshair },
            { name: "Disciplinas", href: "/catalogo", icon: Tags },
            { name: "Minha conta", href: "/perfil", icon: User },
        ],
    },
];

function isActive(pathname: string, href: string) {
    if (href === "/") return pathname === "/";
    return pathname === href || pathname.startsWith(`${href}/`);
}

export function Sidebar({
    collapsed = false,
    onCollapsedChange,
}: SidebarProps) {
    const pathname = usePathname();
    const [mobileOpen, setMobileOpen] = useState(false);
    const [isAdmin, setIsAdmin] = useState(false);

    useEffect(() => {
        let ativo = true;
        supabase.auth.getUser().then(({ data }) => {
            if (ativo) setIsAdmin(data.user?.app_metadata?.is_admin === true);
        });
        return () => { ativo = false; };
    }, []);

    const desktopWidthClass = collapsed ? "lg:w-20" : "lg:w-[290px]";

    function toggleCollapsed() {
        onCollapsedChange?.(!collapsed);
    }

    async function sair() {
        await supabase.auth.signOut();
        window.location.href = "/auth";
    }

    return (
        <>
            {/* Botão do menu no mobile */}
            <button
                type="button"
                onClick={() => setMobileOpen(true)}
                className="fixed left-3 top-3 z-40 inline-flex h-10 w-10 items-center justify-center rounded-md border border-sidebar-border bg-sidebar text-sidebar-foreground shadow-lg lg:hidden"
                aria-label="Abrir menu"
            >
                <Menu size={20} />
            </button>

            {/* Overlay mobile */}
            {mobileOpen && (
                <button
                    type="button"
                    aria-label="Fechar menu"
                    className="fixed inset-0 z-40 bg-black/50 lg:hidden"
                    onClick={() => setMobileOpen(false)}
                />
            )}

            <aside
                className={`fixed inset-y-0 left-0 z-50 flex w-[290px] flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground transition-[width,transform] duration-200 ${desktopWidthClass} lg:translate-x-0 ${mobileOpen ? "translate-x-0" : "-translate-x-full"
                    }`}
            >
                {/* Cabeçalho */}
                <div
                    className={`flex h-14 shrink-0 items-center border-b border-sidebar-border ${collapsed
                            ? "justify-center px-2 lg:justify-center"
                            : "justify-between px-5"
                        }`}
                >
                    <Link
                        href="/"
                        onClick={() => setMobileOpen(false)}
                        className="flex min-w-0 items-center gap-2 font-titulo text-xl font-extrabold uppercase tracking-wide"
                        title={collapsed ? "Vocação Militar" : undefined}
                    >
                        <ShieldCheck size={24} className="shrink-0 text-sidebar-primary" aria-hidden />
                        <span className={collapsed ? "lg:hidden" : ""}>
                            Vocação <span className="text-sidebar-primary">Militar</span>
                        </span>
                    </Link>

                    <button
                        type="button"
                        onClick={() => setMobileOpen(false)}
                        className="inline-flex h-9 w-9 items-center justify-center rounded-md hover:bg-sidebar-accent lg:hidden"
                        aria-label="Fechar menu"
                    >
                        <X size={19} />
                    </button>
                </div>

                {/* Navegação */}
                <nav className="sem-barra min-h-0 flex-1 overflow-y-auto px-3 py-3">
                    <div>
                        {MENU.map((group) => (
                            <section
                                key={group.category}
                                className="border-sidebar-border [&:not(:first-child)]:mt-3 [&:not(:first-child)]:border-t [&:not(:first-child)]:pt-3"
                            >
                                <div
                                    className={`mb-1.5 px-3 font-titulo text-[11px] font-semibold uppercase leading-4 tracking-[0.22em] text-sidebar-primary/80 ${collapsed ? "lg:hidden" : ""
                                        }`}
                                >
                                    {group.category}
                                </div>

                                <div className="space-y-0.5">
                                    {group.items.filter((item) => !item.adminOnly || isAdmin).map((item) => {
                                        const Icon = item.icon;
                                        const active = isActive(
                                            pathname,
                                            item.href
                                        );

                                        return (
                                            <Link
                                                key={item.href}
                                                href={item.href}
                                                onClick={() =>
                                                    setMobileOpen(false)
                                                }
                                                title={
                                                    collapsed
                                                        ? item.name
                                                        : undefined
                                                }
                                                className={`relative flex rounded-md transition ${collapsed
                                                        ? "items-center gap-2.5 px-3 py-2 lg:justify-center lg:px-2"
                                                        : "items-center gap-3 px-3 py-2"
                                                    } ${active
                                                        ? "bg-sidebar-primary/10 text-sidebar-primary before:absolute before:inset-y-1.5 before:left-0 before:w-[3px] before:rounded-full before:bg-sidebar-primary"
                                                        : "text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-foreground"
                                                    }`}
                                            >
                                                <Icon
                                                    size={18}
                                                    className="shrink-0"
                                                />

                                                <span
                                                    className={`min-w-0 text-sm font-medium ${collapsed
                                                            ? "lg:hidden"
                                                            : ""
                                                        }`}
                                                >
                                                    {item.name}
                                                </span>
                                            </Link>
                                        );
                                    })}
                                </div>
                            </section>
                        ))}
                    </div>
                </nav>

                {/* Rodapé: sair da conta + recolher menu */}
                <div className="shrink-0 border-t border-sidebar-border p-2">
                    <div className={`flex gap-2 ${collapsed ? "lg:flex-col lg:items-center" : "items-center"}`}>
                        <button
                            type="button"
                            onClick={sair}
                            className={`inline-flex items-center gap-2.5 rounded-md px-3 py-2 text-[13px] font-medium text-sidebar-foreground/80 transition hover:bg-red-500/10 hover:text-red-600 dark:hover:text-red-400 ${collapsed ? "lg:h-9 lg:w-9 lg:justify-center lg:px-0" : "flex-1"}`}
                            aria-label="Sair da conta"
                            title="Sair da conta"
                        >
                            <LogOut size={17} className="shrink-0" aria-hidden />
                            <span className={collapsed ? "lg:hidden" : ""}>Sair</span>
                        </button>

                        <button
                            type="button"
                            onClick={toggleCollapsed}
                            className="hidden h-9 w-9 shrink-0 items-center justify-center rounded-md border border-sidebar-border text-sidebar-foreground/80 hover:bg-sidebar-accent lg:inline-flex"
                            aria-label={collapsed ? "Expandir menu lateral" : "Recolher menu lateral"}
                            title={collapsed ? "Expandir menu" : "Recolher menu"}
                        >
                            {collapsed ? <ChevronRight size={17} /> : <ChevronLeft size={17} />}
                        </button>
                    </div>
                </div>
            </aside>
        </>
    );
}

export default Sidebar;
