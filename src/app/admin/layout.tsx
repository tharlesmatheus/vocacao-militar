"use client";
import React, { useState } from "react";
import AdminSidebar from "./components/AdminSidebar";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
    const [sidebarOpen, setSidebarOpen] = useState(false);

    return (
        <div className="flex min-h-screen bg-gradient-to-br from-[#e8f0fe] via-[#f3f6fa] to-[#f3f6fa] relative">
            {/* Sidebar para desktop e drawer mobile */}
            <AdminSidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />

            {/* Overlay para mobile */}
            {sidebarOpen && (
                <div
                    className="fixed inset-0 z-40 bg-black/30 md:hidden"
                    onClick={() => setSidebarOpen(false)}
                />
            )}

            {/* Conteúdo */}
            <div className="flex-1 flex flex-col min-h-screen transition-all">

                {/* Top bar mobile */}
                <div className="md:hidden sticky top-0 left-0 w-full z-30 bg-white/90 border-b border-gray-200 py-2 px-4 flex items-center shadow-sm">
                    <button
                        onClick={() => setSidebarOpen(true)}
                        className="text-blue-600 font-bold rounded p-2 border border-blue-200 bg-white shadow"
                        aria-label="Abrir menu"
                    >
                        <svg width={24} height={24} fill="none" viewBox="0 0 24 24">
                            <rect y={4} width={24} height={2} rx={1} fill="currentColor" />
                            <rect y={11} width={24} height={2} rx={1} fill="currentColor" />
                            <rect y={18} width={24} height={2} rx={1} fill="currentColor" />
                        </svg>
                    </button>
                    <span className="ml-4 text-lg font-bold text-[#232939]">Painel Admin</span>
                </div>

                {/* Conteúdo central */}
                <main className="flex-1 flex flex-col w-full max-w-6xl mx-auto px-2 sm:px-6 py-6 transition-all">
                    <div className="flex-1 flex flex-col bg-white rounded-2xl shadow-lg border border-[#e3e8f3] p-4 sm:p-8 min-h-[60vh]">
                        {children}
                    </div>
                </main>

                {/* Rodapé */}
                <footer className="w-full text-center text-xs text-[#a3adc7] pb-2 pt-2 mt-auto">
                    &copy; {new Date().getFullYear()} Vocação Militar - Área Administrativa
                </footer>
            </div>
        </div>
    );
}
