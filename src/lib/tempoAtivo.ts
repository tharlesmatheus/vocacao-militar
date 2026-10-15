"use client";

import { useEffect } from "react";
import { supabase } from "@/lib/supabaseClient";

/*
 * Contagem automática do tempo de estudo.
 *
 * Conta 1 segundo de cada vez SOMENTE quando:
 *   - há uma atividade de estudo aberta (questões, simulado, revisão ou caderno);
 *   - a aba está visível;
 *   - o aluno mexeu em algo (clique, tecla, rolagem, toque) nos últimos 2,5 minutos.
 * Junta os segundos por disciplina e envia ao banco a cada ~90 s, ao trocar de
 * página e ao esconder a aba. O banco recusa tempo acima do relógio e não conta
 * enquanto o cronômetro manual estiver ligado.
 */

export type OrigemEstudo = "questoes" | "simulado" | "revisao" | "caderno";

type Contexto = { origem: OrigemEstudo; disciplinaId: string | null; disciplinaNome: string | null };
type Pacote = Contexto & { segundos: number };

const OCIOSO_MS = 150_000;
const ENVIO_A_CADA_S = 90;

let contexto: Contexto | null = null;
let tokenAtual: string | null = null; // para o envio final ao fechar a aba (não dá para esperar o login)
let ultimaAtividade = 0;
let iniciado = false;
let segundosDesdeEnvio = 0;
const pacotes = new Map<string, Pacote>();

function chave(c: Contexto) {
    return `${c.origem}|${c.disciplinaId ?? ""}|${(c.disciplinaNome ?? "").toLowerCase()}`;
}

function registrarAtividade() {
    ultimaAtividade = Date.now();
}

/**
 * Envio final ao fechar/recarregar a aba: precisa ser síncrono e com keepalive,
 * senão o navegador cancela a requisição junto com a página.
 */
function enviarAoSair() {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const chaveAnon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    const lote = [...pacotes.values()].filter((p) => p.segundos >= 5);
    pacotes.clear();
    segundosDesdeEnvio = 0;
    if (!url || !chaveAnon || !tokenAtual) return;
    for (const p of lote) {
        try {
            fetch(`${url.replace(/\/$/, "")}/rest/v1/rpc/registrar_tempo_auto`, {
                method: "POST",
                keepalive: true,
                headers: { "Content-Type": "application/json", apikey: chaveAnon, Authorization: `Bearer ${tokenAtual}` },
                body: JSON.stringify({
                    p_origem: p.origem,
                    p_segundos: Math.round(p.segundos),
                    p_disciplina_id: p.disciplinaId,
                    p_disciplina_nome: p.disciplinaNome,
                }),
            });
        } catch {
            /* a aba está fechando: não há o que fazer */
        }
    }
}

async function enviar() {
    const lote = [...pacotes.values()].filter((p) => p.segundos >= 5);
    pacotes.clear();
    segundosDesdeEnvio = 0;
    for (const p of lote) {
        try {
            await supabase.rpc("registrar_tempo_auto", {
                p_origem: p.origem,
                p_segundos: Math.round(p.segundos),
                p_disciplina_id: p.disciplinaId,
                p_disciplina_nome: p.disciplinaNome,
            });
        } catch {
            // Sem internet ou banco sem a migração: perde no máximo ~90 s, sem atrapalhar o estudo.
        }
    }
}

function iniciar() {
    if (iniciado || typeof window === "undefined") return;
    iniciado = true;
    for (const ev of ["pointerdown", "keydown", "touchstart", "wheel"]) {
        window.addEventListener(ev, registrarAtividade, { passive: true, capture: true });
    }
    window.addEventListener("scroll", registrarAtividade, { passive: true, capture: true });
    document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "hidden") enviarAoSair();
        else registrarAtividade();
    });
    window.addEventListener("pagehide", enviarAoSair);
    // Guarda o token atual para o envio final (pagehide não pode esperar).
    supabase.auth.getSession().then(({ data }) => { tokenAtual = data.session?.access_token ?? null; });
    supabase.auth.onAuthStateChange((_e, sessao) => { tokenAtual = sessao?.access_token ?? null; });

    window.setInterval(() => {
        if (!contexto) return;
        if (document.visibilityState !== "visible") return;
        if (Date.now() - ultimaAtividade > OCIOSO_MS) return;
        const k = chave(contexto);
        const atual = pacotes.get(k) ?? { ...contexto, segundos: 0 };
        atual.segundos += 1;
        pacotes.set(k, atual);
        segundosDesdeEnvio += 1;
        if (segundosDesdeEnvio >= ENVIO_A_CADA_S) void enviar();
    }, 1000);
}

/** A disciplina do que o aluno está estudando agora (pelo nome da questão ou pelo id do catálogo). */
export function marcarDisciplina(disciplina: { nome?: string | null; id?: string | null }) {
    if (!contexto) return;
    const nome = (disciplina.nome ?? "").trim() || null;
    const id = disciplina.id ?? null;
    if (contexto.disciplinaNome === nome && contexto.disciplinaId === id) return;
    contexto = { ...contexto, disciplinaNome: nome, disciplinaId: id };
    registrarAtividade();
}

/**
 * Liga a contagem enquanto a página estiver aberta. Ao sair, envia o que faltou.
 * Use uma vez por página: useEstudoAutomatico("questoes").
 */
export function useEstudoAutomatico(origem: OrigemEstudo) {
    useEffect(() => {
        iniciar();
        contexto = { origem, disciplinaId: null, disciplinaNome: null };
        registrarAtividade();
        return () => {
            void enviar();
            contexto = null;
        };
    }, [origem]);
}
