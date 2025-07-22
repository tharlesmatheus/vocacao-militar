"use client";
import "./globals.css";
import { Sidebar } from "@/components/Sidebar";
import { Header } from "@/components/Header";
import { usePathname } from "next/navigation";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isAuthRoute = pathname.startsWith("/auth");
  const isAdminRoute = pathname.startsWith("/admin");

  return (
    <html lang="pt-BR" className="h-full">
      <body className="bg-[#f5f6fa] text-[#232939] min-h-screen font-sans antialiased">
        <div className="flex min-h-screen h-full">
          {!isAuthRoute && !isAdminRoute && <Sidebar />}
          <div className="flex-1 flex flex-col h-full bg-[#f5f6fa]">
            {!isAuthRoute && !isAdminRoute && <Header />}
            <main className={
              isAuthRoute || isAdminRoute
                ? "flex min-h-screen items-center justify-center bg-[#f8fafc] w-full"
                : "flex-1 w-full max-w-7xl mx-auto px-2 sm:px-4 md:px-8 py-5 md:py-8"
            }>
              {children}
            </main>
          </div>
        </div>
      </body>
    </html>
  );
}
