import { createHash, createHmac, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto'
import { pool } from './migrar.mjs'

const PACOTES = {
  '50': { creditos: 50, valor: 5, titulo: '50 créditos' },
  '100': { creditos: 100, valor: 59.9, titulo: '100 créditos' },
  '200': { creditos: 200, valor: 99.9, titulo: '200 créditos' },
}
const PACOTES_MANUAIS = {
  '50': { creditos: 50, valor: 29.9 },
  '100': { creditos: 100, valor: 59.9 },
  '200': { creditos: 200, valor: 99.9 },
}
const PLANOS = {
  motorista: { valor: 49, titulo: 'Motorista', creditos: 0 },
  start: { valor: 197, titulo: 'Embarcador Start', creditos: 0 },
  pro: { valor: 397, titulo: 'Embarcador Pro', creditos: 0 },
  empresa: { valor: 890, titulo: 'Empresa', creditos: 0 },
}
const PAGO = new Set(['RECEIVED', 'CONFIRMED', 'RECEIVED_IN_CASH'])
const SUBS = new Set(['a', 'b', 'c', 'd'])

function segredo() {
  return process.env.AUTH_SECRET || ''
}

function b64(valor) {
  return Buffer.from(valor).toString('base64url')
}

function assinar(payload) {
  const corpo = b64(JSON.stringify(payload))
  const sig = createHmac('sha256', segredo()).update(corpo).digest('base64url')
  return `${corpo}.${sig}`
}

function lerToken(token) {
  const [corpo, sig] = String(token || '').split('.')
  if (!corpo || !sig || !segredo()) return null
  const esperado = createHmac('sha256', segredo()).update(corpo).digest('base64url')
  const a = Buffer.from(sig)
  const b = Buffer.from(esperado)
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null
  try {
    const dados = JSON.parse(Buffer.from(corpo, 'base64url').toString('utf8'))
    if (dados.exp && dados.exp < Math.floor(Date.now() / 1000)) return null
    return dados
  } catch {
    return null
  }
}

function hashSenha(senha) {
  const sal = randomBytes(16).toString('hex')
  const hash = scryptSync(senha, sal, 32).toString('hex')
  return `scrypt$${sal}$${hash}`
}

function senhaConfere(senha, gravada) {
  const partes = String(gravada || '').split('$')
  if (partes[0] !== 'scrypt' || !partes[1] || !partes[2]) return false
  const calc = scryptSync(senha, partes[1], 32)
  const alvo = Buffer.from(partes[2], 'hex')
  if (calc.length !== alvo.length) return false
  return timingSafeEqual(calc, alvo)
}

function emailLimpo(valor) {
  return String(valor || '').trim().toLowerCase()
}

function emailValido(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
}

function usuarioDe(row) {
  const meta = row.metadata || {}
  const agora = new Date().toISOString()
  return {
    id: row.id,
    aud: 'authenticated',
    role: 'authenticated',
    email: row.email,
    email_confirmed_at: row.created_at,
    phone: '',
    confirmed_at: row.created_at,
    last_sign_in_at: agora,
    app_metadata: { provider: 'email', providers: ['email'] },
    user_metadata: meta,
    identities: [],
    created_at: row.created_at,
    updated_at: row.updated_at || row.created_at,
    is_anonymous: false,
  }
}

async function sessaoDe(row) {
  const expira = Math.floor(Date.now() / 1000) + 60 * 60
  const access = assinar({ sub: row.id, email: row.email, exp: expira })
  const refresh = randomBytes(32).toString('hex')
  await pool.query(
    `insert into contas_sessoes (conta_id, refresh_token, expira_em) values ($1, $2, now() + interval '30 days')`,
    [row.id, refresh],
  )
  const user = usuarioDe(row)
  return {
    access_token: access,
    token_type: 'bearer',
    expires_in: 3600,
    expires_at: expira,
    refresh_token: refresh,
    user,
  }
}

function tokenDoPedido(req) {
  const bruto = String(req.headers.authorization || '')
  const token = bruto.replace(/^Bearer\s+/i, '')
  if (!token || token === process.env.ANON_KEY) return null
  return lerToken(token)
}

async function lerCorpo(req) {
  const partes = []
  for await (const parte of req) partes.push(parte)
  const texto = Buffer.concat(partes).toString('utf8')
  if (!texto) return {}
  return JSON.parse(texto)
}

function json(res, status, corpo) {
  const headers = {
    'content-type': 'application/json',
    'access-control-allow-origin': '*',
    'access-control-allow-headers': 'authorization, apikey, content-type, prefer, range, accept, accept-profile, content-profile, x-client-info, x-upsert, cache-control',
    'access-control-allow-methods': 'GET,POST,PATCH,PUT,DELETE,OPTIONS',
    'access-control-expose-headers': 'content-range, content-location, location, preference-applied',
  }
  if (status === 204) {
    res.writeHead(204, headers)
    res.end()
    return
  }
  res.writeHead(status, headers)
  res.end(JSON.stringify(corpo))
}

async function enviarEmail(para, assunto, html) {
  const key = (process.env.RESEND_API_KEY || '').trim()
  if (!key) return false
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      from: process.env.RESEND_FROM || 'Doca Livre Oferta de Carga <onboarding@resend.dev>',
      to: [para],
      subject: assunto,
      html,
    }),
  })
  return res.ok
}

