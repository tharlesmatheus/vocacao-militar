"use client";

import { supabase } from "@/lib/supabaseClient";

/*
 * Lembretes no celular (Web Push). A chave pública VAPID vem de
 * NEXT_PUBLIC_VAPID_PUBLIC_KEY; a privada fica só no servidor.
 * No iPhone, só funciona com o app adicionado à tela inicial (iOS 16.4+).
 */

export type EstadoLembretes = "indisponivel" | "iphone-instalar" | "bloqueado" | "ativo" | "inativo";

function base64UrlParaBytes(base64: string): Uint8Array<ArrayBuffer> {
    const preenchido = (base64 + "=".repeat((4 - (base64.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/");
    const bruto = atob(preenchido);
    const bytes = new Uint8Array(new ArrayBuffer(bruto.length));
    for (let i = 0; i < bruto.length; i++) bytes[i] = bruto.charCodeAt(i);
    return bytes;
}

function ehIphoneSemInstalar() {
    const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
    const instalado = window.matchMedia?.("(display-mode: standalone)").matches || (navigator as any).standalone === true;
    return ios && !instalado;
}

async function registro() {
    return (await navigator.serviceWorker.getRegistration("/")) ?? navigator.serviceWorker.register("/sw.js");
}

export async function estadoLembretes(): Promise<EstadoLembretes> {
    if (typeof window === "undefined") return "indisponivel";
    if (ehIphoneSemInstalar()) return "iphone-instalar";
    if (!("serviceWorker" in navigator) || !("PushManager" in window) || !process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY) {
        return "indisponivel";
    }
    if (Notification.permission === "denied") return "bloqueado";
    const reg = await navigator.serviceWorker.getRegistration("/");
    const inscricao = await reg?.pushManager.getSubscription();
    return inscricao ? "ativo" : "inativo";
}

export async function ativarLembretes(): Promise<EstadoLembretes> {
    const estado = await estadoLembretes();
    if (estado === "indisponivel" || estado === "iphone-instalar" || estado === "bloqueado") return estado;

    const permissao = await Notification.requestPermission();
    if (permissao !== "granted") return permissao === "denied" ? "bloqueado" : "inativo";

    const reg = await registro();
    await navigator.serviceWorker.ready;
    const inscricao =
        (await reg.pushManager.getSubscription()) ??
        (await reg.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: base64UrlParaBytes(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!),
        }));

    const json = inscricao.toJSON();
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) throw new Error("Faça login novamente.");
    const { error } = await supabase.from("push_inscricoes").upsert(
        {
            user_id: auth.user.id,
            endpoint: inscricao.endpoint,
            p256dh: json.keys?.p256dh ?? "",
            auth: json.keys?.auth ?? "",
            user_agent: navigator.userAgent.slice(0, 300),
        },
        { onConflict: "endpoint" }
    );
    if (error) throw new Error("Não foi possível salvar o aparelho: " + error.message);
    return "ativo";
}

export async function desativarLembretes(): Promise<EstadoLembretes> {
    const reg = await navigator.serviceWorker.getRegistration("/");
    const inscricao = await reg?.pushManager.getSubscription();
    if (inscricao) {
        await supabase.from("push_inscricoes").delete().eq("endpoint", inscricao.endpoint);
        await inscricao.unsubscribe();
    }
    return "inativo";
}

export const textoEstado: Record<EstadoLembretes, string> = {
    indisponivel: "Este navegador não recebe notificações.",
    "iphone-instalar": "No iPhone: toque em Compartilhar → \"Adicionar à Tela de Início\", abra o app por lá e ative aqui.",
    bloqueado: "As notificações estão bloqueadas nas configurações do navegador para este site.",
    ativo: "Lembretes ativos neste aparelho.",
    inativo: "Receba um aviso de manhã quando tiver revisões para fazer.",
};
