import { jsPDF } from 'jspdf'
import { formatCnpj } from './cnpj'
import { formatPhoneBr } from './phoneBr'
import { LOGO_DOCA_LIVRE_SRC } from './brandAssets'
import { TABELAS_ANTT } from './anttCoeficientes'
import type { AnttInfoCarga, PontoPassagemRota } from '../types'

export type CargaPdfData = {
  numero: string
  pedido?: string
  origem: string
  destino: string
  origemLat?: number | null
  origemLng?: number | null
  destinoLat?: number | null
  destinoLng?: number | null
  pontosPassagem?: PontoPassagemRota[]
  classificacao?: string
  tipoCarga?: string
  veiculo?: string
  carrocerias?: string[]
  complemento?: string
  gerenciamentoRisco?: string
  cargaRetorno?: boolean
  retornaOrigem?: boolean
  remetente?: string
  remetenteCnpj?: string
  destinatario?: string
  destinatarioCnpj?: string
  destinatarioWhatsapp?: string | null
  destinatarioEmail?: string | null
  peso?: number
  volumes?: number
  numEntregas?: number
  valorMercadorias?: number
  freteTabela?: number
  dataCarregamentoIso?: string
  previsaoEntregaIso?: string
  observacao?: string
  antt?: AnttInfoCarga | null
  consumoSugeridoKmL?: number
  precoDieselSugerido?: number
  mapaDataUrl?: string | null
  /** Nome da rota cadastrada, se houver. */
  rotaNome?: string
}

type LogoInfo = { dataUrl: string; width: number; height: number }
let logoPromise: Promise<LogoInfo | null> | null = null

/** Busca e converte a logo (asset do Vite) em data URL, cacheada em memória. */
function carregarLogo(): Promise<LogoInfo | null> {
  if (typeof window === 'undefined') return Promise.resolve(null)
  if (!logoPromise) {
    logoPromise = (async () => {
      try {
        const res = await fetch(LOGO_DOCA_LIVRE_SRC)
        const blob = await res.blob()
        const dataUrl = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader()
          reader.onload = () => resolve(String(reader.result))
          reader.onerror = () => reject(reader.error)
          reader.readAsDataURL(blob)
        })
        const dims = await new Promise<{ width: number; height: number }>((resolve, reject) => {
          const img = new Image()
          img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight })
          img.onerror = () => reject(new Error('logo'))
          img.src = dataUrl
        })
        return { dataUrl, width: dims.width || 1, height: dims.height || 1 }
      } catch {
        return null
      }
    })()
  }
  return logoPromise
}

const COR_MARCA: [number, number, number] = [249, 219, 0]
const COR_MARCA_ESCURA: [number, number, number] = [176, 148, 0]
const COR_PRETO: [number, number, number] = [10, 10, 10]
const COR_TEXTO: [number, number, number] = [24, 24, 24]
const COR_LABEL: [number, number, number] = [110, 112, 118]
const COR_LINHA: [number, number, number] = [228, 229, 233]
const COR_FUNDO_CARD: [number, number, number] = [250, 250, 251]

function moeda(v?: number | null): string {
  if (v == null || !Number.isFinite(v) || v <= 0) return '—'
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function numero(v?: number | null): string {
  if (v == null || !Number.isFinite(v)) return '—'
  return v.toLocaleString('pt-BR')
}

function dataBr(iso?: string): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleDateString('pt-BR')
}

function corClassificacao(c?: string): [number, number, number] {
  if (c === 'A') return [16, 150, 100]
  if (c === 'B') return [217, 141, 20]
  return [176, 148, 0]
}

type MapaPontoTipo = 'origem' | 'parada' | 'destino' | 'od'

type MapaPonto = {
  label: string
  lat: number
  lng: number
  nome: string
  tipo: MapaPontoTipo
}

export type CapturaMapaOpts = {
  origemLat?: number | null
  origemLng?: number | null
  destinoLat?: number | null
  destinoLng?: number | null
  origemNome?: string
  destinoNome?: string
  pontosPassagem?: PontoPassagemRota[]
}

