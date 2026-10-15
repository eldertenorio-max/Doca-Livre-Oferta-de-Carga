/**
 * Presente de créditos da calculadora pública — só Super, só por e-mail.
 *
 * Deploy:
 *   supabase functions deploy rota-presente --project-ref imnlbbfgaztfhwndfxwb
 *
 * Secrets: RESEND_API_KEY / RESEND_FROM (os mesmos do asaas-pix)
 */

import { createClient } from 'npm:@supabase/supabase-js@2'

const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const SUPER_EMAILS = new Set([
  'diego@docalivre.com',
  'elder@docalivre.com',
  'elder.tenorio@docalivre.com.br',
  'wenderson@docalivre.com',
])

const SUPER_LOGINS = new Set([
  'diego',
  'elder',
  'wenderson',
  'diego.isidoro',
  'diegoisidoro',
  'diego isidoro',
  'elder.tenorio',
  'eldertenorio',
  'elder tenorio',
  'wenderson.vinicius',
  'wendersonvinicius',
  'wenderson vinicius',
])

function json(obj: unknown, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { ...corsHeaders, 'content-type': 'application/json' },
  })
}

function fail(erro: string, status = 200) {
  return json({ ok: false, erro }, status)
}

function admin() {
  const url = Deno.env.get('SUPABASE_URL')?.trim()
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')?.trim()
  if (!url || !key) throw new Error('Função sem SUPABASE_URL ou SERVICE_ROLE_KEY')
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
}

function asciiLower(valor: string) {
  return (valor || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
}

function emailValido(email: string) {
  return Boolean(email) && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) && email.length <= 254
}

function escapeHtml(raw: string) {
  return raw
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function urlRota() {
  return 'https://ofertadecarga.com.br/#/rota'
}

function ehDiegoOuElder(email: string, usuario: string) {
  const e = asciiLower(email)
  const u = asciiLower(usuario)
  if (SUPER_EMAILS.has(e) || SUPER_LOGINS.has(u)) return true
  if (e.endsWith('@docalivre.com') || e.endsWith('@docalivre.com.br')) {
    const local = (e.split('@')[0] || '').trim()
    return SUPER_LOGINS.has(local)
  }
  return false
}

async function conferirSuper(adminEmail: string, adminUsuario: string) {
  const email = asciiLower(adminEmail)
  const usuario = asciiLower(adminUsuario)
  if (!email && !usuario) return false

  const dominioDoca =
    email.endsWith('@docalivre.com') || email.endsWith('@docalivre.com.br')
  const conhecido = SUPER_EMAILS.has(email) || SUPER_LOGINS.has(usuario)
  if (!conhecido && !dominioDoca) return false

  const { data, error } = await admin()
    .from('usuarios')
    .select('email, usuario, role, ativo')
    .eq('role', 'super')
    .eq('ativo', true)

  if (error || !Array.isArray(data) || data.length === 0) return conhecido && SUPER_EMAILS.has(email)

  return data.some((u) => {
    const e = asciiLower(String((u as { email?: string }).email || ''))
    const n = asciiLower(String((u as { usuario?: string }).usuario || ''))
    return (email && e === email) || (usuario && n === usuario)
  })
}

async function enviarEmailPresente(opts: {
  email: string
  creditos: number
  contaExiste: boolean
}) {
  const email = opts.email.trim().toLowerCase()
  const apiKey = Deno.env.get('RESEND_API_KEY')?.trim()
  if (!apiKey) return { ok: false as const, motivo: 'smtp_nao_configurado' }
  const from =
    Deno.env.get('RESEND_FROM')?.trim() || 'Doca Livre Oferta de Carga <onboarding@resend.dev>'

  const n = opts.creditos
  const creditosTxt = `${n} crédito${n === 1 ? '' : 's'}`
  const emailSafe = escapeHtml(email)
  const creditosSafe = escapeHtml(creditosTxt)
  const assunto = `Parabéns! Você acabou de ganhar ${creditosTxt}`
  const comoUsar = opts.contaExiste
    ? 'Os créditos já estão na sua conta. Abra o site para ver o aviso.'
    : 'Entre com este mesmo e-mail no site para usar os créditos e ver o aviso.'
  const texto =
    `Parabéns!\n\n` +
    `Você acabou de ganhar ${creditosTxt}.\n\n` +
    `${comoUsar}\n\n` +
    `Calculadora: ${urlRota()}\n` +
    `Mapa da Frota: https://mapadafrota.com.br/\n` +
    `Mapa da Logística: https://mapadalogistica.com.br/\n` +
    `Conta: ${email}\n`
  const html =
    `<div style="font-family:Arial,Helvetica,sans-serif;background:#0f172a;padding:28px 12px">` +
    `<div style="max-width:560px;margin:0 auto;background:#fff;border-radius:20px;overflow:hidden">` +
    `<div style="background:linear-gradient(135deg,#14532d 0%,#166534 42%,#ca8a04 100%);padding:28px 24px 22px;color:#fff">` +
    `<p style="margin:0 0 6px;font-size:12px;font-weight:800;letter-spacing:.12em">DOCA LIVRE · OFERTA DE CARGA</p>` +
    `<h1 style="margin:0;font-size:28px;line-height:1.15">Parabéns!</h1>` +
    `</div>` +
    `<div style="padding:26px 24px 28px">` +
    `<p style="margin:0 0 14px;color:#0f172a;font-size:18px;font-weight:800;line-height:1.35">` +
    `Você acabou de ganhar <span style="color:#15803d">${creditosSafe}</span>.` +
    `</p>` +
    `<p style="margin:0 0 18px;color:#334155;font-size:15px;line-height:1.55">${escapeHtml(comoUsar)}</p>` +
    `<div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:14px;padding:16px 18px;margin:0 0 22px">` +
    `<p style="margin:0 0 4px;font-size:12px;font-weight:800;letter-spacing:.08em;color:#166534">PRESENTE</p>` +
    `<p style="margin:0;font-size:26px;font-weight:800;color:#14532d">+${n}</p>` +
    `<p style="margin:6px 0 0;color:#166534;font-size:14px">Eles já estão na sua conta.</p>` +
    `</div>` +
    `<p style="margin:0 0 18px;color:#64748b;font-size:13px">Conta: <strong style="color:#0f172a">${emailSafe}</strong></p>` +
    `<p style="margin:0"><a href="${urlRota()}" style="display:inline-block;background:#facc15;color:#0f172a;text-decoration:none;font-weight:800;padding:13px 20px;border-radius:12px">Abrir a calculadora</a></p>` +
    `</div></div></div>`

  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ from, to: [email], subject: assunto, text: texto, html }),
  })
  if (r.status === 200 || r.status === 201) return { ok: true as const, motivo: '' }
  const body = (await r.text().catch(() => '')).slice(0, 240)
  return { ok: false as const, motivo: `resend_http_${r.status}: ${body}` }
}

