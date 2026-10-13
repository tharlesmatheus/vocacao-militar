-- =====================================================================
-- Administrador: mover a marca de admin para app_metadata
--
-- Antes, o app considerava admin quem tinha user_metadata.is_admin = true.
-- O user_metadata pode ser alterado pelo próprio usuário no navegador, então
-- qualquer aluno conseguiria se tornar administrador. O app_metadata só pode
-- ser alterado pelo servidor (service role) ou por aqui, pelo SQL Editor.
--
-- PASSO A: veja quem tem a marca hoje (confira se todos são legítimos).
-- =====================================================================
select id, email, created_at
from auth.users
where raw_user_meta_data ->> 'is_admin' = 'true'
order by created_at;

-- =====================================================================
-- PASSO B: troque o e-mail abaixo pelo(s) do(s) administrador(es) de verdade
-- e rode só este bloco. Depois, saia e entre de novo no /admin para o token
-- ser renovado.
-- =====================================================================
-- update auth.users
--    set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb) || '{"is_admin": true}'::jsonb
--  where email in ('SEU_EMAIL_DE_ADMIN@exemplo.com');
--
-- Conferência:
-- select email, raw_app_meta_data ->> 'is_admin' as admin from auth.users where raw_app_meta_data ->> 'is_admin' = 'true';
