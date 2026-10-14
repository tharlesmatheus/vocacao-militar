/**
 * Traduz as mensagens do Supabase Auth (vêm em inglês) para o aluno.
 * Mensagens desconhecidas viram um texto genérico em português.
 */
const TRADUCOES: [RegExp, string][] = [
    [/invalid login credentials/i, "E-mail ou senha incorretos."],
    [/email not confirmed/i, "Confirme seu e-mail antes de entrar. Procure a mensagem que enviamos (veja também o spam)."],
    [/user already registered|already been registered/i, "Este e-mail já tem cadastro. Use \"Entrar\" ou \"Esqueci minha senha\"."],
    [/password should be at least|password.*(short|length)/i, "A senha precisa ter pelo menos 8 caracteres."],
    [/weak password|pwned|easy to guess/i, "Essa senha é muito fácil de adivinhar. Escolha outra."],
    [/unable to validate email|invalid email|email address .* is invalid/i, "Informe um e-mail válido."],
    [/rate limit|too many requests|for security purposes, you can only request/i, "Muitas tentativas seguidas. Aguarde alguns minutos e tente de novo."],
    [/same password|different from the old/i, "A nova senha precisa ser diferente da atual."],
    [/session.*(missing|expired)|jwt expired|refresh token/i, "Sua sessão expirou. Entre de novo."],
    [/signups not allowed|signup is disabled/i, "Novos cadastros estão temporariamente desativados."],
    [/failed to fetch|network/i, "Sem conexão com o servidor. Verifique sua internet e tente de novo."],
];

export function erroAuth(mensagem?: string | null): string {
    const m = String(mensagem ?? "");
    for (const [padrao, texto] of TRADUCOES) if (padrao.test(m)) return texto;
    return "Não foi possível concluir agora. Tente de novo em instantes.";
}
