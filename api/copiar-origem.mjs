import fs from 'node:fs'

const url = process.env.SUPABASE_URL
const api = process.env.API_URL
const token = process.env.IMPORT_TOKEN
const bundle = process.env.BUNDLE
if (!url || !api || !token || !bundle) {
  console.error('Faltam SUPABASE_URL, API_URL, IMPORT_TOKEN ou BUNDLE')
  process.exit(1)
}

const texto = fs.readFileSync(bundle, 'utf8')
const marca = texto.indexOf(',Dl=`', texto.indexOf('imnlbbfgaztfhwndfxwb'))
const chave = texto.slice(marca + ',Dl=`'.length, texto.indexOf('`', marca + ',Dl=`'.length))
const ordem = ['rotas', 'transportadores', 'cargas', 'lances', 'usuarios', 'kanban_sync']

async function buscar(tabela) {
  const linhas = []
  let de = 0
  for (;;) {
    const ate = de + 199
    const res = await fetch(`${url}/rest/v1/${tabela}?select=*`, {
      headers: {
        apikey: chave,
        Authorization: `Bearer ${chave}`,
        Range: `${de}-${ate}`,
      },
    })
    if (res.status === 404 || res.status === 416) return linhas
    if (!res.ok) {
      const corpo = await res.text()
      throw new Error(`${tabela} ${res.status} ${corpo.slice(0, 160)}`)
    }
    const pagina = await res.json()
    linhas.push(...pagina)
    if (pagina.length < 200) break
    de += 200
  }
  return linhas
}

const idsRotas = new Set()
for (const tabela of ordem) {
  let linhas = await buscar(tabela)
  if (tabela === 'rotas') {
    for (const linha of linhas) idsRotas.add(linha.id)
  }
  if (tabela === 'cargas') {
    linhas = linhas.map((linha) =>
      linha.rota_id && !idsRotas.has(linha.rota_id) ? { ...linha, rota_id: null } : linha,
    )
  }
  const res = await fetch(`${api}/copiar`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-importar': token,
    },
    body: JSON.stringify({ tabela, linhas }),
  })
  const corpo = await res.text()
  console.log(`${tabela} ${res.status} ${corpo.slice(0, 200)}`)
  if (!res.ok) process.exit(1)
}
