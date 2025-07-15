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
} from "lucide-react";
import { useState } from "react";

// Menu sem "Meus Resumos"
const MENU = [
    { name: "Resolver Questões", href: "/", icon: Home },
    { name: "Cronograma Semanal", href: "/cronograma", icon: CalendarDays },
    { name: "Minhas Estatísticas", href: "/estatisticas", icon: BarChart2 },
    { name: "Minhas Conquistas", href: "/conquistas", icon: BadgeCheck },
    { name: "Meu Perfil", href: "/perfil", icon: User },
    { name: "Meu Plano", href: "/plano", icon: CreditCard },
];

export function Sidebar() {
    const pathname = usePathname();
    const [open, setOpen] = useState(false);

    return (
        <>
            {/* Botão para abrir menu (mobile) */}
            <button
                className="fixed top-5 left-4 z-40 md:hidden bg-white rounded-lg p-2 shadow border border-[#ececec]"
                aria-label="Abrir menu"
                onClick={() => setOpen(true)}
            >
                <MenuIcon className="w-6 h-6 text-[#232939]" />
            </button>

            {/* Sidebar - Desktop: fixa, Mobile: drawer */}
            <aside
                className={`
          z-30 font-sans
          bg-white px-4 pt-6 pb-4 shadow-lg border-r border-[#ececec]
          w-[250px] min-h-screen flex flex-col
          transition-transform duration-200
          md:sticky md:top-0 md:left-0 md:translate-x-0
          ${open ? "fixed left-0 top-0 h-screen" : "fixed -translate-x-full md:translate-x-0"}
        `}
            >
                {/* Botão fechar - Mobile */}
                <button
                    className="absolute top-5 right-3 md:hidden rounded-lg p-2"
                    aria-label="Fechar menu"
                    onClick={() => setOpen(false)}
                >
                    <CloseIcon className="w-6 h-6 text-[#232939]" />
                </button>

                {/* Logo */}
                <div className="flex items-center gap-3 mb-10 select-none">
                    <div className="w-11 h-11 rounded-xl bg-[#232939] flex items-center justify-center text-white font-black text-xl shadow">
                        VM
                    </div>
                    <span className="font-black text-xl leading-6 text-[#232939] tracking-tight">
                        Vocação<br />Militar
                    </span>
                </div>
                {/* Menu */}
                <nav className="flex flex-col gap-1 flex-1">
                    {MENU.map((item) => {
                        const active = pathname === item.href || (item.href === "/" && pathname === "/");
                        return (
                            <Link
                                key={item.name}
                                href={item.href}
                                className={`
                  flex items-center gap-3 px-4 py-3 rounded-xl font-semibold text-[15px]
                  transition-all
                  ${active
                                        ? "bg-[#f5f6fa] text-[#232939] font-bold"
                                        : "text-[#656b7b] hover:bg-[#f2f5fa] hover:text-[#232939]"
                                    }
                `}
                                onClick={() => setOpen(false)} // Fecha menu ao clicar (mobile)
                            >
                                <item.icon size={20} className={active ? "text-[#232939]" : "text-[#b1bad3]"} />
                                <span className="whitespace-pre-line">{item.name}</span>
                            </Link>
                        );
                    })}
                </nav>
            </aside>
            {/* BACKDROP para fechar menu mobile */}
            {open && (
                <div
                    className="fixed inset-0 z-20 bg-black/30 md:hidden"
                    onClick={() => setOpen(false)}
                    aria-label="Fechar menu"
                />
            )}
        </>
    );
}
