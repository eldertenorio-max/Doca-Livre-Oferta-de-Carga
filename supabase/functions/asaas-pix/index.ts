/**
 * PIX Asaas da calculadora pública: gera QR, confirma pagamento, libera crédito e envia e-mail.
 *
 * Deploy:
 *   supabase functions deploy asaas-pix --project-ref imnlbbfgaztfhwndfxwb
 *
 * Secrets:
 *   ASAAS_API_KEY   (obrigatório)
 *   RESEND_API_KEY / RESEND_FROM
 *   ASAAS_WEBHOOK_TOKEN (opcional; se vazio, a função gera um token estável)
 */

import { createClient } from 'npm:@supabase/supabase-js@2'

const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, asaas-access-token',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const PACOTES: Record<string, { creditos: number; valor: number; titulo: string }> = {
  '50': { creditos: 50, valor: 0.01, titulo: '50 créditos' },
  '100': { creditos: 100, valor: 59.9, titulo: '100 créditos' },
  '200': { creditos: 200, valor: 99.9, titulo: '200 créditos' },
}

const PLANOS: Record<string, { valor: number; titulo: string }> = {
  motorista: { valor: 49, titulo: 'Motorista' },
  start: { valor: 197, titulo: 'Embarcador Start' },
  pro: { valor: 397, titulo: 'Embarcador Pro' },
  empresa: { valor: 890, titulo: 'Empresa' },
}

const PAGO = new Set(['RECEIVED', 'CONFIRMED', 'RECEIVED_IN_CASH'])

type Cobranca = {
  id: string
  user_id: string | null
  asaas_payment_id: string
  asaas_customer_id: string | null
  tipo: 'credito' | 'plano'
  pacote_id: string
  creditos: number
  valor: number
  status: string
  email: string | null
  email_enviado_em: string | null
}

function json(obj: unknown, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { ...corsHeaders, 'content-type': 'application/json' },
  })
}

function admin() {
  const url = Deno.env.get('SUPABASE_URL')?.trim()
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')?.trim()
  if (!url || !key) throw new Error('Função sem SUPABASE_URL ou SERVICE_ROLE_KEY')
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
}

