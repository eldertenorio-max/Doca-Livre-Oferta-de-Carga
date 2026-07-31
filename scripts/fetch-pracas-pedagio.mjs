import fs from 'node:fs'
import path from 'node:path'

const UA = {
  headers: {
    Accept: 'application/json',
    'User-Agent': 'DocaLivre/1.0 (contato@docalivre.com)',
  },
}

const outPath = path.resolve('public/data/pracas-pedagio.json')

function normalizeAntt(j) {
  const arr = j['praca-de-pedagio'] || j.data || []
  if (!Array.isArray(arr)) return []
  const pracas = []
  for (const o of arr) {
    const situacao = String(o.situacao || '').toLowerCase()
    if (situacao && situacao !== 'ativo') continue
    const lat = Number(String(o.latitude ?? '').replace(',', '.'))
    const lng = Number(String(o.longitude ?? '').replace(',', '.'))
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue
    const nome = String(o.praca_de_pedagio || o.praca || 'Praça').trim()
    const free_flow =
      /free.?flow|p[oó]rtico|ocr|livre passagem|eletr[oô]nic/i.test(nome) ||
      /free.?flow/i.test(String(o.tipo_de_pista || ''))
    pracas.push({
      nome,
      concessionaria: String(o.concessionaria || '').trim(),
      rodovia: String(o.rodovia || '').trim(),
      uf: String(o.uf || '').trim(),
      lat,
      lng,
      free_flow,
      fonte: 'antt',
    })
  }
  return pracas
}

async function fetchAntt() {
  const api = await fetch(
    'https://dados.antt.gov.br/api/3/action/package_show?id=praca-de-pedagio',
    UA,
  ).then((r) => r.json())
  const resources = (api.result?.resources || []).filter(
    (r) =>
      String(r.format || '').toUpperCase() === 'JSON' &&
      String(r.url || '').includes('/download/'),
  )
  const url = resources[resources.length - 1]?.url
  if (!url) throw new Error('ANTT JSON resource not found')
  console.log('ANTT url', url)
  const j = await fetch(url, UA).then((r) => r.json())
  return normalizeAntt(j)
}

async function fetchOsm() {
  const q = `[out:json][timeout:120];(
  node["barrier"="toll_booth"](-34,-74,5,-34);
  node["highway"="toll_gantry"](-34,-74,5,-34);
);out body;`
  const bases = [
    'https://overpass-api.de/api/interpreter',
    'https://overpass.kumi.systems/api/interpreter',
  ]
  for (const base of bases) {
    try {
      const r = await fetch(base, {
        method: 'POST',
        headers: {
          ...UA.headers,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: `data=${encodeURIComponent(q)}`,
      })
      const txt = await r.text()
      console.log('overpass', base, r.status, txt.slice(0, 60))
      if (!txt.trim().startsWith('{')) continue
      const oj = JSON.parse(txt)
      const osm = []
      for (const e of oj.elements || []) {
        if (e.lat == null || e.lon == null) continue
        const tags = e.tags || {}
        const nome = tags.name || tags.operator || tags.ref || tags.brand || 'Pedágio'
        const free_flow =
          tags.highway === 'toll_gantry' ||
          /free.?flow|p[oó]rtico|gantry/i.test(nome)
        osm.push({
          nome,
          concessionaria: String(tags.operator || '').trim(),
          rodovia: String(tags.ref || '').trim(),
          uf: '',
          lat: e.lat,
          lng: e.lon,
          free_flow,
          fonte: 'osm',
        })
      }
      return osm
    } catch (e) {
      console.log('overpass err', base, e.message)
    }
  }
  return []
}

const antt = await fetchAntt()
console.log('ANTT', antt.length)
const osm = await fetchOsm()
console.log('OSM', osm.length)
const all = [...antt, ...osm]
fs.mkdirSync(path.dirname(outPath), { recursive: true })
fs.writeFileSync(
  outPath,
  JSON.stringify({
    updated_at: new Date().toISOString(),
    count: all.length,
    pracas: all,
  }),
)
console.log('wrote', all.length, '→', outPath)
