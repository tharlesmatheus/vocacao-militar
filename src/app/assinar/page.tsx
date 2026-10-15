import type { CSSProperties, ReactNode } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { Barlow_Condensed } from "next/font/google";
import { PRECO_PLANO } from "@/lib/plano";
import {
    ArrowRight,
    BarChart3,
    BookX,
    Check,
    Clock3,
    Crosshair,
    HelpCircle,
    Layers3,
    MessageSquareText,
    NotebookPen,
    ShieldCheck,
    Siren,
    Target,
    TimerReset,
} from "lucide-react";
import { FormularioAssinatura } from "@/components/publico/FormularioAssinatura";

/*
 * Página pública de vendas (sem login, sem barra lateral; ver isPublicRoute em app/layout.tsx).
 *
 * As imagens em /public/vendas são capturas das telas reais do app (com uma questão
 * real da PM BA e textos de exemplo). Se as telas mudarem, gere as imagens de novo.
 * Não use números de acervo nem depoimentos inventados: só o que o produto entrega.
 */

const PRECO = PRECO_PLANO;

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
    "--primary": "#3b82f6",
    "--primary-foreground": "#ffffff",
    "--ring": "#3b82f6",
} as CSSProperties;

export const metadata: Metadata = {
    title: "Vocação Militar — Treino para concursos policiais",
    description:
        "Questões de provas anteriores de PM, PC, PRF, PF, Bombeiros e Guarda, com comentário em cada questão, caderno de erros automático, flashcards, revisão e simulados. R$ 14,90/mês, 7 dias de garantia.",
};

const carreiras = ["Polícia Militar", "Polícia Civil", "PRF", "Polícia Federal", "Bombeiro Militar", "Guarda Municipal", "Polícia Penal"];

const dores = [
    { icone: BookX, titulo: "Você estuda e esquece", texto: "Lê o conteúdo, faz resumo, e na semana seguinte já não lembra. Sem revisão, o estudo escorre pelos dedos." },
    { icone: Target, titulo: "Erra sempre a mesma coisa", texto: "A questão muda de banca, mas a pegadinha é a mesma. Sem treinar o erro, ele volta no dia da prova." },
    { icone: HelpCircle, titulo: "Não sabe se está pronto", texto: "Estuda muito, mas não sabe em qual matéria está perdendo pontos nem quanto está acertando de verdade." },
];

type Bloco = {
    tag: string;
    titulo: string;
    texto: string;
    itens: string[];
    imagem: string;
    largura: number;
    altura: number;
    alt: string;
    icone: typeof Crosshair;
};

const metodo: Bloco[] = [
    {
        tag: "Treino",
        icone: Crosshair,
        titulo: "Treine com questões de provas reais",
        texto: "Escolha a sua corporação e o seu cargo e resolva questões que já caíram em concursos policiais, no formato da prova.",
        itens: [
            "Filtro por instituição, cargo, banca, disciplina e assunto",
            "Questões completas, com gabarito oficial",
            "Certo ou errado e múltipla escolha",
        ],
        imagem: "/vendas/questao.webp",
        largura: 1360,
        altura: 1414,
        alt: "Questão de Direito Penal da PM BA respondida no Vocação Militar",
    },
    {
        tag: "Comentário",
        icone: MessageSquareText,
        titulo: "Entenda o porquê de cada gabarito",
        texto: "Cada questão tem um comentário direto ao ponto: por que a certa está certa, por que as outras estão erradas e a dica para não cair de novo.",
        itens: ["Artigo de lei citado", "Explicação de cada alternativa", "Dica de prova no final"],
        imagem: "/vendas/comentario.webp",
        largura: 1170,
        altura: 864,
        alt: "Comentário explicando o gabarito de uma questão",
    },
    {
        tag: "Caderno de erros",
        icone: NotebookPen,
        titulo: "Seus erros viram treino automático",
        texto: "Errou? A questão vai sozinha para o seu caderno de erros. Você refaz até acertar duas vezes seguidas, e só então ela sai.",
        itens: ["Nada para anotar: o caderno se monta sozinho", "Acertou no chute? Guarde para treinar depois", "Veja quantos erros você já recuperou"],
        imagem: "/vendas/caderno.webp",
        largura: 1400,
        altura: 836,
        alt: "Tela do caderno de erros com as questões para refazer",
    },
    {
        tag: "Revisão",
        icone: Layers3,
        titulo: "Revisão que não deixa você esquecer",
        texto: "Transforme qualquer questão em flashcard ou resumo. O sistema traz cada item de volta no dia certo, para o conteúdo ficar até a prova.",
        itens: ["Flashcards e resumos no mesmo lugar", "Revisão espaçada com agenda do dia", "Você só revisa o que está para vencer"],
        imagem: "/vendas/flashcard.webp",
        largura: 1400,
        altura: 1066,
        alt: "Flashcard sobre concussão e corrupção passiva na revisão",
    },
    {
        tag: "Simulado",
        icone: TimerReset,
        titulo: "Simulado com relógio, como no dia da prova",
        texto: "Monte um simulado da sua corporação e cargo, com tempo contando. Treine a pressão antes de enfrentá-la de verdade.",
        itens: ["Questões sorteadas do seu concurso", "Cronômetro e mapa das questões", "Nota e acerto por disciplina no final"],
        imagem: "/vendas/simulado.webp",
        largura: 1400,
        altura: 1105,
        alt: "Simulado da PM BA em andamento com cronômetro",
    },
    {
        tag: "Desempenho",
        icone: BarChart3,
        titulo: "Saiba exatamente onde está perdendo pontos",
        texto: "Tempo de estudo, questões e acerto por disciplina e por assunto. O sistema aponta o que precisa de atenção para você não estudar no escuro.",
        itens: ["Tempo contado sozinho enquanto você resolve", "Acerto por disciplina e assunto", "Alerta do que está abaixo de 70%"],
        imagem: "/vendas/desempenho.webp",
        largura: 1400,
        altura: 788,
        alt: "Tabela de desempenho por disciplina",
    },
];

