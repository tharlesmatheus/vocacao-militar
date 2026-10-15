"use client";

import Script from "next/script";
import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { META_PIXEL_ID, eventoPixel } from "@/lib/pixel";

/** Pixel da Meta: carrega uma vez e registra PageView a cada troca de página. */
export function MetaPixel() {
    const pathname = usePathname();
    const ignorar = pathname.startsWith("/admin") || pathname.startsWith("/landing");

    useEffect(() => {
        if (!ignorar) eventoPixel("PageView");
    }, [pathname, ignorar]);

    if (!META_PIXEL_ID) return null;
    return (
        <Script id="meta-pixel" strategy="afterInteractive">
            {`!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?
n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;
n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;
t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,
document,'script','https://connect.facebook.net/en_US/fbevents.js');
fbq('init','${META_PIXEL_ID}');
(window.__fbqPendentes||[]).splice(0).forEach(function(a){fbq.apply(null,a)});`}
        </Script>
    );
}
