/**
 * OTP da calculadora pública: criar conta e esqueci a senha (código de 6 dígitos).
 * Conta marcada origem=rota_publico — não entra no sistema Oferta de Carga.
 *
 * Deploy:
 *   supabase functions deploy rota-publico-otp --project-ref imnlbbfgaztfhwndfxwb
 *
 * Secrets: RESEND_API_KEY / RESEND_FROM / PORTAL_OTP_SECRET (os mesmos do portal-otp)
 */

import { createClient } from 'npm:@supabase/supabase-js@2'

const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const OTP_TTL_SEC = 15 * 60
const OTP_RESEND_COOLDOWN_SEC = 60
const OTP_LEN = 6
const ORIGEM = 'rota_publico'

function json(obj: unknown, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { ...corsHeaders, 'content-type': 'application/json' },
  })
}

function fail(erro: string, status = 200) {
  return json({ ok: false, erro }, status)
}

function otpSecret() {
  return (
    Deno.env.get('PORTAL_OTP_SECRET')?.trim() ||
    Deno.env.get('SSO_SECRET')?.trim() ||
    'doca-livre-oferta-otp-dev'
  )
}

function normalizeEmail(raw: string) {
  return (raw || '').trim().toLowerCase()
}

function emailValido(email: string) {
  return Boolean(email) && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) && email.length <= 254
}

function maskEmail(email: string) {
  const [name, domain] = email.split('@')
  if (!name || !domain) return email
  return `${name.slice(0, 2)}***@${domain}`
}

function gerarCodigo() {
  return String(Math.floor(Math.random() * 1_000_000)).padStart(OTP_LEN, '0')
}

async function sha256Hex(text: string) {
  const data = new TextEncoder().encode(text)
  const hash = await crypto.subtle.digest('SHA-256', data)
  return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

async function hashCodigo(codigo: string) {
  return sha256Hex(`${otpSecret()}:rota:${codigo.trim()}`)
}

function admin() {
  const url = Deno.env.get('SUPABASE_URL')?.trim()
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')?.trim()
  if (!url || !key) throw new Error('Função sem SUPABASE_URL ou SERVICE_ROLE_KEY')
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
}

type AuthInfo = {
  existe: boolean
  id?: string
  origem?: string
  role?: string
  providers?: string[]
}

function soCalculadora(info: AuthInfo) {
  const role = String(info.role || '')
  if (role === 'transportador' || role === 'minerva' || role === 'super') return false
  if (String(info.origem || '') === ORIGEM) return true
  const providers = Array.isArray(info.providers) ? info.providers : []
  return providers.includes('email') && !providers.includes('google') && !role
}

function soGoogle(info: AuthInfo) {
  const providers = Array.isArray(info.providers) ? info.providers : []
  return providers.includes('google') && !providers.includes('email') && String(info.origem || '') !== ORIGEM
}

async function authPorEmail(sb: ReturnType<typeof admin>, email: string): Promise<AuthInfo> {
  const { data, error } = await sb.rpc('rota_publico_auth_por_email', { p_email: email })
  const parsed = (data ?? {}) as AuthInfo & { ok?: boolean; providers?: unknown }
  if (error || parsed.ok === false) return { existe: false }
  const providers = Array.isArray(parsed.providers)
    ? parsed.providers.filter((p): p is string => typeof p === 'string')
    : []
  return {
    existe: Boolean(parsed.existe),
    id: parsed.id,
    origem: parsed.origem,
    role: parsed.role,
    providers,
  }
}

async function enviarResend(email: string, codigo: string, finalidade: 'rota_cadastro' | 'rota_senha') {
  const apiKey = Deno.env.get('RESEND_API_KEY')?.trim()
  if (!apiKey) return { ok: false as const, motivo: 'smtp_nao_configurado' }
  const from =
    Deno.env.get('RESEND_FROM')?.trim() || 'Doca Livre Oferta de Carga <onboarding@resend.dev>'
  const cadastro = finalidade === 'rota_cadastro'
  const assunto = cadastro
    ? 'Código para criar sua conta na calculadora — Doca Livre'
    : 'Código para nova senha na calculadora — Doca Livre'
  const acao = cadastro
    ? 'confirmar seu e-mail e criar a conta na calculadora'
    : 'confirmar e criar uma senha nova na calculadora'
  const texto =
    `Seu código Doca Livre Oferta de Carga é: ${codigo}\n\n` +
    `Use este código para ${acao}.\n` +
    `Ele vale por ${OTP_TTL_SEC / 60} minutos.\n\n` +
    'Esta conta é só do site aberto (calculadora e mapa). Não abre o sistema Oferta de Carga.\n' +
    'Se você não pediu, ignore este e-mail.'
  const html =
    `<div style="font-family:Arial,Helvetica,sans-serif;background:#f8fafc;padding:24px 12px">` +
    `<div style="max-width:480px;margin:0 auto;background:#fff;border-radius:16px;padding:24px;border:1px solid #e2e8f0">` +
    `<p style="margin:0 0 4px;font-size:12px;font-weight:800;letter-spacing:.08em;color:#16a34a">DOCA LIVRE · CALCULADORA</p>` +
    `<p style="margin:0 0 16px;font-size:15px;color:#334155">Use este código para ${acao}:</p>` +
    `<p style="margin:0 0 16px;font-size:32px;font-weight:800;letter-spacing:8px;color:#0f172a">${codigo}</p>` +
    `<p style="margin:0 0 8px;color:#64748b;font-size:13px">Vale por ${OTP_TTL_SEC / 60} minutos.</p>` +
    `<p style="margin:0;color:#94a3b8;font-size:12px">Conta só do site aberto. Não abre o sistema Oferta de Carga.</p>` +
    `</div></div>`
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from, to: [email], subject: assunto, text: texto, html }),
  })
  if (r.status === 200 || r.status === 201) return { ok: true as const, motivo: '' }
  const body = (await r.text().catch(() => '')).slice(0, 240)
  return { ok: false as const, motivo: `resend_http_${r.status}: ${body}` }
}