function asaasKey() {
  return (Deno.env.get('ASAAS_API_KEY') || '').trim().replace(/^["']|["']$/g, '')
}

function fail(erro: string) {
  return json({ ok: false, erro })
}

function asaasBase() {
  const envUrl = Deno.env.get('ASAAS_API_URL')?.trim().replace(/\/$/, '')
  if (envUrl) return envUrl.endsWith('/v3') ? envUrl : `${envUrl}/v3`
  const key = asaasKey()
  if (key.includes('aact_hmlg')) return 'https://api-sandbox.asaas.com/v3'
  return 'https://api.asaas.com/v3'
}

function soDigitos(valor: string) {
  return (valor || '').replace(/\D/g, '')
}

function cpfCnpjOk(valor: string) {
  const d = soDigitos(valor)
  if (d.length === 11) {
    if (/^(\d)\1+$/.test(d)) return false
    const nums = d.split('').map(Number)
    const dv = (slice: number[], factor: number) => {
      const soma = slice.reduce((acc, n, i) => acc + n * (factor - i), 0)
      const rest = (soma * 10) % 11
      return rest === 10 ? 0 : rest
    }
    return dv(nums.slice(0, 9), 10) === nums[9] && dv(nums.slice(0, 10), 11) === nums[10]
  }
  if (d.length === 14) {
    if (/^(\d)\1+$/.test(d)) return false
    const nums = d.split('').map(Number)
    const dv = (slice: number[], pesos: number[]) => {
      const soma = slice.reduce((acc, n, i) => acc + n * pesos[i], 0)
      const rest = soma % 11
      return rest < 2 ? 0 : 11 - rest
    }
    const p1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
    const p2 = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
    return dv(nums.slice(0, 12), p1) === nums[12] && dv(nums.slice(0, 13), p2) === nums[13]
  }
  return false
}

function hojeISO() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' })
}

function erroAsaas(body: unknown, http = 0) {
  if (!body || typeof body !== 'object') {
    return http === 401
      ? 'O Asaas recusou a chave de API. Gere outra em Integrações e atualize o secret ASAAS_API_KEY.'
      : 'Falha no Asaas.'
  }
  const o = body as {
    errors?: Array<{ description?: string; code?: string }>
    message?: string
    erro?: string
    raw?: string
  }
  const desc = Array.isArray(o.errors) ? o.errors[0]?.description || o.errors[0]?.code : ''
  const raw = String(desc || o.message || o.erro || o.raw || '').trim()
  const t = raw.toLowerCase()
  if (http === 401 || t.includes('invalid_access_token') || t.includes('chave de api')) {
    return 'O Asaas recusou a chave de API. Gere outra em Integrações e atualize o secret ASAAS_API_KEY.'
  }
  if (
    t.includes('em análise') ||
    t.includes('em analise') ||
    t.includes('não aprovad') ||
    t.includes('nao aprovad') ||
    t.includes('aprovação') ||
    t.includes('aprovacao') ||
    t.includes('onboarding') ||
    t.includes('documentação') ||
    t.includes('documentacao')
  ) {
    return 'A conta Asaas ainda está em análise. Quando estiver aprovada, o QR Code passa a ser gerado.'
  }
  return raw || 'Falha no Asaas.'
}

async function asaasFetch(path: string, init?: RequestInit) {
  const key = asaasKey()
  if (!key) return { ok: false as const, status: 0, body: { erro: 'asaas_nao_configurado' } }
  const method = String(init?.method || 'GET').toUpperCase()
  const headers: Record<string, string> = {
    Accept: 'application/json',
    'User-Agent': 'DocaLivreOfertaDeCarga/1.0 (https://ofertadecarga.com.br)',
    access_token: key,
    Authorization: `Bearer ${key}`,
  }
  if (init?.body) headers['Content-Type'] = 'application/json'
  const r = await fetch(`${asaasBase()}${path}`, {
    method,
    body: init?.body,
    headers,
  })
  const text = await r.text()
  let body: unknown = {}
  try {
    body = text ? JSON.parse(text) : {}
  } catch {
    body = { raw: text.slice(0, 240) }
  }
  if (!r.ok) console.error('asaas', method, path, r.status, text.slice(0, 400))
  return { ok: r.ok, status: r.status, body }
}

type ContaAsaas = {
  commercialInfo?: string
  documentation?: string
  bankAccountInfo?: string
  general?: string
}

async function situacaoContaAsaas(): Promise<
  { ok: true; conta: ContaAsaas } | { ok: false; erro: string; http: number }
> {
  const ping = await asaasFetch('/myAccount/status')
  if (!ping.ok) return { ok: false, erro: erroAsaas(ping.body, ping.status), http: ping.status }
  const st = ping.body as ContaAsaas
  return {
    ok: true,
    conta: {
      commercialInfo: st.commercialInfo,
      documentation: st.documentation,
      bankAccountInfo: st.bankAccountInfo,
      general: st.general,
    },
  }
}

function contaAindaEmAnalise(conta?: ContaAsaas | null) {
  const g = String(conta?.general || '').toUpperCase()
  return g !== '' && g !== 'APPROVED'
}

async function webhookToken() {
  const env = Deno.env.get('ASAAS_WEBHOOK_TOKEN')?.trim() || ''
  if (env.length >= 32) return env
  const seed = `${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''}|doca-asaas-wh`
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(seed))
  return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

function webhookUrl() {
  const base = (Deno.env.get('SUPABASE_URL') || '').replace(/\/$/, '')
  const anon = Deno.env.get('SUPABASE_ANON_KEY') || ''
  if (!base || !anon) return ''
  return `${base}/functions/v1/asaas-pix?apikey=${encodeURIComponent(anon)}`
}

async function garantirWebhook() {
  const url = webhookUrl()
  const token = await webhookToken()
  if (!url || token.length < 32) return
  const lista = await asaasFetch('/webhooks')
  const data = (lista.body as { data?: Array<{ id?: string; url?: string; name?: string }> }).data || []
  if (data.some((w) => (w.url || '').includes('/asaas-pix'))) return
  await asaasFetch('/webhooks', {
    method: 'POST',
    body: JSON.stringify({
      name: 'Doca Livre PIX',
      url,
      email: 'diego@docalivre.com',
      enabled: true,
      interrupted: false,
      apiVersion: 3,
      authToken: token,
      sendType: 'NON_SEQUENTIALLY',
      events: ['PAYMENT_RECEIVED', 'PAYMENT_CONFIRMED'],
    }),
  })
}

async function usuarioDoPedido(req: Request) {
  const auth = req.headers.get('Authorization') || ''
  const token = auth.replace(/^Bearer\s+/i, '').trim()
  if (!token || token === Deno.env.get('SUPABASE_ANON_KEY')) return null
  const sb = admin()
  const { data, error } = await sb.auth.getUser(token)
  if (error || !data.user) return null
  const meta = data.user.user_metadata || {}
  return {
    id: data.user.id,
    email: (data.user.email || '').trim().toLowerCase(),
    nome: String(meta.full_name || meta.name || data.user.email || 'Cliente Doca Livre').trim(),
  }
}

async function clienteAsaas(opts: { nome: string; email: string; cpfCnpj: string; userId?: string }) {
  const doc = soDigitos(opts.cpfCnpj)
  const busca = await asaasFetch(`/customers?cpfCnpj=${encodeURIComponent(doc)}&limit=1`)
  const lista = busca.body as { data?: Array<{ id?: string }> }
  const existente = busca.ok ? lista.data?.[0]?.id : ''
  if (existente) return { ok: true as const, id: existente }

  const criar = await asaasFetch('/customers', {
    method: 'POST',
    body: JSON.stringify({
      name: opts.nome.slice(0, 80) || 'Cliente Doca Livre',
      cpfCnpj: doc,
      email: opts.email || undefined,
      externalReference: opts.userId || opts.email || doc,
      notificationDisabled: true,
    }),
  })
  const id = (criar.body as { id?: string }).id
  if (!criar.ok || !id) return { ok: false as const, erro: erroAsaas(criar.body, criar.status) }
  return { ok: true as const, id }
}

function urlCadastro(planoId: string) {
  return `https://ofertadecargas.docalivre.com.br/#/cadastro-transportador?plano=${encodeURIComponent(planoId)}&pago=1`
}

function urlRota() {
  return 'https://ofertadecarga.com.br/#/rota'
}

function brl(n: number) {
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function escapeHtml(raw: string) {
  return raw
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function linhaExtrato(label: string, valor: string) {
  return (
    `<tr>` +
    `<td style="padding:8px 0;color:#64748b;font-size:13px;border-bottom:1px solid #e2e8f0">${label}</td>` +
    `<td style="padding:8px 0;color:#0f172a;font-size:13px;font-weight:700;text-align:right;border-bottom:1px solid #e2e8f0">${valor}</td>` +
    `</tr>`
  )
}

function envelopeEmail(titulo: string, intro: string, extratoHtml: string, extraHtml: string) {
  return (
    `<div style="font-family:Arial,Helvetica,sans-serif;background:#f8fafc;padding:24px 12px">` +
    `<div style="max-width:560px;margin:0 auto;background:#fff;border:1px solid #e2e8f0;border-radius:16px;padding:28px 24px">` +
    `<p style="margin:0 0 4px;font-size:12px;font-weight:800;letter-spacing:.08em;color:#16a34a">DOCA LIVRE</p>` +
    `<h1 style="margin:0 0 12px;font-size:22px;color:#0f172a">${titulo}</h1>` +
    `<p style="margin:0 0 20px;color:#334155;font-size:15px;line-height:1.5">${intro}</p>` +
    `<p style="margin:0 0 8px;font-size:12px;font-weight:800;color:#64748b;letter-spacing:.06em">EXTRATO DO PAGAMENTO</p>` +
    `<table style="width:100%;border-collapse:collapse;margin:0 0 20px">${extratoHtml}</table>` +
    extraHtml +
    `<p style="margin:24px 0 0;color:#94a3b8;font-size:12px">Se você não reconhece esta compra, fale conosco pelo WhatsApp do site.</p>` +
    `</div></div>`
  )
}

async function enviarEmail(cobranca: Cobranca, saldoAtual?: number) {
  const email = (cobranca.email || '').trim().toLowerCase()
  if (!email) return { ok: false as const, motivo: 'sem_email' }
  const apiKey = Deno.env.get('RESEND_API_KEY')?.trim()
  if (!apiKey) return { ok: false as const, motivo: 'smtp_nao_configurado' }
  const from =
    Deno.env.get('RESEND_FROM')?.trim() || 'Doca Livre Oferta de Carga <onboarding@resend.dev>'

  const valor = brl(Number(cobranca.valor))
  const quando = new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })
  const codigo = cobranca.asaas_payment_id
  const emailSafe = escapeHtml(email)
  const codigoSafe = escapeHtml(codigo)

  let assunto = 'Pagamento confirmado — Doca Livre'
  let texto = ''
  let html = ''

  const extratoBase =
    linhaExtrato('Status', 'Pago com sucesso') +
    linhaExtrato('Data', escapeHtml(quando)) +
    linhaExtrato('Forma', 'PIX') +
    linhaExtrato('Valor', valor) +
    linhaExtrato('Código', codigoSafe) +
    linhaExtrato('Conta', emailSafe)

  if (cobranca.tipo === 'credito') {
    const tituloPacote = PACOTES[cobranca.pacote_id]?.titulo || `${cobranca.creditos} créditos`
    const saldoTxt =
      typeof saldoAtual === 'number' && Number.isFinite(saldoAtual)
        ? String(saldoAtual)
        : '—'
    assunto = `Pagamento confirmado — ${cobranca.creditos} créditos na sua conta`
    texto =
      `Pagamento confirmado.\n\n` +
      `EXTRATO\n` +
      `Status: Pago com sucesso\n` +
      `Data: ${quando}\n` +
      `Forma: PIX\n` +
      `Item: ${tituloPacote}\n` +
      `Valor: ${valor}\n` +
      `Código: ${codigo}\n` +
      `Conta Google: ${email}\n\n` +
      `CRÉDITOS\n` +
      `${cobranca.creditos} créditos foram adicionados à sua conta.\n` +
      `Saldo atual: ${saldoTxt} crédito(s).\n` +
      `Cada crédito vale 1 cálculo: ${urlRota()}\n`
    html = envelopeEmail(
      'Pagamento confirmado',
      `Recebemos o seu PIX. Os créditos já estão na conta Google <strong>${emailSafe}</strong>.`,
      extratoBase + linhaExtrato('Item', escapeHtml(tituloPacote)),
      `<div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:12px;padding:14px 16px">` +
        `<p style="margin:0 0 6px;font-size:12px;font-weight:800;color:#166534;letter-spacing:.06em">CRÉDITOS ADICIONADOS</p>` +
        `<p style="margin:0;font-size:18px;font-weight:800;color:#14532d">+${cobranca.creditos} créditos</p>` +
        `<p style="margin:6px 0 0;color:#166534;font-size:14px">Saldo atual: <strong>${saldoTxt}</strong> crédito(s). Cada um vale 1 cálculo na calculadora.</p>` +
        `</div>` +
        `<p style="margin:18px 0 0"><a href="${urlRota()}" style="display:inline-block;background:#0f172a;color:#fff;text-decoration:none;font-weight:800;padding:12px 18px;border-radius:10px">Abrir a calculadora</a></p>`,
    )
  } else {
    const plano = PLANOS[cobranca.pacote_id]?.titulo || cobranca.pacote_id
    const link = urlCadastro(cobranca.pacote_id)
    assunto = `Pagamento confirmado — plano ${plano}`
    texto =
      `Pagamento confirmado.\n\n` +
      `EXTRATO\n` +
      `Status: Pago com sucesso\n` +
      `Data: ${quando}\n` +
      `Forma: PIX\n` +
      `Plano: ${plano}\n` +
      `Valor: ${valor}\n` +
      `Código: ${codigo}\n` +
      `E-mail: ${email}\n\n` +
      `Cadastro do sistema: ${link}\n`
    html = envelopeEmail(
      'Pagamento confirmado',
      `Recebemos o PIX do plano <strong>${escapeHtml(plano)}</strong>. O cadastro do sistema já pode ser concluído.`,
      extratoBase + linhaExtrato('Plano', escapeHtml(plano)),
      `<p style="margin:0 0 14px;color:#334155;font-size:15px">Use o botão abaixo para criar a conta do sistema com este plano.</p>` +
        `<p style="margin:0"><a href="${link}" style="display:inline-block;background:#0f172a;color:#fff;text-decoration:none;font-weight:800;padding:12px 18px;border-radius:10px">Concluir o cadastro</a></p>`,
    )
  }

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

async function processarPago(paymentId: string) {
  const sb = admin()
  const { data } = await sb
    .from('rota_publico_cobrancas')
    .select(
      'id, user_id, asaas_payment_id, asaas_customer_id, tipo, pacote_id, creditos, valor, status, email, email_enviado_em',
    )
    .eq('asaas_payment_id', paymentId)
    .maybeSingle()
  const cobranca = data as Cobranca | null
  if (!cobranca) return { ok: false as const, erro: 'cobranca_nao_encontrada' }

  if (cobranca.tipo === 'credito') {
    if (!cobranca.user_id) return { ok: false as const, erro: 'sem_usuario' }
    const creditou = await sb.rpc('rota_publico_creditar_asaas', {
      p_user: cobranca.user_id,
      p_txid: cobranca.asaas_payment_id,
      p_pacote: cobranca.pacote_id,
      p_creditos: cobranca.creditos,
      p_valor: cobranca.valor,
    })
    if (creditou.error) return { ok: false as const, erro: creditou.error.message }
  }

  const saldoResp =
    cobranca.user_id
      ? await sb.from('rota_publico_creditos').select('saldo').eq('user_id', cobranca.user_id).maybeSingle()
      : { data: null }
  const saldo = Number((saldoResp.data as { saldo?: number } | null)?.saldo ?? cobranca.creditos)

  let emailEnviado = Boolean(cobranca.email_enviado_em)
  let emailErro: string | null = null
  if (!emailEnviado) {
    const mail = await enviarEmail(cobranca, saldo)
    if (mail.ok) emailEnviado = true
    else emailErro = mail.motivo
  }

  await sb
    .from('rota_publico_cobrancas')
    .update({
      status: 'pago',
      paid_at: cobranca.status === 'pago' ? undefined : new Date().toISOString(),
      email_enviado_em: emailEnviado ? new Date().toISOString() : cobranca.email_enviado_em,
      email_erro: emailErro,
    })
    .eq('id', cobranca.id)

  return { ok: true as const, emailEnviado, saldo, cobranca }
}

async function criarCobranca(req: Request, body: Record<string, unknown>) {
  if (!asaasKey()) return fail('asaas_nao_configurado')

  const tipo = body.tipo === 'plano' ? 'plano' : 'credito'
  const pacote = String(body.pacote || '').trim()
  const cpfCnpj = soDigitos(String(body.cpfCnpj || ''))
  if (!cpfCnpjOk(cpfCnpj)) {
    return fail('Informe um CPF ou CNPJ válido.')
  }

  const conta = await usuarioDoPedido(req)
  if (tipo === 'credito' && !conta) {
    return fail('Entre com Google para comprar créditos.')
  }

  let creditos = 0
  let valor = 0
  let titulo = ''
  if (tipo === 'credito') {
    const p = PACOTES[pacote]
    if (!p) return fail('Pacote inválido.')
    creditos = p.creditos
    valor = p.valor
    titulo = p.titulo
  } else {
    const p = PLANOS[pacote]
    if (!p) return fail('Plano inválido.')
    valor = p.valor
    titulo = p.titulo
  }

  const email = (conta?.email || String(body.email || '')).trim().toLowerCase()
  const nome = (conta?.nome || String(body.nome || '')).trim() || email.split('@')[0] || 'Cliente Doca Livre'
  if (tipo === 'plano' && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return fail('Informe o e-mail para enviarmos a confirmação.')
  }

  const situacao = await situacaoContaAsaas()
  if (situacao.ok && contaAindaEmAnalise(situacao.conta)) {
    return fail(
      'A conta Asaas ainda está em análise (documentos/cadastro). O QR Code só é gerado depois da aprovação.',
    )
  }

  const cliente = await clienteAsaas({
    nome,
    email,
    cpfCnpj,
    userId: conta?.id,
  })
  if (!cliente.ok) return fail(cliente.erro)

  const descricao =
    tipo === 'credito'
      ? `Doca Livre — ${titulo} da calculadora`
      : `Doca Livre — plano ${titulo}`
  const cobrancaAsaas = await asaasFetch('/payments', {
    method: 'POST',
    body: JSON.stringify({
      customer: cliente.id,
      billingType: 'PIX',
      value: Number(Number(valor).toFixed(2)),
      dueDate: hojeISO(),
      description: descricao.slice(0, 500),
      externalReference: `${tipo}:${conta?.id || email}:${pacote}`.slice(0, 100),
    }),
  })
  const paymentId = (cobrancaAsaas.body as { id?: string }).id
  if (!cobrancaAsaas.ok || !paymentId) {
    return fail(erroAsaas(cobrancaAsaas.body, cobrancaAsaas.status))
  }

  const qr = await asaasFetch(`/payments/${encodeURIComponent(paymentId)}/pixQrCode`)
  const qrBody = qr.body as { encodedImage?: string; payload?: string; expirationDate?: string }
  if (!qr.ok || !qrBody.payload) {
    return fail(erroAsaas(qr.body, qr.status) || 'Não foi possível gerar o QR Code PIX.')
  }

  const sb = admin()
  const { error: insErr } = await sb.from('rota_publico_cobrancas').insert({
    user_id: conta?.id || null,
    asaas_payment_id: paymentId,
    asaas_customer_id: cliente.id,
    tipo,
    pacote_id: pacote,
    creditos,
    valor,
    status: 'pendente',
    email: email || null,
  })
  if (insErr) {
    return fail('Não foi possível gravar a cobrança. Rode o SQL do Asaas no Supabase.')
  }

  try {
    await garantirWebhook()
  } catch {
    /* QR já gerado; webhook pode ser criado na próxima cobrança */
  }

  const imagem = qrBody.encodedImage
    ? qrBody.encodedImage.startsWith('data:')
      ? qrBody.encodedImage
      : `data:image/png;base64,${qrBody.encodedImage}`
    : ''

  return json({
    ok: true,
    asaas: true,
    paymentId,
    payload: qrBody.payload,
    imagem,
    valor,
    creditos,
    pacoteId: pacote,
    tipo,
    expiracao: qrBody.expirationDate || '',
  })
}

async function statusCobranca(req: Request, body: Record<string, unknown>) {
  const paymentId = String(body.paymentId || '').trim()
  if (!paymentId) return fail('Pagamento inválido.')

  const sb = admin()
  const { data } = await sb
    .from('rota_publico_cobrancas')
    .select('*')
    .eq('asaas_payment_id', paymentId)
    .maybeSingle()
  const cobranca = data as Cobranca | null
  if (!cobranca) return fail('Cobrança não encontrada.')

  const conta = await usuarioDoPedido(req)
  if (cobranca.tipo === 'credito' && cobranca.user_id && conta?.id !== cobranca.user_id) {
    return fail('Essa cobrança é de outra conta.')
  }

  if (cobranca.status === 'pago') {
    return json({
      ok: true,
      pago: true,
      status: 'pago',
      emailEnviado: Boolean(cobranca.email_enviado_em),
    })
  }

  const consulta = await asaasFetch(`/payments/${encodeURIComponent(paymentId)}`)
  const status = String((consulta.body as { status?: string }).status || '')
  if (!consulta.ok) return fail(erroAsaas(consulta.body, consulta.status))
  if (!PAGO.has(status)) {
    return json({ ok: true, pago: false, status })
  }

  const proc = await processarPago(paymentId)
  if (!proc.ok) return json({ ok: false, erro: proc.erro }, 500)
  return json({
    ok: true,
    pago: true,
    status: 'pago',
    emailEnviado: proc.emailEnviado,
    saldo: proc.saldo,
  })
}

async function webhook(req: Request) {
  const esperado = await webhookToken()
  const recebido = (req.headers.get('asaas-access-token') || '').trim()
  if (!esperado || recebido !== esperado) {
    return json({ ok: false, erro: 'Webhook não autorizado.' }, 401)
  }
  const body = (await req.json().catch(() => ({}))) as {
    event?: string
    payment?: { id?: string; status?: string }
  }
  const event = String(body.event || '')
  const paymentId = String(body.payment?.id || '')
  const status = String(body.payment?.status || '')
  if (!paymentId) return json({ ok: true, ignored: true })
  if (
    event !== 'PAYMENT_RECEIVED' &&
    event !== 'PAYMENT_CONFIRMED' &&
    !PAGO.has(status)
  ) {
    return json({ ok: true, ignored: true, event })
  }
  const proc = await processarPago(paymentId)
  if (!proc.ok && proc.erro === 'cobranca_nao_encontrada') {
    return json({ ok: true, ignored: true, motivo: 'cobranca_nao_encontrada' })
  }
  if (!proc.ok) return json({ ok: false, erro: proc.erro }, 500)
  return json({ ok: true, pago: true, emailEnviado: proc.emailEnviado })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ ok: false, erro: 'Método não permitido.' }, 405)

  try {
    if (req.headers.get('asaas-access-token')) return await webhook(req)
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>
    const action = String(body.action || '').trim()
    if (action === 'criar') return await criarCobranca(req, body)
    if (action === 'status') return await statusCobranca(req, body)
    if (action === 'config') {
      const situacao = asaasKey() ? await situacaoContaAsaas() : null
      return json({
        ok: true,
        asaas: Boolean(asaasKey()),
        resend: Boolean(Deno.env.get('RESEND_API_KEY')?.trim()),
        sandbox: asaasKey().includes('aact_hmlg'),
        conta: situacao && situacao.ok ? situacao.conta : undefined,
        contaErro: situacao && !situacao.ok ? situacao.erro : undefined,
      })
    }
    return fail('Ação inválida.')
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Erro interno.'
    console.error('asaas-pix', msg)
    return fail(msg)
  }
})
