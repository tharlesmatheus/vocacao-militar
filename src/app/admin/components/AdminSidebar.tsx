"use client";
import { User, BookOpen, PlusCircle, LogOut } from "lucide-react";
import { useRouter, usePathname } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import React from "react";

const links = [
    { href: "/admin", label: "Clientes", icon: <User className="w-5 h-5" /> },
    { href: "/admin?tab=questoes", label: "Questões", icon: <BookOpen className="w-5 h-5" /> },
    { href: "/admin?tab=novo-cliente", label: "Novo Cliente", icon: <PlusCircle className="w-5 h-5" /> },
    { href: "/admin?tab=nova-questao", label: "Nova Questão", icon: <PlusCircle className="w-5 h-5" /> },
];

export default function AdminSidebar({
    open,
    onOpen,
    onClose,
}: {
    open: boolean;
    onOpen: () => void;
    onClose: () => void;
}) {
    const router = useRouter();
    const pathname = usePathname();
    const queryTab = typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("tab") : null;

    async function handleLogout() {
        await supabase.auth.signOut();
        router.replace("/admin/login");
    }

    return (
        <>
            {/* Overlay para mobile */}
            <div
                className={`fixed inset-0 z-40 bg-black/30 md:hidden transition-opacity ${open ? "opacity-100" : "opacity-0 pointer-events-none"}`}
                onClick={onClose}
                aria-hidden="true"
            />
            <aside
                className={`fixed z-50 top-0 left-0 h-full w-[250px] bg-white border-r shadow-md flex flex-col transition-transform duration-200
          ${open ? "translate-x-0" : "-translate-x-full md:translate-x-0"}
        `}
                style={{ minHeight: "100vh" }}
            >
                {/* Logo */}
                <div className="flex items-center px-7 py-7 gap-3 border-b">
                    <div className="bg-blue-600 text-white rounded-full w-11 h-11 flex items-center justify-center text-2xl font-bold">
                        VM
                    </div>
                    <span className="text-xl font-extrabold text-[#232939]">Admin</span>
                </div>
                {/* Navegação */}
                <nav className="flex-1 flex flex-col gap-1 mt-6">
                    {links.map((link, i) => {
                        const isActive =
                            (pathname === "/admin" && !queryTab && i === 0) ||
                            (typeof window !== "undefined" && new URLSearchParams(window.location.search).get("tab") === link.href.split("tab=")[1]);
                        return (
                            <a
                                key={link.href}
                                href={link.href}
                                className={`flex items-center gap-3 px-7 py-2 rounded-lg font-semibold transition
                  ${isActive
                                        ? "bg-[#e9effd] text-blue-700 shadow"
                                        : "text-[#232939] hover:bg-[#f2f6fe]"}
                `}
                                onClick={onClose}
                            >
                                {link.icon}
                                <span className="text-base">{link.label}</span>
                            </a>
                        );
                    })}
                </nav>
                {/* Sair */}
                <button
                    onClick={handleLogout}
                    className="flex items-center gap-3 px-7 py-2 rounded-lg font-semibold mt-auto mb-2 bg-[#f8fafd] text-[#232939] hover:bg-red-600 hover:text-white transition"
                >
                    <LogOut className="w-5 h-5" /> Sair
                </button>
                {/* Rodapé */}
                <div className="p-3 text-xs text-[#a3adc7] text-center border-t">
                    &copy; {new Date().getFullYear()} Vocação Militar <br />
                    Área Administrativa
                </div>
            </aside>
        </>
    );
}
