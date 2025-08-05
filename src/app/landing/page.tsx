export default function LandingPage() {
    return (
        <div className="min-h-screen bg-gradient-to-br from-[#10192a] to-[#1e2746] flex flex-col">
            {/* Header */}
            <header className="flex items-center justify-between px-8 py-6">
                <div className="flex items-center gap-2">
                    <span className="bg-blue-600 text-white rounded-full px-3 py-2 font-bold text-xl shadow-xl">VM</span>
                    <span className="text-2xl font-bold text-white drop-shadow">Vocação Militar</span>
                </div>
                <a
                    href="/login"
                    className="text-blue-400 font-semibold hover:underline transition"
                >
                    Já sou aluno
                </a>
            </header>

            {/* HERO */}
            <section className="flex flex-col-reverse md:flex-row items-center justify-between flex-1 gap-12 px-8 py-12 max-w-6xl mx-auto">
                <div className="flex-1 flex flex-col gap-7 max-w-xl">
                    <h1 className="text-5xl md:text-6xl font-extrabold text-white leading-tight drop-shadow-xl">
                        Passe nos concursos militares <br />
                        <span className="text-blue-400">estudando de forma inteligente</span>
                    </h1>
                    <p className="text-xl text-gray-300 mt-2 drop-shadow">
                        Plataforma online com questões comentadas, estatísticas, cronograma semanal, conquistas e tudo que você precisa para conquistar sua vaga nas forças armadas!
                    </p>
                    <ul className="mt-4 flex flex-col gap-2 text-blue-200 text-lg">
                        <li className="flex items-center gap-2">
                            <span className="text-blue-400">✔</span> Banco de questões atualizado
                        </li>
                        <li className="flex items-center gap-2">
                            <span className="text-blue-400">✔</span> Simulados e estatísticas de desempenho
                        </li>
                        <li className="flex items-center gap-2">
                            <span className="text-blue-400">✔</span> Cronograma de estudos inteligente
                        </li>
                        <li className="flex items-center gap-2">
                            <span className="text-blue-400">✔</span> Suporte de professores militares
                        </li>
                    </ul>
                    <div className="mt-8 flex gap-4">
                        <a
                            href="/login?cadastro=1"
                            className="bg-blue-500 hover:bg-blue-700 text-white font-extrabold text-xl px-8 py-4 rounded-full shadow-lg transition"
                        >
                            Começar Agora
                        </a>
                        <a
                            href="#planos"
                            className="bg-white/10 hover:bg-blue-900 text-blue-200 font-bold px-8 py-4 rounded-full border border-blue-600 transition"
                        >
                            Ver Planos
                        </a>
                    </div>
                </div>
                <div className="flex-1 flex justify-center items-center">
                    <img
                        src="/screenshots/plataforma.png"
                        alt="Plataforma Vocação Militar"
                        className="rounded-3xl shadow-2xl border-4 border-blue-800 w-full max-w-[450px] animate-fade-in"
                        style={{ minHeight: 350, background: '#191e2b' }}
                    />
                </div>
            </section>

            {/* DEPOIMENTOS */}
            <section className="bg-[#13182a] py-16">
                <div className="max-w-4xl mx-auto px-6 text-center">
                    <h2 className="text-3xl font-bold text-white mb-8">Quem já usou recomenda!</h2>
                    <div className="flex flex-col md:flex-row gap-8 justify-center">
                        <div className="bg-[#212947] p-8 rounded-2xl shadow-lg flex-1 text-white">
                            <p className="italic">"A plataforma me ajudou a manter o foco e entender onde eu estava errando. Fui aprovado graças ao cronograma personalizado!"</p>
                            <span className="block mt-3 text-blue-300 font-semibold">— João, aprovado na ESA</span>
                        </div>
                        <div className="bg-[#212947] p-8 rounded-2xl shadow-lg flex-1 text-white">
                            <p className="italic">"Melhor custo-benefício! Muito conteúdo, questões atualizadas e suporte rápido."</p>
                            <span className="block mt-3 text-blue-300 font-semibold">— Larissa, aprovada na EEAR</span>
                        </div>
                    </div>
                </div>
            </section>

            {/* PLANOS */}
            <section id="planos" className="bg-[#19213a] py-16">
                <div className="max-w-4xl mx-auto px-6 text-center">
                    <h2 className="text-3xl font-bold text-white mb-6">Planos para começar hoje mesmo</h2>
                    <div className="flex flex-col md:flex-row items-center justify-center gap-8">
                        <div className="bg-[#1e2746] p-10 rounded-2xl shadow-lg border border-blue-700 flex-1">
                            <h3 className="text-xl font-semibold text-blue-300 mb-2">Plano Premium</h3>
                            <div className="text-4xl font-bold text-white mb-3">R$ 7,00 <span className="text-lg text-gray-300">/mês</span></div>
                            <ul className="text-gray-200 mb-4 flex flex-col gap-2 text-lg">
                                <li>✅ Acesso a todas as questões</li>
                                <li>✅ Simulados ilimitados</li>
                                <li>✅ Cronograma personalizado</li>
                                <li>✅ Suporte prioritário</li>
                            </ul>
                            <a
                                href="/login?cadastro=1"
                                className="bg-blue-500 hover:bg-blue-700 text-white font-bold px-8 py-3 rounded-full text-xl shadow-md transition"
                            >
                                Assinar Agora
                            </a>
                        </div>
                    </div>
                    <div className="mt-8 text-gray-400 text-sm">
                        <span>Pagamento seguro via Kiwify. Cancelamento fácil, sem burocracia.</span>
                    </div>
                </div>
            </section>

            {/* FAQ */}
            <section className="bg-[#151b2c] py-16">
                <div className="max-w-4xl mx-auto px-6">
                    <h2 className="text-3xl font-bold text-white mb-8 text-center">Dúvidas Frequentes</h2>
                    <div className="flex flex-col gap-6 text-lg text-blue-100">
                        <div>
                            <span className="font-bold">Tem período de teste?</span><br />
                            Sim! Você pode experimentar a plataforma por 7 dias sem compromisso.
                        </div>
                        <div>
                            <span className="font-bold">Posso cancelar quando quiser?</span><br />
                            Sim, cancelamento é simples e sem burocracia direto pelo painel do comprador.
                        </div>
                        <div>
                            <span className="font-bold">O acesso é imediato?</span><br />
                            Sim, após o pagamento o acesso premium é liberado automaticamente.
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