async function cooldownOk(
  sb: ReturnType<typeof admin>,
  email: string,
  finalidade: string,
) {
  const { data } = await sb
    .from('portal_email_codigos')
    .select('criado_em')
    .eq('email', email)
    .eq('finalidade', finalidade)
    .order('criado_em', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (!data?.criado_em) return true
  return Date.now() - new Date(data.criado_em).getTime() >= OTP_RESEND_COOLDOWN_SEC * 1000
}

async function salvarCodigo(
  sb: ReturnType<typeof admin>,
  finalidade: string,
  email: string,
  codigo: string,
) {
  await sb
    .from('portal_email_codigos')
    .update({ usado: true })
    .eq('email', email)
    .eq('finalidade', finalidade)
    .eq('usado', false)
  const { error } = await sb.from('portal_email_codigos').insert({
    finalidade,
    email,
    codigo_hash: await hashCodigo(codigo),
    expira_em: new Date(Date.now() + OTP_TTL_SEC * 1000).toISOString(),
    usado: false,
  })
  if (error) throw new Error(error.message)
}

async function consumirCodigo(
  sb: ReturnType<typeof admin>,
  finalidade: string,
  email: string,
  codigoRaw: string,
) {
  const codigo = (codigoRaw || '').replace(/\D/g, '')
  if (!/^\d{6}$/.test(codigo)) return { ok: false as const, motivo: 'formato' }
  const { data } = await sb
    .from('portal_email_codigos')
    .select('id, codigo_hash, expira_em')
    .eq('email', email)
    .eq('finalidade', finalidade)
    .eq('usado', false)
    .order('criado_em', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (!data) return { ok: false as const, motivo: 'inexistente' }
  if (new Date(data.expira_em).getTime() < Date.now()) return { ok: false as const, motivo: 'expirado' }
  if ((await hashCodigo(codigo)) !== data.codigo_hash) return { ok: false as const, motivo: 'invalido' }
  await sb.from('portal_email_codigos').update({ usado: true }).eq('id', data.id)
  return { ok: true as const, motivo: '' }
}

function msgCodigo(motivo: string) {
  if (motivo === 'formato' || motivo === 'invalido') return 'Código inválido.'
  if (motivo === 'inexistente') return 'Solicite um novo código.'
  if (motivo === 'expirado') return 'Código expirado. Peça outro.'
  return 'Código inválido.'
}

async function enviarCodigo(
  sb: ReturnType<typeof admin>,
  email: string,
  finalidade: 'rota_cadastro' | 'rota_senha',
) {
  if (!(await cooldownOk(sb, email, finalidade))) {
    return fail('Aguarde 1 minuto antes de pedir outro código.')
  }
  const codigo = gerarCodigo()
  const mail = await enviarResend(email, codigo, finalidade)
  if (!mail.ok) {
    if (mail.motivo === 'smtp_nao_configurado') {
      return fail('E-mail ainda não configurado. Falta RESEND_API_KEY no Supabase.')
    }
    return fail('Não foi possível enviar o e-mail com o código.')
  }
  await salvarCodigo(sb, finalidade, email, codigo)
  return json({
    ok: true,
    mensagem: `Enviamos um código de 6 dígitos para ${maskEmail(email)}. Confira a caixa de entrada e o spam.`,
    email,
    email_mascarado: maskEmail(email),
  })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return fail('Use POST', 405)

  let body: Record<string, unknown> = {}
  try {
    body = (await req.json()) as Record<string, unknown>
  } catch {
    return fail('JSON inválido')
  }

  const action = String(body.action || '').trim()
  const sb = admin()
  const email = normalizeEmail(String(body.email || ''))

  try {
    if (action === 'cadastro_enviar') {
      if (!emailValido(email)) return fail('Informe um e-mail válido.')
      const conta = await authPorEmail(sb, email)
      if (conta.existe) {
        if (soGoogle(conta)) return fail('Este e-mail já entra com Google.')
        if (!soCalculadora(conta)) {
          return fail('Este e-mail já tem conta no sistema. Use o login do Oferta de Carga.')
        }
        return fail('Este e-mail já tem conta na calculadora. Entre ou use “Esqueci a senha”.')
      }
      return await enviarCodigo(sb, email, 'rota_cadastro')
    }

    if (action === 'cadastro_confirmar') {
      if (!emailValido(email)) return fail('Informe um e-mail válido.')
      const senha = String(body.senha || body.password || '')
      const nome = String(body.nome || '').trim() || email.split('@')[0] || 'Conta'
      if (senha.length < 6) return fail('A senha precisa ter pelo menos 6 caracteres.')
      const check = await consumirCodigo(sb, 'rota_cadastro', email, String(body.codigo || ''))
      if (!check.ok) return fail(msgCodigo(check.motivo))

      const existente = await authPorEmail(sb, email)
      if (existente.existe) {
        if (!soCalculadora(existente) || !existente.id) {
          return fail('Este e-mail já está em uso.')
        }
        const { error } = await sb.auth.admin.updateUserById(existente.id, {
          password: senha,
          email_confirm: true,
          user_metadata: { origem: ORIGEM, nome, full_name: nome },
        })
        if (error) return fail(error.message || 'Não foi possível gravar a conta.')
        return json({ ok: true, email })
      }

      const { data, error } = await sb.auth.admin.createUser({
        email,
        password: senha,
        email_confirm: true,
        user_metadata: { origem: ORIGEM, nome, full_name: nome },
      })
      if (error || !data.user?.id) {
        return fail(error?.message || 'Não foi possível criar a conta.')
      }
      return json({ ok: true, email })
    }

    if (action === 'senha_enviar') {
      if (!emailValido(email)) return fail('Informe um e-mail válido.')
      const conta = await authPorEmail(sb, email)
      if (!conta.existe) {
        return json({
          ok: true,
          mensagem: `Se ${maskEmail(email)} tiver conta na calculadora, o código foi enviado.`,
          email,
          email_mascarado: maskEmail(email),
        })
      }
      if (soGoogle(conta) && !soCalculadora(conta)) {
        return fail('Esta conta entra com Google. Não precisa de senha.')
      }
      if (!soCalculadora(conta)) {
        return fail('Esta conta é do sistema Oferta de Carga. Troque a senha no login do sistema.')
      }
      return await enviarCodigo(sb, email, 'rota_senha')
    }

    if (action === 'senha_confirmar') {
      if (!emailValido(email)) return fail('Informe um e-mail válido.')
      const senha = String(body.senha || body.password || '')
      if (senha.length < 6) return fail('A senha precisa ter pelo menos 6 caracteres.')
      const check = await consumirCodigo(sb, 'rota_senha', email, String(body.codigo || ''))
      if (!check.ok) return fail(msgCodigo(check.motivo))
      const conta = await authPorEmail(sb, email)
      if (!conta.existe || !conta.id || !soCalculadora(conta)) {
        return fail('Não foi possível gravar a senha desta conta.')
      }
      const { error } = await sb.auth.admin.updateUserById(conta.id, {
        password: senha,
        email_confirm: true,
      })
      if (error) return fail(error.message || 'Não foi possível gravar a senha.')
      return json({ ok: true, email })
    }

    return fail('acao_invalida')
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Falha no código.'
    if (/rota_publico_auth_por_email|portal_email_codigos|finalidade/i.test(msg)) {
      return fail('Rode o SQL de códigos da calculadora no Supabase.')
    }
    return fail(msg)
  }
})
