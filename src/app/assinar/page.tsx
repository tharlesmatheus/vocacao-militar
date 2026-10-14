import type { Metadata } from "next";
import Link from "next/link";
import {
    BarChart3,
    BookOpenCheck,
    CalendarCheck2,
    CheckCircle2,
    Layers3,
    MessageSquareText,
    NotebookText,
    RotateCcw,
    ShieldCheck,
    Target,
} from "lucide-react";
import { FormularioAssinatura } from "@/components/publico/FormularioAssinatura";

/*
 * Página pública de vendas. Não exige login e não mostra a barra lateral do app
 * (ver isPublicRoute em app/layout.tsx).
 */

const PRECO = "R$ 14,90";

export const metadata: Metadata = {
    title: "Vocação Militar — Questões para concursos militares",
    description:
        "Mais de 60 mil questões de concursos com comentários, cadernos de erros, revisão e estatísticas. Assine por R$ 14,90/mês e cancele quando quiser.",
};

const recursos = [
    { icone: BookOpenCheck, titulo: "Mais de 60 mil questões", texto: "Filtre por instituição, cargo, banca, disciplina e assunto. Só entram questões completas, com gabarito e sem imagem faltando." },
    { icone: MessageSquareText, titulo: "Comentário em cada questão", texto: "Clique em \"Ver comentários\" e entenda o porquê do gabarito, além de trocar ideias com outros alunos." },
    { icone: NotebookText, titulo: "Cadernos de erros e acertos", texto: "Errou? A questão vai para o seu caderno automaticamente para você refazer na hora certa." },
    { icone: RotateCcw, titulo: "Revisão inteligente", texto: "O sistema traz de volta o que você precisa revisar, para o conteúdo não se perder." },
    { icone: BarChart3, titulo: "Estatísticas de desempenho", texto: "Veja seu aproveitamento por disciplina e assunto e saiba exatamente onde focar." },
    { icone: CalendarCheck2, titulo: "Edital, cronograma e Pomodoro", texto: "Organize o edital, monte o cronograma e acompanhe seu tempo real de estudo." },
    { icone: Layers3, titulo: "Flashcards e resumos", texto: "Crie flashcards das questões e guarde seus resumos no mesmo lugar." },
    { icone: Target, titulo: "Foco na carreira militar", texto: "Feito para quem estuda para PM, Bombeiros, Guarda Municipal e Forças Armadas." },
];

const faq = [
    {
        p: "Como funciona a cobrança?",
        r: `É uma assinatura mensal de ${PRECO}. No cartão ou no Pix automático, a renovação é feita sozinha todo mês: você autoriza uma vez e não precisa pagar manualmente.`,
    },
    {
        p: "Posso cancelar quando quiser?",
        r: "Sim, sem multa. Ao cancelar, você continua com acesso até o fim do período que já pagou.",
    },
    {
        p: "E se eu não gostar?",
        r: "Você tem 7 dias, a partir da compra, para pedir o reembolso integral, como prevê o Código de Defesa do Consumidor.",
    },
    {
        p: "Como acesso depois de pagar?",
        r: "Assim que o pagamento é aprovado, você recebe um e-mail para criar sua senha e já entra com acesso liberado. Se já tem conta, o acesso é liberado nela.",
    },
    {
        p: "Funciona no celular?",
        r: "Sim. A plataforma funciona no navegador do celular, do tablet e do computador, e pode ser instalada na tela inicial do celular.",
    },
];

