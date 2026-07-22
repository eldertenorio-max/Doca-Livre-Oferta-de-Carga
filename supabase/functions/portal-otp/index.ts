/**
 * Portal OTP — envio de código por e-mail (Resend), no padrão WMS Pro.
 *
 * Deploy:
 *   supabase functions deploy portal-otp --project-ref imnlbbfgaztfhwndfxwb
 *
 * Secrets (Dashboard → Edge Functions → Secrets):
 *   RESEND_API_KEY
 *   RESEND_FROM=Doca Livre Oferta de Carga <onboarding@resend.dev>
 *   PORTAL_OTP_SECRET=<string longa aleatória>
 *   PORTAL_OTP_DEBUG=0   (1 só em homologação)
 *
 * Automáticos: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 */

import { createClient } from 'npm:@supabase/supabase-js@2'

const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const OTP_TTL_SEC = 15 * 60
const OTP_RESEND_COOLDOWN_SEC = 60
const VERIFY_TOKEN_TTL_SEC = 30 * 60
const OTP_LEN = 6

function json(obj: unknown, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { ...corsHeaders, 'content-type': 'application/json' },
  })
}

function otpSecret() {
  return (
    Deno.env.get('PORTAL_OTP_SECRET')?.trim() ||
    Deno.env.get('SSO_SECRET')?.trim() ||
    'doca-livre-oferta-otp-dev'
  )
}

function debugEnabled() {
  const v = (Deno.env.get('PORTAL_OTP_DEBUG') || '').trim().toLowerCase()
  return v === '1' || v === 'true' || v === 'yes'
}

function normalizeEmail(raw: string) {
  return (raw || '').trim().toLowerCase()
}

function emailValido(email: string) {
  return Boolean(email) && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) && email.length <= 254
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
  return sha256Hex(`${otpSecret()}:${codigo.trim()}`)
}

function b64urlEncode(raw: Uint8Array | string) {
  const bytes =
    typeof raw === 'string' ? new TextEncoder().encode(raw) : raw
  let bin = ''
  for (const b of bytes) bin += String.fromCharCode(b)
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}

function b64urlDecode(text: string) {
  const pad = '='.repeat((4 - (text.length % 4)) % 4)
  const b64 = (text + pad).replace(/-/g, '+').replace(/_/g, '/')
  const bin = atob(b64)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

async function hmacSha256(body: string) {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(otpSecret()),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(body))
  return b64urlEncode(new Uint8Array(sig))
}

async function issueVerifyToken(finalidade: string, email: string) {
  const payload = {
    p: finalidade,
    e: normalizeEmail(email),
    exp: Math.floor(Date.now() / 1000) + VERIFY_TOKEN_TTL_SEC,
    jti: crypto.randomUUID().slice(0, 16),
  }
  const body = b64urlEncode(JSON.stringify(payload))
  const sig = await hmacSha256(body)
  return `${body}.${sig}`
}

async function verifyTokenPayload(token: string, finalidade: string) {
  const t = (token || '').trim()
  if (!t.includes('.')) throw new Error('Token inválido.')
  const [body, sig] = t.split(/\.(.+)/).filter(Boolean)
  if (!body || !sig) throw new Error('Token inválido.')
  const expected = await hmacSha256(body)
  if (expected !== sig) throw new Error('Token inválido.')
  const payload = JSON.parse(new TextDecoder().decode(b64urlDecode(body))) as {
    p?: string
    e?: string
    exp?: number
  }
  if (payload.p !== finalidade) throw new Error('Token inválido para esta operação.')
  if ((payload.exp ?? 0) < Math.floor(Date.now() / 1000)) {
    throw new Error('Token expirado. Peça um novo código.')
  }
  const email = normalizeEmail(String(payload.e || ''))
  if (!emailValido(email)) throw new Error('Token inválido.')
  return { email, finalidade }
}

