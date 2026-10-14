import type { CSSProperties, ReactNode } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { Barlow_Condensed } from "next/font/google";
import {
    BarChart3,
    BookOpenCheck,
    CalendarCheck2,
    Crosshair,
    Layers3,
    MessageSquareText,
    NotebookText,
    RotateCcw,
    ShieldCheck,
    Siren,
} from "lucide-react";
import { FormularioAssinatura } from "@/components/publico/FormularioAssinatura";

/*
 * Página pública de vendas. Não exige login e não mostra a barra lateral do app
 * (ver isPublicRoute em app/layout.tsx).
 *
 * Visual "tático": fundo preto, dourado de insígnia e títulos condensados.
 * As cores são aplicadas sobrescrevendo as variáveis do tema só neste bloco,
 * então o FormularioAssinatura (que usa bg-card, text-primary etc.) herda o
 * visual escuro sem precisar de uma versão própria.
 */

const PRECO = "R$ 14,90";

const fonteTitulo = Barlow_Condensed({ subsets: ["latin"], weight: ["600", "700", "800"], display: "swap" });

const temaTatico = {
    "--background": "#0a0a0a",
    "--foreground": "#f4f4f5",
    "--card": "#161616",
    "--card-foreground": "#f4f4f5",
    "--muted": "#1c1c1c",
    "--muted-foreground": "#a1a1aa",
    "--border": "#2c2c2c",
    "--input": "#2c2c2c",
    "--primary": "#f2b705",
    "--primary-foreground": "#0a0a0a",
    "--ring": "#f2b705",
} as CSSProperties;

export const metadata: Metadata = {
    title: "Vocação Militar — Questões para concursos policiais",
    description:
        "Mais de 60 mil questões para Polícia Militar, Polícia Civil, PRF, Polícia Federal, Bombeiros e Guarda Municipal, com comentários, caderno de erros e estatísticas. R$ 14,90/mês, cancele quando quiser.",
};

/* Carreiras com mais questões no acervo (contagem feita no banco do VM3 em 14/10/2026). */
const carreiras = ["Polícia Militar", "Polícia Civil", "PRF", "Polícia Federal", "Bombeiro Militar", "Guarda Municipal"];

const recursos = [
    { icone: BookOpenCheck, titulo: "+60 mil questões", texto: "Filtre por corporação, cargo, banca, disciplina e assunto. Só entram questões completas, com gabarito e sem imagem faltando." },
    { icone: MessageSquareText, titulo: "Comentário em cada questão", texto: "Entenda o porquê do gabarito em \"Ver comentários\" e troque ideias com outros candidatos." },
    { icone: NotebookText, titulo: "Caderno de erros", texto: "Errou? A questão vai direto para o seu caderno, para você refazer até acertar." },
    { icone: RotateCcw, titulo: "Revisão programada", texto: "O sistema traz de volta o que você precisa revisar, para o conteúdo não se perder até a prova." },
    { icone: BarChart3, titulo: "Raio-x do desempenho", texto: "Aproveitamento por disciplina e assunto: saiba exatamente onde está perdendo pontos." },
    { icone: CalendarCheck2, titulo: "Edital e cronograma", texto: "Organize o edital, monte o cronograma e controle seu tempo real de estudo com Pomodoro." },
    { icone: Layers3, titulo: "Flashcards e resumos", texto: "Transforme questões em flashcards e guarde seus resumos no mesmo lugar." },
    { icone: Crosshair, titulo: "Foco na carreira policial", texto: "Feito para quem quer vestir a farda: questões das provas de PM, PC, PRF, PF, Bombeiros e Guarda Municipal." },
];

const faq = [
    {
        p: "Como funciona a cobrança?",
        r: `É uma assinatura mensal de ${PRECO}. No cartão ou no Pix automático, a renovação é feita sozinha todo mês: você autoriza uma vez e não precisa pagar manualmente.`,
    },
    { p: "Posso cancelar quando quiser?", r: "Sim, sem multa. Ao cancelar, você continua com acesso até o fim do período que já pagou." },
    { p: "E se eu não gostar?", r: "Você tem 7 dias, a partir da compra, para pedir o reembolso integral, como prevê o Código de Defesa do Consumidor." },
    {
        p: "Como acesso depois de pagar?",
        r: "Assim que o pagamento é aprovado, você recebe um e-mail para criar sua senha e já entra com acesso liberado. Se já tem conta, o acesso é liberado nela.",
    },
    { p: "Funciona no celular?", r: "Sim. Funciona no navegador do celular, do tablet e do computador, e pode ser instalada na tela inicial do celular." },
];