export default function AssinarPage() {
    return (
        <div className="min-h-screen w-full bg-background text-foreground">
            {/* Topo */}
            <header className="mx-auto flex w-full max-w-6xl items-center justify-between px-5 py-5">
                <span className="text-lg font-extrabold tracking-tight">
                    Vocação <span className="text-primary">Militar</span>
                </span>
                <Link href="/auth" className="rounded-lg border border-border px-4 py-2 text-sm font-semibold hover:bg-muted">
                    Já sou aluno
                </Link>
            </header>

            {/* Hero + formulário */}
            <section className="mx-auto grid w-full max-w-6xl gap-10 px-5 pb-16 pt-6 lg:grid-cols-[1.1fr_0.9fr] lg:items-center">
                <div className="flex flex-col gap-6">
                    <span className="w-fit rounded-full bg-primary/10 px-3 py-1 text-xs font-bold uppercase tracking-wide text-primary">
                        Concursos militares e de segurança pública
                    </span>
                    <h1 className="text-4xl font-extrabold leading-tight sm:text-5xl">
                        Treine com questões de verdade e chegue pronto no dia da prova.
                    </h1>
                    <p className="text-lg text-muted-foreground">
                        Mais de 60 mil questões com comentários, cadernos de erros, revisão e estatísticas
                        em uma plataforma só, por menos de 50 centavos por dia.
                    </p>
                    <ul className="grid gap-2 text-sm sm:grid-cols-2">
                        {["Questões filtradas por cargo e banca", "Comentário em todas as questões", "Caderno de erros automático", "Cancele quando quiser"].map((t) => (
                            <li key={t} className="flex items-center gap-2">
                                <CheckCircle2 className="h-5 w-5 text-primary" aria-hidden />
                                {t}
                            </li>
                        ))}
                    </ul>
                </div>

                <div id="assinar" className="rounded-3xl border border-border bg-card p-6 shadow-xl sm:p-8">
                    <div className="mb-5">
                        <div className="text-sm font-semibold text-muted-foreground">Assinatura mensal</div>
                        <div className="flex items-end gap-1">
                            <span className="text-4xl font-extrabold">{PRECO}</span>
                            <span className="pb-1 text-muted-foreground">/mês</span>
                        </div>
                        <div className="mt-1 text-sm text-muted-foreground">Acesso completo à plataforma.</div>
                    </div>
                    <FormularioAssinatura preco={PRECO} />
                </div>
            </section>

            {/* Recursos */}
            <section className="border-y border-border bg-muted/40">
                <div className="mx-auto w-full max-w-6xl px-5 py-16">
                    <h2 className="mb-10 text-center text-3xl font-extrabold">Tudo o que você precisa para estudar</h2>
                    <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
                        {recursos.map(({ icone: Icone, titulo, texto }) => (
                            <div key={titulo} className="rounded-2xl border border-border bg-card p-5">
                                <Icone className="mb-3 h-7 w-7 text-primary" aria-hidden />
                                <h3 className="mb-1 font-bold">{titulo}</h3>
                                <p className="text-sm text-muted-foreground">{texto}</p>
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            {/* Como funciona */}
            <section className="mx-auto w-full max-w-6xl px-5 py-16">
                <h2 className="mb-10 text-center text-3xl font-extrabold">Como funciona</h2>
                <ol className="grid gap-5 md:grid-cols-3">
                    {[
                        ["Preencha seus dados", "Nome, e-mail e WhatsApp. Leva 20 segundos."],
                        ["Pague com segurança", "Cartão ou Pix automático pela Kiwify. A renovação é automática."],
                        ["Comece a estudar", "Você recebe um e-mail para criar sua senha e já entra com acesso liberado."],
                    ].map(([titulo, texto], i) => (
                        <li key={titulo} className="rounded-2xl border border-border bg-card p-6">
                            <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-full bg-primary font-bold text-primary-foreground">
                                {i + 1}
                            </div>
                            <h3 className="mb-1 font-bold">{titulo}</h3>
                            <p className="text-sm text-muted-foreground">{texto}</p>
                        </li>
                    ))}
                </ol>
            </section>

            {/* Garantia */}
            <section className="mx-auto w-full max-w-4xl px-5 pb-16">
                <div className="flex flex-col items-center gap-3 rounded-3xl border border-primary/30 bg-primary/10 p-8 text-center">
                    <ShieldCheck className="h-10 w-10 text-primary" aria-hidden />
                    <h2 className="text-2xl font-extrabold">7 dias para testar sem risco</h2>
                    <p className="max-w-2xl text-muted-foreground">
                        Assine, use tudo e, se não for para você, peça o reembolso integral em até 7 dias.
                        Depois disso, cancele quando quiser, sem multa.
                    </p>
                    <a href="#assinar" className="mt-2 rounded-xl bg-primary px-6 py-3 font-bold text-primary-foreground">
                        Quero assinar por {PRECO}/mês
                    </a>
                </div>
            </section>

            {/* FAQ */}
            <section className="mx-auto w-full max-w-3xl px-5 pb-20">
                <h2 className="mb-8 text-center text-3xl font-extrabold">Perguntas frequentes</h2>
                <div className="flex flex-col gap-3">
                    {faq.map(({ p, r }) => (
                        <details key={p} className="group rounded-2xl border border-border bg-card p-5">
                            <summary className="cursor-pointer list-none font-semibold">
                                {p}
                            </summary>
                            <p className="mt-3 text-sm text-muted-foreground">{r}</p>
                        </details>
                    ))}
                </div>
            </section>

            <footer className="border-t border-border">
                <div className="mx-auto flex w-full max-w-6xl flex-col items-center justify-between gap-3 px-5 py-8 text-sm text-muted-foreground sm:flex-row">
                    <span>© {new Date().getFullYear()} Vocação Militar</span>
                    <nav className="flex gap-5">
                        <Link href="/termos" className="hover:underline">Termos de Uso</Link>
                        <Link href="/privacidade" className="hover:underline">Privacidade</Link>
                        <Link href="/auth" className="hover:underline">Entrar</Link>
                    </nav>
                </div>
            </footer>
        </div>
    );
}