const SITES = new Set(['calculadora', 'frota', 'logistica', 'render'])

function metaUsuario(user: { user_metadata?: Record<string, unknown> }) {
  return user.user_metadata || {}
}

function siteDoUsuario(user: { user_metadata?: Record<string, unknown> }) {
  const site = String(metaUsuario(user).site || '')
  if (site === 'render') return 'calculadora'
  return SITES.has(site) ? site : ''
}

function cpfDoUsuario(user: { user_metadata?: Record<string, unknown> }) {
  const meta = metaUsuario(user)
  return String(meta.cpf || meta.CPF || meta.documento || '').replace(/\D/g, '').slice(0, 11)
}

function nomeDoUsuario(user: { email?: string; user_metadata?: Record<string, unknown> }) {
  const meta = metaUsuario(user)
  return (
    String(meta.nome || meta.full_name || meta.name || user.email || 'Conta').trim() || 'Conta'
  )
}

async function listarAuthUsers(sb: ReturnType<typeof admin>) {
  const users: Array<{
    id: string
    email?: string
    user_metadata?: Record<string, unknown>
  }> = []
  for (let page = 1; page <= 25; page++) {
    const { data, error } = await sb.auth.admin.listUsers({ page, perPage: 200 })
    if (error) throw new Error(error.message)
    const lote = data.users || []
    users.push(...lote)
    if (lote.length < 200) break
  }
  return users
}

