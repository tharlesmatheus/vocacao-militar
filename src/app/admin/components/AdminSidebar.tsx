"use client";
import { User, BookOpen, PlusCircle, LogOut } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import React from "react";

const links = [
    { href: "/admin", label: "Clientes", icon: <User /> },
    { href: "/admin?tab=questoes", label: "Questões", icon: <BookOpen /> },
    { href: "/admin?tab=novo-cliente", label: "Novo Cliente", icon: <PlusCircle /> },
    { href: "/admin?tab=nova-questao", label: "Nova Questão", icon: <PlusCircle /> },
];

export default function AdminSidebar({
    open,
    onClose,
}: {
    open: boolean;
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
                className={`fixed inset-0 bg-black/30 z-40 md:hidden transition-opacity ${open ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"}`}
                onClick={onClose}
            ></div>
            <aside
                className={`fixed md:static z-50 top-0 left-0 h-full w-[250px] bg-white shadow-lg flex flex-col transition-transform duration-200
        ${open ? "translate-x-0" : "-translate-x-full md:translate-x-0"}
        `}
                style={{ minHeight: "100vh" }}
            >
                <div className="flex items-center px-6 py-6 gap-3 border-b">
                    <div className="bg-blue-600 text-white rounded-full w-11 h-11 flex items-center justify-center text-2xl font-bold">
                        VM
                    </div>
                    <span className="text-xl font-extrabold text-[#232939]">Admin</span>
                </div>
                <nav className="flex-1 flex flex-col gap-1 mt-6">
                    {links.map((link, i) => {
                        // Detecção simples da aba/tab ativa (pode melhorar conforme navegação)
                        const active =
                            (pathname === "/admin" && !queryTab && i === 0) ||
                            (typeof window !== "undefined" && new URLSearchParams(window.location.search).get("tab") === link.href.split("tab=")[1]);
                        return (
                            <a
                                key={link.href}
                                href={link.href}
                                className={`flex items-center gap-3 px-6 py-2 rounded-lg font-semibold transition
                  ${active
                                        ? "bg-blue-600 text-white shadow"
                                        : "text-[#232939] hover:bg-blue-100"}
                `}
                                onClick={onClose}
                            >
                                {link.icon} {link.label}
                            </a>
                        );
                    })}
                    <button
                        onClick={handleLogout}
                        className="flex items-center gap-3 px-6 py-2 rounded-lg font-semibold mt-auto bg-gray-100 text-[#232939] hover:bg-red-600 hover:text-white transition"
                    >
                        <LogOut /> Sair
                    </button>
                </nav>
                <div className="p-4 text-xs text-[#a3adc7] text-center border-t mt-auto">
                    &copy; {new Date().getFullYear()} Vocação Militar <br />
                    Área Administrativa
                </div>
            </aside>
        </>
    );
}
