import { formatCurrency } from './businessRules'
import type { AnttCalculo, PreferenciaRota } from './anttFrete'

export type RotaPontoAcao = {
  endereco: string
  lat?: number | null
  lng?: number | null
}

export type RotaResultadoPayload = {
  origem: string
  destino: string
  vias?: RotaPontoAcao[]
  origemCoords?: { lat: number; lng: number } | null
  destinoCoords?: { lat: number; lng: number } | null
  calc: AnttCalculo
  tipoVeiculo?: string
  idaEVolta?: boolean
  preferencia?: PreferenciaRota | string
}

const PREF_LABEL: Record<string, string> = {
  eficiente: 'Rota eficiente',
  curta: 'Rota curta',
  evitar_pedagio: 'Evitar pedágios',
}

export function rotuloPreferenciaRota(pref?: string): string {
  if (!pref) return ''
  return PREF_LABEL[pref] || pref
}

function pontoValido(lat?: number | null, lng?: number | null): boolean {
  return lat != null && lng != null && Number.isFinite(lat) && Number.isFinite(lng)
}

function pontoMaps(
  endereco: string,
  coords?: { lat: number; lng: number } | null,
  lat?: number | null,
  lng?: number | null,
): string {
  if (coords && pontoValido(coords.lat, coords.lng)) {
    return `${coords.lat},${coords.lng}`
  }
  if (pontoValido(lat, lng)) return `${lat},${lng}`
  return endereco.trim()
}

export function googleMapsDirUrl(p: RotaResultadoPayload): string | null {
  const origin = pontoMaps(p.origem, p.origemCoords)
  const dest = pontoMaps(p.destino, p.destinoCoords)
  if (!origin || !dest) return null
  const params = new URLSearchParams()
  params.set('api', '1')
  params.set('travelmode', 'driving')
  params.set('origin', origin)
  params.set('destination', dest)
  const wps = (p.vias ?? [])
    .map((v) => pontoMaps(v.endereco || '', null, v.lat, v.lng))
    .filter(Boolean)
    .slice(0, 10)
  if (wps.length) params.set('waypoints', wps.join('|'))
  return `https://www.google.com/maps/dir/?${params.toString()}`
}

export function wazeRotaUrl(p: RotaResultadoPayload): string | null {
  const o = p.origemCoords
  const d = p.destinoCoords
  if (o && d && pontoValido(o.lat, o.lng) && pontoValido(d.lat, d.lng)) {
    return `https://www.waze.com/live-map/directions?to=ll.${d.lat}%2C${d.lng}&from=ll.${o.lat}%2C${o.lng}`
  }
  if (d && pontoValido(d.lat, d.lng)) {
    return `https://www.waze.com/ul?ll=${d.lat},${d.lng}&navigate=yes`
  }
  const q = p.destino.trim()
  if (!q) return null
  return `https://www.waze.com/ul?q=${encodeURIComponent(q)}&navigate=yes`
}

export function textoCompartilharRota(p: RotaResultadoPayload): string {
  const r = p.calc.rota
  const vias = (p.vias ?? [])
    .map((v) => v.endereco.trim())
    .filter(Boolean)
    .map((v, i) => `  ${i + 1}. ${v}`)
  const linhas = [
    `Rota — Oferta de Carga`,
    `${p.origem} → ${p.destino}`,
    vias.length ? `Passagens:\n${vias.join('\n')}` : '',
    p.tipoVeiculo ? `Veículo: ${p.tipoVeiculo}` : '',
    p.idaEVolta ? 'Trecho: ida e volta' : '',
    rotuloPreferenciaRota(p.preferencia),
    `${r.distancia_km} km · ${r.duracao_label}`,
    `Pedágio ${formatCurrency(r.pedagio)} · Combustível ${formatCurrency(r.combustivel)}`,
    `Custo total ${formatCurrency(r.custo_total)}`,
    p.calc.piso_selecionado != null
      ? `Piso ANTT ${formatCurrency(p.calc.piso_selecionado)}`
      : '',
    typeof window !== 'undefined' ? window.location.href : '',
  ]
  return linhas.filter(Boolean).join('\n')
}

export async function copiarOuCompartilharRota(
  p: RotaResultadoPayload,
): Promise<{ ok: true; via: 'share' | 'clipboard' } | { ok: false; erro: string }> {
  const text = textoCompartilharRota(p)
  const title = `Rota: ${p.origem} → ${p.destino}`
  const url = typeof window !== 'undefined' ? window.location.href : undefined
  const nav = navigator as Navigator & {
    share?: (data: ShareData) => Promise<void>
    canShare?: (data?: ShareData) => boolean
  }
  if (nav.share) {
    try {
      const data: ShareData = { title, text, url }
      if (!nav.canShare || nav.canShare(data)) {
        await nav.share(data)
        return { ok: true, via: 'share' }
      }
    } catch (e) {
      if (e instanceof Error && e.name === 'AbortError') {
        return { ok: false, erro: 'Compartilhamento cancelado.' }
      }
    }
  }
  try {
    await navigator.clipboard.writeText(text)
    return { ok: true, via: 'clipboard' }
  } catch {
    return { ok: false, erro: 'Não foi possível copiar o resumo da rota.' }
  }
}