async function guardarCodigo(finalidade, email) {
  const codigo = String(Math.floor(100000 + Math.random() * 900000))
  await pool.query(
    `insert into otp_codigos (finalidade, email, codigo, expira_em) values ($1, $2, $3, now() + interval '15 minutes')`,
    [finalidade, email, codigo],
  )
  return codigo
}

async function consumirCodigo(finalidade, email, codigo) {
  const digitos = String(codigo || '').replace(/\D/g, '')
  if (digitos.length !== 6) return 'formato'
  const res = await pool.query(
    `select id, codigo, expira_em, usado_em from otp_codigos
     where finalidade = $1 and email = $2
     order by created_at desc limit 1`,
    [finalidade, email],
  )
  const row = res.rows[0]
  if (!row || row.usado_em) return 'inexistente'
  if (new Date(row.expira_em).getTime() < Date.now()) return 'expirado'
  if (row.codigo !== digitos) {
    await pool.query(`update otp_codigos set tentativas = tentativas + 1 where id = $1`, [row.id])
    return 'invalido'
  }
  await pool.query(`update otp_codigos set usado_em = now() where id = $1`, [row.id])
  return ''
}

const msgCodigo = {
  formato: 'Código inválido.',
  inexistente: 'Solicite um novo código.',
  expirado: 'Código expirado. Solicite outro.',
  invalido: 'Código inválido.',
}

async function atenderAuth(req, res, caminho, url) {
  if (caminho === '/auth/v1/settings' && req.method === 'GET') {
    json(res, 200, { external: { google: false, email: true }, disable_signup: false, mailer_autoconfirm: true })
    return
  }
  if (caminho === '/auth/v1/authorize') {
    json(res, 400, { error: 'provider_disabled', error_description: 'O login Google ainda não está ligado na Azure.', msg: 'O login Google ainda não está ligado na Azure.' })
    return
  }
  let corpo = {}
  if (req.method !== 'GET') {
    try { corpo = await lerCorpo(req) } catch { json(res, 400, { error: 'invalid_json', msg: 'JSON inválido.' }); return }
  }
  if (caminho === '/auth/v1/signup' && req.method === 'POST') {
    const email = emailLimpo(corpo.email)
    const senha = String(corpo.password || '')
    if (!emailValido(email) || senha.length < 6) {
      json(res, 400, { error: 'invalid', msg: 'E-mail ou senha inválidos.' })
      return
    }
    const existe = await pool.query(`select id from contas_publicas where email = $1`, [email])
    if (existe.rows[0]) {
      json(res, 400, { error: 'user_already_exists', msg: 'Este e-mail já tem conta.' })
      return
    }
    const meta = corpo.data && typeof corpo.data === 'object' ? corpo.data : {}
    const ins = await pool.query(
      `insert into contas_publicas (email, senha_hash, metadata) values ($1, $2, $3::jsonb) returning *`,
      [email, hashSenha(senha), JSON.stringify(meta)],
    )
    const sessao = await sessaoDe(ins.rows[0])
    json(res, 200, sessao)
    return
  }
  if (caminho === '/auth/v1/token' && req.method === 'POST') {
    const tipo = url.searchParams.get('grant_type') || corpo.grant_type
    if (tipo === 'refresh_token') {
      const achou = await pool.query(
        `select c.* from contas_sessoes s join contas_publicas c on c.id = s.conta_id
         where s.refresh_token = $1 and s.expira_em > now()`,
        [String(corpo.refresh_token || '')],
      )
      if (!achou.rows[0]) { json(res, 400, { error: 'invalid_grant', msg: 'Sessão expirada.' }); return }
      json(res, 200, await sessaoDe(achou.rows[0]))
      return
    }
    const email = emailLimpo(corpo.email)
    const senha = String(corpo.password || '')
    const achou = await pool.query(`select * from contas_publicas where email = $1`, [email])
    const row = achou.rows[0]
    if (!row || !senhaConfere(senha, row.senha_hash)) {
      json(res, 400, { error: 'invalid_grant', msg: 'E-mail ou senha não conferem.' })
      return
    }
    json(res, 200, await sessaoDe(row))
    return
  }
  if (caminho === '/auth/v1/user' && req.method === 'GET') {
    const token = tokenDoPedido(req)
    if (!token?.sub) { json(res, 401, { error: 'no_session', msg: 'Sessão ausente.' }); return }
    const achou = await pool.query(`select * from contas_publicas where id = $1`, [token.sub])
    if (!achou.rows[0]) { json(res, 401, { error: 'user_not_found', msg: 'Conta não encontrada.' }); return }
    json(res, 200, usuarioDe(achou.rows[0]))
    return
  }
  if (caminho === '/auth/v1/user' && req.method === 'PUT') {
    const token = tokenDoPedido(req)
    if (!token?.sub) { json(res, 401, { error: 'no_session', msg: 'Sessão ausente.' }); return }
    const atual = await pool.query(`select * from contas_publicas where id = $1`, [token.sub])
    const row = atual.rows[0]
    if (!row) { json(res, 401, { error: 'user_not_found', msg: 'Conta não encontrada.' }); return }
    const meta = { ...(row.metadata || {}), ...(corpo.data || {}) }
    const senha = corpo.password ? hashSenha(String(corpo.password)) : row.senha_hash
    const salvo = await pool.query(
      `update contas_publicas set metadata = $2::jsonb, senha_hash = $3, updated_at = now() where id = $1 returning *`,
      [row.id, JSON.stringify(meta), senha],
    )
    json(res, 200, usuarioDe(salvo.rows[0]))
    return
  }
  if (caminho === '/auth/v1/logout' && req.method === 'POST') {
    json(res, 204)
    return
  }
  if (caminho === '/auth/v1/recover' && req.method === 'POST') {
    json(res, 200, {})
    return
  }
  json(res, 404, { error: 'not_found', msg: 'Não encontrado.' })
}