async function acaoContas(
  sb: ReturnType<typeof admin>,
  action: string,
  body: Record<string, unknown>,
) {
  if (action === 'listar_contas') {
    const sitePedido = String(body.site || '')
    const todos = sitePedido === 'todos'
    const site = sitePedido === 'render' ? 'calculadora' : sitePedido
    if (!todos && !SITES.has(site)) return fail('Escolha o site.')
    const busca = asciiLower(String(body.busca || ''))
    const buscaCpf = busca.replace(/\D/g, '')

    const [users, saldosRes, portalRes] = await Promise.all([
      listarAuthUsers(sb),
      sb.from('rota_publico_creditos').select('user_id, saldo'),
      sb.from('usuarios').select('email'),
    ])
    if (saldosRes.error) return fail(saldosRes.error.message)
    const saldoPorId = new Map<string, number>()
    for (const row of saldosRes.data || []) {
      saldoPorId.set(String(row.user_id), Number(row.saldo) || 0)
    }
    const emailsPortal = new Set<string>()
    if (!portalRes.error) {
      for (const row of portalRes.data || []) {
        const email = asciiLower(String((row as { email?: string }).email || ''))
        if (email) emailsPortal.add(email)
      }
    }

    const elegiveis = users.filter((u) => {
      const origem = String(metaUsuario(u).origem || '')
      const email = asciiLower(u.email || '')
      const contaPublica =
        origem === 'rota_publico' ||
        saldoPorId.has(u.id) ||
        (Boolean(email) && !emailsPortal.has(email))
      if (!contaPublica) return false
      if (!busca) return true
      const nome = asciiLower(nomeDoUsuario(u))
      const cpf = cpfDoUsuario(u)
      const bateCpf = buscaCpf.length >= 3 && cpf.includes(buscaCpf)
      return email.includes(busca) || nome.includes(busca) || bateCpf
    })
    const semSite = elegiveis.filter((u) => !siteDoUsuario(u)).length
    const contas = elegiveis
      .filter((u) => todos || siteDoUsuario(u) === site)
      .map((u) => ({
        id: u.id,
        email: asciiLower(u.email || ''),
        nome: nomeDoUsuario(u),
        cpf: cpfDoUsuario(u),
        site: siteDoUsuario(u),
        saldo: saldoPorId.get(u.id) || 0,
      }))
      .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
      .slice(0, 500)

    return json({ ok: true, contas, semSite })
  }

  const userId = String(body.userId || '').trim()
  const creditos = Math.floor(Number(body.creditos))
  if (!/^[0-9a-f-]{36}$/i.test(userId)) return fail('Selecione uma pessoa da lista.')
  if (!Number.isFinite(creditos) || creditos < 1 || creditos > 10000) {
    return fail('Informe de 1 a 10.000 créditos.')
  }

  const { data: achado, error: userErr } = await sb.auth.admin.getUserById(userId)
  if (userErr || !achado.user) return fail('Conta não encontrada.')
  const origem = String(achado.user.user_metadata?.origem || '')
  const emailConta = asciiLower(achado.user.email || '')
  const { data: saldoAtual } = await sb
    .from('rota_publico_creditos')
    .select('saldo')
    .eq('user_id', userId)
    .maybeSingle()
  if (origem !== 'rota_publico' && !saldoAtual) {
    const { data: portal } = emailConta
      ? await sb.from('usuarios').select('id').ilike('email', emailConta).maybeSingle()
      : { data: { id: 'sem-email' } }
    if (portal) return fail('Esta conta não é dos sites públicos.')
  }

  const saldoAnterior = saldoAtual ? Number(saldoAtual.saldo) || 0 : null
  const saldo = (saldoAnterior || 0) + creditos
  const agora = new Date().toISOString()
  const { error } = await sb.from('rota_publico_creditos').upsert({
    user_id: userId,
    saldo,
    updated_at: agora,
  })
  if (error) return fail(error.message || 'Não foi possível gravar os créditos.')

  const por = asciiLower(String(body.adminEmail || body.adminUsuario || 'super')) || 'super'
  const { data: aviso, error: avisoErr } = await sb
    .from('rota_publico_presentes')
    .insert({
      email: emailConta,
      creditos,
      criado_por: por,
      aplicado_em: agora,
      user_id: userId,
    })
    .select('id')
    .single()
  if (avisoErr || !aviso?.id) {
    if (saldoAnterior == null) {
      await sb.from('rota_publico_creditos').delete().eq('user_id', userId)
    } else {
      await sb.from('rota_publico_creditos').upsert({
        user_id: userId,
        saldo: saldoAnterior,
        updated_at: agora,
      })
    }
    return fail(avisoErr?.message || 'Não foi possível registrar o aviso de créditos.')
  }

  const mail = emailConta
    ? await enviarEmailPresente({ email: emailConta, creditos, contaExiste: true })
    : { ok: false as const, motivo: 'sem_email' }
  await sb
    .from('rota_publico_presentes')
    .update({
      email_enviado_em: mail.ok ? new Date().toISOString() : null,
      email_erro: mail.ok ? null : mail.motivo,
    })
    .eq('id', aviso.id)

  return json({
    ok: true,
    saldo,
    email: emailConta,
    creditos,
    emailEnviado: mail.ok,
  })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return fail('method_not_allowed', 405)

  let body: Record<string, unknown> = {}
  try {
    body = (await req.json()) as Record<string, unknown>
  } catch {
    return fail('json_invalido')
  }

  const action = String(body.action || '').trim()
  if (action === 'config') {
    return json({ ok: true, resend: Boolean(Deno.env.get('RESEND_API_KEY')?.trim()) })
  }

  const adminEmail = String(body.adminEmail || '')
  const adminUsuario = String(body.adminUsuario || '')
  if (!ehDiegoOuElder(adminEmail, adminUsuario)) return fail('somente_super')
  const superOk = await conferirSuper(adminEmail, adminUsuario)
  if (!superOk) return fail('somente_super')

  const sb = admin()

  if (action === 'listar') {
    const { data, error } = await sb
      .from('rota_publico_presentes')
      .select(
        'id, email, creditos, criado_em, criado_por, aplicado_em, visto_em, email_enviado_em, email_erro',
      )
      .order('criado_em', { ascending: false })
      .limit(20)
    if (error) return fail('Rode o SQL de presentes no Supabase.')
    return json({ ok: true, presentes: data || [] })
  }

  if (action === 'listar_contas' || action === 'dar_creditos') {
    try {
      return await acaoContas(sb, action, body)
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Não foi possível listar as contas.'
      return fail(msg)
    }
  }

  if (action !== 'presentear') return fail('acao_invalida')

  const email = asciiLower(String(body.email || ''))
  const creditos = Math.floor(Number(body.creditos))
  if (!emailValido(email)) return fail('Informe um e-mail válido para enviar o presente.')
  if (!Number.isFinite(creditos) || creditos < 1 || creditos > 500) {
    return fail('Informe de 1 a 500 créditos.')
  }

  const por = asciiLower(adminEmail) || asciiLower(adminUsuario) || 'super'
  const { data, error } = await sb.rpc('rota_publico_presentear', {
    p_email: email,
    p_creditos: creditos,
    p_por: por,
  })
  const parsed = (data ?? {}) as {
    ok?: boolean
    erro?: string
    id?: string
    aplicado?: boolean
    conta_existe?: boolean
    saldo?: number
    creditos?: number
    email?: string
  }
  if (error) {
    const msg = error.message || ''
    if (/rota_publico_presentear|does not exist|schema cache/i.test(msg)) {
      return fail('Rode o SQL de presentes no Supabase.')
    }
    return fail(msg || 'Não foi possível presentear.')
  }
  if (!parsed.ok) {
    if (parsed.erro === 'email_invalido') return fail('Informe um e-mail válido para enviar o presente.')
    if (parsed.erro === 'creditos_invalidos') return fail('Informe de 1 a 500 créditos.')
    if (parsed.erro === 'limite_diario') return fail('Limite diário de presentes atingido. Tente amanhã.')
    return fail('Não foi possível presentear.')
  }

  const mail = await enviarEmailPresente({
    email,
    creditos,
    contaExiste: Boolean(parsed.conta_existe),
  })
  if (parsed.id) {
    await sb
      .from('rota_publico_presentes')
      .update({
        email_enviado_em: mail.ok ? new Date().toISOString() : null,
        email_erro: mail.ok ? null : mail.motivo,
      })
      .eq('id', parsed.id)
  }

  return json({
    ok: true,
    id: parsed.id,
    email,
    creditos,
    aplicado: Boolean(parsed.aplicado),
    contaExiste: Boolean(parsed.conta_existe),
    saldo: Number(parsed.saldo) || 0,
    emailEnviado: mail.ok,
    emailErro: mail.ok ? '' : mail.motivo,
  })
})
