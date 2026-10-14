import type { Metadata } from "next";
import { EMAIL_CONTATO, PaginaLegal } from "@/components/publico/PaginaLegal";

// MODELO INICIAL: revise com um advogado e inclua razão social e CNPJ (controlador dos dados).

export const metadata: Metadata = { title: "Política de Privacidade — Vocação Militar" };

export default function PrivacidadePage() {
    return (
        <PaginaLegal titulo="Política de Privacidade" atualizadoEm="15/10/2026">
            <p>
                Esta política explica quais dados a Vocação Militar coleta, para quê e quais são os seus direitos,
                conforme a Lei Geral de Proteção de Dados (Lei nº 13.709/2018).
            </p>

            <h2>1. Dados que coletamos</h2>
            <ul>
                <li>Cadastro: nome, e-mail e, se você informar, telefone e CPF.</li>
                <li>Assinatura: situação do plano, datas e valores informados pela Kiwify. Não recebemos nem guardamos dados de cartão.</li>
                <li>Uso da plataforma: questões respondidas, acertos e erros, cadernos, anotações, comentários e tempo de estudo.</li>
                <li>Dados técnicos mínimos para segurança, como um código derivado do IP para limitar tentativas abusivas.</li>
            </ul>

            <h2>2. Para que usamos</h2>
            <ul>
                <li>Criar e manter sua conta e liberar o acesso da assinatura.</li>
                <li>Gerar suas estatísticas, revisões e recomendações de estudo.</li>
                <li>Atendimento e avisos sobre a sua conta e pagamentos.</li>
                <li>Enviar avisos de concursos e dicas de estudo, somente se você autorizar (você pode cancelar a qualquer momento).</li>
            </ul>

            <h2>3. Com quem compartilhamos</h2>
            <ul>
                <li>Kiwify, para processar pagamentos.</li>
                <li>Fornecedores de infraestrutura (hospedagem, banco de dados e envio de e-mails) e de inteligência artificial usada para gerar comentários das questões. Esses comentários são gerados a partir da questão, sem seus dados pessoais.</li>
                <li>Autoridades, quando exigido por lei.</li>
            </ul>
            <p>Não vendemos seus dados.</p>

            <h2>4. Seus direitos</h2>
            <p>
                Você pode pedir acesso, correção, exclusão dos seus dados, portabilidade e revogar consentimentos pelo
                e-mail {EMAIL_CONTATO}. Alguns dados de pagamento podem ser mantidos pelo prazo exigido em lei.
            </p>

            <h2>5. Por quanto tempo guardamos</h2>
            <p>
                Enquanto a sua conta existir. Após a exclusão, apagamos ou anonimizamos os dados, exceto os que a lei
                exige manter. Cadastros que não chegaram a concluir a compra são apagados em até 12 meses.
            </p>

            <h2>6. Segurança</h2>
            <p>
                Usamos conexão criptografada, controle de acesso por usuário no banco de dados e acesso administrativo
                restrito.
            </p>

            <h2>7. Contato</h2>
            <p>Encarregado de dados e dúvidas: {EMAIL_CONTATO}.</p>
        </PaginaLegal>
    );
}
