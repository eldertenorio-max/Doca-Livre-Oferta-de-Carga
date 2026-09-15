/**
 * Simula SP → Pouso Alegre e SP → Itapeva → Pouso Alegre
 * no motor Doca Livre (Valhalla/OSRM + catálogo de praças)
 * e tenta cruzar com Rotas Brasil / QualP.
 */
const UA = 'DocaLivre-validacao-rota/1.0 (diego@docalivre.com)'
const EIXOS = 6
const VALHALLA = 'https://valhalla1.openstreetmap.de/route'
const EXCLUDE_RODOANEL = [
  [-46.79, -23.4],
  [-46.72, -23.39],
  [-46.64, -23.395],
  [-46.585, -23.405],
  [-46.568, -23.43],
  [-46.575, -23.455],
  [-46.64, -23.465],
  [-46.72, -23.46],
  [-46.785, -23.478],
  [-46.798, -23.45],
]

function roundMoney(n) {
  return Math.round((n + Number.EPSILON) * 100) / 100
}

function fmtMin(min) {
  const m = Math.round(min)
  const h = Math.floor(m / 60)
  const r = m % 60
  return h ? `${h} h ${String(r).padStart(2, '0')} m` : `${r} min`
}

function calibrarDuracaoRodovia(km, duracaoMin) {
  if (km < 80 || duracaoMin <= 0) return duracaoMin
  const vel = km / (duracaoMin / 60)
  if (vel < 55 || vel >= 88) return duracaoMin
  return (km / 92) * 60
}

async function nominatim(q) {
  const url = new URL('https://nominatim.openstreetmap.org/search')
  url.searchParams.set('format', 'json')
  url.searchParams.set('limit', '1')
  url.searchParams.set('countrycodes', 'br')
  url.searchParams.set('q', q)
  const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json' } })
  if (!res.ok) throw new Error(`nominatim ${res.status}`)
  const rows = await res.json()
  if (!rows[0]) throw new Error(`sem geocode: ${q}`)
  return {
    label: rows[0].display_name,
    lat: Number(rows[0].lat),
    lng: Number(rows[0].lon),
  }
}

function decodePolyline6(encoded) {
  const out = []
  let index = 0
  let lat = 0
  let lng = 0
  while (index < encoded.length) {
    let b
    let shift = 0
    let result = 0
    do {
      b = encoded.charCodeAt(index++) - 63
      result |= (b & 0x1f) << shift
      shift += 5
    } while (b >= 0x20)
    const dlat = result & 1 ? ~(result >> 1) : result >> 1
    lat += dlat
    shift = 0
    result = 0
    do {
      b = encoded.charCodeAt(index++) - 63
      result |= (b & 0x1f) << shift
      shift += 5
    } while (b >= 0x20)
    const dlng = result & 1 ? ~(result >> 1) : result >> 1
    lng += dlng
    out.push({ lat: lat / 1e6, lng: lng / 1e6 })
  }
  return out
}

function slimLatLng(line) {
  const step = Math.max(1, Math.floor(line.length / 1200))
  return line.filter((_, i) => i % step === 0 || i === line.length - 1)
}

async function valhalla(pontos, useTolls, costing = 'truck') {
  const body = {
    locations: pontos.map((p) => ({ lat: p.lat, lon: p.lng })),
    costing,
    costing_options: { [costing]: { use_tolls: useTolls, use_highways: 1 } },
    exclude_polygons: [EXCLUDE_RODOANEL],
    shape_format: 'polyline6',
    units: 'kilometers',
  }
  let res = await fetch(VALHALLA, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'User-Agent': UA },
    body: JSON.stringify(body),
  })
  if (!res.ok && res.status === 400) {
    const { exclude_polygons, ...rest } = body
    res = await fetch(VALHALLA, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'User-Agent': UA },
      body: JSON.stringify(rest),
    })
  }
  if (!res.ok) throw new Error(`valhalla ${res.status} ${await res.text()}`)
  const data = await res.json()
  const legs = data.trip?.legs ?? []
  const line = slimLatLng(legs.flatMap((l) => (l.shape ? decodePolyline6(l.shape) : [])))
  const km = Number(data.trip?.summary?.length)
  const sec = Number(data.trip?.summary?.time)
  const durRaw = sec / 60
  const dur = calibrarDuracaoRodovia(km, durRaw)
  return { km, durRaw, dur, line, vel: km / (dur / 60) }
}

