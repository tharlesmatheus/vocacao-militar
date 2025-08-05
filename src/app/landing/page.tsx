// app/landing/page.tsx

export default function LandingPage() {
    return (
        <div className="min-h-screen bg-gradient-to-br from-gray-900 to-gray-800 flex flex-col">
            {/* Header */}
            <header className="flex items-center justify-between px-8 py-6 bg-black/50">
                <div className="flex items-center gap-2">
                    <span className="bg-blue-600 text-white rounded-full px-3 py-2 font-bold text-xl">VM</span>
                    <span className="text-2xl font-bold text-white">Vocação Militar</span>
                </div>
                <a
                    href="/login"
                    className="text-blue-400 font-semibold hover:underline transition"
                >
                    Já sou aluno
                </a>
            </header>

            {/* Hero Section */}
            <section className="flex flex-col md:flex-row items-center justify-center flex-1 gap-16 px-8 py-12">
                <div className="flex-1 flex flex-col gap-6 max-w-xl">
                    <h1 className="text-4xl md:text-5xl font-extrabold text-white leading-tight">
                        Passe nos concursos militares <span className="text-blue-400">estudando de forma inteligente</span>
                    </h1>
                    <p className="text-lg text-gray-300">
                        Plataforma online com questões comentadas, estatísticas, cronograma semanal, conquistas e tudo que você precisa para conquistar sua vaga nas forças armadas!
                    </p>
                    <ul className="mt-2 flex flex-col gap-2 text-gray-200">
                        <li>✔️ Banco de questões atualizado</li>
                        <li>✔️ Simulados e estatísticas de desempenho</li>
                        <li>✔️ Cronograma de estudos inteligente</li>
                        <li>✔️ Acesso 100% online, 24h</li>
                        <li>✔️ Suporte de professores militares</li>
                    </ul>
                    <div className="mt-6 flex gap-4">
                        <a
                            href="/login?cadastro=1"
                            className="bg-blue-500 hover:bg-blue-600 text-white font-bold px-6 py-3 rounded-2xl shadow-lg transition"
                        >
                            Começar Agora
                        </a>
                        <a
                            href="#planos"
                            className="bg-white/10 hover:bg-white/20 text-blue-200 font-bold px-6 py-3 rounded-2xl border border-blue-600 transition"
                        >
                            Ver Planos
                        </a>
                    </div>
                </div>
                <div className="hidden md:block flex-1">
                    <img
                        src="/screenshots/plataforma.png"
                        alt="Plataforma Vocação Militar"
                        className="rounded-2xl shadow-2xl border-4 border-blue-800"
                    />
                </div>
            </section>

            {/* Planos */}
            <section id="planos" className="bg-gray-900 py-16">
                <div className="max-w-4xl mx-auto px-6 text-center">
                    <h2 className="text-3xl font-bold text-white mb-6">Planos acessíveis para você começar hoje</h2>
                    <div className="flex flex-col md:flex-row items-center justify-center gap-8">
                        <div className="bg-gray-800 p-8 rounded-2xl shadow-lg border border-blue-600 flex-1">
                            <h3 className="text-xl font-semibold text-blue-300 mb-2">Plano Premium</h3>
                            <div className="text-3xl font-bold text-white mb-3">R$ 7,00 <span className="text-base text-gray-300">/mês</span></div>
                            <ul className="text-gray-200 mb-4 flex flex-col gap-2">
                                <li>✅ Acesso a todas as questões</li>
                                <li>✅ Simulados ilimitados</li>
                                <li>✅ Cronograma personalizado</li>
                                <li>✅ Suporte prioritário</li>
                            </ul>
                            <a
                                href="/login?cadastro=1"
                                className="bg-blue-500 hover:bg-blue-600 text-white font-bold px-6 py-2 rounded-lg transition"
                            >
                                Assinar Agora
                            </a>
                        </div>
                    </div>
                    <div className="mt-6 text-gray-400 text-sm">
                        <span>Pagamento seguro via Kiwify. Cancelamento fácil, sem burocracia.</span>
                    </div>
                </div>
            </section>

            {/* Depoimentos */}
            <section className="bg-black py-16">
                <div className="max-w-4xl mx-auto px-6 text-center">
                    <h2 className="text-3xl font-bold text-white mb-6">Quem já usou recomenda!</h2>
                    <div className="flex flex-col md:flex-row gap-8 justify-center">
                        <div className="bg-gray-800 p-6 rounded-2xl shadow-lg flex-1">
                            <p className="text-gray-100 italic">"A plataforma me ajudou a manter o foco e entender onde eu estava errando. Fui aprovado graças ao cronograma personalizado!"</p>
                            <span className="block mt-3 text-blue-200 font-semibold">— João, aprovado na ESA</span>
                        </div>
                        <div className="bg-gray-800 p-6 rounded-2xl shadow-lg flex-1">
                            <p className="text-gray-100 italic">"Melhor custo-benefício! Muito conteúdo, questões atualizadas e suporte rápido."</p>
                            <span className="block mt-3 text-blue-200 font-semibold">— Larissa, aprovada na EEAR</span>
                        </div>
                    </div>
                </div>
            </section>

            {/* Footer */}
            <footer className="bg-black py-8 text-center text-gray-500 text-sm">
                &copy; {new Date().getFullYear()} Vocação Militar. Todos os direitos reservados.
            </footer>
        </div>
    );
}