function cidadeDoEndereco(endereco?: string): string {
  const parts = (endereco || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
  if (parts.length >= 2) return parts[parts.length - 2] || parts[parts.length - 1]
  return parts[0] || ''
}

function mesmaCoord(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
  tol = 0.00035,
): boolean {
  return Math.abs(a.lat - b.lat) < tol && Math.abs(a.lng - b.lng) < tol
}

function pontosDoMapa(opts?: CapturaMapaOpts): MapaPonto[] {
  const oNome = cidadeDoEndereco(opts?.origemNome) || 'Origem'
  const dNome = cidadeDoEndereco(opts?.destinoNome) || 'Destino'
  const origem =
    opts?.origemLat != null &&
    opts?.origemLng != null &&
    Number.isFinite(opts.origemLat) &&
    Number.isFinite(opts.origemLng)
      ? {
          label: 'O',
          lat: Number(opts.origemLat),
          lng: Number(opts.origemLng),
          nome: `Origem · ${oNome}`,
          tipo: 'origem' as const,
        }
      : null
  const paradas: MapaPonto[] = []
  for (const [i, p] of (opts?.pontosPassagem ?? []).entries()) {
    if (p.lat == null || p.lng == null || !Number.isFinite(p.lat) || !Number.isFinite(p.lng)) {
      continue
    }
    const cid = cidadeDoEndereco(p.endereco)
    paradas.push({
      label: String(paradas.length + 1),
      lat: Number(p.lat),
      lng: Number(p.lng),
      nome: cid ? `Parada ${paradas.length + 1} · ${cid}` : `Parada ${paradas.length + 1}`,
      tipo: 'parada',
    })
  }
  const destino =
    opts?.destinoLat != null &&
    opts?.destinoLng != null &&
    Number.isFinite(opts.destinoLat) &&
    Number.isFinite(opts.destinoLng)
      ? {
          label: 'D',
          lat: Number(opts.destinoLat),
          lng: Number(opts.destinoLng),
          nome: `Destino · ${dNome}`,
          tipo: 'destino' as const,
        }
      : null

  if (origem && destino && mesmaCoord(origem, destino)) {
    return [
      {
        label: 'O/D',
        lat: origem.lat,
        lng: origem.lng,
        nome: `Origem e destino · ${oNome}`,
        tipo: 'od',
      },
      ...paradas,
    ]
  }
  return [origem, ...paradas, destino].filter(Boolean) as MapaPonto[]
}

function corPino(tipo: MapaPontoTipo): string {
  if (tipo === 'origem') return '#16a34a'
  if (tipo === 'destino') return '#dc2626'
  if (tipo === 'od') return '#0f766e'
  return '#2563eb'
}

function lon2tile(lon: number, z: number) {
  return ((lon + 180) / 360) * 2 ** z
}

function lat2tile(lat: number, z: number) {
  const rad = (lat * Math.PI) / 180
  return (
    ((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) * 2 ** z
  )
}

function loadTileImg(url: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    const t = window.setTimeout(() => resolve(null), 9000)
    img.onload = () => {
      window.clearTimeout(t)
      resolve(img)
    }
    img.onerror = () => {
      window.clearTimeout(t)
      resolve(null)
    }
    img.src = url
  })
}

function roundRectPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  const rr = Math.min(r, w / 2, h / 2)
  ctx.beginPath()
  ctx.moveTo(x + rr, y)
  ctx.arcTo(x + w, y, x + w, y + h, rr)
  ctx.arcTo(x + w, y + h, x, y + h, rr)
  ctx.arcTo(x, y + h, x, y, rr)
  ctx.arcTo(x, y, x + w, y, rr)
  ctx.closePath()
}

async function polylineDaRota(
  pts: MapaPonto[],
): Promise<Array<{ lat: number; lng: number }>> {
  const o = pts.find((p) => p.tipo === 'origem' || p.tipo === 'od')
  const d = pts.find((p) => p.tipo === 'destino' || p.tipo === 'od')
  const vias = pts.filter((p) => p.tipo === 'parada')
  if (!o || !d) return pts
  try {
    const { rotaOsrmComGeometria } = await import('./anttPedagioAberto')
    const rota = await rotaOsrmComGeometria(
      { lat: o.lat, lng: o.lng },
      { lat: d.lat, lng: d.lng },
      { waypoints: vias.map((v) => ({ lat: v.lat, lng: v.lng })) },
    )
    if (rota?.polyline && rota.polyline.length > 2) return rota.polyline
  } catch {
    /* usa segmentos entre paradas */
  }
  return pts
}