async function aplicarCota(chaves, consumir, limite, produto) {
  const hoje = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date())
  let max = 0
  for (const chave of chaves) {
    const res = await pool.query(`select n, inicio from mapa_publico_cotas where chave = $1`, [chave])
    const row = res.rows[0]
    if (!row) continue
    const dia = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date(row.inicio))
    const n = dia === hoje ? Number(row.n) : 0
    if (n > max) max = n
  }
  if (consumir) {
    if (max >= limite) return { ok: false, usadas: limite, restam: 0, esgotado: true, produto }
    max += 1
    for (const chave of chaves) {
      await pool.query(
        `insert into mapa_publico_cotas (chave, n, inicio, updated_at) values ($1, $2, now(), now())
         on conflict (chave) do update set n = excluded.n, inicio = now(), updated_at = now()`,
        [chave, max],
      )
    }
  }
  return { ok: true, usadas: Math.min(max, limite), restam: Math.max(0, limite - max), esgotado: max >= limite, produto }
}

function chavesCota(req, corpo, prefixo) {
  const ip = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim()
  const chaves = []
  if (ip) chaves.push(`${prefixo}ip:${createHash('sha256').update(`doca-mapa-cota:${ip}`).digest('hex').slice(0, 40)}`)
  const visitor = String(corpo.visitor_id || corpo.p_visitor || '')
  const device = String(corpo.device_hash || corpo.p_device || '')
  if (/^[a-zA-Z0-9:_-]{8,80}$/.test(visitor)) chaves.push(`${prefixo}vid:${visitor}`)
  if (/^[a-zA-Z0-9:_-]{8,80}$/.test(device)) chaves.push(`${prefixo}dev:${device}`)
  return chaves
}

async function saldoDe(userId) {
  await pool.query(
    `insert into rota_publico_creditos (user_id, saldo) values ($1, 0) on conflict (user_id) do nothing`,
    [userId],
  )
  const pendentes = await pool.query(
    `select coalesce(sum(creditos), 0)::int as n from rota_publico_presentes
     where user_id = $1 and aplicado_em is null`,
    [userId],
  )
  const extra = Number(pendentes.rows[0]?.n || 0)
  if (extra > 0) {
    await pool.query(
      `update rota_publico_creditos set saldo = saldo + $2, updated_at = now() where user_id = $1`,
      [userId, extra],
    )
    await pool.query(
      `update rota_publico_presentes set aplicado_em = now() where user_id = $1 and aplicado_em is null`,
      [userId],
    )
  }
  const res = await pool.query(`select saldo from rota_publico_creditos where user_id = $1`, [userId])
  return Number(res.rows[0]?.saldo || 0)
}

