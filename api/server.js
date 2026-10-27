import http from 'node:http'
import https from 'node:https'
import { timingSafeEqual } from 'node:crypto'
import { atenderArquivo } from './arquivos.mjs'
import { atenderSemSupabase } from './sem-supabase.mjs'
import { pool } from './migrar.mjs'

const port = Number(process.env.PORT || 8080)
const tabelas = [
  'transportadores',
  'cargas',
  'lances',
  'kanban_sync',
  'usuarios',
  'rotas',
  'profiles',
  'grupos_transportadores',
  'grupo_transportador_membros',
  'veiculos',
  'motoristas',
  'transportador_documentos',
  'interacoes_pontuacao',
  'app_store',
  'push_subscriptions',
  'mapa_empresas',
  'mapa_usuarios',
  'mapa_feed_posts',
  'mapa_feed_curtidas',
  'mapa_feed_comentarios',
  'mapa_feed_comentario_curtidas',
  'mapa_notificacoes',
]
const copiaPermitida = new Set(tabelas)
const prefixoArquivo = 'https://imnlbbfgaztfhwndfxwb.supabase.co/storage/v1/object/public/'
const prefixoBlob = 'https://stofertacargaprod.blob.core.windows.net/'

function lerCorpo(req) {
  return new Promise((resolve, reject) => {
    const partes = []
    req.on('data', (parte) => partes.push(parte))
    req.on('end', () => {
      try {
        resolve(JSON.parse(Buffer.concat(partes).toString('utf8') || '{}'))
      } catch (erro) {
        reject(erro)
      }
    })
    req.on('error', reject)
  })
}

function segredoConfere(esperado, recebido) {
  const certo = String(esperado || '')
  const valor = String(recebido || '')
  if (!certo || valor.length !== certo.length) return false
  return timingSafeEqual(Buffer.from(valor), Buffer.from(certo))
}

function cors(origemPedido) {
  return {
    'access-control-allow-origin': origemPedido || '*',
    'access-control-allow-headers': 'authorization, apikey, content-type, prefer, range, accept, accept-profile, content-profile, x-client-info, x-upsert, cache-control',
    'access-control-allow-methods': 'GET,POST,PATCH,PUT,DELETE,OPTIONS',
    'access-control-expose-headers': 'content-range, content-location, location, preference-applied',
    'access-control-max-age': '86400',
  }
}

async function colunasDaTabela(tabela) {
  const res = await pool.query(
    `select column_name, data_type, is_nullable from information_schema.columns
     where table_schema = 'public' and table_name = $1`,
    [tabela],
  )
  return res.rows
}

function valorPg(tipo, anulavel, valor) {
  const texto = tipo === 'text' || tipo === 'character varying' || tipo === 'character'
  if (valor === '') {
    if (tipo === 'boolean') return false
    if (!texto) return anulavel === 'NO' && (tipo === 'integer' || tipo === 'bigint' || tipo === 'smallint' || tipo === 'numeric') ? 0 : null
  }
  if (valor !== null && (tipo === 'jsonb' || tipo === 'json')) {
    if (typeof valor === 'string') {
      try {
        JSON.parse(valor)
        return valor
      } catch {
        return JSON.stringify(valor)
      }
    }
    return JSON.stringify(valor)
  }
  return valor
}

async function gravarTabela(tabela, linhas, conflito) {
  const colunas = await colunasDaTabela(tabela)
  const nomes = new Set(colunas.map((c) => c.column_name))
  const tipos = new Map(colunas.map((c) => [c.column_name, c.data_type]))
  const nulos = new Map(colunas.map((c) => [c.column_name, c.is_nullable]))
  const chaves = (Array.isArray(conflito) ? conflito : ['id']).filter((nome) => nomes.has(nome))
  if (!chaves.length) throw new Error('sem_chave')
  let gravadas = 0
  for (const linha of linhas) {
    if (!chaves.every((nome) => linha[nome] !== undefined && linha[nome] !== null)) continue
    const pares = Object.entries(linha).filter(([nome, valor]) => nomes.has(nome) && valor !== undefined)
    const campos = pares.map(([nome]) => `"${nome}"`)
    const valores = pares.map(([, valor], i) => valorPg(tipos.get(pares[i][0]), nulos.get(pares[i][0]), valor))
    const marcas = pares.map((_, i) => `$${i + 1}`)
    const atualizaveis = pares.filter(([nome]) => !chaves.includes(nome))
    const acao = atualizaveis.length
      ? `do update set ${atualizaveis.map(([nome]) => `"${nome}" = excluded."${nome}"`).join(', ')}`
      : 'do nothing'
    await pool.query(
      `insert into "${tabela}" (${campos.join(', ')}) values (${marcas.join(', ')})
       on conflict (${chaves.map((nome) => `"${nome}"`).join(', ')}) ${acao}`,
      valores,
    )
    gravadas += 1
  }
  return gravadas
}

async function contagens() {
  const out = {}
  for (const tabela of tabelas) {
    const res = await pool.query(`select count(*)::int as n from ${tabela}`)
    out[tabela] = res.rows[0].n
  }
  return out
}

async function ajustarUrls() {
  const texto = [
    ['transportador_documentos', 'url'],
    ['veiculos', 'foto_url'],
    ['transportadores', 'logo_url'],
    ['transportadores', 'facial_foto_url'],
    ['usuarios', 'avatar_url'],
    ['profiles', 'avatar_url'],
    ['mapa_feed_posts', 'imagem_url'],
  ]
  for (const [tabela, coluna] of texto) {
    await pool.query(
      `update "${tabela}" set "${coluna}" = replace("${coluna}", $1, $2) where "${coluna}" like '%' || $1 || '%'`,
      [prefixoArquivo, prefixoBlob],
    )
  }
  const jsons = [
    ['veiculos', 'fotos'],
    ['kanban_sync', 'payload'],
    ['app_store', 'valor'],
    ['mapa_empresas', 'payload'],
    ['mapa_feed_posts', 'midias'],
    ['transportadores', 'perfil_publico'],
  ]
  for (const [tabela, coluna] of jsons) {
    await pool.query(
      `update "${tabela}" set "${coluna}" = replace("${coluna}"::text, $1, $2)::jsonb
       where "${coluna}"::text like '%' || $1 || '%'`,
      [prefixoArquivo, prefixoBlob],
    )
  }
}