/* Faixa zebrada amarela e preta, usada como divisória. */
function Faixa() {
    return (
        <div
            aria-hidden
            className="h-2 w-full"
            style={{ backgroundImage: "repeating-linear-gradient(-45deg, #f2b705 0 14px, #0a0a0a 14px 28px)" }}
        />
    );
}

function Rotulo({ children }: { children: ReactNode }) {
    return (
        <span className={`${fonteTitulo.className} inline-flex w-fit items-center gap-2 border border-primary/40 bg-primary/10 px-3 py-1 text-sm font-semibold uppercase tracking-[0.2em] text-primary`}>
            {children}
        </span>
    );
}

export default function AssinarPage() {
    const h = `${fonteTitulo.className} uppercase tracking-wide`;

    return (
        <div style={temaTatico} className="min-h-screen w-full bg-background text-foreground [color-scheme:dark]">
            {/* Topo */}
            <header className="border-b border-border bg-black/60 backdrop-blur">
                <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-3 px-5 py-4">
                    <span className={`${h} flex items-center gap-2 text-2xl font-extrabold`}>
                        <ShieldCheck className="h-7 w-7 shrink-0 text-primary" aria-hidden />
                        <span>Vocação <span className="text-primary">Militar</span></span>
                    </span>
                    <Link href="/auth" className="shrink-0 border border-border px-4 py-2 text-sm font-semibold uppercase tracking-wider hover:border-primary hover:text-primary">
                        Já sou aluno
                    </Link>
                </div>
            </header>

            {/* Hero + formulário */}
            <section className="relative overflow-hidden">
                {/* Brilho de giroflex (vermelho e azul) e grade sutil ao fundo */}
                <div
                    aria-hidden
                    className="pointer-events-none absolute inset-0"
                    style={{
                        backgroundImage:
                            "radial-gradient(600px 320px at 8% 0%, rgba(220,38,38,0.20), transparent 70%), radial-gradient(600px 320px at 92% 0%, rgba(37,99,235,0.20), transparent 70%), linear-gradient(rgba(255,255,255,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.03) 1px, transparent 1px)",
                        backgroundSize: "auto, auto, 40px 40px, 40px 40px",
                    }}
                />
                <div className="relative mx-auto grid w-full max-w-6xl gap-10 px-5 pb-16 pt-12 lg:grid-cols-[1.1fr_0.9fr] lg:items-center">
                    <div className="flex flex-col gap-6">
                        <Rotulo><Siren className="h-4 w-4" aria-hidden /> Concursos policiais</Rotulo>
                        <h1 className={`${h} text-5xl font-extrabold leading-[0.95] sm:text-6xl lg:text-7xl`}>
                            Sua farda começa <span className="text-primary">na preparação.</span>
                        </h1>
                        <p className="max-w-xl text-lg text-muted-foreground">
                            Mais de 60 mil questões de concursos policiais com comentários, caderno de erros, revisão
                            e estatísticas. Treine como quem vai ser aprovado, por menos de 50 centavos por dia.
                        </p>
                        <ul className="flex flex-wrap gap-2">
                            {carreiras.map((c) => (
                                <li key={c} className={`${fonteTitulo.className} border border-border bg-card px-3 py-1 text-base font-semibold uppercase tracking-wider text-zinc-200`}>
                                    {c}
                                </li>
                            ))}
                        </ul>
                    </div>

                    <div id="assinar" className="relative scroll-mt-6 border border-primary/40 bg-[#0f0f0f] p-6 shadow-[0_0_60px_rgba(242,183,5,0.08)] sm:p-8">
                        <span aria-hidden className="absolute -top-px left-6 right-6 h-[3px] bg-primary" />
                        <div className="mb-5">
                            <div className={`${fonteTitulo.className} text-sm font-semibold uppercase tracking-[0.2em] text-muted-foreground`}>Assinatura mensal</div>
                            <div className="flex items-end gap-1">
                                <span className={`${fonteTitulo.className} text-6xl font-extrabold text-primary`}>{PRECO}</span>
                                <span className="pb-2 text-muted-foreground">/mês</span>
                            </div>
                            <div className="mt-1 text-sm text-muted-foreground">Acesso completo. Cancele quando quiser.</div>
                        </div>
                        <FormularioAssinatura preco={PRECO} />
                    </div>
                </div>
            </section>

            <Faixa />

            {/* Números */}
            <section className="border-b border-border bg-black">
                <div className="mx-auto grid w-full max-w-6xl grid-cols-2 gap-6 px-5 py-10 text-center md:grid-cols-4">
                    {[
                        ["+60 mil", "questões"],
                        ["100%", "com gabarito"],
                        ["Cartão ou Pix", "renovação automática"],
                        ["7 dias", "de garantia"],
                    ].map(([valor, legenda]) => (
                        <div key={legenda}>
                            <div className={`${h} text-3xl font-extrabold text-primary sm:text-4xl`}>{valor}</div>
                            <div className="text-sm uppercase tracking-wider text-muted-foreground">{legenda}</div>
                        </div>
                    ))}
                </div>
            </section>

            {/* Recursos */}
            <section className="mx-auto w-full max-w-6xl px-5 py-16">
                <div className="mb-10 flex flex-col items-center gap-3 text-center">
                    <Rotulo>Arsenal de estudo</Rotulo>
                    <h2 className={`${h} text-4xl font-extrabold`}>Tudo para a sua aprovação</h2>
                </div>
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                    {recursos.map(({ icone: Icone, titulo, texto }) => (
                        <div key={titulo} className="border border-border bg-card p-5 transition hover:border-primary/60">
                            <Icone className="mb-3 h-7 w-7 text-primary" aria-hidden />
                            <h3 className={`${h} mb-1 text-xl font-bold`}>{titulo}</h3>
                            <p className="text-sm text-muted-foreground">{texto}</p>
                        </div>
                    ))}
                </div>
            </section>

            {/* Como funciona */}
            <section className="border-y border-border bg-black">
                <div className="mx-auto w-full max-w-6xl px-5 py-16">
                    <h2 className={`${h} mb-10 text-center text-4xl font-extrabold`}>Missão em 3 passos</h2>
                    <ol className="grid gap-4 md:grid-cols-3">
                        {[
                            ["Preencha seus dados", "Nome, e-mail e WhatsApp. Leva 20 segundos."],
                            ["Pague com segurança", "Cartão ou Pix automático pela Kiwify. A renovação é automática."],
                            ["Comece a treinar", "Você recebe um e-mail para criar sua senha e já entra com acesso liberado."],
                        ].map(([titulo, texto], i) => (
                            <li key={titulo} className="border border-border bg-card p-6">
                                <div className={`${h} mb-3 text-5xl font-extrabold text-primary/80`}>0{i + 1}</div>
                                <h3 className={`${h} mb-1 text-xl font-bold`}>{titulo}</h3>
                                <p className="text-sm text-muted-foreground">{texto}</p>
                            </li>
                        ))}
                    </ol>
                </div>
            </section>

            {/* Garantia */}
            <section className="mx-auto w-full max-w-4xl px-5 py-16">
                <div className="flex flex-col items-center gap-3 border border-primary/40 bg-primary/5 p-8 text-center">
                    <ShieldCheck className="h-12 w-12 text-primary" aria-hidden />
                    <h2 className={`${h} text-3xl font-extrabold`}>7 dias para testar sem risco</h2>
                    <p className="max-w-2xl text-muted-foreground">
                        Assine, use tudo e, se não for para você, peça o reembolso integral em até 7 dias.
                        Depois disso, cancele quando quiser, sem multa.
                    </p>
                    <a href="#assinar" className={`${h} mt-2 bg-primary px-8 py-3 text-lg font-bold text-primary-foreground transition hover:brightness-110`}>
                        Quero assinar por {PRECO}/mês
                    </a>
                </div>
            </section>

            {/* FAQ */}
            <section className="mx-auto w-full max-w-3xl px-5 pb-20">
                <h2 className={`${h} mb-8 text-center text-4xl font-extrabold`}>Perguntas frequentes</h2>
                <div className="flex flex-col gap-3">
                    {faq.map(({ p, r }) => (
                        <details key={p} className="group border border-border bg-card p-5 open:border-primary/50">
                            <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-semibold">
                                {p}
                                <span className="text-xl text-primary transition group-open:rotate-45" aria-hidden>+</span>
                            </summary>
                            <p className="mt-3 text-sm text-muted-foreground">{r}</p>
                        </details>
                    ))}
                </div>
            </section>

            <Faixa />
            <footer className="bg-black">
                <div className="mx-auto flex w-full max-w-6xl flex-col items-center justify-between gap-3 px-5 py-8 text-sm text-muted-foreground sm:flex-row">
                    <span>© {new Date().getFullYear()} Vocação Militar</span>
                    <nav className="flex gap-5">
                        <Link href="/termos" className="hover:text-primary">Termos de Uso</Link>
                        <Link href="/privacidade" className="hover:text-primary">Privacidade</Link>
                        <Link href="/auth" className="hover:text-primary">Entrar</Link>
                    </nav>
                </div>
            </footer>
        </div>
    );
}
