"use client";

import "./globals.css";
import React from "react";
import { usePathname } from "next/navigation";
import { ThemeProvider } from "@/components/theme-provider";
import { Sidebar } from "@/components/Sidebar";
import { Header } from "@/components/Header";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isAuthRoute = pathname.startsWith("/auth");
  const isAdminRoute = pathname.startsWith("/admin");
  // Páginas públicas (vendas e textos legais): sem barra lateral e sem moldura centralizada.
  const isPublicRoute = ["/assinar", "/termos", "/privacidade"].some((r) => pathname.startsWith(r));
  const isAuthLikeRoute = pathname.startsWith("/definir-senha");
  const showChrome = !isAuthRoute && !isAdminRoute && !isPublicRoute && !isAuthLikeRoute;

  // ✅ estado do collapse fica no layout
  const [sidebarCollapsed, setSidebarCollapsed] = React.useState(false);

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

  /**
   * FIX: Scroll normal do navegador (rodinha do mouse)
   */
  React.useEffect(() => {
    if (typeof window === "undefined") return;

    const html = document.documentElement;
    const body = document.body;

    const prevHtmlOverflowY = html.style.overflowY;
    const prevBodyOverflowY = body.style.overflowY;

    html.style.overflowY = "auto";
    body.style.overflowY = "auto";

    const proto = EventTarget.prototype as EventTarget & {
      __wheelPassivePatchApplied__?: boolean;
      __originalAddEventListener__?: typeof EventTarget.prototype.addEventListener;
    };

    if (!proto.__wheelPassivePatchApplied__) {
      proto.__wheelPassivePatchApplied__ = true;
      proto.__originalAddEventListener__ = proto.addEventListener;

      function patchedAddEventListener(
        this: EventTarget,
        type: string,
        listener: EventListenerOrEventListenerObject | null,
        options?: boolean | AddEventListenerOptions
      ) {
        if (type === "wheel" || type === "mousewheel" || type === "touchmove") {
          const opts: AddEventListenerOptions =
            typeof options === "boolean"
              ? { capture: options }
              : options
                ? { ...options }
                : {};

          if (opts.passive !== true) opts.passive = true;

          return proto.__originalAddEventListener__!.call(this, type, listener, opts);
        }

        return proto.__originalAddEventListener__!.call(this, type, listener, options as any);
      }

      proto.addEventListener =
        patchedAddEventListener as typeof EventTarget.prototype.addEventListener;
    }

    return () => {
      html.style.overflowY = prevHtmlOverflowY;
      body.style.overflowY = prevBodyOverflowY;
    };
  }, []);

  // Largura real da sidebar no desktop. A sidebar só fica fixa a partir de "lg"
  // (lg:w-20 recolhida, lg:w-[290px] aberta); o recuo precisa ser o mesmo.
  const sidebarWidthClass = sidebarCollapsed ? "lg:pl-20" : "lg:pl-[290px]";

  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <head>
        <link rel="manifest" href="/manifest.json" />
        <meta name="theme-color" content="#0b0b0c" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black" />
        <meta name="apple-mobile-web-app-title" content="Vocação" />
        <link rel="icon" href="/favicon.ico" sizes="any" />
        <link rel="icon" type="image/png" href="/icon-192.png" />
        <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
        <meta name="application-name" content="Vocação" />
        <meta
          name="description"
          content="Plataforma de estudos e estatísticas de questões."
        />
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
      </head>

      <body className="bg-background text-foreground font-sans antialiased overflow-x-hidden">
        <ThemeProvider attribute="class" defaultTheme="dark" enableSystem={false} storageKey="vm-tema" disableTransitionOnChange>
          {showChrome && (
            <Sidebar
              collapsed={sidebarCollapsed}
              onCollapsedChange={setSidebarCollapsed}
            />
          )}

          <div className={["w-full max-w-full", showChrome ? sidebarWidthClass : ""].join(" ")}>
            {showChrome && <Header />}

            <main
              className={
                showChrome
                  ? "w-full px-3 sm:px-4 md:px-8 py-5 md:py-8"
                  : isPublicRoute
                    ? "w-full"
                    : "min-h-screen flex items-center justify-center bg-muted w-full px-4"
              }
            >
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