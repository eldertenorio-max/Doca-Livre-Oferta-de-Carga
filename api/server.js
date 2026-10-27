import fs from 'node:fs'
import http from 'node:http'
import pg from 'pg'

const port = Number(process.env.PORT || 8080)
const tabelas = ['transportadores', 'cargas', 'lances', 'kanban_sync', 'usuarios', 'rotas']
const copiaPermitida = new Set(tabelas)

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

async function colunasDaTabela(tabela) {
  const res = await pool.query(
    `select column_name, data_type from information_schema.columns
     where table_schema = 'public' and table_name = $1`,
    [tabela],
  )
  return res.rows
}

async function gravarTabela(tabela, linhas) {
  const colunas = await colunasDaTabela(tabela)
  const nomes = new Set(colunas.map((c) => c.column_name))
  const tipos = new Map(colunas.map((c) => [c.column_name, c.data_type]))
  let gravadas = 0
  for (const linha of linhas) {
    const pares = Object.entries(linha).filter(([nome, valor]) => nomes.has(nome) && valor !== undefined)
    if (!pares.some(([nome]) => nome === 'id')) continue
    const campos = pares.map(([nome]) => `"${nome}"`)
    const valores = pares.map(([, valor], i) => {
      const tipo = tipos.get(pares[i][0])
      if (valor !== null && (tipo === 'jsonb' || tipo === 'json') && typeof valor !== 'string') {
        return JSON.stringify(valor)
      }
      return valor
    })
    const marcas = pares.map((_, i) => `$${i + 1}`)
    const atualiza = pares
      .map(([nome]) => `"${nome}" = excluded."${nome}"`)
      .join(', ')
    await pool.query(
      `insert into "${tabela}" (${campos.join(', ')}) values (${marcas.join(', ')})
       on conflict (id) do update set ${atualiza}`,
      valores,
    )
    gravadas += 1
  }
  return gravadas
}

const pool = new pg.Pool({
  ssl: process.env.PGHOST ? { rejectUnauthorized: false } : undefined,
})

async function migrar() {
  const sql = fs.readFileSync(new URL('./sql/001_nucleo.sql', import.meta.url), 'utf8')
  await pool.query(sql)
}

async function contagens() {
  const out = {}
  for (const tabela of tabelas) {
    const res = await pool.query(`select count(*)::int as n from ${tabela}`)
    out[tabela] = res.rows[0].n
  }
  return out
}

let migracaoErro = null
try {
  await migrar()
} catch (erro) {
  migracaoErro = erro instanceof Error ? erro.message : 'Falha ao preparar o banco'
}

const server = http.createServer(async (req, res) => {
  const caminho = (req.url || '/').split('?')[0]
  if (caminho === '/copiar' && req.method === 'POST') {
    const esperado = process.env.IMPORT_TOKEN || ''
    const recebido = req.headers['x-importar'] || ''
    if (!esperado || recebido !== esperado) {
      res.writeHead(404, { 'content-type': 'application/json' })
      res.end(JSON.stringify({ ok: false, erro: 'Não encontrado' }))
      return
    }
    try {
      const corpo = await lerCorpo(req)
      const tabela = String(corpo.tabela || '')
      if (!copiaPermitida.has(tabela) || !Array.isArray(corpo.linhas)) {
        res.writeHead(400, { 'content-type': 'application/json' })
        res.end(JSON.stringify({ ok: false, erro: 'Tabela inválida' }))
        return
      }
      const gravadas = await gravarTabela(tabela, corpo.linhas)
      res.writeHead(200, { 'content-type': 'application/json' })
      res.end(JSON.stringify({ ok: true, tabela, gravadas }))
    } catch (erro) {
      const partes = erro && typeof erro === 'object'
        ? [erro.code, erro.table, erro.constraint, erro.column].filter(Boolean)
        : []
      const codigo = partes.length ? partes.join(' ') : 'Falha ao gravar'
      res.writeHead(500, { 'content-type': 'application/json' })
      res.end(JSON.stringify({ ok: false, erro: codigo }))
    }
    return
  }
  if (caminho !== '/' && caminho !== '/saude') {
    res.writeHead(404, { 'content-type': 'application/json' })
    res.end(JSON.stringify({ ok: false, erro: 'Não encontrado' }))
    return
  }
  if (migracaoErro) {
    res.writeHead(500, { 'content-type': 'application/json' })
    res.end(JSON.stringify({ ok: false, erro: migracaoErro }))
    return
  }
  try {
    const dados = await contagens()
    res.writeHead(200, { 'content-type': 'application/json' })
    res.end(JSON.stringify({
      ok: true,
      banco: 'ofertacarga',
      copia: Boolean(process.env.IMPORT_TOKEN),
      contagens: dados,
    }))
  } catch (erro) {
    const mensagem = erro instanceof Error ? erro.message : 'Falha no banco'
    res.writeHead(500, { 'content-type': 'application/json' })
    res.end(JSON.stringify({ ok: false, erro: mensagem }))
  }
})

server.listen(port, '0.0.0.0')
