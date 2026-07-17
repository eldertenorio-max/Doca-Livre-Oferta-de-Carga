-- OTP de cadastro / troca de senha (mesmo padrão do WMS Pro)
CREATE TABLE IF NOT EXISTS public.portal_email_codigos (
  id BIGSERIAL PRIMARY KEY,
  finalidade TEXT NOT NULL CHECK (finalidade IN ('cadastro', 'senha')),
  email TEXT NOT NULL,
  codigo_hash TEXT NOT NULL,
  expira_em TIMESTAMPTZ NOT NULL,
  usado BOOLEAN NOT NULL DEFAULT FALSE,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_portal_email_codigos_email
  ON public.portal_email_codigos (email, finalidade, criado_em DESC);

ALTER TABLE public.portal_email_codigos ENABLE ROW LEVEL SECURITY;

-- Sem policies públicas: só service role (Edge Function) acessa.
DROP POLICY IF EXISTS "Permitir SELECT em portal_email_codigos" ON public.portal_email_codigos;
DROP POLICY IF EXISTS "Permitir INSERT em portal_email_codigos" ON public.portal_email_codigos;
DROP POLICY IF EXISTS "Permitir UPDATE em portal_email_codigos" ON public.portal_email_codigos;
DROP POLICY IF EXISTS "Permitir DELETE em portal_email_codigos" ON public.portal_email_codigos;