const incluso = [
    "Questões de provas anteriores de concursos policiais",
    "Comentário explicando cada questão",
    "Caderno de erros automático",
    "Flashcards, resumos e revisão programada",
    "Simulados cronometrados",
    "Estatísticas por disciplina e assunto",
    "Meta do seu concurso e missão do dia",
    "No computador e no celular",
];

const faq = [
    {
        p: "Serve para qual concurso?",
        r: "Para concursos policiais e de segurança pública: Polícia Militar, Polícia Civil, PRF, Polícia Federal, Corpo de Bombeiros, Polícia Penal e Guarda Municipal. Você escolhe a instituição e o cargo e treina com as questões deles.",
    },
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
    { p: "Funciona no celular?", r: "Sim. Funciona no navegador do celular, do tablet e do computador, e pode ser instalado na tela inicial do celular como um aplicativo." },
];

/* Faixa zebrada azul e preta, usada como divisória. */
function Faixa() {
    return (
        <div
            aria-hidden
            className="h-2 w-full"
            style={{ backgroundImage: "repeating-linear-gradient(-45deg, #3b82f6 0 14px, #0a0a0a 14px 28px)" }}
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

function BotaoAssinar({ children, className = "" }: { children: ReactNode; className?: string }) {
    return (
        <a
            href="#assinar"
            className={`${fonteTitulo.className} inline-flex items-center justify-center gap-2 bg-primary px-7 py-4 text-xl font-bold uppercase tracking-wide text-primary-foreground shadow-[0_10px_40px_rgba(59,130,246,0.35)] transition hover:brightness-110 ${className}`}
        >
            {children}
            <ArrowRight className="h-5 w-5" aria-hidden />
        </a>
    );
}

/** Captura de tela com moldura de janela (cantos, borda e brilho azul). */
function Tela({ src, largura, altura, alt }: { src: string; largura: number; altura: number; alt: string }) {
    return (
        <figure className="relative">
            <div aria-hidden className="absolute -inset-4 -z-10 rounded-3xl bg-primary/10 blur-2xl" />
            <div className="overflow-hidden rounded-xl border border-white/10 bg-[#111] shadow-2xl shadow-black/60">
                <div className="flex items-center gap-1.5 border-b border-white/10 bg-[#141414] px-3 py-2" aria-hidden>
                    <span className="h-2.5 w-2.5 rounded-full bg-white/15" />
                    <span className="h-2.5 w-2.5 rounded-full bg-white/15" />
                    <span className="h-2.5 w-2.5 rounded-full bg-white/15" />
                </div>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={src} width={largura} height={altura} alt={alt} loading="lazy" decoding="async" className="block h-auto w-full" />
            </div>
        </figure>
    );
}

export default function AssinarPage() {
    const h = `${fonteTitulo.className} uppercase tracking-wide`;

    return (
        <div style={temaTatico} className="min-h-screen w-full overflow-x-clip bg-background pb-20 text-foreground [color-scheme:dark] md:pb-0">
            {/* Topo */}
            <header className="sticky top-0 z-40 border-b border-border bg-black/80 backdrop-blur">
                <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-3 px-5 py-3">
                    <span className={`${h} flex items-center gap-2 text-xl font-extrabold sm:text-2xl`}>
                        <ShieldCheck className="h-7 w-7 shrink-0 text-primary" aria-hidden />
                        <span>Vocação <span className="text-primary">Militar</span></span>
                    </span>
                    <nav className="flex items-center gap-2">
                        <Link href="/auth" className="shrink-0 px-3 py-2 text-sm font-semibold uppercase tracking-wider text-muted-foreground hover:text-primary">
                            Entrar
                        </Link>
                        <a href="#assinar" className="hidden shrink-0 bg-primary px-4 py-2 text-sm font-bold uppercase tracking-wider text-primary-foreground hover:brightness-110 sm:inline-block">
                            Assinar
                        </a>
                    </nav>
                </div>
            </header>

            {/* Hero */}
            <section className="relative overflow-hidden">
                <div
                    aria-hidden
                    className="pointer-events-none absolute inset-0"
                    style={{
                        backgroundImage:
                            "radial-gradient(700px 360px at 5% 0%, rgba(220,38,38,0.22), transparent 70%), radial-gradient(700px 360px at 95% 10%, rgba(37,99,235,0.25), transparent 70%), linear-gradient(rgba(255,255,255,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.03) 1px, transparent 1px)",
                        backgroundSize: "auto, auto, 40px 40px, 40px 40px",
                    }}
                />
                <div className="relative mx-auto grid w-full max-w-6xl items-center gap-12 px-5 pb-16 pt-12 lg:grid-cols-[1.15fr_0.85fr] lg:pt-16">
                    <div className="flex flex-col gap-6">
                        <Rotulo><Siren className="h-4 w-4" aria-hidden /> Concursos policiais</Rotulo>
                        <h1 className={`${h} text-5xl font-extrabold leading-[0.92] sm:text-6xl lg:text-7xl`}>
                            A farda se conquista <span className="text-primary">questão por questão.</span>
                        </h1>
                        <p className="max-w-xl text-lg text-zinc-300 sm:text-xl">
                            Treine com questões de provas anteriores da sua corporação, entenda cada gabarito e
                            transforme cada erro em ponto na prova. Um método simples, todo dia, até a aprovação.
                        </p>
                        <ul className="grid max-w-xl gap-2 text-zinc-200 sm:grid-cols-2">
                            {["Comentário em cada questão", "Caderno de erros automático", "Revisão no dia certo", "Simulados com cronômetro"].map((t) => (
                                <li key={t} className="flex items-center gap-2">
                                    <Check className="h-5 w-5 shrink-0 text-primary" aria-hidden /> {t}
                                </li>
                            ))}
                        </ul>
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                            <BotaoAssinar>Começar agora</BotaoAssinar>
                            <div className="text-sm text-muted-foreground">
                                <span className="font-semibold text-foreground">{PRECO}/mês</span> · 7 dias de garantia · cancele quando quiser
                            </div>
                        </div>
                    </div>

                    {/* Celular com uma questão real */}
                    <div className="relative mx-auto w-[260px] sm:w-[300px]">
                        <div aria-hidden className="absolute -inset-10 -z-10 rounded-full bg-primary/20 blur-3xl" />
                        <div className="rounded-[2.6rem] border border-white/15 bg-black p-2.5 shadow-2xl shadow-black">
                            <div className="relative overflow-hidden rounded-[2.1rem] bg-[#0a0a0a]">
                                <div aria-hidden className="absolute left-1/2 top-2 z-10 h-5 w-24 -translate-x-1/2 rounded-full bg-black" />
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img
                                    src="/vendas/celular.webp"
                                    width={720}
                                    height={1440}
                                    alt="Questão de Direito Penal da PM BA respondida no celular"
                                    className="block h-auto w-full pt-6"
                                    fetchPriority="high"
                                />
                            </div>
                        </div>
                        <div className="absolute -left-10 top-[58%] hidden items-center gap-2 border border-emerald-500/40 bg-[#0f1a14] px-3 py-2 text-sm font-semibold text-emerald-300 shadow-xl sm:flex">
                            <Check className="h-4 w-4" aria-hidden /> Você acertou!
                        </div>
                        <div className="absolute -right-8 top-[22%] hidden items-center gap-2 border border-primary/40 bg-[#0d1424] px-3 py-2 text-sm font-semibold text-blue-200 shadow-xl sm:flex">
                            <NotebookPen className="h-4 w-4" aria-hidden /> Erro vai pro caderno
                        </div>
                    </div>
                </div>
            </section>

            {/* Carreiras */}
            <section className="border-y border-border bg-black">
                <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-center gap-x-6 gap-y-2 px-5 py-5">
                    {carreiras.map((c) => (
                        <span key={c} className={`${h} text-base font-semibold text-zinc-400 sm:text-lg`}>
                            {c}
                        </span>
                    ))}
                </div>
            </section>

            {/* Dor */}
            <section className="mx-auto w-full max-w-6xl px-5 py-16 sm:py-20">
                <div className="mb-10 flex flex-col items-center gap-3 text-center">
                    <Rotulo>O problema</Rotulo>
                    <h2 className={`${h} max-w-3xl text-4xl font-extrabold sm:text-5xl`}>
                        Estudar muito não é o mesmo que <span className="text-primary">estudar para passar</span>
                    </h2>
                </div>
                <div className="grid gap-4 md:grid-cols-3">
                    {dores.map(({ icone: Icone, titulo, texto }) => (
                        <div key={titulo} className="border border-border bg-card p-6">
                            <Icone className="mb-4 h-8 w-8 text-red-400" aria-hidden />
                            <h3 className={`${h} mb-2 text-2xl font-bold`}>{titulo}</h3>
                            <p className="text-muted-foreground">{texto}</p>
                        </div>
                    ))}
                </div>
                <p className="mx-auto mt-10 max-w-2xl text-center text-lg text-zinc-300">
                    Quem passa em concurso policial não é quem lê mais. É quem <b className="text-foreground">treina com questão, corrige o erro e revisa</b> até
                    o conteúdo ficar. O Vocação Militar organiza isso para você, todo dia.
                </p>
            </section>

            <Faixa />

            {/* Método */}
            <section className="bg-black">
                <div className="mx-auto w-full max-w-6xl px-5 py-16 sm:py-20">
                    <div className="mb-14 flex flex-col items-center gap-3 text-center">
                        <Rotulo>O método</Rotulo>
                        <h2 className={`${h} text-4xl font-extrabold sm:text-5xl`}>Treinar, entender, corrigir, revisar</h2>
                        <p className="max-w-2xl text-muted-foreground">Telas reais da plataforma. É isso que você usa a partir de hoje.</p>
                    </div>

                    <div className="flex flex-col gap-20 sm:gap-24">
                        {metodo.map((b, i) => (
                            <article key={b.titulo} className="grid items-center gap-10 lg:grid-cols-2 lg:gap-14">
                                <div className={`flex flex-col gap-4 ${i % 2 ? "lg:order-2" : ""}`}>
                                    <div className="flex items-center gap-3">
                                        <span className={`${h} text-5xl font-extrabold text-primary/70`}>0{i + 1}</span>
                                        <span className={`${fonteTitulo.className} inline-flex items-center gap-1.5 text-sm font-semibold uppercase tracking-[0.2em] text-primary`}>
                                            <b.icone className="h-4 w-4" aria-hidden /> {b.tag}
                                        </span>
                                    </div>
                                    <h3 className={`${h} text-3xl font-extrabold sm:text-4xl`}>{b.titulo}</h3>
                                    <p className="text-lg text-zinc-300">{b.texto}</p>
                                    <ul className="flex flex-col gap-2">
                                        {b.itens.map((t) => (
                                            <li key={t} className="flex items-start gap-2 text-zinc-200">
                                                <Check className="mt-0.5 h-5 w-5 shrink-0 text-primary" aria-hidden /> {t}
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                                <div className={`${i % 2 ? "lg:order-1" : ""} ${b.altura > b.largura ? "mx-auto w-full max-w-md" : ""}`}>
                                    <Tela src={b.imagem} largura={b.largura} altura={b.altura} alt={b.alt} />
                                </div>
                            </article>
                        ))}
                    </div>
                </div>
            </section>

            <Faixa />

            {/* Rotina */}
            <section className="mx-auto w-full max-w-6xl px-5 py-16 sm:py-20">
                <div className="mb-10 flex flex-col items-center gap-3 text-center">
                    <Rotulo>Sua rotina</Rotulo>
                    <h2 className={`${h} text-4xl font-extrabold sm:text-5xl`}>Uma missão por dia, sem enrolação</h2>
                </div>
                <ol className="grid gap-4 md:grid-cols-3">
                    {[
                        [Target, "Defina sua meta", "Escolha a instituição e o cargo. As questões e os simulados passam a girar em torno da sua prova."],
                        [Clock3, "Cumpra a missão do dia", "Questões, revisões e tempo de estudo do dia. Você abre o app e já sabe o que fazer."],
                        [BarChart3, "Corrija a rota", "Veja onde está errando, refaça o caderno de erros e chegue na prova sem ponto fraco escondido."],
                    ].map(([Icone, titulo, texto], i) => {
                        const I = Icone as typeof Target;
                        return (
                            <li key={titulo as string} className="relative border border-border bg-card p-6">
                                <span className={`${h} absolute right-5 top-4 text-5xl font-extrabold text-white/5`}>0{i + 1}</span>
                                <I className="mb-4 h-8 w-8 text-primary" aria-hidden />
                                <h3 className={`${h} mb-2 text-2xl font-bold`}>{titulo as string}</h3>
                                <p className="text-muted-foreground">{texto as string}</p>
                            </li>
                        );
                    })}
                </ol>
            </section>

            {/* Oferta + formulário */}
            <section className="relative overflow-hidden border-y border-border bg-black">
                <div
                    aria-hidden
                    className="pointer-events-none absolute inset-0"
                    style={{ backgroundImage: "radial-gradient(800px 400px at 50% 0%, rgba(37,99,235,0.18), transparent 70%)" }}
                />
                <div className="relative mx-auto grid w-full max-w-6xl gap-10 px-5 py-16 sm:py-20 lg:grid-cols-2 lg:items-center">
                    <div className="flex flex-col gap-5">
                        <Rotulo>Acesso completo</Rotulo>
                        <h2 className={`${h} text-4xl font-extrabold sm:text-5xl`}>
                            Tudo isso por menos de <span className="text-primary">R$ 0,50 por dia</span>
                        </h2>
                        <p className="text-lg text-zinc-300">
                            Menos que um lanche por mês para treinar todos os dias com o mesmo método de quem leva a aprovação a sério.
                        </p>
                        <ul className="grid gap-2 sm:grid-cols-2">
                            {incluso.map((t) => (
                                <li key={t} className="flex items-start gap-2 text-zinc-200">
                                    <Check className="mt-0.5 h-5 w-5 shrink-0 text-primary" aria-hidden /> {t}
                                </li>
                            ))}
                        </ul>
                        <div className="mt-2 flex items-start gap-3 border border-emerald-500/30 bg-emerald-500/5 p-4">
                            <ShieldCheck className="h-8 w-8 shrink-0 text-emerald-400" aria-hidden />
                            <p className="text-sm text-zinc-300">
                                <b className="text-foreground">Garantia de 7 dias.</b> Assine, use tudo e, se não for para você, peça o
                                reembolso integral. Depois, cancele quando quiser, sem multa.
                            </p>
                        </div>
                    </div>

                    <div id="assinar" className="relative scroll-mt-20 border border-primary/50 bg-[#0f0f0f] p-6 shadow-[0_0_80px_rgba(59,130,246,0.15)] sm:p-8">
                        <span aria-hidden className="absolute -top-px left-6 right-6 h-[3px] bg-primary" />
                        <div className="mb-5">
                            <div className={`${fonteTitulo.className} text-sm font-semibold uppercase tracking-[0.2em] text-muted-foreground`}>Assinatura mensal</div>
                            <div className="flex items-end gap-1">
                                <span className={`${fonteTitulo.className} text-6xl font-extrabold text-primary`}>{PRECO}</span>
                                <span className="pb-2 text-muted-foreground">/mês</span>
                            </div>
                            <div className="mt-1 text-sm text-muted-foreground">Cartão ou Pix · renovação automática · cancele quando quiser</div>
                        </div>
                        <FormularioAssinatura preco={PRECO} />
                    </div>
                </div>
            </section>

            {/* FAQ */}
            <section className="mx-auto w-full max-w-3xl px-5 py-16 sm:py-20">
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

            {/* Chamada final */}
            <section className="mx-auto w-full max-w-4xl px-5 pb-20">
                <div className="flex flex-col items-center gap-5 border border-primary/40 bg-primary/5 p-8 text-center sm:p-12">
                    <h2 className={`${h} text-4xl font-extrabold sm:text-5xl`}>A sua vaga não vai esperar</h2>
                    <p className="max-w-2xl text-lg text-zinc-300">
                        O edital sai e quem já vinha treinando sai na frente. Comece hoje, com 7 dias de garantia.
                    </p>
                    <BotaoAssinar>Quero começar por {PRECO}/mês</BotaoAssinar>
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

            {/* Barra fixa no celular */}
            <div className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-black/95 p-3 backdrop-blur md:hidden">
                <a
                    href="#assinar"
                    className={`${fonteTitulo.className} flex w-full items-center justify-center gap-2 bg-primary py-3 text-lg font-bold uppercase tracking-wide text-primary-foreground`}
                >
                    Começar por {PRECO}/mês <ArrowRight className="h-5 w-5" aria-hidden />
                </a>
            </div>
        </div>
    );
}