function encaminhar(req, res, base, caminho, tirar = []) {
  const alvo = new URL(caminho, base)
  const lib = alvo.protocol === 'https:' ? https : http
  const headers = { ...req.headers, host: alvo.host }
  for (const nome of tirar) delete headers[nome]
  const pre = lib.request(alvo, { method: req.method, headers }, (up) => {
    const saida = { ...up.headers, ...cors(req.headers.origin) }
    res.writeHead(up.statusCode || 502, saida)
    up.pipe(res)
  })
  pre.on('error', () => {
    if (!res.headersSent) res.writeHead(502, { 'content-type': 'application/json' })
    res.end(JSON.stringify({ ok: false, erro: 'Falha ao encaminhar' }))
  })
  req.pipe(pre)
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || '/', 'http://local')
  const caminho = url.pathname
  if (req.method === 'OPTIONS') {
    res.writeHead(204, cors(req.headers.origin))
    res.end()
    return
  }
  if (caminho === '/saude' || caminho === '/') {
    if (process.env.MIGRACAO_ERRO) {
      res.writeHead(500, { 'content-type': 'application/json', ...cors(req.headers.origin) })
      res.end(JSON.stringify({ ok: false, erro: String(process.env.MIGRACAO_ERRO).slice(0, 300) }))
      return
    }
    try {
      const dados = await contagens()
      let rest = false
      try {
        const prova = await fetch('http://127.0.0.1:3001/rotas?select=id&limit=1')
        rest = prova.ok
      } catch {
        rest = false
      }
      res.writeHead(200, { 'content-type': 'application/json', ...cors(req.headers.origin) })
      res.end(JSON.stringify({
        ok: true,
        banco: 'ofertacarga',
        rest,
        copia: Boolean(process.env.IMPORT_TOKEN),
        contagens: dados,
      }))
    } catch (erro) {
      const mensagem = erro instanceof Error ? erro.message : 'Falha no banco'
      res.writeHead(500, { 'content-type': 'application/json' })
      res.end(JSON.stringify({ ok: false, erro: mensagem }))
    }
    return
  }

  if ((caminho === '/copiar' || caminho === '/ajustar-urls') && req.method === 'POST') {
    if (!segredoConfere(process.env.IMPORT_TOKEN, req.headers['x-importar'])) {
      res.writeHead(404, { 'content-type': 'application/json' })
      res.end(JSON.stringify({ ok: false, erro: 'Não encontrado' }))
      return
    }
    try {
      if (caminho === '/ajustar-urls') {
        await ajustarUrls()
        res.writeHead(200, { 'content-type': 'application/json' })
        res.end(JSON.stringify({ ok: true }))
        return
      }
      const corpo = await lerCorpo(req)
      const tabela = String(corpo.tabela || '')
      if (!copiaPermitida.has(tabela) || !Array.isArray(corpo.linhas)) {
        res.writeHead(400, { 'content-type': 'application/json' })
        res.end(JSON.stringify({ ok: false, erro: 'Tabela inválida' }))
        return
      }
      const gravadas = await gravarTabela(tabela, corpo.linhas, corpo.conflito)
      res.writeHead(200, { 'content-type': 'application/json' })
      res.end(JSON.stringify({ ok: true, tabela, gravadas }))
    } catch (erro) {
      const bruto = erro instanceof Error ? erro.message : ''
      const limpo = bruto.replace(/"[^"]*"/g, '""').replace(/'[^']*'/g, "''").slice(0, 160)
      const partes = erro && typeof erro === 'object'
        ? [erro.code, erro.table, erro.column, limpo].filter(Boolean)
        : []
      res.writeHead(500, { 'content-type': 'application/json' })
      res.end(JSON.stringify({ ok: false, erro: partes.length ? partes.join(' ') : 'Falha ao gravar' }))
    }
    return
  }

  if (!segredoConfere(process.env.ANON_KEY, req.headers.apikey)) {
    res.writeHead(401, { 'content-type': 'application/json', ...cors(req.headers.origin) })
    res.end(JSON.stringify({ message: 'Chave inválida' }))
    return
  }

  if (caminho.startsWith('/auth/v1') || caminho.startsWith('/functions/v1') || caminho.startsWith('/rest/v1/rpc/')) {
    const atendeu = await atenderSemSupabase(req, res, caminho, url)
    if (atendeu) return
  }
  if (caminho.startsWith('/rest/v1')) {
    const resto = caminho.slice('/rest/v1'.length) || '/'
    encaminhar(req, res, 'http://127.0.0.1:3001', `${resto}${url.search}`, ['authorization'])
    return
  }
  if (caminho.startsWith('/storage/v1')) {
    try {
      await atenderArquivo(req, res, caminho)
    } catch {
      if (!res.headersSent) res.writeHead(500, { 'content-type': 'application/json' })
      res.end(JSON.stringify({ message: 'Falha no arquivo' }))
    }
    return
  }
  res.writeHead(404, { 'content-type': 'application/json' })
  res.end(JSON.stringify({ ok: false, erro: 'Não encontrado' }))
})

server.on('upgrade', (req, socket) => {
  socket.destroy()
})

server.listen(port, '0.0.0.0')
