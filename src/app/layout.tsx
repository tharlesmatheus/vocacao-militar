"use client";
import "./globals.css";
import { Sidebar } from "@/components/Sidebar";
import { Header } from "@/components/Header";
import { usePathname } from "next/navigation";
import { ThemeProvider } from "@/components/theme-provider";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isAuthRoute = pathname.startsWith("/auth");
  const isAdminRoute = pathname.startsWith("/admin");

  return (
    <html lang="pt-BR" className="h-full">
      <body className="bg-background text-foreground min-h-screen font-sans antialiased">
        <ThemeProvider
          attribute="class"
          defaultTheme="light"    // <- Alterado para iniciar sempre claro!
          enableSystem
          disableTransitionOnChange
        >
          <div className="flex min-h-screen h-full">
            {!isAuthRoute && !isAdminRoute && <Sidebar />}
            <div className="flex-1 flex flex-col h-full bg-background">
              {!isAuthRoute && !isAdminRoute && <Header />}
              <main className={
                isAuthRoute || isAdminRoute
                  ? "flex min-h-screen items-center justify-center bg-muted w-full"
                  : "flex-1 w-full max-w-7xl mx-auto px-2 sm:px-4 md:px-8 py-5 md:py-8"
              }>
                {children}
              </main>
            </div>
          </div>
        </ThemeProvider>
      </body>
    </html>
  );
}
