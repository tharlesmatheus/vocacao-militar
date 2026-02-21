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
  const showChrome = !isAuthRoute && !isAdminRoute;

  // Registra o service worker
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
        <link rel="manifest" href="/manifest.json" />

        <meta
          name="theme-color"
          content="#ffffff"
          media="(prefers-color-scheme: light)"
        />
        <meta
          name="theme-color"
          content="#0a0a0a"
          media="(prefers-color-scheme: dark)"
        />

        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <meta name="apple-mobile-web-app-title" content="Vocação" />

        <link rel="icon" href="/favicon.ico" sizes="any" />
        <link rel="icon" type="image/png" href="/icons/icon-192x192.png" />
        <link rel="apple-touch-icon" href="/icons/icon-192x192.png" />
        <link
          rel="mask-icon"
          href="/icons/safari-pinned-tab.svg"
          color="#0ea5e9"
        />

        <meta name="application-name" content="Vocação" />
        <meta
          name="description"
          content="Plataforma de estudos e estatísticas de questões."
        />
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1, viewport-fit=cover"
        />
      </head>

      <body className="min-h-[100dvh] bg-background text-foreground font-sans antialiased overflow-x-hidden">
        <ThemeProvider
          attribute="class"
          defaultTheme="light"
          enableSystem
          disableTransitionOnChange
        >
          {/* Sidebar é fixed, então o conteúdo precisa de padding-left no desktop */}
          {showChrome && <Sidebar />}

          <div
            className={[
              "min-h-[100dvh] w-full max-w-full overflow-x-hidden",
              showChrome ? "md:pl-[260px]" : "",
            ].join(" ")}
          >
            {showChrome && <Header />}

            <main
              className={
                showChrome
                  ? "w-full max-w-full overflow-x-hidden px-3 sm:px-4 md:px-8 py-5 md:py-8"
                  : "flex min-h-[100dvh] items-center justify-center bg-muted w-full px-4"
              }
            >
              {/* Padroniza a largura do conteúdo */}
              {showChrome ? (
                <div className="mx-auto w-full max-w-7xl">{children}</div>
              ) : (
                children
              )}
            </main>
          </div>
        </ThemeProvider>
      </body>
    </html>
  );
}