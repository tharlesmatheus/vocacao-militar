-- =====================================================================
-- Leads da página pública (/assinar)
--
-- Quem preenche o formulário vira um lead. O id do lead vai para o checkout
-- da Kiwify no parâmetro sck e volta no webhook (TrackingParameters.sck),
-- ligando a compra ao cadastro mesmo que o e-mail do checkout seja outro.
--
-- Só o servidor (service role) lê e grava: nenhuma política para o navegador.
-- Pode ser executado mais de uma vez.
-- =====================================================================
begin;

create table if not exists public.leads (
  id               uuid primary key default gen_random_uuid(),
  nome             text not null check (length(btrim(nome)) between 2 and 120),
  email            text not null check (length(email) <= 200 and email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  telefone         text check (telefone is null or telefone ~ '^\d{10,13}$'),
  aceite_termos_em timestamptz not null,
  aceite_contato   boolean not null default false,       -- autorizou receber mensagens (LGPD)
  status           text not null default 'checkout'
                   check (status in ('checkout', 'convertido')),
  user_id          uuid references auth.users(id) on delete set null,
  utm              jsonb not null default '{}'::jsonb,
  ip_hash          text,                                  -- hash do IP, só para limitar abusos
  convertido_em    timestamptz,
  created_at       timestamptz not null default now()
);

create index if not exists idx_leads_email   on public.leads (lower(email));
create index if not exists idx_leads_ip_data on public.leads (ip_hash, created_at);
create index if not exists idx_leads_status  on public.leads (status, created_at);

alter table public.leads enable row level security;
revoke all on public.leads from anon, authenticated;

commit;

-- Conferência:
-- select status, count(*) from public.leads group by status;