async function atenderRpc(req, res, caminho) {
  const nome = caminho.slice('/rest/v1/rpc/'.length)
  let corpo = {}
  try { corpo = await lerCorpo(req) } catch { json(res, 400, { message: 'JSON inválido' }); return }
  const token = tokenDoPedido(req)
  const uid = token?.sub || null
  if (nome === 'rota_publico_cota_cliente' || nome === 'mapa_publico_cota_cliente') {
    const prefixo = nome.startsWith('rota_') ? 'rota:' : ''
    const chaves = chavesCota(req, corpo, prefixo)
    const limite = 2
    if (!chaves.length) { json(res, 200, { ok: true, usadas: 0, restam: limite, esgotado: false }); return }
    json(res, 200, await aplicarCota(chaves, Boolean(corpo.p_consumir), limite))
    return
  }
  if (!uid && nome !== 'rota_publico_consultar_pix') {
    json(res, 200, { ok: false, erro: 'nao_autenticado', creditos: 0, presente: 0, comprou: false })
    return
  }
  if (nome === 'rota_publico_meus_creditos') {
    const creditos = await saldoDe(uid)
    const presentes = await pool.query(
      `select coalesce(sum(creditos), 0)::int as n, coalesce(array_agg(id), '{}') as ids
       from rota_publico_presentes where user_id = $1 and aplicado_em is not null and visto_em is null`,
      [uid],
    )
    const pix = await pool.query(`select 1 from rota_publico_pix where user_id = $1 limit 1`, [uid])
    json(res, 200, {
      ok: true,
      creditos,
      presente: Number(presentes.rows[0]?.n || 0),
      presente_ids: presentes.rows[0]?.ids || [],
      comprou: creditos > 0 || Boolean(pix.rows[0]),
    })
    return
  }
  if (nome === 'rota_publico_consumir_credito') {
    await saldoDe(uid)
    const resUp = await pool.query(
      `update rota_publico_creditos set saldo = saldo - 1, updated_at = now()
       where user_id = $1 and saldo >= 1 returning saldo`,
      [uid],
    )
    if (!resUp.rows[0]) {
      const atual = await pool.query(`select saldo from rota_publico_creditos where user_id = $1`, [uid])
      json(res, 200, { ok: false, creditos: Number(atual.rows[0]?.saldo || 0) })
      return
    }
    json(res, 200, { ok: true, creditos: Number(resUp.rows[0].saldo) })
    return
  }
  if (nome === 'rota_publico_migrar_local') {
    const add = Math.max(0, Math.min(Number(corpo.p_saldo || 0), 200))
    await saldoDe(uid)
    if (add > 0) {
      await pool.query(
        `update rota_publico_creditos set saldo = saldo + $2, updated_at = now() where user_id = $1`,
        [uid, add],
      )
    }
    json(res, 200, { ok: true, creditos: await saldoDe(uid) })
    return
  }
  if (nome === 'rota_publico_marcar_presente_visto') {
    const ids = Array.isArray(corpo.p_ids) ? corpo.p_ids : []
    if (ids.length) {
      await pool.query(
        `update rota_publico_presentes set visto_em = now() where user_id = $1 and id = any($2::uuid[])`,
        [uid, ids],
      )
    }
    json(res, 200, { ok: true })
    return
  }
  if (nome === 'rota_publico_creditar_pacote') {
    const pacote = PACOTES_MANUAIS[String(corpo.p_pacote || '').trim()]
    const txid = String(corpo.p_txid || '').trim().toUpperCase()
    if (!pacote || !txid || txid.length > 32) {
      json(res, 200, { ok: false, erro: pacote ? 'txid_invalido' : 'pacote_invalido', creditos: await saldoDe(uid) })
      return
    }
    try {
      await pool.query(
        `insert into rota_publico_pix (user_id, txid, pacote_id, creditos, valor) values ($1, $2, $3, $4, $5)`,
        [uid, txid, String(corpo.p_pacote), pacote.creditos, pacote.valor],
      )
    } catch (erro) {
      if (erro && erro.code === '23505') {
        const usado = await pool.query(
          `select p.created_at, p.pacote_id, c.email from rota_publico_pix p
           left join contas_publicas c on c.id = p.user_id where p.txid = $1`,
          [txid],
        )
        json(res, 200, {
          ok: false,
          erro: 'ja_usado',
          ja_creditado: true,
          creditos: await saldoDe(uid),
          quando: usado.rows[0]?.created_at,
          pacote_id: usado.rows[0]?.pacote_id,
          email: usado.rows[0]?.email || '',
          txid,
        })
        return
      }
      throw erro
    }
    await pool.query(
      `update rota_publico_creditos set saldo = saldo + $2, updated_at = now() where user_id = $1`,
      [uid, pacote.creditos],
    )
    json(res, 200, { ok: true, creditos: await saldoDe(uid) })
    return
  }
  if (nome === 'rota_publico_consultar_pix') {
    const txid = String(corpo.p_txid || '').replace(/[^A-Za-z0-9]/g, '').toUpperCase()
    if (txid.length < 6) { json(res, 200, { ok: false, erro: 'codigo_curto' }); return }
    const resPix = await pool.query(
      `select p.user_id, p.created_at, p.pacote_id, p.creditos, p.valor, c.email, s.saldo
       from rota_publico_pix p
       left join contas_publicas c on c.id = p.user_id
       left join rota_publico_creditos s on s.user_id = p.user_id
       where p.txid = $1`,
      [txid],
    )
    const row = resPix.rows[0]
    if (!row?.user_id) {
      json(res, 200, { ok: true, encontrado: false, ja_creditado: false, txid })
      return
    }
    json(res, 200, {
      ok: true,
      encontrado: true,
      ja_creditado: true,
      txid,
      email: row.email || '',
      pacote_id: row.pacote_id,
      creditos: row.creditos,
      valor: Number(row.valor),
      quando: row.created_at,
      saldo_atual: Number(row.saldo || 0),
    })
    return
  }
  json(res, 404, { message: 'Função não encontrada' })
}