async function enviarResend(email: string, codigo: string, finalidade: string) {
  const apiKey = Deno.env.get('RESEND_API_KEY')?.trim()
  if (!apiKey) {
    return { ok: false as const, motivo: 'smtp_nao_configurado' }
  }
  const from =
    Deno.env.get('RESEND_FROM')?.trim() ||
    'Doca Livre Oferta de Carga <onboarding@resend.dev>'

  const isCadastro = finalidade === 'cadastro'
  const assunto = isCadastro
    ? 'Doca Livre — código de confirmação de e-mail'
    : 'Doca Livre — código para trocar a senha'
  const acao = isCadastro
    ? 'confirmar seu e-mail e concluir o cadastro'
    : 'redefinir sua senha no portal'
  const texto =
    `Seu código Doca Livre Oferta de Carga é: ${codigo}\n\n` +
    `Use este código para ${acao}.\n` +
    `Ele vale por ${OTP_TTL_SEC / 60} minutos.\n\n` +
    'Se você não solicitou, ignore este e-mail.'
  const html =
    `<p>Seu código <strong>Doca Livre Oferta de Carga</strong> é:</p>` +
    `<p style="font-size:28px;font-weight:700;letter-spacing:4px">${codigo}</p>` +
    `<p>Use este código para ${acao}. Vale por ${OTP_TTL_SEC / 60} minutos.</p>` +
    `<p style="color:#64748b;font-size:13px">Se você não solicitou, ignore este e-mail.</p>`

  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from,
      to: [email],
      subject: assunto,
      text: texto,
      html,
    }),
  })
  if (r.status === 200 || r.status === 201) return { ok: true as const, motivo: '' }
  const body = (await r.text().catch(() => '')).slice(0, 240)
  return { ok: false as const, motivo: `resend_http_${r.status}: ${body}` }
}

function msgFalhaEmail(motivo: string) {
  const m = (motivo || '').toLowerCase()
  if (m.includes('smtp_nao_configurado')) {
    return (
      'E-mail ainda não configurado. No Supabase (Edge Functions → Secrets) defina ' +
      'RESEND_API_KEY e RESEND_FROM.'
    )
  }
  return `Não foi possível enviar o e-mail de confirmação. (${motivo})`
}

function adminClient() {
  const url = Deno.env.get('SUPABASE_URL')?.trim()
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')?.trim()
  if (!url || !key) throw new Error('Função sem SUPABASE_URL ou SERVICE_ROLE_KEY')
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
}

async function cooldownOk(
  sb: ReturnType<typeof adminClient>,
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
  const age = Date.now() - new Date(data.criado_em).getTime()
  return age >= OTP_RESEND_COOLDOWN_SEC * 1000
}

