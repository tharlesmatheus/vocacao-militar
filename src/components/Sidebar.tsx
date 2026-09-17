"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, type ComponentType } from "react";
import {
    BarChart2,
    BookOpen,
    Brain,
    CalendarDays,
    ChevronLeft,
    ChevronRight,
    Clock,
    FileText,
    History,
    Home,
    Layers3,
    Menu,
    NotebookText,
    PlusCircle,
    Tags,
    Trophy,
    User,
    X,
} from "lucide-react";

type MenuItem = {
    name: string;
    href: string;
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
            { name: "Dashboard", href: "/", icon: Home },
            { name: "Estatísticas", href: "/estatisticas", icon: BarChart2 },
            { name: "Conquistas", href: "/conquistas", icon: Trophy },
        ],
    },
    {
        category: "ESTUDO",
        items: [
            { name: "Novas Questões", href: "/landing", icon: PlusCircle },
            { name: "Questões", href: "/questoes", icon: Brain },
            { name: "Catálogo", href: "/catalogo", icon: Tags },
            { name: "Cadernos", href: "/cadernos", icon: NotebookText },
            { name: "Flash Cards", href: "/flashcards", icon: Layers3 },
            { name: "Edital", href: "/edital", icon: BookOpen },
            { name: "Resumos", href: "/resumos", icon: FileText },
            { name: "Revisão", href: "/revisao", icon: History },
            { name: "Cronograma", href: "/cronograma", icon: CalendarDays },
            { name: "Tempo de estudo", href: "/tempo-de-estudo", icon: Clock },
        ],
    },
    {
        category: "CONFIGURAÇÕES",
        items: [
            { name: "Meu Perfil", href: "/perfil", icon: User },
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

    const desktopWidthClass = collapsed ? "lg:w-20" : "lg:w-[290px]";

    function toggleCollapsed() {
        onCollapsedChange?.(!collapsed);
    }

    return (
        <>
            {/* Botão do menu no mobile */}
            <button
                type="button"
                onClick={() => setMobileOpen(true)}
                className="fixed left-4 top-4 z-40 inline-flex h-10 w-10 items-center justify-center rounded-xl border border-border bg-card shadow-sm lg:hidden"
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
                className={`fixed inset-y-0 left-0 z-50 flex w-[290px] flex-col border-r border-border bg-card transition-[width,transform] duration-200 ${desktopWidthClass} lg:translate-x-0 ${mobileOpen ? "translate-x-0" : "-translate-x-full"
                    }`}
            >
                {/* Cabeçalho */}
                <div
                    className={`flex h-16 shrink-0 items-center border-b border-border ${collapsed
                            ? "justify-center px-2 lg:justify-center"
                            : "justify-between px-5"
                        }`}
                >
                    <Link
                        href="/"
                        onClick={() => setMobileOpen(false)}
                        className="min-w-0 font-bold tracking-tight"
                        title={collapsed ? "Vocação Militar" : undefined}
                    >
                        <span className="lg:hidden">Vocação Militar</span>

                        {collapsed ? (
                            <span className="hidden h-9 w-9 items-center justify-center rounded-xl bg-primary text-sm font-bold text-primary-foreground lg:inline-flex">
                                VM
                            </span>
                        ) : (
                            <span className="hidden lg:inline">
                                Vocação Militar
                            </span>
                        )}
                    </Link>

                    <button
                        type="button"
                        onClick={() => setMobileOpen(false)}
                        className="inline-flex h-9 w-9 items-center justify-center rounded-lg hover:bg-muted lg:hidden"
                        aria-label="Fechar menu"
                    >
                        <X size={19} />
                    </button>
                </div>

                {/* Navegação */}
                <nav className="flex-1 overflow-y-auto p-3">
                    <div className="space-y-5">
                        {MENU.map((group) => (
                            <section key={group.category}>
                                <div
                                    className={`mb-2 px-3 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground ${collapsed ? "lg:hidden" : ""
                                        }`}
                                >
                                    {group.category}
                                </div>

                                <div className="space-y-1">
                                    {group.items.map((item) => {
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
                                                className={`flex rounded-2xl transition ${collapsed
                                                        ? "items-center gap-3 px-3 py-3 lg:justify-center lg:px-2"
                                                        : "items-center gap-3 px-3 py-3"
                                                    } ${active
                                                        ? "bg-primary text-primary-foreground"
                                                        : "text-foreground hover:bg-muted"
                                                    }`}
                                            >
                                                <Icon
                                                    size={19}
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

                {/* Rodapé */}
                <div className="shrink-0 border-t border-border">
                    <div
                        className={`p-3 ${collapsed
                                ? "lg:flex lg:justify-center"
                                : ""
                            }`}
                    >
                        <button
                            type="button"
                            onClick={toggleCollapsed}
                            className={`hidden items-center rounded-xl border border-border text-sm hover:bg-muted lg:inline-flex ${collapsed
                                    ? "h-10 w-10 justify-center"
                                    : "w-full justify-between gap-3 px-3 py-2.5"
                                }`}
                            aria-label={
                                collapsed
                                    ? "Expandir menu lateral"
                                    : "Recolher menu lateral"
                            }
                            title={
                                collapsed
                                    ? "Expandir menu"
                                    : "Recolher menu"
                            }
                        >
                            {!collapsed && <span>Recolher menu</span>}

                            {collapsed ? (
                                <ChevronRight size={18} />
                            ) : (
                                <ChevronLeft size={18} />
                            )}
                        </button>
                    </div>

                    <div
                        className={`px-4 pb-4 text-xs leading-relaxed text-muted-foreground ${collapsed ? "lg:hidden" : ""
                            }`}
                    >
                        Cadastros de instituições, cargos, bancas,
                        disciplinas e assuntos:
                        {" "}
                        <Link
                            href="/catalogo"
                            onClick={() => setMobileOpen(false)}
                            className="font-semibold text-foreground hover:underline"
                        >
                            Catálogo
                        </Link>
                        .
                    </div>
                </div>
            </aside>
        </>
    );
}

export default Sidebar;