async function otp(req, res, corpo, portal) {
  const action = String(corpo.action || '')
  const email = emailLimpo(corpo.email)
  if (action.endsWith('_enviar')) {
    if (!emailValido(email)) { json(res, 400, { ok: false, erro: 'Informe um e-mail válido.' }); return }
    const finalidade = action.startsWith('senha') ? (portal ? 'senha' : 'rota_senha') : (portal ? 'cadastro' : 'rota_cadastro')
    if (!portal && action === 'cadastro_enviar') {
      const conta = await pool.query(`select id, metadata from contas_publicas where email = $1`, [email])
      if (conta.rows[0]) { json(res, 200, { ok: false, erro: 'Este e-mail já tem conta na calculadora. Entre ou use “Esqueci a senha”.' }); return }
    }
    const codigo = await guardarCodigo(finalidade, email)
    const foi = await enviarEmail(email, 'Seu código Doca Livre', `<p>Seu código é <b>${codigo}</b>. Ele vale por 15 minutos.</p>`)
    if (!foi) { json(res, 200, { ok: false, erro: 'O envio de e-mail ainda não está configurado na Azure.' }); return }
    const [nome, dominio] = email.split('@')
    json(res, 200, { ok: true, email, email_mascarado: `${nome.slice(0, 2)}***@${dominio}`, mensagem: 'Código enviado para o e-mail.' })
    return
  }
  if (action.endsWith('_verificar') || action.endsWith('_confirmar')) {
    const finalidade = action.includes('senha') ? (portal ? 'senha' : 'rota_senha') : (portal ? 'cadastro' : 'rota_cadastro')
    const motivo = await consumirCodigo(finalidade, email, corpo.codigo)
    if (motivo) { json(res, 400, { ok: false, erro: msgCodigo[motivo] || 'Código inválido.' }); return }
    if (action === 'cadastro_confirmar' || action === 'senha_confirmar') {
      const senha = String(corpo.senha || corpo.password || '')
      if (senha.length < 6) { json(res, 200, { ok: false, erro: 'A senha precisa ter pelo menos 6 caracteres.' }); return }
      const nome = String(corpo.nome || '').trim() || email.split('@')[0]
      const meta = { origem: 'rota_publico', nome, full_name: nome, cpf: String(corpo.cpf || '').replace(/\D/g, '').slice(0, 11), site: corpo.site || 'calculadora' }
      const existe = await pool.query(`select * from contas_publicas where email = $1`, [email])
      if (existe.rows[0]) {
        await pool.query(
          `update contas_publicas set senha_hash = $2, metadata = metadata || $3::jsonb, updated_at = now() where email = $1`,
          [email, hashSenha(senha), JSON.stringify(meta)],
        )
      } else if (action === 'cadastro_confirmar') {
        await pool.query(
          `insert into contas_publicas (email, senha_hash, metadata) values ($1, $2, $3::jsonb)`,
          [email, hashSenha(senha), JSON.stringify(meta)],
        )
      } else {
        json(res, 200, { ok: false, erro: 'Não foi possível gravar a senha desta conta.' })
        return
      }
      json(res, 200, { ok: true, email })
      return
    }
    const verify = assinar({ email, finalidade, exp: Math.floor(Date.now() / 1000) + 30 * 60 })
    json(res, 200, { ok: true, verify_token: verify, email, mensagem: 'Código confirmado.' })
    return
  }
  if (action === 'validar_token') {
    const dados = lerToken(String(corpo.verify_token || ''))
    if (!dados?.email) { json(res, 400, { ok: false, erro: 'Token inválido.' }); return }
    json(res, 200, { ok: true, email: dados.email })
    return
  }
  if (action === 'criar_usuario_auth') {
    const dados = lerToken(String(corpo.verify_token || ''))
    const emailConta = emailLimpo(corpo.email || dados?.email)
    const senha = String(corpo.password || '')
    if (!emailValido(emailConta) || senha.length < 6) { json(res, 400, { ok: false, erro: 'Dados inválidos.' }); return }
    const meta = { nome: corpo.nome || '', usuario: corpo.usuario || '', origem: 'portal' }
    const existe = await pool.query(`select id from contas_publicas where email = $1`, [emailConta])
    if (existe.rows[0]) {
      await pool.query(`update contas_publicas set senha_hash = $2, updated_at = now() where email = $1`, [emailConta, hashSenha(senha)])
      json(res, 200, { ok: true, user_id: existe.rows[0].id })
      return
    }
    const ins = await pool.query(
      `insert into contas_publicas (email, senha_hash, metadata) values ($1, $2, $3::jsonb) returning id`,
      [emailConta, hashSenha(senha), JSON.stringify(meta)],
    )
    json(res, 200, { ok: true, user_id: ins.rows[0].id })
    return
  }
  if (action === 'cadastro_recusa_enviar' || action === 'cadastro_aprovado_enviar') {
    const destino = emailLimpo(corpo.email)
    if (!emailValido(destino)) { json(res, 400, { ok: false, erro: 'E-mail inválido.' }); return }
    const assunto = action.includes('recusa') ? 'Cadastro não aprovado' : 'Cadastro aprovado'
    const foi = await enviarEmail(destino, assunto, `<p>${assunto}.</p>`)
    if (!foi) { json(res, 200, { ok: false, erro: 'O envio de e-mail ainda não está configurado na Azure.' }); return }
    json(res, 200, { ok: true, email: destino })
    return
  }
  json(res, 400, { ok: false, erro: 'acao_invalida' })
}