/** Mapa real (tiles CARTO/OSM) com pinos e nomes das paradas. */
async function gerarMapaEstatico(pts: MapaPonto[]): Promise<string | null> {
  if (typeof document === 'undefined' || pts.length === 0) return null
  const W = 960
  const H = 520
  const TILE = 256
  const line = await polylineDaRota(pts)
  const lats = [...pts.map((p) => p.lat), ...line.map((p) => p.lat)]
  const lngs = [...pts.map((p) => p.lng), ...line.map((p) => p.lng)]
  let minLat = Math.min(...lats)
  let maxLat = Math.max(...lats)
  let minLng = Math.min(...lngs)
  let maxLng = Math.max(...lngs)
  const padLat = Math.max((maxLat - minLat) * 0.28, 0.018)
  const padLng = Math.max((maxLng - minLng) * 0.32, 0.018)
  minLat -= padLat
  maxLat += padLat
  minLng -= padLng
  maxLng += padLng

  let z = 14
  for (; z >= 6; z--) {
    const w = (lon2tile(maxLng, z) - lon2tile(minLng, z)) * TILE
    const h = (lat2tile(minLat, z) - lat2tile(maxLat, z)) * TILE
    const nx = Math.ceil(w / TILE) + 2
    const ny = Math.ceil(h / TILE) + 2
    if (nx * ny <= 20 && w < W * 1.4 && h < H * 1.4) break
  }

  const cx = (lon2tile(minLng, z) + lon2tile(maxLng, z)) / 2
  const cy = (lat2tile(minLat, z) + lat2tile(maxLat, z)) / 2
  const tlX = cx - W / 2 / TILE
  const tlY = cy - H / 2 / TILE
  const x0 = Math.floor(tlX)
  const y0 = Math.floor(tlY)
  const x1 = Math.ceil(tlX + W / TILE)
  const y1 = Math.ceil(tlY + H / TILE)
  const n = 2 ** z

  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext('2d')
  if (!ctx) return null
  ctx.fillStyle = '#e8eef3'
  ctx.fillRect(0, 0, W, H)

  const jobs: Promise<void>[] = []
  for (let tx = x0; tx <= x1; tx++) {
    for (let ty = y0; ty <= y1; ty++) {
      if (ty < 0 || ty >= n) continue
      const wx = ((tx % n) + n) % n
      const url = `https://tile.openstreetmap.org/${z}/${wx}/${ty}.png`
      jobs.push(
        loadTileImg(url).then((img) => {
          if (!img) return
          ctx.drawImage(img, (tx - tlX) * TILE, (ty - tlY) * TILE, TILE, TILE)
        }),
      )
    }
  }
  await Promise.all(jobs)

  function toPx(lat: number, lng: number) {
    return {
      x: (lon2tile(lng, z) - tlX) * TILE,
      y: (lat2tile(lat, z) - tlY) * TILE,
    }
  }

  const pxLine = line.map((p) => toPx(p.lat, p.lng))
  if (pxLine.length >= 2) {
    ctx.lineJoin = 'round'
    ctx.lineCap = 'round'
    ctx.strokeStyle = 'rgba(255,255,255,0.95)'
    ctx.lineWidth = 8
    ctx.beginPath()
    pxLine.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)))
    ctx.stroke()
    ctx.strokeStyle = '#2563eb'
    ctx.lineWidth = 4.5
    ctx.beginPath()
    pxLine.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)))
    ctx.stroke()
  }

  const pins = pts.map((p, i) => {
    const { x, y } = toPx(p.lat, p.lng)
    return { ...p, x, y, lado: i % 2 === 0 ? 1 : -1 }
  })

  pins.forEach((p) => {
    const color = corPino(p.tipo)
    const r = 13
    ctx.save()
    ctx.shadowColor = 'rgba(0,0,0,0.35)'
    ctx.shadowBlur = 5
    ctx.shadowOffsetY = 2
    ctx.beginPath()
    ctx.arc(p.x, p.y, r, 0, Math.PI * 2)
    ctx.fillStyle = color
    ctx.fill()
    ctx.shadowColor = 'transparent'
    ctx.lineWidth = 3
    ctx.strokeStyle = '#fff'
    ctx.stroke()
    ctx.fillStyle = '#fff'
    ctx.font = 'bold 12px system-ui,sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(p.label, p.x, p.y + 0.5)
    ctx.restore()

    ctx.font = 'bold 12px system-ui,sans-serif'
    const padX = 8
    const tw = Math.min(ctx.measureText(p.nome).width, 220)
    const chipW = tw + padX * 2
    const chipH = 22
    let bx = p.lado > 0 ? p.x + 18 : p.x - 18 - chipW
    let by = p.y - 36
    if (bx < 8) bx = 8
    if (bx + chipW > W - 8) bx = W - 8 - chipW
    if (by < 8) by = p.y + 18
    ctx.fillStyle = 'rgba(255,255,255,0.96)'
    ctx.strokeStyle = color
    ctx.lineWidth = 1.6
    roundRectPath(ctx, bx, by, chipW, chipH, 6)
    ctx.fill()
    ctx.stroke()
    ctx.fillStyle = '#1c1917'
    ctx.textAlign = 'left'
    ctx.textBaseline = 'middle'
    ctx.fillText(p.nome, bx + padX, by + chipH / 2, tw)
  })

  ctx.fillStyle = 'rgba(255,255,255,0.92)'
  roundRectPath(ctx, 8, H - 26, 268, 18, 4)
  ctx.fill()
  ctx.fillStyle = '#64748b'
  ctx.font = '10px sans-serif'
  ctx.textAlign = 'left'
  ctx.textBaseline = 'alphabetic'
  ctx.fillText('© OpenStreetMap · © CARTO', 14, H - 13)

  return canvas.toDataURL('image/jpeg', 0.9)
}

function canvasQuaseEmBranco(canvas: HTMLCanvasElement): boolean {
  const ctx = canvas.getContext('2d')
  if (!ctx) return true
  const { width, height } = canvas
  if (width < 20 || height < 20) return true
  const data = ctx.getImageData(0, 0, width, height).data
  let claros = 0
  let n = 0
  for (let i = 0; i < data.length; i += 64) {
    n += 1
    if (data[i] > 242 && data[i + 1] > 242 && data[i + 2] > 242) claros += 1
  }
  return n > 0 && claros / n > 0.9
}

