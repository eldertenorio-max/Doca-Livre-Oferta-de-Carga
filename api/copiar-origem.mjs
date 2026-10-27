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
const ordem = [
  'rotas',
  'transportadores',
  'grupos_transportadores',
  'grupo_transportador_membros',
  'veiculos',
  'motoristas',
  'cargas',
  'lances',
  'transportador_documentos',
  'profiles',
  'usuarios',
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
  'kanban_sync',
]
const conflitos = {
  grupo_transportador_membros: ['grupo_id', 'transportador_id'],
  mapa_feed_curtidas: ['post_id', 'usuario'],
  mapa_feed_comentario_curtidas: ['comentario_id', 'usuario'],
  mapa_usuarios: ['usuario'],
  app_store: ['chave'],
}

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

const ids = {
  rotas: new Set(),
  transportadores: new Set(),
  grupos_transportadores: new Set(),
  mapa_feed_posts: new Set(),
  mapa_feed_comentarios: new Set(),
  veiculos: new Set(),
}
for (const tabela of ordem) {
  let linhas = await buscar(tabela)
  if (ids[tabela]) {
    for (const linha of linhas) if (linha.id) ids[tabela].add(linha.id)
  }
  if (tabela === 'cargas') {
    linhas = linhas.map((linha) => ({
      ...linha,
      rota_id: linha.rota_id && !ids.rotas.has(linha.rota_id) ? null : linha.rota_id,
      transportador_vencedor_id:
        linha.transportador_vencedor_id && !ids.transportadores.has(linha.transportador_vencedor_id)
          ? null
          : linha.transportador_vencedor_id,
    }))
  }
  if (tabela === 'veiculos' || tabela === 'profiles' || tabela === 'motoristas') {
    linhas = linhas.map((linha) =>
      linha.transportador_id && !ids.transportadores.has(linha.transportador_id)
        ? { ...linha, transportador_id: null }
        : linha,
    )
  }
  if (tabela === 'motoristas') {
    linhas = linhas.map((linha) =>
      linha.veiculo_id && !ids.veiculos.has(linha.veiculo_id) ? { ...linha, veiculo_id: null } : linha,
    )
  }
  if (tabela === 'transportador_documentos') {
    linhas = linhas.filter((linha) => ids.transportadores.has(linha.transportador_id))
  }
  if (tabela === 'grupo_transportador_membros') {
    linhas = linhas.filter(
      (linha) => ids.grupos_transportadores.has(linha.grupo_id) && ids.transportadores.has(linha.transportador_id),
    )
  }
  if (tabela === 'mapa_feed_curtidas' || tabela === 'mapa_feed_comentarios') {
    linhas = linhas.filter((linha) => ids.mapa_feed_posts.has(linha.post_id))
  }
  if (tabela === 'mapa_feed_comentario_curtidas') {
    linhas = linhas.filter((linha) => ids.mapa_feed_comentarios.has(linha.comentario_id))
  }
  const res = await fetch(`${api}/copiar`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-importar': token,
    },
    body: JSON.stringify({ tabela, linhas, conflito: conflitos[tabela] || ['id'] }),
  })
  const corpo = await res.text()
  console.log(`${tabela} ${res.status} ${corpo.slice(0, 200)}`)
  if (!res.ok) process.exit(1)
}