async function osrm(pontos) {
  const path = pontos.map((p) => `${p.lng},${p.lat}`).join(';')
  const url = `https://router.project-osrm.org/route/v1/driving/${path}?overview=full&geometries=geojson&alternatives=true`
  const res = await fetch(url, { headers: { 'User-Agent': UA } })
  if (!res.ok) return null
  const data = await res.json()
  const routes = (data.routes || []).map((r) => ({
    km: r.distance / 1000,
    dur: r.duration / 60,
    durCal: calibrarDuracaoRodovia(r.distance / 1000, r.duration / 60),
  }))
  routes.sort((a, b) => a.dur - b.dur)
  return routes[0] || null
}

function haversineM(a, b) {
  const R = 6371000
  const toRad = (d) => (d * Math.PI) / 180
  const dLat = toRad(b.lat - a.lat)
  const dLng = toRad(b.lng - a.lng)
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)))
}

function distPontoSegmentoM(p, a, b) {
  const toRad = (d) => (d * Math.PI) / 180
  const lat0 = toRad((a.lat + b.lat + p.lat) / 3)
  const cos = Math.cos(lat0) || 1e-6
  const x = (lng) => toRad(lng) * cos
  const y = (lat) => toRad(lat)
  const ax = x(a.lng)
  const ay = y(a.lat)
  const bx = x(b.lng)
  const by = y(b.lat)
  const px = x(p.lng)
  const py = y(p.lat)
  const dx = bx - ax
  const dy = by - ay
  const len2 = dx * dx + dy * dy
  let t = len2 === 0 ? 0 : ((px - ax) * dx + (py - ay) * dy) / len2
  t = Math.max(0, Math.min(1, t))
  return haversineM(p, {
    lat: (ay + t * dy) * (180 / Math.PI),
    lng: ((ax + t * dx) / cos) * (180 / Math.PI),
  })
}

function distPontoPolilinhaM(p, line) {
  let min = Infinity
  for (let i = 0; i < line.length - 1; i++) {
    min = Math.min(min, distPontoSegmentoM(p, line[i], line[i + 1]))
  }
  return min
}

function tarifaBaseCarro(rodovia, nome = '') {
  const r = `${rodovia} ${nome}`.toUpperCase().replace(/\s+/g, '')
  if (/SP-?280|CASTELO|SP-?270|RAPOSO/.test(r)) return 3.65
  if (/SP-?021|RODOANEL/.test(r)) return 3.5
  if (/BR-?116|DUTRA|SP-?070|AYRTON|BANDEIRANTES|SP-?348/.test(r)) return 3.8
  if (/BR-?101|BR-?040|BR-?381|SP-?330|ANHANGUERA/.test(r)) return 3.7
  if (/BR-?153|BR-?262|BR-?277|BR-?376|BR-?050/.test(r)) return 3.4
  if (/BR-?290|BR-?386|BR-?163|BR-?364/.test(r)) return 3.2
  return 3.5
}

function normTxt(s) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

