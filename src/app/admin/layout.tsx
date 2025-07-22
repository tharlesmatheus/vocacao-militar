"use client";
import React, { useState } from "react";
import AdminSidebar from "./components/AdminSidebar";


export default function AdminLayout({ children }: { children: React.ReactNode }) {
    const [sidebarOpen, setSidebarOpen] = useState(false);

    return (
        <div className="flex min-h-screen bg-[#f3f6fa]">
            <AdminSidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
            <div className="flex-1 flex flex-col min-h-screen">
                {/* Mobile: menu button */}
                <div className="md:hidden p-2 bg-[#f3f6fa]">
                    <button
                        onClick={() => setSidebarOpen(true)}
                        className="text-[#232939] bg-gray-100 px-4 py-2 rounded font-bold border"
                    >
                        Menu
                    </button>
                </div>
                <main className="flex-1 w-full max-w-7xl mx-auto px-2 sm:px-4 md:px-8 py-5 md:py-8">
                    {children}
                </main>
            </div>
        </div>
    );
}
