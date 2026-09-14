import type { RotaResultadoPayload } from './rotaResultadoAcoes'
import { rotuloPreferenciaRota } from './rotaResultadoAcoes'

const NAVY = 'FF0F172A'
const GOLD = 'FFFFB300'
const WHITE = 'FFFFFFFF'
const SLATE = 'FF64748B'
const INK = 'FF0F172A'
const LINE = 'FFE2E8F0'
const ZEBRA = 'FFF8FAFC'
const SOFT = 'FFEEF2FF'
const TOTAL_BG = 'FF1E3A8A'

type CellStyle = {
  font?: {
    name?: string
    bold?: boolean
    italic?: boolean
    color?: { rgb: string }
    sz?: number
  }
  fill?: { patternType: 'solid'; fgColor: { rgb: string } }
  alignment?: {
    vertical?: 'center' | 'top' | 'bottom'
    horizontal?: 'left' | 'center' | 'right'
    wrapText?: boolean
  }
  border?: Record<string, { style: string; color: { rgb: string } }>
  numFmt?: string
}

type Cell = {
  v: string | number
  t: 's' | 'n'
  s: CellStyle
  z?: string
}

function fill(rgb: string) {
  return { patternType: 'solid' as const, fgColor: { rgb } }
}

function font(opts: { bold?: boolean; italic?: boolean; color?: string; sz?: number } = {}) {
  return {
    name: 'Calibri',
    bold: opts.bold,
    italic: opts.italic,
    color: { rgb: opts.color || INK },
    sz: opts.sz || 11,
  }
}

const box = {
  top: { style: 'thin', color: { rgb: LINE } },
  bottom: { style: 'thin', color: { rgb: LINE } },
  left: { style: 'thin', color: { rgb: LINE } },
  right: { style: 'thin', color: { rgb: LINE } },
}

function cell(v: string | number | null | undefined, s: CellStyle, z?: string): Cell {
  const isNum = typeof v === 'number' && Number.isFinite(v)
  return {
    v: isNum ? v : v == null || v === '' ? '' : String(v),
    t: isNum ? 'n' : 's',
    s,
    ...(z ? { z } : {}),
  }
}

function money(n: number | null | undefined, s: CellStyle): Cell {
  if (n == null || !Number.isFinite(n)) {
    return cell('—', {
      ...s,
      alignment: { vertical: 'center', horizontal: s.alignment?.horizontal || 'right' },
    })
  }
  const fmt = '"R$" #,##0.00'
  return cell(n, {
    ...s,
    alignment: { vertical: 'center', horizontal: s.alignment?.horizontal || 'right' },
    numFmt: fmt,
  }, fmt)
}