function chavePraca(p) {
  const nome = normTxt(p.nome)
    .replace(/\b(free flow|ocr|portico|praca|pedagio|defasada|desativada|desativado|inativa|inativo)\b/g, ' ')
    .replace(/\b(norte|sul|leste|oeste|sentido|autopista)\b/g, ' ')
    .replace(/\b(de|da|do|das|dos)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  const conc = normTxt(p.concessionaria)
    .replace(/\b(autopista|concessionaria)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  const rod = normTxt(p.rodovia).replace(/\s+/g, '')
  return `${conc}|${rod}|${nome}`
}

function pedagioNaRota(pracas, line, eixos) {
  const RAIO_M = 250
  const DEDUPE_M = 500
  const DEDUPE_OSM_ANTT_M = 2500
  const cands = []
  for (const p of pracas) {
    const d = distPontoPolilinhaM({ lat: p.lat, lng: p.lng }, line)
    if (d <= RAIO_M) cands.push({ ...p, dist: d })
  }
  cands.sort((a, b) => {
    const ff = (x) => (/free.?flow|p[oó]rtico/i.test(`${x.nome} ${x.rodovia}`) || x.free_flow ? 1 : 0)
    const osm = (x) => (x.fonte === 'osm' ? 1 : 0)
    return ff(a) - ff(b) || osm(a) - osm(b) || a.dist - b.dist
  })
  const kept = []
  const chaves = new Set()
  for (const h of cands) {
    if (h.free_flow || /free.?flow|p[oó]rtico/i.test(`${h.nome} ${h.rodovia}`)) continue
    if (/\b(defasada|desativad|inativa|inativo)\b/i.test(h.nome || '')) continue
    const isOsm = h.fonte === 'osm'
    if (isOsm && h.dist > 160) continue
    const key = chavePraca(h)
    if (key && chaves.has(key)) continue
    const dup = kept.find((x) => {
      const d = haversineM(x, h)
      const lim = isOsm && x.fonte !== 'osm' ? DEDUPE_OSM_ANTT_M : DEDUPE_M
      return d < lim
    })
    if (dup) continue
    kept.push(h)
    if (key) chaves.add(key)
  }
  const detalhe = kept.map((p) => {
    const base = tarifaBaseCarro(p.rodovia, p.nome)
    return {
      nome: p.nome,
      rodovia: p.rodovia,
      uf: p.uf,
      fonte: p.fonte,
      valor: roundMoney(base * eixos),
      carro: base,
    }
  })
  const total = roundMoney(detalhe.reduce((s, p) => s + p.valor, 0))
  return { total, porEixo: roundMoney(total / eixos), detalhe }
}

async function tryJson(label, url, init) {
  try {
    const res = await fetch(url, {
      ...init,
      headers: { Accept: 'application/json', 'User-Agent': UA, ...(init?.headers || {}) },
    })
    const text = await res.text()
    let json = null
    try {
      json = JSON.parse(text)
    } catch {
      json = { raw: text.slice(0, 400) }
    }
    return { label, status: res.status, json }
  } catch (e) {
    return { label, error: e instanceof Error ? e.message : String(e) }
  }
}

async function main() {
  console.log('Geocodificando...')
  const [sp, pa, itaSp, itaMg] = await Promise.all([
    nominatim('São Paulo, SP, Brasil'),
    nominatim('Pouso Alegre, MG, Brasil'),
    nominatim('Itapeva, SP, Brasil'),
    nominatim('Itapeva, MG, Brasil'),
  ])
  console.log('SP', sp)
  console.log('Pouso Alegre', pa)
  console.log('Itapeva-SP', itaSp)
  console.log('Itapeva-MG (Fernão Dias)', itaMg)

  const fs = await import('node:fs')
  const cat = JSON.parse(
    fs.readFileSync(new URL('../public/data/pracas-pedagio.json', import.meta.url), 'utf8'),
  )
  const pracas = Array.isArray(cat.pracas) ? cat.pracas : cat

  const cenarios = [
    { nome: 'São Paulo → Pouso Alegre', pts: [sp, pa] },
    { nome: 'São Paulo → Itapeva-MG → Pouso Alegre (na Fernão Dias)', pts: [sp, itaMg, pa] },
    { nome: 'São Paulo → Itapeva-SP → Pouso Alegre (desvio)', pts: [sp, itaSp, pa] },
  ]

  for (const c of cenarios) {
    console.log('\n========== ' + c.nome + ' ==========')
    const vTruck = await valhalla(c.pts, 0.5, 'truck')
    const vAuto = await valhalla(c.pts, 0.5, 'auto')
    const o = await osrm(c.pts)
    const pedTruck = pedagioNaRota(pracas, vTruck.line, EIXOS)
    const pedAuto2 = pedagioNaRota(pracas, vAuto.line, 2)
    console.log('Doca Livre (Valhalla truck, 6 eixos, rota eficiente):')
    console.log({
      km: Number(vTruck.km.toFixed(1)),
      tempo_bruto: fmtMin(vTruck.durRaw),
      tempo_calibrado: fmtMin(vTruck.dur),
      vel_calibrada: `${vTruck.vel.toFixed(1)} km/h`,
      pedagio_6eixos: pedTruck.total,
      pedagio_por_eixo: pedTruck.porEixo,
      pracas: pedTruck.detalhe.length,
    })
    console.log(
      'Praças:',
      pedTruck.detalhe.map((p) => `${p.nome} (${p.rodovia}/${p.uf}) R$ ${p.valor}`).join(' | ') || '(nenhuma)',
    )
    console.log('Valhalla auto (carro):', {
      km: Number(vAuto.km.toFixed(1)),
      tempo_calibrado: fmtMin(vAuto.dur),
      pedagio_2eixos: pedAuto2.total,
      pracas: pedAuto2.detalhe.length,
    })
    if (o) {
      console.log('OSRM (referência OSM carro):', {
        km: Number(o.km.toFixed(1)),
        tempo: fmtMin(o.dur),
        tempo_calibrado: fmtMin(o.durCal),
      })
    }
  }

  const ptsRB = `${sp.lng},${sp.lat};${pa.lng},${pa.lat}`
  const ptsRBVia = `${sp.lng},${sp.lat};${itaSp.lng},${itaSp.lat};${pa.lng},${pa.lat}`
  const rbUrls = [
    `https://rotasbrasil.com.br/apiRotas/enderecos/?pontos=sao paulo,sao paulo;pouso alegre,minas gerais&veiculo=caminhao&eixo=6&paradas=true`,
    `https://rotasbrasil.com.br/apiRotas/coordenadas/?pontos=${ptsRB}&veiculo=caminhao&eixo=6&paradas=true`,
    `https://rotasbrasil.com.br/apiRotas/coordenadas/?pontos=${ptsRBVia}&veiculo=caminhao&eixo=6&paradas=true`,
    `https://rotasbrasil.com.br/apiRotas/enderecos/?pontos=sao paulo,sao paulo;itapeva,sao paulo;pouso alegre,minas gerais&veiculo=caminhao&eixo=6&paradas=true`,
  ]
  console.log('\n========== Rotas Brasil API ==========')
  for (const u of rbUrls) {
    const r = await tryJson(u.slice(0, 90), u)
    const j = r.json
    const resumo = j?.rotas?.[0]
      ? {
          distancia: j.rotas[0].distancia,
          duracao: j.rotas[0].duracao,
          valorPedagio: j.rotas[0].valorPedagio,
          pedagios: (j.rotas[0].pedagios || []).map((p) => `${p.praca} ${p.valor}`),
          via: j.rotas[0].via,
          erro: j.erro || j.message || j.msg,
        }
      : { status: r.status, keys: j && typeof j === 'object' ? Object.keys(j).slice(0, 12) : [], preview: JSON.stringify(j).slice(0, 280) }
    console.log(r.label, r.status || r.error, JSON.stringify(resumo, null, 0))
  }

  console.log('\n========== QualP tentativas ==========')
  const qp = [
    await tryJson('qualp rotas v4', 'https://api.qualp.com.br/rotas/v4', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        locations: [
          { address: 'São Paulo, SP' },
          { address: 'Pouso Alegre, MG' },
        ],
        vehicle: { type: 'truck', axles: 6 },
      }),
    }),
    await tryJson('app.qualp', 'https://app.qualp.com.br/'),
  ]
  for (const r of qp) {
    console.log(r.label, r.status || r.error, JSON.stringify(r.json).slice(0, 240))
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