/** Gera mapa estático com paradas e trajeto pela rodovia (melhor no PDF). */
export async function capturarMapaCarga(opts?: CapturaMapaOpts): Promise<string | null> {
  if (typeof document === 'undefined') return null
  const pts = pontosDoMapa(opts)
  const estatico = await gerarMapaEstatico(pts)
  if (estatico) return estatico

  const el = document.querySelector('.rota-map-preview') as HTMLElement | null
  if (el && el.offsetWidth >= 40 && el.offsetHeight >= 40) {
    try {
      const html2canvas = (await import('html2canvas')).default
      const canvas = await html2canvas(el, {
        useCORS: true,
        allowTaint: false,
        backgroundColor: '#eef1f4',
        scale: 2,
        logging: false,
        ignoreElements: (node) =>
          node instanceof HTMLElement &&
          (node.hasAttribute('data-pdf-ignore') ||
            node.classList.contains('leaflet-control-container')),
      })
      if (!canvasQuaseEmBranco(canvas)) {
        return canvas.toDataURL('image/jpeg', 0.88)
      }
    } catch {
      /* captura da tela indisponível */
    }
  }
  return null
}

/** Gera o PDF da carga em memória (client-side, sem backend). */
export async function gerarPdfCarga(
  data: CargaPdfData,
): Promise<{ blob: Blob; filename: string }> {
  const doc = new jsPDF({ unit: 'pt', format: 'a4' })
  const pageW = doc.internal.pageSize.getWidth()
  const pageH = doc.internal.pageSize.getHeight()
  const marginX = 42
  const bottomLimit = pageH - 58
  let y = 0
  let paginaTemCabecalho = false

  function novaPagina() {
    doc.addPage()
    paginaTemCabecalho = false
    y = 40
    cabecalhoContinuacao()
  }

  function ensureSpace(h: number) {
    if (y + h > bottomLimit) novaPagina()
  }

  function cabecalhoContinuacao() {
    if (paginaTemCabecalho) return
    paginaTemCabecalho = true
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(9.5)
    doc.setTextColor(...COR_LABEL)
    doc.text(`CARGA ${data.numero || ''}`.trim(), marginX, y)
    doc.setDrawColor(...COR_LINHA)
    doc.setLineWidth(0.7)
    doc.line(marginX, y + 6, pageW - marginX, y + 6)
    y += 26
  }

  function tituloSecao(titulo: string): number {
    ensureSpace(30)
    const boxStartY = y - 12
    doc.setFillColor(...COR_MARCA)
    doc.rect(marginX, y - 10, 4, 13, 'F')
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(11)
    doc.setTextColor(...COR_PRETO)
    doc.text(titulo.toUpperCase(), marginX + 11, y)
    y += 12
    doc.setDrawColor(...COR_LINHA)
    doc.setLineWidth(0.8)
    doc.line(marginX, y, pageW - marginX, y)
    y += 16
    return boxStartY
  }

  function fecharSecao(boxStartY: number, paginaInicio: number) {
    y += 4
    if (doc.getNumberOfPages() === paginaInicio) {
      doc.setDrawColor(...COR_LINHA)
      doc.setLineWidth(0.8)
      doc.roundedRect(
        marginX - 10,
        boxStartY,
        pageW - marginX * 2 + 20,
        y - boxStartY - 2,
        5,
        5,
        'S',
      )
    }
    y += 20
  }

  function secao(titulo: string, render: () => void) {
    const paginaInicio = doc.getNumberOfPages()
    const boxStartY = tituloSecao(titulo)
    render()
    fecharSecao(boxStartY, paginaInicio)
  }

  function linha(label: string, valor: string) {
    ensureSpace(16)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(9)
    doc.setTextColor(...COR_LABEL)
    doc.text(label.toUpperCase(), marginX, y)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(10.5)
    doc.setTextColor(...COR_TEXTO)
    const maxW = pageW - marginX * 2 - 150
    const linhas = doc.splitTextToSize(valor || '—', maxW)
    doc.text(linhas, marginX + 150, y)
    y += Math.max(15, linhas.length * 12 + 3)
  }

  function linhasDuplas(a: [string, string], b: [string, string]) {
    ensureSpace(28)
    const half = (pageW - marginX * 2) / 2
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(9)
    doc.setTextColor(...COR_LABEL)
    doc.text(a[0].toUpperCase(), marginX, y)
    if (b[0]) doc.text(b[0].toUpperCase(), marginX + half, y)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(10.5)
    doc.setTextColor(...COR_TEXTO)
    doc.text(a[1] || '—', marginX, y + 14)
    if (b[0]) doc.text(b[1] || '—', marginX + half, y + 14)
    y += 30
  }

  function linhaClassificacao(classificacao?: string, veiculo?: string) {
    ensureSpace(28)
    const half = (pageW - marginX * 2) / 2
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(9)
    doc.setTextColor(...COR_LABEL)
    doc.text('CLASSIFICAÇÃO', marginX, y)
    doc.text('VEÍCULO', marginX + half, y)
    const cor = corClassificacao(classificacao)
    const label = classificacao ? `ROTA ${classificacao}` : '—'
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(9.5)
    const w = doc.getTextWidth(label) + 14
    doc.setFillColor(...cor)
    doc.roundedRect(marginX, y + 5, w, 15, 3, 3, 'F')
    doc.setTextColor(255, 255, 255)
    doc.text(label, marginX + 7, y + 15.5)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(10.5)
    doc.setTextColor(...COR_TEXTO)
    doc.text(veiculo || '—', marginX + half, y + 14)
    y += 30
  }

  const contentW = pageW - marginX * 2
  const antt = data.antt
  const rota = antt?.rota
  const tabelaAntt =
    TABELAS_ANTT.find((t) => t.id === antt?.tabela)?.label ||
    (antt?.tabela ? `Tabela ${antt.tabela}` : '—')
  const kml = rota?.consumo_km_l ?? data.consumoSugeridoKmL
  const diesel = rota?.preco_diesel ?? data.precoDieselSugerido
  const litros =
    rota?.litros ??
    (rota?.distancia_km && kml && kml > 0
      ? Math.round((rota.distancia_km / kml) * 10) / 10
      : null)
  const formulaComb =
    rota?.distancia_km && kml && diesel
      ? `${String(rota.distancia_km).replace('.', ',')} km ÷ ${String(kml).replace('.', ',')} km/l = ${String(litros ?? '—').replace('.', ',')} L × ${moeda(diesel)}`
      : ''

  function kpis(items: { label: string; value: string }[]) {
    const cols = 3
    const gap = 7
    const w = (contentW - gap * (cols - 1)) / cols
    const h = 44
    items.forEach((it, i) => {
      const col = i % cols
      if (col === 0) {
        if (i > 0) y += h + gap
        ensureSpace(h + 10)
      }
      const x = marginX + col * (w + gap)
      doc.setFillColor(252, 252, 253)
      doc.setDrawColor(...COR_LINHA)
      doc.setLineWidth(0.55)
      doc.roundedRect(x, y, w, h, 4, 4, 'FD')
      doc.setFillColor(...COR_MARCA)
      doc.rect(x, y + 5, 3.2, h - 10, 'F')
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(6.5)
      doc.setTextColor(...COR_LABEL)
      doc.text(it.label.toUpperCase(), x + 10, y + 15)
      doc.setFontSize(10.5)
      doc.setTextColor(...COR_PRETO)
      const val = doc.splitTextToSize(it.value || '—', w - 16)
      doc.text(val[0], x + 10, y + 32)
    })
    y += h + 12
  }

  function tabela2(headers: [string, string], rows: [string, string][]) {
    if (rows.length === 0) return
    const rowH = 15
    const headH = 16
    ensureSpace(headH + rows.length * rowH + 10)
    doc.setFillColor(...COR_PRETO)
    doc.roundedRect(marginX, y, contentW, headH, 2, 2, 'F')
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(7.5)
    doc.setTextColor(255, 255, 255)
    doc.text(headers[0].toUpperCase(), marginX + 8, y + 11)
    doc.text(headers[1].toUpperCase(), marginX + contentW - 8, y + 11, { align: 'right' })
    y += headH
    rows.forEach((row, ri) => {
      if (ri % 2 === 0) {
        doc.setFillColor(...COR_FUNDO_CARD)
        doc.rect(marginX, y, contentW, rowH, 'F')
      }
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(8.5)
      doc.setTextColor(...COR_TEXTO)
      const left = doc.splitTextToSize(row[0], contentW * 0.68)
      doc.text(left[0], marginX + 8, y + 11)
      doc.setFont('helvetica', 'bold')
      doc.text(row[1], marginX + contentW - 8, y + 11, { align: 'right' })
      y += rowH
    })
    y += 10
  }

  // ---- Cabeçalho (só na 1ª página) ----
  const logo = await carregarLogo()
  y = 36
  if (logo) {
    const logoH = 28
    const logoW = (logo.width / logo.height) * logoH
    doc.addImage(logo.dataUrl, 'PNG', marginX, y - 18, logoW, logoH)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(9)
    doc.setTextColor(...COR_PRETO)
    doc.text('Oferta de Carga', marginX + logoW + 10, y - 2)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8)
    doc.setTextColor(...COR_LABEL)
    doc.text('Documento da carga para o transportador', marginX + logoW + 10, y + 11)
  } else {
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(16)
    doc.setTextColor(...COR_MARCA_ESCURA)
    doc.text('DOCA LIVRE', marginX, y)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(9)
    doc.setTextColor(...COR_LABEL)
    doc.text('Oferta de Carga', marginX + 108, y)
  }
  const agora = new Date()
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8)
  doc.setTextColor(...COR_LABEL)
  doc.text(
    `${agora.toLocaleDateString('pt-BR')} ${agora.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`,
    pageW - marginX,
    y + 4,
    { align: 'right' },
  )
  y += 22
  doc.setFillColor(...COR_MARCA)
  doc.rect(marginX, y, contentW, 3, 'F')
  y += 12

  const barH = 34
  doc.setFillColor(...COR_PRETO)
  doc.roundedRect(marginX, y, contentW, barH, 5, 5, 'F')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(13)
  doc.setTextColor(255, 255, 255)
  doc.text(`Carga ${data.numero || ''}`.trim(), marginX + 12, y + 21)
  let bx = marginX + 12 + doc.getTextWidth(`Carga ${data.numero || ''}`.trim()) + 14
  if (data.pedido) {
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(9)
    doc.setTextColor(210, 210, 210)
    doc.text(`Pedido ${data.pedido}`, bx, y + 21)
  }
  if (data.classificacao) {
    const lab = `ROTA ${data.classificacao}`
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(8)
    const bw = doc.getTextWidth(lab) + 14
    const cor = corClassificacao(data.classificacao)
    doc.setFillColor(...cor)
    doc.roundedRect(pageW - marginX - bw - 10, y + 9, bw, 16, 3, 3, 'F')
    doc.setTextColor(255, 255, 255)
    doc.text(lab, pageW - marginX - bw - 3, y + 20)
  }
  y += barH + 16
  paginaTemCabecalho = true

  // ---- Rota ----
  secao('Rota', () => {
    const colW = (contentW - 10) / 2
    const boxH = 58
    ensureSpace(boxH + 8)
    doc.setFillColor(255, 255, 255)
    doc.setDrawColor(...COR_LINHA)
    doc.roundedRect(marginX, y, colW, boxH, 4, 4, 'S')
    doc.setFillColor(22, 163, 74)
    doc.rect(marginX, y, 4, boxH, 'F')
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(7)
    doc.setTextColor(...COR_LABEL)
    doc.text('ORIGEM', marginX + 12, y + 13)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(9)
    doc.setTextColor(...COR_TEXTO)
    doc.text(doc.splitTextToSize(data.origem || '—', colW - 20).slice(0, 3), marginX + 12, y + 26)

    doc.setDrawColor(...COR_LINHA)
    doc.roundedRect(marginX + colW + 10, y, colW, boxH, 4, 4, 'S')
    doc.setFillColor(220, 38, 38)
    doc.rect(marginX + colW + 10, y, 4, boxH, 'F')
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(7)
    doc.setTextColor(...COR_LABEL)
    doc.text('DESTINO', marginX + colW + 22, y + 13)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(9)
    doc.setTextColor(...COR_TEXTO)
    doc.text(
      doc.splitTextToSize(data.destino || '—', colW - 20).slice(0, 3),
      marginX + colW + 22,
      y + 26,
    )
    y += boxH + 10

    if (data.rotaNome) {
      linha('Rota cadastrada', data.rotaNome)
    }
    const vias = data.pontosPassagem ?? []
    if (vias.length > 0) {
      linha(
        vias.length === 1 ? 'Parada' : `Paradas (${vias.length})`,
        vias
          .map((p, i) => {
            const end = (p.endereco || '').trim() || `Parada ${i + 1}`
            return `${i + 1}) ${end}`
          })
          .join('\n'),
      )
    }
    linhasDuplas(
      ['Veículo', data.veiculo || '—'],
      ['Carroceria', (data.carrocerias ?? []).join(', ') || '—'],
    )
    linhasDuplas(
      ['Retorna p/ origem', data.retornaOrigem ? 'Sim' : 'Não'],
      ['Carga retorno', data.cargaRetorno ? 'Sim' : 'Não'],
    )
  })

  // ---- Mapa ----
  secao('Mapa da rota', () => {
    const mapW = contentW
    if (data.mapaDataUrl) {
      const imgH = 208
      ensureSpace(imgH + 8)
      try {
        doc.addImage(data.mapaDataUrl, 'JPEG', marginX, y, mapW, imgH)
        y += imgH + 8
        doc.setFont('helvetica', 'normal')
        doc.setFontSize(7.5)
        doc.setTextColor(...COR_LABEL)
        doc.text(
          'O = origem · números = paradas · D = destino · O/D = origem e destino (retorno)',
          marginX,
          y,
        )
        y += 10
        return
      } catch {
        /* cai no esquema */
      }
    }

    const pts: { label: string; lat: number; lng: number }[] = []
    if (data.origemLat != null && data.origemLng != null && Number.isFinite(data.origemLat)) {
      pts.push({ label: 'O', lat: data.origemLat, lng: data.origemLng })
    }
    for (const [i, p] of (data.pontosPassagem ?? []).entries()) {
      if (p.lat != null && p.lng != null && Number.isFinite(p.lat) && Number.isFinite(p.lng)) {
        pts.push({ label: String(i + 1), lat: p.lat, lng: p.lng })
      }
    }
    if (data.destinoLat != null && data.destinoLng != null && Number.isFinite(data.destinoLat)) {
      pts.push({ label: 'D', lat: data.destinoLat, lng: data.destinoLng })
    }

    if (pts.length >= 2) {
      const mapH = 168
      ensureSpace(mapH + 8)
      const lats = pts.map((p) => p.lat)
      const lngs = pts.map((p) => p.lng)
      const minLat = Math.min(...lats)
      const maxLat = Math.max(...lats)
      const minLng = Math.min(...lngs)
      const maxLng = Math.max(...lngs)
      const dLat = Math.max(maxLat - minLat, 0.04)
      const dLng = Math.max(maxLng - minLng, 0.04)
      const pad = 0.12
      function xy(lat: number, lng: number) {
        const x = marginX + 18 + ((lng - minLng + dLng * pad) / (dLng * (1 + pad * 2))) * (mapW - 36)
        const yy = y + 18 + (1 - (lat - minLat + dLat * pad) / (dLat * (1 + pad * 2))) * (mapH - 36)
        return { x, y: yy }
      }
      doc.setFillColor(...COR_FUNDO_CARD)
      doc.roundedRect(marginX, y, mapW, mapH, 4, 4, 'F')
      doc.setDrawColor(...COR_LINHA)
      doc.roundedRect(marginX, y, mapW, mapH, 4, 4, 'S')
      doc.setDrawColor(37, 99, 235)
      doc.setLineWidth(1.8)
      for (let i = 1; i < pts.length; i++) {
        const a = xy(pts[i - 1].lat, pts[i - 1].lng)
        const b = xy(pts[i].lat, pts[i].lng)
        doc.line(a.x, a.y, b.x, b.y)
      }
      pts.forEach((p, i) => {
        const pos = xy(p.lat, p.lng)
        const cor: [number, number, number] =
          i === 0 ? [22, 163, 74] : i === pts.length - 1 ? [220, 38, 38] : [37, 99, 235]
        doc.setFillColor(...cor)
        doc.circle(pos.x, pos.y, 7, 'F')
        doc.setFont('helvetica', 'bold')
        doc.setFontSize(7)
        doc.setTextColor(255, 255, 255)
        doc.text(p.label, pos.x, pos.y + 2.4, { align: 'center' })
      })
      y += mapH + 10
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(8)
      doc.setTextColor(...COR_LABEL)
      doc.text('O = origem · números = paradas · D = destino', marginX, y)
      y += 12
    } else {
      linha('', 'Mapa indisponível — preencha origem, destino e coordenadas.')
    }
  })

  // ---- Resumo da viagem ----
  secao('Resumo da viagem', () => {
    kpis([
      {
        label: 'Distância',
        value: rota?.distancia_km != null ? `${rota.distancia_km} km` : '—',
      },
      { label: 'Duração', value: rota?.duracao_label || '—' },
      { label: 'Frete tabela', value: moeda(data.freteTabela) },
      { label: 'Pedágio', value: moeda(rota?.pedagio) },
      { label: 'Combustível', value: moeda(rota?.combustivel) },
      { label: 'Custo operacional', value: moeda(rota?.custo_total) },
    ])
    linhasDuplas(
      ['Carregamento', dataBr(data.dataCarregamentoIso)],
      ['Previsão de entrega', dataBr(data.previsaoEntregaIso)],
    )
    linhasDuplas(
      ['Vale-pedágio', moeda(rota?.vale_pedagio ?? rota?.pedagio)],
      ['Pedágio / eixo', moeda(rota?.pedagio_por_eixo)],
    )
  })

  // ---- Veículo e carga ----
  secao('Veículo e carga', () => {
    linhaClassificacao(data.classificacao, data.veiculo)
    linhasDuplas(
      ['Tipo de carga', data.tipoCarga || '—'],
      ['Carroceria', (data.carrocerias ?? []).join(', ') || '—'],
    )
    linhasDuplas(
      ['Complemento', data.complemento || '—'],
      ['Gerenc. de risco', data.gerenciamentoRisco || '—'],
    )
    linhasDuplas(
      ['Peso', data.peso && data.peso > 0 ? `${numero(data.peso)} kg` : '—'],
      ['Volumes', numero(data.volumes)],
    )
    linhasDuplas(
      ['Nº de entregas', data.numEntregas != null ? String(data.numEntregas) : '—'],
      ['Valor mercadorias', moeda(data.valorMercadorias)],
    )
    linhasDuplas(
      ['Pedido', data.pedido || '—'],
      ['Eixos', antt?.eixos != null ? `${antt.eixos} eixos` : '—'],
    )
  })

  // ---- Frete, ANTT e combustível ----
  secao('Frete, ANTT e combustível', () => {
    kpis([
      { label: 'Frete tabela', value: moeda(data.freteTabela) },
      { label: 'Piso ANTT', value: moeda(antt?.piso_selecionado) },
      { label: 'Custo (pedágio + comb.)', value: moeda(rota?.custo_total) },
    ])
    linhasDuplas(['Tabela ANTT', tabelaAntt], ['Categoria', antt?.categoria_label || '—'])
    linhasDuplas(
      ['Eixos no cálculo', antt?.eixos != null ? String(antt.eixos) : '—'],
      [
        'Consumo',
        kml != null ? `${String(kml).replace('.', ',')} km/l` : '—',
      ],
    )
    linhasDuplas(
      ['Preço do diesel', moeda(diesel)],
      ['Litros', litros != null ? `${String(litros).replace('.', ',')} L` : '—'],
    )
    if (formulaComb) {
      linha('Conta do combustível', formulaComb)
    }
    if (antt?.fonte) {
      linha('Fonte', antt.fonte)
    }
    if (antt?.pisos?.length) {
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(8)
      doc.setTextColor(...COR_LABEL)
      ensureSpace(18)
      doc.text('PISOS ANTT POR CATEGORIA', marginX, y)
      y += 8
      tabela2(
        ['Categoria', 'Valor'],
        antt.pisos.map((p) => [
          `${p.label}${p.id === antt.categoria_id ? '  ← selecionada' : ''}`,
          p.valor != null ? moeda(p.valor) : '—',
        ]),
      )
    }
    const pracas = rota?.pracas ?? []
    if (pracas.length > 0) {
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(8)
      doc.setTextColor(...COR_LABEL)
      ensureSpace(18)
      doc.text(`PRAÇAS NA ROTA (${pracas.length})`, marginX, y)
      y += 8
      tabela2(
        ['Praça', 'Valor'],
        pracas.map((p) => [
          `${p.nome}${p.free_flow ? ' (Free Flow)' : ''}`,
          moeda(p.valor),
        ]),
      )
    } else if (!rota) {
      linha(
        'Cálculo de rota',
        'Ainda sem cálculo ANTT/combustível. Preencha origem, destino e veículo e clique em Recalcular.',
      )
    }
  })

  // ---- Remetente e destinatário ----
  secao('Remetente e destinatário', () => {
    linhasDuplas(
      ['Remetente', data.remetente || '—'],
      ['CNPJ remetente', data.remetenteCnpj ? formatCnpj(data.remetenteCnpj) : '—'],
    )
    linhasDuplas(
      ['Destinatário', data.destinatario || '—'],
      ['CNPJ destinatário', data.destinatarioCnpj ? formatCnpj(data.destinatarioCnpj) : '—'],
    )
    linhasDuplas(
      ['WhatsApp', data.destinatarioWhatsapp ? formatPhoneBr(data.destinatarioWhatsapp) : '—'],
      ['E-mail', data.destinatarioEmail?.trim() || '—'],
    )
  })

  secao('Observações', () => {
    const txt = data.observacao?.trim() || '—'
    const lines = doc.splitTextToSize(txt, contentW)
    ensureSpace(lines.length * 12 + 4)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(10)
    doc.setTextColor(...COR_TEXTO)
    doc.text(lines, marginX, y)
    y += lines.length * 12 + 4
  })

  // ---- Rodapé em todas as páginas ----
  const totalPaginas = doc.getNumberOfPages()
  for (let i = 1; i <= totalPaginas; i++) {
    doc.setPage(i)
    doc.setDrawColor(...COR_LINHA)
    doc.setLineWidth(0.6)
    doc.line(marginX, pageH - 40, pageW - marginX, pageH - 40)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8)
    doc.setTextColor(150, 150, 150)
    doc.text(
      'Documento informativo gerado pela plataforma Doca Livre Oferta de Carga.',
      marginX,
      pageH - 26,
    )
    doc.text(`Página ${i} de ${totalPaginas}`, pageW - marginX, pageH - 26, { align: 'right' })
  }

  const blob = doc.output('blob') as Blob
  const numLimpo = (data.numero || 'carga').replace(/[^\w-]+/g, '')
  const filename = `carga-${numLimpo || 'nova'}.pdf`
  return { blob, filename }
}

export async function baixarPdfCarga(data: CargaPdfData) {
  const { blob, filename } = await gerarPdfCarga(data)
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 4000)
}

export async function compartilharPdfCarga(
  data: CargaPdfData,
): Promise<{ ok: true; via: 'share' | 'download' } | { ok: false; erro: string }> {
  const { blob, filename } = await gerarPdfCarga(data)
  const file = new File([blob], filename, { type: 'application/pdf' })
  const nav = navigator as Navigator & {
    canShare?: (data?: { files?: File[] }) => boolean
    share?: (data: ShareData & { files?: File[] }) => Promise<void>
  }
  if (nav.canShare && nav.share && nav.canShare({ files: [file] })) {
    try {
      await nav.share({
        files: [file],
        title: `Carga ${data.numero || ''}`.trim(),
        text: `Carga ${data.numero || ''}: ${data.origem} → ${data.destino}`,
      })
      return { ok: true, via: 'share' }
    } catch (e) {
      if (e instanceof Error && e.name === 'AbortError') {
        return { ok: false, erro: 'Compartilhamento cancelado.' }
      }
      // segue para o fallback de download
    }
  }
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 4000)
  return { ok: true, via: 'download' }
}