async function salvarCodigo(
  sb: ReturnType<typeof adminClient>,
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
  sb: ReturnType<typeof adminClient>,
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
  if (new Date(data.expira_em).getTime() < Date.now()) {
    return { ok: false as const, motivo: 'expirado' }
  }
  const expected = await hashCodigo(codigo)
  if (expected !== data.codigo_hash) return { ok: false as const, motivo: 'invalido' }

  await sb.from('portal_email_codigos').update({ usado: true }).eq('id', data.id)
  return { ok: true as const, motivo: '' }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ ok: false, erro: 'Use POST' }, 405)

  let body: Record<string, unknown>
  try {
    body = (await req.json()) as Record<string, unknown>
  } catch {
    return json({ ok: false, erro: 'JSON inválido' }, 400)
  }

  const action = String(body.action || '')
  let sb: ReturnType<typeof adminClient>
  try {
    sb = adminClient()
  } catch (e) {
    return json({ ok: false, erro: e instanceof Error ? e.message : 'Config inválida' }, 500)
  }

  try {
    if (action === 'cadastro_enviar' || action === 'senha_enviar') {
      const finalidade = action === 'cadastro_enviar' ? 'cadastro' : 'senha'
      const email = normalizeEmail(String(body.email || ''))
      if (!emailValido(email)) return json({ ok: false, erro: 'Informe um e-mail válido.' }, 400)

      if (!(await cooldownOk(sb, email, finalidade))) {
        return json(
          { ok: false, erro: 'Aguarde 1 minuto antes de solicitar outro código.' },
          429,
        )
      }

      const codigo = gerarCodigo()
      const mail = await enviarResend(email, codigo, finalidade)
      if (!mail.ok) {
        if (debugEnabled()) {
          await salvarCodigo(sb, finalidade, email, codigo)
          return json({
            ok: true,
            mensagem: 'Código gerado (modo debug — e-mail não enviado).',
            debug_codigo: codigo,
            smtp_motivo: mail.motivo,
          })
        }
        return json(
          { ok: false, erro: msgFalhaEmail(mail.motivo), smtp_motivo: mail.motivo },
          503,
        )
      }

      await salvarCodigo(sb, finalidade, email, codigo)
      const [name, domain] = email.split('@')
      const mask = `${name.slice(0, 2)}***@${domain}`
      return json({
        ok: true,
        mensagem: 'Código enviado para o e-mail. Verifique a caixa de entrada e o spam.',
        email,
        email_mascarado: mask,
        ...(debugEnabled() ? { debug_codigo: codigo } : {}),
      })
    }

    if (action === 'cadastro_verificar' || action === 'senha_verificar') {
      const finalidade = action === 'cadastro_verificar' ? 'cadastro' : 'senha'
      const email = normalizeEmail(String(body.email || ''))
      const codigo = String(body.codigo || '')
      if (!emailValido(email)) return json({ ok: false, erro: 'E-mail inválido.' }, 400)

      const check = await consumirCodigo(sb, finalidade, email, codigo)
      if (!check.ok) {
        const map: Record<string, string> = {
          formato: 'Código inválido.',
          inexistente: 'Solicite um novo código.',
          expirado: 'Código expirado. Solicite outro.',
          invalido: 'Código inválido.',
        }
        return json({ ok: false, erro: map[check.motivo] || 'Código inválido.' }, 400)
      }

      const verify_token = await issueVerifyToken(finalidade, email)
      return json({
        ok: true,
        verify_token,
        email,
        mensagem:
          finalidade === 'cadastro'
            ? 'E-mail confirmado. Defina usuário e senha.'
            : 'Código confirmado. Defina a nova senha.',
      })
    }

    if (action === 'validar_token') {
      const finalidade = String(body.finalidade || 'cadastro')
      const token = String(body.verify_token || body.verifyToken || '')
      const payload = await verifyTokenPayload(token, finalidade)
      return json({ ok: true, email: payload.email })
    }

    /**
     * Cria usuário Auth já confirmado (sem e-mail do Supabase).
     * Usado no “Enviar cadastro” após OTP — evita rate limit do signUp.
     */
    if (action === 'criar_usuario_auth') {
      const token = String(body.verify_token || body.verifyToken || '')
      const password = String(body.password || body.senha || '')
      const usuario = String(body.usuario || '').trim()
      const nome = String(body.nome || '').trim()
      if (password.length < 4) {
        return json({ ok: false, erro: 'Senha deve ter ao menos 4 caracteres.' }, 400)
      }
      if (usuario.length < 2) {
        return json({ ok: false, erro: 'Usuário inválido.' }, 400)
      }

      let email: string
      try {
        const payload = await verifyTokenPayload(token, 'cadastro')
        email = payload.email
      } catch (e) {
        return json(
          {
            ok: false,
            erro: e instanceof Error ? e.message : 'Confirme o e-mail novamente.',
          },
          400,
        )
      }

      const { data: created, error: createErr } = await sb.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: {
          nome: nome || usuario,
          usuario,
          role: 'transportador',
        },
      })

      if (!createErr && created.user?.id) {
        return json({ ok: true, user_id: created.user.id, email })
      }

      const msg = createErr?.message || ''
      if (/already|registered|exists/i.test(msg)) {
        const { data: listed, error: listErr } = await sb.auth.admin.listUsers({
          page: 1,
          perPage: 200,
        })
        if (listErr) {
          return json({ ok: false, erro: listErr.message }, 400)
        }
        const existing = listed.users.find((u) => (u.email || '').toLowerCase() === email)
        if (!existing?.id) {
          return json(
            { ok: false, erro: 'Este e-mail já possui conta. Use outro e-mail ou faça login.' },
            400,
          )
        }
        await sb.auth.admin.updateUserById(existing.id, {
          password,
          email_confirm: true,
          user_metadata: {
            nome: nome || usuario,
            usuario,
            role: 'transportador',
          },
        })
        return json({ ok: true, user_id: existing.id, email, reused: true })
      }

      return json({ ok: false, erro: msg || 'Falha ao criar usuário.' }, 400)
    }

    return json({ ok: false, erro: `Ação desconhecida: ${action}` }, 400)
  } catch (e) {
    return json(
      { ok: false, erro: e instanceof Error ? e.message : 'Erro interno' },
      500,
    )
  }
})