async function pix(req, res, corpo) {
  const action = String(corpo.action || '')
  const chave = (process.env.ASAAS_API_KEY || '').trim()
  if (action === 'config') {
    json(res, 200, { ok: true, asaas: Boolean(chave), doca: false, resend: Boolean(process.env.RESEND_API_KEY), sandbox: chave.includes('aact_hmlg') })
    return
  }
  if (!chave) { json(res, 200, { ok: false, erro: 'asaas_nao_configurado' }); return }
  const base = (process.env.ASAAS_API_URL || 'https://api.asaas.com/v3').replace(/\/$/, '')
  async function asaas(path, init) {
    const resposta = await fetch(`${base}${path}`, {
      ...init,
      headers: { access_token: chave, 'content-type': 'application/json', ...(init?.headers || {}) },
    })
    const body = await resposta.json().catch(() => ({}))
    return { ok: resposta.ok, body }
  }
  if (action === 'criar') {
    const tipo = corpo.tipo === 'plano' ? 'plano' : 'credito'
    const item = tipo === 'plano' ? PLANOS[String(corpo.pacote || '')] : PACOTES[String(corpo.pacote || '')]
    if (!item) { json(res, 200, { ok: false, erro: 'Pacote inválido.' }); return }
    const cliente = await asaas('/customers', {
      method: 'POST',
      body: JSON.stringify({ name: corpo.nome || 'Cliente', email: corpo.email || undefined, cpfCnpj: String(corpo.cpfCnpj || '').replace(/\D/g, '') }),
    })
    const customer = cliente.body?.id
    if (!cliente.ok || !customer) { json(res, 200, { ok: false, erro: 'Não foi possível abrir o cliente do PIX.' }); return }
    const hoje = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date())
    const cobranca = await asaas('/payments', {
      method: 'POST',
      body: JSON.stringify({ customer, billingType: 'PIX', value: item.valor, dueDate: hoje, description: `Doca Livre — ${item.titulo}` }),
    })
    const paymentId = cobranca.body?.id
    if (!cobranca.ok || !paymentId) { json(res, 200, { ok: false, erro: 'Não foi possível criar o PIX.' }); return }
    const qr = await asaas(`/payments/${encodeURIComponent(paymentId)}/pixQrCode`)
    if (!qr.ok || !qr.body?.payload) { json(res, 200, { ok: false, erro: 'Não foi possível gerar o QR Code PIX.' }); return }
    const token = tokenDoPedido(req)
    const imagem = qr.body.encodedImage ? (String(qr.body.encodedImage).startsWith('data:') ? qr.body.encodedImage : `data:image/png;base64,${qr.body.encodedImage}`) : ''
    await pool.query(
      `insert into rota_publico_cobrancas (user_id, email, asaas_payment_id, asaas_customer_id, tipo, pacote_id, creditos, valor, status, payload, imagem)
       values ($1, $2, $3, $4, $5, $6, $7, $8, 'pendente', $9, $10)`,
      [token?.sub || null, emailLimpo(corpo.email), paymentId, customer, tipo, String(corpo.pacote), item.creditos || 0, item.valor, qr.body.payload, imagem],
    )
    json(res, 200, { ok: true, asaas: true, paymentId, payload: qr.body.payload, imagem, valor: item.valor, creditos: item.creditos || 0, pacoteId: String(corpo.pacote), tipo, expiracao: qr.body.expirationDate })
    return
  }
  if (action === 'status') {
    const paymentId = String(corpo.paymentId || '')
    const consulta = await asaas(`/payments/${encodeURIComponent(paymentId)}`)
    const status = String(consulta.body?.status || '')
    const pago = PAGO.has(status)
    let saldo
    if (pago) {
      const cobranca = await pool.query(`select * from rota_publico_cobrancas where asaas_payment_id = $1`, [paymentId])
      const row = cobranca.rows[0]
      if (row && row.status !== 'pago' && row.user_id && row.creditos > 0) {
        await saldoDe(row.user_id)
        await pool.query(`update rota_publico_creditos set saldo = saldo + $2, updated_at = now() where user_id = $1`, [row.user_id, row.creditos])
        await pool.query(`update rota_publico_cobrancas set status = 'pago', pago_em = now() where id = $1`, [row.id])
        saldo = await saldoDe(row.user_id)
      }
    }
    json(res, 200, { ok: true, pago, status, saldo })
    return
  }
  json(res, 400, { ok: false, erro: 'acao_invalida' })
}

