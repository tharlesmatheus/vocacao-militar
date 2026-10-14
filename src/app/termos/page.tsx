import type { Metadata } from "next";
import { EMAIL_CONTATO, PaginaLegal } from "@/components/publico/PaginaLegal";

// MODELO INICIAL: revise com um advogado e inclua razão social e CNPJ antes de vender.

export const metadata: Metadata = { title: "Termos de Uso — Vocação Militar" };

export default function TermosPage() {
    return (
        <PaginaLegal titulo="Termos de Uso" atualizadoEm="15/10/2026">
            <p>
                Estes Termos regulam o uso da plataforma Vocação Militar. Ao criar uma conta ou assinar, você concorda com eles.
            </p>

            <h2>1. O serviço</h2>
            <p>
                A Vocação Militar oferece, por assinatura, acesso a um banco de questões de concursos, comentários,
                cadernos, revisão, estatísticas e ferramentas de organização de estudo. O conteúdo tem finalidade
                educacional e não garante aprovação em concurso.
            </p>

            <h2>2. Conta</h2>
            <ul>
                <li>A conta é pessoal e intransferível. Não compartilhe sua senha.</li>
                <li>Você é responsável pelas informações que cadastra e pelos comentários que publica.</li>
                <li>Podemos suspender contas que compartilhem acesso, copiem o conteúdo em massa ou publiquem conteúdo ofensivo.</li>
            </ul>

            <h2>3. Assinatura, renovação e cancelamento</h2>
            <ul>
                <li>A assinatura é mensal e renovada automaticamente no cartão ou no Pix automático, pela Kiwify.</li>
                <li>Você pode cancelar a qualquer momento, sem multa, pela Kiwify. O acesso continua até o fim do período já pago.</li>
                <li>
                    Em até 7 dias após a compra, você pode desistir e receber o reembolso integral (art. 49 do Código de
                    Defesa do Consumidor).
                </li>
                <li>Reembolsos e contestações de pagamento encerram o acesso imediatamente.</li>
                <li>Mudanças de preço serão avisadas com antecedência e valem a partir da renovação seguinte.</li>
            </ul>

            <h2>4. Conteúdo</h2>
            <p>
                Questões de provas são reproduzidas para fins de estudo. Gabaritos e comentários podem conter erros;
                use o botão de reportar erro para nos avisar. Comentários de alunos são de responsabilidade de quem os
                publica e podem ser removidos se violarem estes Termos.
            </p>

            <h2>5. Disponibilidade</h2>
            <p>
                Trabalhamos para manter a plataforma no ar, mas podem ocorrer interrupções para manutenção ou por
                falhas de terceiros.
            </p>

            <h2>6. Contato</h2>
            <p>Dúvidas e solicitações: {EMAIL_CONTATO}.</p>
        </PaginaLegal>
    );
}
