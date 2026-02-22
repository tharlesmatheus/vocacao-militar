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

  /**
   * FIX: Scroll normal do navegador (rodinha do mouse)
   * - Garante que html/body estejam roláveis mesmo se algum overlay/scroll-lock travar overflow.
   * - Evita "preventDefault()" em wheel/touchmove ao forçar listeners a serem passive.
   */
  React.useEffect(() => {
    if (typeof window === "undefined") return;

    // 1) Garante que o documento possa rolar
    const html = document.documentElement;
    const body = document.body;

    const prevHtmlOverflowY = html.style.overflowY;
    const prevBodyOverflowY = body.style.overflowY;

    html.style.overflowY = "auto";
    body.style.overflowY = "auto";

    // 2) Patch em addEventListener para forçar passive: true em wheel/touchmove
    const proto = EventTarget.prototype as EventTarget & {
      __wheelPassivePatchApplied__?: boolean;
      __originalAddEventListener__?: typeof EventTarget.prototype.addEventListener;
    };

    // Evita patch duplicado em hot reload
    if (!proto.__wheelPassivePatchApplied__) {
      proto.__wheelPassivePatchApplied__ = true;
      proto.__originalAddEventListener__ = proto.addEventListener;

      const original = proto.addEventListener.bind(proto);

      function patchedAddEventListener(
        this: EventTarget,
        type: string,
        listener: EventListenerOrEventListenerObject | null,
        options?: boolean | AddEventListenerOptions
      ) {
        if (type === "wheel" || type === "mousewheel" || type === "touchmove") {
          // Normaliza options para objeto
          const opts: AddEventListenerOptions =
            typeof options === "boolean"
              ? { capture: options }
              : options
                ? { ...options }
                : {};

          // Força passive: true (impede preventDefault() de matar a rolagem)
          if (opts.passive !== true) opts.passive = true;

          return proto.__originalAddEventListener__!.call(this, type, listener, opts);
        }

        return proto.__originalAddEventListener__!.call(this, type, listener, options as any);
      }

      proto.addEventListener = patchedAddEventListener as typeof EventTarget.prototype.addEventListener;
    }

    return () => {
      // Restaura overflow inline anterior
      html.style.overflowY = prevHtmlOverflowY;
      body.style.overflowY = prevBodyOverflowY;

      // Mantém o patch (não desfaz) para evitar o bug voltar após navegação/hot reload
    };
  }, []);

  return (
    <html lang="pt-BR">
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

      <body className="bg-background text-foreground font-sans antialiased overflow-x-hidden">
        <ThemeProvider
          attribute="class"
          defaultTheme="light"
          enableSystem
          disableTransitionOnChange
        >
          {showChrome && <Sidebar />}

          <div
            className={[
              "w-full max-w-full",
              showChrome ? "md:pl-[260px]" : "",
            ].join(" ")}
          >
            {showChrome && <Header />}

            <main
              className={
                showChrome
                  ? "w-full px-3 sm:px-4 md:px-8 py-5 md:py-8"
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