async function push(res, corpo) {
  const publica = (process.env.VAPID_PUBLIC_KEY || '').trim()
  const privada = (process.env.VAPID_PRIVATE_KEY || '').trim()
  if (!publica || !privada) { json(res, 200, { ok: false, erro: 'O aviso no celular ainda não está configurado na Azure.' }); return }
  const tids = Array.isArray(corpo.transportador_ids) ? corpo.transportador_ids.map(String).filter(Boolean) : []
  if (!tids.length) { json(res, 400, { ok: false, erro: 'Informe transportador_ids.' }); return }
  const rows = await pool.query(
    `select id, endpoint, p256dh, auth, transportador_id, user_agent from push_subscriptions where transportador_id = any($1::text[])`,
    [tids],
  )
  const mod = await import('web-push')
  const webpush = mod.default || mod
  webpush.setVapidDetails(process.env.VAPID_SUBJECT || 'mailto:diego@docalivre.com', publica, privada)
  const payload = JSON.stringify({
    title: corpo.titulo || 'Doca Livre',
    body: corpo.mensagem || 'Nova notificação',
    icon: 'https://ofertadecarga.com.br/icon-192.png?v=oferta6',
    tag: corpo.tag || corpo.carga_id || 'doca-livre',
    data: { url: corpo.url || '/#/transportador', carga_id: corpo.carga_id || null },
  })
  let enviados = 0
  const remover = []
  for (const row of rows.rows) {
    try {
      await webpush.sendNotification({ endpoint: row.endpoint, keys: { p256dh: row.p256dh, auth: row.auth } }, payload, { TTL: 3600, urgency: 'high' })
      enviados += 1
    } catch (erro) {
      const status = erro && erro.statusCode
      if (status === 404 || status === 410) remover.push(row.id)
    }
  }
  if (remover.length) await pool.query(`delete from push_subscriptions where id = any($1::uuid[])`, [remover])
  json(res, 200, { ok: true, enviados, total: rows.rows.length, removidos: remover.length })
}

