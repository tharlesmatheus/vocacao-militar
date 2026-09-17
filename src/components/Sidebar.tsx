"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, type ComponentType } from "react";
import {
    BarChart3,
    BookOpenCheck,
    ChevronLeft,
    ChevronRight,
    Clock3,
    FileText,
    Home,
    Menu,
    RotateCcw,
    Tags,
    X,
} from "lucide-react";

type MenuItem = {
    href: string;
    label: string;
    description?: string;
    icon: ComponentType<{
        size?: number;
        className?: string;
    }>;
};

export type SidebarProps = {
    collapsed?: boolean;
    onCollapsedChange?: (collapsed: boolean) => void;
};

const ITEMS: MenuItem[] = [
    {
        href: "/",
        label: "Início",
        description: "Visão geral",
        icon: Home,
    },
    {
        href: "/questoes",
        label: "Questões",
        description: "Lançar e resolver questões",
        icon: BookOpenCheck,
    },
    {
        href: "/catalogo",
        label: "Catálogo",
        description: "Instituições, cargos, bancas, disciplinas e assuntos",
        icon: Tags,
    },
    {
        href: "/revisao",
        label: "Revisões",
        description: "Cadernos e revisão espaçada",
        icon: RotateCcw,
    },
    {
        href: "/edital",
        label: "Edital",
        description: "Estrutura do plano de estudos",
        icon: FileText,
    },
    {
        href: "/estatisticas",
        label: "Estatísticas",
        description: "Desempenho e evolução",
        icon: BarChart3,
    },
    {
        href: "/tempo-de-estudo",
        label: "Tempo de estudo",
        description: "Histórico de sessões",
        icon: Clock3,
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
            {/* Botão mobile */}
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
                        title={collapsed ? "Estudos" : undefined}
                    >
                        <span className="lg:hidden">Estudos</span>
                        {collapsed ? (
                            <span className="hidden lg:inline-flex h-9 w-9 items-center justify-center rounded-xl bg-primary text-sm font-bold text-primary-foreground">
                                E
                            </span>
                        ) : (
                            <span className="hidden lg:inline">Estudos</span>
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
                    <div className="space-y-1">
                        {ITEMS.map((item) => {
                            const Icon = item.icon;
                            const active = isActive(pathname, item.href);

                            return (
                                <Link
                                    key={item.href}
                                    href={item.href}
                                    onClick={() => setMobileOpen(false)}
                                    title={collapsed ? item.label : undefined}
                                    className={`flex rounded-2xl transition ${collapsed
                                            ? "items-center gap-3 px-3 py-3 lg:justify-center lg:px-2"
                                            : "items-start gap-3 px-3 py-3"
                                        } ${active
                                            ? "bg-primary text-primary-foreground"
                                            : "text-foreground hover:bg-muted"
                                        }`}
                                >
                                    <Icon
                                        size={19}
                                        className={`shrink-0 ${collapsed ? "" : "mt-0.5"
                                            }`}
                                    />

                                    {/* Mobile sempre exibe texto. Desktop recolhido esconde. */}
                                    <span
                                        className={`min-w-0 ${collapsed ? "lg:hidden" : ""
                                            }`}
                                    >
                                        <span className="block text-sm font-semibold">
                                            {item.label}
                                        </span>

                                        {item.description && (
                                            <span
                                                className={`mt-0.5 block text-xs leading-relaxed ${active
                                                        ? "text-primary-foreground/75"
                                                        : "text-muted-foreground"
                                                    }`}
                                            >
                                                {item.description}
                                            </span>
                                        )}
                                    </span>
                                </Link>
                            );
                        })}
                    </div>
                </nav>

                {/* Rodapé */}
                <div className="shrink-0 border-t border-border">
                    <div
                        className={`p-3 ${collapsed ? "lg:flex lg:justify-center" : ""
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
                        className={`px-4 pb-4 text-xs text-muted-foreground ${collapsed ? "lg:hidden" : ""
                            }`}
                    >
                        O cadastro das categorias de questões é feito
                        exclusivamente em{" "}
                        <Link
                            href="/catalogo"
                            onClick={() => setMobileOpen(false)}
                            className="font-semibold text-foreground hover:underline"
                        >
                            /catalogo
                        </Link>
                        .
                    </div>
                </div>
            </aside>
        </>
    );
}

export default Sidebar;