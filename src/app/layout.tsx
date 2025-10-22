"use client";

import "./globals.css";
import { Sidebar } from "@/components/Sidebar";
import { Header } from "@/components/Header";
import { ThemeProvider } from "@/components/theme-provider";
import { usePathname } from "next/navigation";
import React from "react";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isAuthRoute = pathname.startsWith("/auth");
  const isAdminRoute = pathname.startsWith("/admin");

  // Registra o service worker (se existir /sw.js em public)
  React.useEffect(() => {
    if (typeof window !== "undefined" && "serviceWorker" in navigator) {
      const swUrl = "/sw.js";
      fetch(swUrl, { method: "HEAD" })
        .then((res) => {
          if (res.ok) navigator.serviceWorker.register(swUrl).catch(() => { });
        })
        .catch(() => { });
    }
  }, []);

  return (
    <html lang="pt-BR" className="h-full">
      <head>
        {/* Manifest PWA */}
        <link rel="manifest" href="/manifest.json" />

        {/* Cores do tema para barras do navegador (claro/escuro) */}
        <meta name="theme-color" content="#ffffff" media="(prefers-color-scheme: light)" />
        <meta name="theme-color" content="#0a0a0a" media="(prefers-color-scheme: dark)" />

        {/* iOS PWA */}
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <meta name="apple-mobile-web-app-title" content="Vocação" />

        {/* Ícones (ajuste os nomes se os seus forem diferentes) */}
        <link rel="icon" href="/favicon.ico" sizes="any" />
        <link rel="icon" type="image/png" href="/icons/icon-192x192.png" />
        <link rel="apple-touch-icon" href="/icons/icon-192x192.png" />
        <link rel="mask-icon" href="/icons/safari-pinned-tab.svg" color="#0ea5e9" />

        {/* Meta básicos */}
        <meta name="application-name" content="Vocação" />
        <meta name="description" content="Plataforma de estudos e estatísticas de questões." />
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
      </head>

      <body className="bg-background text-foreground min-h-screen font-sans antialiased">
        <ThemeProvider
          attribute="class"
          defaultTheme="light" // inicia claro
          enableSystem
          disableTransitionOnChange
        >
          <div className="flex min-h-screen h-full">
            {!isAuthRoute && !isAdminRoute && <Sidebar />}
            <div className="flex-1 flex flex-col h-full bg-background">
              {!isAuthRoute && !isAdminRoute && <Header />}
              <main
                className={
                  isAuthRoute || isAdminRoute
                    ? "flex min-h-screen items-center justify-center bg-muted w-full"
                    : "flex-1 w-full max-w-7xl mx-auto px-2 sm:px-4 md:px-8 py-5 md:py-8"
                }
              >
                {children}
              </main>
            </div>
          </div>
        </ThemeProvider>
      </body>
    </html>
  );
}