async function presente(res, corpo) {
  const action = String(corpo.action || '')
  if (action === 'config') { json(res, 200, { ok: true, resend: Boolean(process.env.RESEND_API_KEY) }); return }
  if (action === 'listar') {
    const lista = await pool.query(
      `select id, email, creditos, criado_em, criado_por, aplicado_em, visto_em, email_enviado_em, email_erro
       from rota_publico_presentes order by criado_em desc limit 200`,
    )
    json(res, 200, { ok: true, presentes: lista.rows })
    return
  }
  if (action === 'listar_contas') {
    const lista = await pool.query(
      `select c.id, c.email, c.metadata, coalesce(s.saldo, 0) as saldo
       from contas_publicas c left join rota_publico_creditos s on s.user_id = c.id
       order by c.email limit 500`,
    )
    json(res, 200, {
      ok: true,
      contas: lista.rows.map((row) => ({
        id: row.id,
        email: row.email,
        nome: row.metadata?.nome || row.email,
        cpf: row.metadata?.cpf || '',
        site: row.metadata?.site || '',
        saldo: Number(row.saldo),
      })),
      semSite: 0,
    })
    return
  }
  if (action === 'presentear' || action === 'dar_creditos') {
    const email = emailLimpo(corpo.email)
    const creditos = Math.max(0, Math.min(Number(corpo.creditos || 0), 10000))
    if (!emailValido(email) || creditos < 1) { json(res, 200, { ok: false, erro: 'Informe e-mail e créditos.' }); return }
    const conta = await pool.query(`select id from contas_publicas where email = $1`, [email])
    const userId = conta.rows[0]?.id || null
    if (userId) await saldoDe(userId)
    if (userId) {
      await pool.query(`update rota_publico_creditos set saldo = saldo + $2, updated_at = now() where user_id = $1`, [userId, creditos])
    }
    const ins = await pool.query(
      `insert into rota_publico_presentes (user_id, email, creditos, criado_por, aplicado_em)
       values ($1, $2, $3, $4, case when $1::uuid is null then null else now() end) returning id`,
      [userId, email, creditos, String(corpo.adminEmail || corpo.adminUsuario || '')],
    )
    const foi = await enviarEmail(email, 'Créditos Doca Livre', `<p>Você recebeu ${creditos} créditos.</p>`)
    if (foi) await pool.query(`update rota_publico_presentes set email_enviado_em = now() where id = $1`, [ins.rows[0].id])
    json(res, 200, { ok: true, id: ins.rows[0].id, email, creditos, aplicado: Boolean(userId), contaExiste: Boolean(userId), emailEnviado: foi, saldo: userId ? await saldoDe(userId) : 0 })
    return
  }
  json(res, 400, { ok: false, erro: 'acao_invalida' })
}

async function tile(req, res, caminho) {
  const partes = caminho.split('/').filter(Boolean)
  const i = partes.lastIndexOf('mapa-tile-pt')
  const slice = i >= 0 ? partes.slice(i + 1) : []
  if (slice.length < 4) { res.writeHead(400); res.end('Bad path'); return }
  const [s, zRaw, xRaw, yRaw] = slice
  const z = Number(zRaw)
  const x = Number(xRaw)
  const y = Number(String(yRaw).replace(/\.png$/i, ''))
  if (!SUBS.has(s) || !Number.isInteger(z) || z < 0 || z > 19 || x < 0 || y < 0 || x >= 2 ** z || y >= 2 ** z) {
    res.writeHead(400); res.end('Bad tile'); return
  }
  const upstream = await fetch(`https://osmap.${s}.tile.maphost.pt/pt/map/v1/${z}/${x}/${y}.png`, {
    headers: { referer: 'https://www.osmap.pt/', 'user-agent': 'DocaLivre-OfertaMapa/1.0 (diego@docalivre.com)', accept: 'image/png' },
  })
  if (!upstream.ok) {
    res.writeHead(upstream.status === 404 ? 404 : 502, { 'access-control-allow-origin': '*' })
    res.end('tile')
    return
  }
  const body = Buffer.from(await upstream.arrayBuffer())
  res.writeHead(200, { 'content-type': 'image/png', 'cache-control': 'public, max-age=86400', 'access-control-allow-origin': '*' })
  res.end(body)
}

export async function atenderSemSupabase(req, res, caminho, url) {
  try {
    if (caminho.startsWith('/auth/v1')) { await atenderAuth(req, res, caminho, url); return true }
    if (caminho.startsWith('/rest/v1/rpc/')) { await atenderRpc(req, res, caminho); return true }
    if (caminho.startsWith('/functions/v1/mapa-tile-pt')) { await tile(req, res, caminho); return true }
    if (caminho.startsWith('/functions/v1/')) {
      const nome = caminho.slice('/functions/v1/'.length).split('/')[0]
      let corpo = {}
      if (req.method !== 'GET') {
        try { corpo = await lerCorpo(req) } catch { json(res, 400, { ok: false, erro: 'JSON inválido' }); return true }
      }
      if (nome === 'portal-otp') { await otp(req, res, corpo, true); return true }
      if (nome === 'rota-publico-otp') { await otp(req, res, corpo, false); return true }
      if (nome === 'mapa-publico-busca') {
        const produto = String(corpo.produto || '')
        const chaves = chavesCota(req, corpo, produto ? `${produto}:` : '')
        json(res, 200, await aplicarCota(chaves, corpo.action === 'consume', 2, produto))
        return true
      }
      if (nome === 'asaas-pix') { await pix(req, res, corpo); return true }
      if (nome === 'web-push') { await push(res, corpo); return true }
      if (nome === 'rota-presente') { await presente(res, corpo); return true }
      json(res, 404, { ok: false, erro: 'Não encontrado' })
      return true
    }
  } catch {
    if (!res.headersSent) json(res, 500, { ok: false, erro: 'Falha na Azure' })
    return true
  }
  return false
}
