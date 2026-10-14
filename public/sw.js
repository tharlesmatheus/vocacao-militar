/* Service worker da Vocação Militar: instalação como app e lembretes (Web Push). */

self.addEventListener("install", () => {
    self.skipWaiting();
});

self.addEventListener("activate", (event) => {
    event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", () => {
    // Sem cache offline por enquanto: tudo vem da rede.
});

self.addEventListener("push", (event) => {
    let dados = {};
    try {
        dados = event.data ? event.data.json() : {};
    } catch {
        dados = { body: event.data ? event.data.text() : "" };
    }
    const titulo = dados.title || "Vocação Militar";
    event.waitUntil(
        self.registration.showNotification(titulo, {
            body: dados.body || "Sua missão de hoje está esperando.",
            icon: "/icon-192.png",
            badge: "/icon-192.png",
            tag: dados.tag || "lembrete-diario",
            data: { url: dados.url || "/" },
        })
    );
});

self.addEventListener("notificationclick", (event) => {
    event.notification.close();
    const destino = new URL((event.notification.data && event.notification.data.url) || "/", self.location.origin).href;
    event.waitUntil(
        self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((janelas) => {
            for (const j of janelas) {
                if (j.url.startsWith(self.location.origin) && "focus" in j) {
                    j.navigate(destino);
                    return j.focus();
                }
            }
            return self.clients.openWindow(destino);
        })
    );
});