function slugArquivo(s: string): string {
  const t = s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\w]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40)
  return t || 'rota'
}

export async function exportarPlanilhaRota(p: RotaResultadoPayload) {
  const XLSX = await import('xlsx')
  const r = p.calc.rota
  const resumo = [
    ['Campo', 'Valor'],
    ['Origem', p.origem],
    ...((p.vias ?? []).map((v, i) => [`Passagem ${i + 1}`, v.endereco]) as [string, string][]),
    ['Destino', p.destino],
    ['Veículo', p.tipoVeiculo || ''],
    ['Eixos', String(p.calc.eixos)],
    ['Eixos ANTT', String(p.calc.eixos_utilizados)],
    ['Categoria', p.calc.categoria_label || ''],
    ['Trecho', p.idaEVolta ? 'Ida e volta' : 'Só ida'],
    ['Preferência', rotuloPreferenciaRota(p.preferencia)],
    ['Distância (km)', r.distancia_km],
    ['Tempo', r.duracao_label],
    ['Pedágio', r.pedagio],
    ['Pedágio / eixo', r.pedagio_por_eixo],
    ['Vale-pedágio', r.vale_pedagio ?? r.pedagio],
    ['Combustível', r.combustivel],
    ['Consumo (km/l)', r.consumo_km_l ?? ''],
    ['Diesel (R$/L)', r.preco_diesel ?? ''],
    ['Litros', r.litros ?? ''],
    ['Custo total', r.custo_total],
    ['Piso ANTT', p.calc.piso_selecionado ?? ''],
    ['Fonte', p.calc.fonte],
  ]
  const pracas = [
    ['Ordem', 'Praça', 'km', 'min', 'Valor', 'Carro', 'Free flow', 'lat', 'lng'],
    ...(r.pracas ?? [])
      .slice()
      .sort((a, b) => (a.ordem ?? a.km_ate ?? 0) - (b.ordem ?? b.km_ate ?? 0))
      .map((pr, i) => [
        pr.ordem ?? i + 1,
        pr.nome,
        pr.km_ate ?? '',
        pr.min_ate ?? '',
        pr.valor,
        pr.valor_carro ?? '',
        pr.free_flow ? 'sim' : '',
        pr.lat ?? '',
        pr.lng ?? '',
      ]),
  ]

  const wsResumo = XLSX.utils.aoa_to_sheet(resumo)
  wsResumo['!cols'] = [{ wch: 18 }, { wch: 52 }]
  const wsPracas = XLSX.utils.aoa_to_sheet(pracas)
  wsPracas['!cols'] = [
    { wch: 8 },
    { wch: 36 },
    { wch: 10 },
    { wch: 8 },
    { wch: 12 },
    { wch: 12 },
    { wch: 12 },
    { wch: 12 },
    { wch: 12 },
  ]
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, wsResumo, 'Resumo')
  XLSX.utils.book_append_sheet(wb, wsPracas, 'Pracas')
  const nome = `rota-${slugArquivo(p.origem)}-${slugArquivo(p.destino)}.xlsx`
  XLSX.writeFile(wb, nome)
}

const LOCAL_KEY = 'doca-rotas-salvas-calc'

export type RotaSalvaLocal = {
  id: string
  savedAt: string
  descricao: string
  origem: string
  destino: string
  vias: RotaPontoAcao[]
  origemCoords?: { lat: number; lng: number } | null
  destinoCoords?: { lat: number; lng: number } | null
  km: number
  custoTotal: number
}

export function salvarRotaNesteAparelho(p: RotaResultadoPayload): RotaSalvaLocal {
  const item: RotaSalvaLocal = {
    id:
      typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID()
        : `rl_${Date.now()}`,
    savedAt: new Date().toISOString(),
    descricao: `${p.origem} → ${p.destino}`.slice(0, 140),
    origem: p.origem,
    destino: p.destino,
    vias: p.vias ?? [],
    origemCoords: p.origemCoords ?? null,
    destinoCoords: p.destinoCoords ?? null,
    km: p.calc.rota.distancia_km,
    custoTotal: p.calc.rota.custo_total,
  }
  try {
    const prev = JSON.parse(localStorage.getItem(LOCAL_KEY) || '[]') as RotaSalvaLocal[]
    const lista = Array.isArray(prev) ? prev : []
    const mesma = lista.findIndex(
      (x) =>
        x.origem.trim().toLowerCase() === item.origem.trim().toLowerCase() &&
        x.destino.trim().toLowerCase() === item.destino.trim().toLowerCase(),
    )
    const next =
      mesma >= 0
        ? lista.map((x, i) => (i === mesma ? { ...item, id: x.id } : x))
        : [item, ...lista].slice(0, 40)
    localStorage.setItem(LOCAL_KEY, JSON.stringify(next))
  } catch {
    /* quota / private mode */
  }
  return item
}
