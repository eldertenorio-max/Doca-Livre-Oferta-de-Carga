import fs from 'node:fs'
import http from 'node:http'
import pg from 'pg'

const port = Number(process.env.PORT || 8080)
const tabelas = ['transportadores', 'cargas', 'lances', 'kanban_sync', 'usuarios']

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

await migrar()

const server = http.createServer(async (req, res) => {
  const caminho = (req.url || '/').split('?')[0]
  if (caminho !== '/' && caminho !== '/saude') {
    res.writeHead(404, { 'content-type': 'application/json' })
    res.end(JSON.stringify({ ok: false, erro: 'Não encontrado' }))
    return
  }
  try {
    const dados = await contagens()
    res.writeHead(200, { 'content-type': 'application/json' })
    res.end(JSON.stringify({ ok: true, banco: 'ofertacarga', contagens: dados }))
  } catch (erro) {
    const mensagem = erro instanceof Error ? erro.message : 'Falha no banco'
    res.writeHead(500, { 'content-type': 'application/json' })
    res.end(JSON.stringify({ ok: false, erro: mensagem }))
  }
})

server.listen(port, '0.0.0.0')