function qty(n: number | null | undefined, s: CellStyle, fmt: string): Cell {
  if (n == null || !Number.isFinite(Number(n))) {
    return cell('—', {
      ...s,
      alignment: { vertical: 'center', horizontal: s.alignment?.horizontal || 'right' },
    })
  }
  return cell(Number(n), {
    ...s,
    alignment: { vertical: 'center', horizontal: s.alignment?.horizontal || 'right' },
    numFmt: fmt,
  }, fmt)
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

async function loadXlsx() {
  const mod = await import('xlsx-js-style')
  const withDefault = mod as unknown as { default?: typeof mod }
  return withDefault.default ?? mod
}

export async function exportarPlanilhaRota(p: RotaResultadoPayload) {
  const XLSX = await loadXlsx()
  const r = p.calc.rota
  const agora = new Date().toLocaleString('pt-BR')
  const trajeto = `${p.origem} → ${p.destino}`

  const labelS: CellStyle = {
    font: font({ bold: true, color: SLATE, sz: 10 }),
    fill: fill(ZEBRA),
    alignment: { vertical: 'center', horizontal: 'left' },
    border: box,
  }
  const valueS: CellStyle = {
    font: font({ sz: 11 }),
    fill: fill(WHITE),
    alignment: { vertical: 'center', wrapText: true },
    border: box,
  }
  const sectionS: CellStyle = {
    font: font({ bold: true, color: GOLD, sz: 11 }),
    fill: fill(NAVY),
    alignment: { vertical: 'center', horizontal: 'left' },
  }
  const kpiLabel: CellStyle = {
    font: font({ bold: true, color: NAVY, sz: 9 }),
    fill: fill(GOLD),
    alignment: { vertical: 'center', horizontal: 'center' },
  }
  const kpiValue: CellStyle = {
    font: font({ bold: true, color: WHITE, sz: 13 }),
    fill: fill(NAVY),
    alignment: { vertical: 'center', horizontal: 'center', wrapText: true },
  }
  const totalLabel: CellStyle = {
    font: font({ bold: true, color: GOLD, sz: 11 }),
    fill: fill(TOTAL_BG),
    alignment: { vertical: 'center' },
    border: box,
  }
  const totalValue: CellStyle = {
    font: font({ bold: true, color: NAVY, sz: 12 }),
    fill: fill(GOLD),
    alignment: { vertical: 'center', horizontal: 'right' },
    border: box,
    numFmt: '"R$" #,##0.00',
  }

  const resumo: Cell[][] = []
  const merges: { s: { r: number; c: number }; e: { r: number; c: number } }[] = []
  const heights: { hpt: number }[] = []

  const add = (row: Cell[], hpt: number, mergeCols?: [number, number]) => {
    const rIdx = resumo.length
    resumo.push(row)
    heights.push({ hpt })
    if (mergeCols) merges.push({ s: { r: rIdx, c: mergeCols[0] }, e: { r: rIdx, c: mergeCols[1] } })
  }

  const banner = (text: string, sz: number, hpt: number, bg = NAVY, color = GOLD, italic = false) => {
    const s: CellStyle = {
      font: font({ bold: true, italic, color, sz }),
      fill: fill(bg),
      alignment: { vertical: 'center', horizontal: 'left', wrapText: true },
    }
    add([cell(text, s), cell('', s)], hpt, [0, 1])
  }

  const secao = (titulo: string) => add([cell(titulo, sectionS), cell('', sectionS)], 24, [0, 1])

  const linha = (label: string, valor: string | number | Cell) => {
    const v = typeof valor === 'object' && valor !== null && 't' in valor ? valor : cell(valor, valueS)
    add([cell(label, labelS), v], v.s.alignment?.wrapText ? 28 : 22)
  }

  banner('Oferta de Carga', 16, 30)
  banner('Relatório da rota', 12, 22, NAVY, WHITE)
  banner(trajeto, 11, 36, SOFT, INK)
  banner(`Gerado em ${agora}  ·  Doca Livre`, 9, 20, SOFT, SLATE, true)

  add(
    [
      cell('Distância', kpiLabel),
      cell('Tempo', kpiLabel),
    ],
    18,
  )
  add(
    [
      qty(r.distancia_km, kpiValue, '#,##0.0 "km"'),
      cell(r.duracao_label || '—', kpiValue),
    ],
    32,
  )
  add(
    [
      cell('Pedágio', kpiLabel),
      cell('Custo total', kpiLabel),
    ],
    18,
  )
  add(
    [money(r.pedagio, kpiValue), money(r.custo_total, { ...kpiValue, numFmt: '"R$" #,##0.00' })],
    32,
  )

  add([cell('', { fill: fill(WHITE) }), cell('', { fill: fill(WHITE) })], 10)

  secao('TRAJETO')
  linha('Origem', p.origem)
  ;(p.vias ?? []).forEach((via, i) => {
    if (via.endereco.trim()) linha(`Passagem ${i + 1}`, via.endereco)
  })
  linha('Destino', p.destino)

  add([cell('', { fill: fill(WHITE) }), cell('', { fill: fill(WHITE) })], 8)
  secao('VEÍCULO')
  linha('Veículo', p.tipoVeiculo || '—')
  linha('Eixos', p.calc.eixos)
  linha('Eixos ANTT', p.calc.eixos_utilizados)
  linha('Categoria', p.calc.categoria_label || '—')
  linha('Trecho', p.idaEVolta ? 'Ida e volta' : 'Só ida')
  linha('Preferência', rotuloPreferenciaRota(p.preferencia) || '—')

  add([cell('', { fill: fill(WHITE) }), cell('', { fill: fill(WHITE) })], 8)
  secao('CUSTOS')
  linha('Distância', qty(r.distancia_km, valueS, '#,##0.0 "km"'))
  linha('Tempo', r.duracao_label || '—')
  linha('Pedágio', money(r.pedagio, valueS))
  linha('Pedágio / eixo', money(r.pedagio_por_eixo, valueS))
  linha('Vale-pedágio', money(r.vale_pedagio ?? r.pedagio, valueS))
  linha('Combustível', money(r.combustivel, valueS))
  linha('Consumo', qty(r.consumo_km_l, valueS, '0.00 "km/l"'))
  linha('Diesel', qty(r.preco_diesel, valueS, '"R$" #,##0.00"/L"'))
  linha('Litros', qty(r.litros, valueS, '#,##0.00 "L"'))
  add([cell('Custo total', totalLabel), money(r.custo_total, totalValue)], 28)
  if (p.calc.piso_selecionado != null) {
    linha('Piso ANTT', money(p.calc.piso_selecionado, valueS))
  }

  add([cell('', { fill: fill(WHITE) }), cell('', { fill: fill(WHITE) })], 8)
  secao('FONTE')
  const fonteS: CellStyle = {
    font: font({ italic: true, color: SLATE, sz: 9 }),
    fill: fill(ZEBRA),
    alignment: { vertical: 'top', wrapText: true },
    border: box,
  }
  add([cell(p.calc.fonte || '—', fonteS), cell('', fonteS)], 48, [0, 1])

  const wsResumo = XLSX.utils.aoa_to_sheet(resumo)
  wsResumo['!merges'] = merges
  wsResumo['!cols'] = [{ wch: 22 }, { wch: 62 }]
  wsResumo['!rows'] = heights

  const headS: CellStyle = {
    font: font({ bold: true, color: GOLD, sz: 10 }),
    fill: fill(NAVY),
    alignment: { vertical: 'center', horizontal: 'center', wrapText: true },
  }
  const oddS: CellStyle = {
    font: font({ sz: 10 }),
    fill: fill(WHITE),
    alignment: { vertical: 'center', wrapText: true },
    border: box,
  }
  const evenS: CellStyle = {
    ...oddS,
    fill: fill(ZEBRA),
  }
  const numS = (base: CellStyle): CellStyle => ({
    ...base,
    alignment: { vertical: 'center', horizontal: 'right' },
  })

  const pracasOrd = (r.pracas ?? [])
    .slice()
    .sort((a, b) => (a.ordem ?? a.km_ate ?? 0) - (b.ordem ?? b.km_ate ?? 0))

  const pracasTitleS: CellStyle = {
    font: font({ bold: true, color: GOLD, sz: 14 }),
    fill: fill(NAVY),
    alignment: { vertical: 'center' },
  }
  const pracas: Cell[][] = []
  const pracasMerges: { s: { r: number; c: number }; e: { r: number; c: number } }[] = []
  const pracasH: { hpt: number }[] = []

  const addP = (row: Cell[], hpt: number, mergeTo?: number) => {
    const idx = pracas.length
    pracas.push(row)
    pracasH.push({ hpt })
    if (mergeTo != null) {
      pracasMerges.push({ s: { r: idx, c: 0 }, e: { r: idx, c: mergeTo } })
    }
  }

  const empty9 = (s: CellStyle) => Array.from({ length: 9 }, () => cell('', s))
  const titleRow = empty9(pracasTitleS)
  titleRow[0] = cell(`Praças de pedágio  ·  ${pracasOrd.length} trecho${pracasOrd.length === 1 ? '' : 's'}`, pracasTitleS)
  addP(titleRow, 28, 8)

  const subS: CellStyle = {
    font: font({ italic: true, color: SLATE, sz: 9 }),
    fill: fill(SOFT),
    alignment: { vertical: 'center' },
  }
  const subRow = empty9(subS)
  subRow[0] = cell(trajeto, subS)
  addP(subRow, 20, 8)

  addP(empty9({ fill: fill(WHITE) }), 8)

  const headers = ['#', 'Praça', 'km', 'min', 'Valor', 'Carro', 'Free flow', 'Latitude', 'Longitude']
  addP(
    headers.map((h) => cell(h, headS)),
    24,
  )

  if (pracasOrd.length === 0) {
    const emptyS: CellStyle = {
      font: font({ italic: true, color: SLATE, sz: 11 }),
      fill: fill(ZEBRA),
      alignment: { vertical: 'center', horizontal: 'center' },
    }
    const row = empty9(emptyS)
    row[0] = cell('Nenhuma praça detectada nesta rota.', emptyS)
    addP(row, 28, 8)
  } else {
    pracasOrd.forEach((pr, i) => {
      const base = i % 2 === 0 ? oddS : evenS
      addP(
        [
          cell(pr.ordem ?? i + 1, numS(base)),
          cell(pr.nome || '—', base),
          qty(pr.km_ate, numS(base), '#,##0.0'),
          qty(pr.min_ate, numS(base), '0'),
          money(pr.valor, numS(base)),
          money(pr.valor_carro, numS(base)),
          cell(pr.free_flow ? 'Sim' : '—', { ...base, alignment: { vertical: 'center', horizontal: 'center' } }),
          qty(pr.lat, numS(base), '0.000000'),
          qty(pr.lng, numS(base), '0.000000'),
        ],
        22,
      )
    })
    const totS: CellStyle = {
      font: font({ bold: true, color: GOLD, sz: 11 }),
      fill: fill(NAVY),
      alignment: { vertical: 'center' },
    }
    const totNum: CellStyle = {
      ...totS,
      alignment: { vertical: 'center', horizontal: 'right' },
      numFmt: '"R$" #,##0.00',
    }
    const totRow = empty9(totS)
    totRow[0] = cell('Total', totS)
    totRow[1] = cell(`${pracasOrd.length} praça${pracasOrd.length === 1 ? '' : 's'}`, totS)
    totRow[4] = money(
      pracasOrd.reduce((acc, pr) => acc + (Number(pr.valor) || 0), 0),
      totNum,
    )
    addP(totRow, 26)
  }

  const wsPracas = XLSX.utils.aoa_to_sheet(pracas)
  wsPracas['!merges'] = pracasMerges
  wsPracas['!cols'] = [
    { wch: 8 },
    { wch: 42 },
    { wch: 10 },
    { wch: 8 },
    { wch: 14 },
    { wch: 14 },
    { wch: 12 },
    { wch: 14 },
    { wch: 14 },
  ]
  wsPracas['!rows'] = pracasH
  if (pracasOrd.length > 0) {
    wsPracas['!autofilter'] = { ref: `A4:I${4 + pracasOrd.length}` }
    wsPracas['!views'] = [{ state: 'frozen', ySplit: 4, topLeftCell: 'A5', activeCell: 'A5' }]
  }

  const wb = XLSX.utils.book_new()
  wb.Props = {
    Title: `Rota ${p.origem} → ${p.destino}`,
    Subject: 'Relatório da rota',
    Author: 'Oferta de Carga',
    Company: 'Doca Livre',
    CreatedDate: new Date(),
  }
  XLSX.utils.book_append_sheet(wb, wsResumo, 'Resumo')
  XLSX.utils.book_append_sheet(wb, wsPracas, 'Praças')
  XLSX.writeFile(wb, `rota-${slugArquivo(p.origem)}-${slugArquivo(p.destino)}.xlsx`)
}
