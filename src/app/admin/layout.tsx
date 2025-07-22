"use client";
import React, { useState } from "react";
import AdminSidebar from "./components/AdminSidebar";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
    const [sidebarOpen, setSidebarOpen] = useState(false);

    return (
        <div className="flex bg-[#f5f6fa] min-h-screen">
            <AdminSidebar open={sidebarOpen} onOpen={() => setSidebarOpen(true)} onClose={() => setSidebarOpen(false)} />
            <div className="flex-1 flex flex-col">
                {/* Header para mobile: botão de menu */}
                <div className="md:hidden p-3 flex items-center bg-white shadow-sm">
                    <button
                        onClick={() => setSidebarOpen(true)}
                        className="bg-[#eef1f7] px-4 py-2 rounded font-bold border text-[#232939]"
                    >
                        Menu
                    </button>
                </div>
                {/* Conteúdo principal */}
                <main className="flex-1 w-full max-w-4xl mx-auto px-2 sm:px-4 py-6">
                    {children}
                </main>
            </div>
        </div>
    );
}
