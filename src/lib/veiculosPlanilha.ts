import * as XLSX from 'xlsx'
import { emptyFotosVeiculo } from './veiculoFotos'
import { TIPOS_VEICULO } from './tiposVeiculo'
import { parseMoneyInput, roundMoney } from './businessRules'
import { newVeiculoId } from './veiculosSync'
import { localizacaoDaTransportadora } from './veiculoLocalizacao'
import type { Transportador, Veiculo } from '../types'

/** Cabeçalhos do modelo — mesmos campos do cadastro (exceto fotos). */
export const VEICULO_PLANILHA_HEADERS = [
  'placa',
  'renavam',
  'condutor',
  'tipo',
  'frete_minimo',
  'marca',
  'modelo',
  'cor',
  'ano_fabricacao',
  'ano_modelo',
  'uf_licenciamento',
  'situacao',
  'gerenciamento_risco',
  'rastreador_dados',
  'tipo_carroceria',
  'qtd_pallets',
  'aclimatacao',
  'marca_termico',
  'temp_min',
  'temp_max',
  'capacidade_kg',
  'cubagem_m3',
  'eixos',
] as const

export type VeiculoPlanilhaHeader = (typeof VEICULO_PLANILHA_HEADERS)[number]

/** Colunas que devem ficar como texto no Excel (zeros à esquerda). */
const COLUNAS_TEXTO = new Set<VeiculoPlanilhaHeader>([
  'placa',
  'renavam',
  'ano_fabricacao',
  'ano_modelo',
  'uf_licenciamento',
])

const UFS = new Set([
  'AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG', 'PA',
  'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO',
])

const MARCAS = new Set([
  'Volvo', 'Scania', 'Mercedes-Benz', 'Volkswagen', 'Iveco', 'Ford', 'Outra',
])

/** Remove fórmula/apóstrofo que o Excel usa para forçar texto. */
function unwrapExcelText(v: string): string {
  const s = v.trim()
  const m = s.match(/^="(.*)"$/)
  if (m) return m[1].replace(/""/g, '"')
  if (s.startsWith("'")) return s.slice(1)
  return s
}

/** Linha de exemplo no modelo (ajuda o usuário a preencher). */
const EXEMPLO_ROW: string[] = [
  'ABC1D23',
  '00112233445',
  'Nome do Condutor',
  TIPOS_VEICULO[0] ?? 'Truck',
  '3500,00',
  'Volvo',
  'FH 460',
  'Branco',
  '2022',
  '2023',
  'SP',
  'ativo',
  'nenhum',
  '',
  'Baú',
  '28',
  'Seco',
  '',
  '',
  '',
  '23000',
  '90',
  '3',
]

/** Baixa modelo em pasta de trabalho Excel (.xlsx). */
export function baixarModeloPlanilhaVeiculos() {
  const headers = [...VEICULO_PLANILHA_HEADERS]
  const ws = XLSX.utils.aoa_to_sheet([headers, EXEMPLO_ROW])

  // Largura amigável + formato texto nas colunas sensíveis (RENAVAM, anos…)
  ws['!cols'] = headers.map((h) => ({
    wch: Math.max(14, h.length + 2),
  }))

  for (let c = 0; c < headers.length; c++) {
    const key = headers[c] as VeiculoPlanilhaHeader
    if (!COLUNAS_TEXTO.has(key)) continue
    for (const r of [0, 1]) {
      const addr = XLSX.utils.encode_cell({ r, c })
      const cell = ws[addr]
      if (!cell) continue
      cell.t = 's'
      cell.v = String(cell.v ?? '')
      cell.z = '@'
    }
  }

  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Veículos')
  XLSX.writeFile(wb, 'modelo-cadastro-veiculos.xlsx')
}

function normalizeHeader(h: string): string {
  return h
    .replace(/^\ufeff/, '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, '_')
}

function parseCsvLine(line: string, sep: string): string[] {
  const out: string[] = []
  let cur = ''
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"'
          i++
        } else {
          inQuotes = false
        }
      } else {
        cur += ch
      }
      continue
    }
    if (ch === '"') {
      inQuotes = true
      continue
    }
    if (ch === sep) {
      out.push(cur)
      cur = ''
      continue
    }
    cur += ch
  }
  out.push(cur)
  return out
}

function detectSep(headerLine: string): string {
  const sc = (headerLine.match(/;/g) || []).length
  const cc = (headerLine.match(/,/g) || []).length
  return sc >= cc ? ';' : ','
}

export type LinhaVeiculoPlanilha = {
  linha: number
  raw: Record<string, string>
  ok: boolean
  erros: string[]
  veiculo?: Omit<Veiculo, 'id' | 'created_at' | 'updated_at'> & { id?: string }
}

function cell(raw: Record<string, string>, key: VeiculoPlanilhaHeader): string {
  return unwrapExcelText(raw[key] ?? '')
}

function parseNum(v: string): number | undefined {
  if (!v) return undefined
  const n = Number(String(v).replace(/\./g, '').replace(',', '.').replace(/[^\d.-]/g, ''))
  return Number.isFinite(n) ? n : undefined
}

function mapRisco(v: string): 'rastreador' | 'localizador' | 'nenhum' {
  const s = v
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
  if (s.includes('rastreador')) return 'rastreador'
  if (s.includes('localizador')) return 'localizador'
  return 'nenhum'
}

function mapSituacao(v: string): 'ativo' | 'inativo' {
  const s = v.toLowerCase()
  if (s.startsWith('inativ') || s === '0' || s === 'false') return 'inativo'
  return 'ativo'
}

const ALIASES: Record<string, VeiculoPlanilhaHeader> = {
  placa: 'placa',
  renavam: 'renavam',
  condutor: 'condutor',
  proprietario: 'condutor',
  tipo: 'tipo',
  categoria: 'tipo',
  frete_minimo: 'frete_minimo',
  frete: 'frete_minimo',
  marca: 'marca',
  modelo: 'modelo',
  cor: 'cor',
  ano_fabricacao: 'ano_fabricacao',
  ano_fab: 'ano_fabricacao',
  ano_modelo: 'ano_modelo',
  uf_licenciamento: 'uf_licenciamento',
  uf: 'uf_licenciamento',
  situacao: 'situacao',
  gerenciamento_risco: 'gerenciamento_risco',
  risco: 'gerenciamento_risco',
  rastreador_dados: 'rastreador_dados',
  tipo_carroceria: 'tipo_carroceria',
  carroceria: 'tipo_carroceria',
  qtd_pallets: 'qtd_pallets',
  pallets: 'qtd_pallets',
  aclimatacao: 'aclimatacao',
  marca_termico: 'marca_termico',
  termico: 'marca_termico',
  temp_min: 'temp_min',
  temperatura_min: 'temp_min',
  temp_max: 'temp_max',
  temperatura_max: 'temp_max',
  capacidade_kg: 'capacidade_kg',
  capacidade: 'capacidade_kg',
  cubagem_m3: 'cubagem_m3',
  cubagem: 'cubagem_m3',
  eixos: 'eixos',
}

/** Parse a partir de matriz (1ª linha = cabeçalho). */
export function parsePlanilhaVeiculosRows(rows: string[][]): {
  headersOk: boolean
  missingHeaders: string[]
  linhas: LinhaVeiculoPlanilha[]
} {
  const nonEmpty = rows.filter((r) => r.some((c) => String(c ?? '').trim().length > 0))
  if (nonEmpty.length === 0) {
    return { headersOk: false, missingHeaders: [...VEICULO_PLANILHA_HEADERS], linhas: [] }
  }

  const headerCells = (nonEmpty[0] ?? []).map((h) => normalizeHeader(String(h ?? '')))
  const headerIndex = new Map<string, number>()
  headerCells.forEach((h, i) => {
    if (h) headerIndex.set(h, i)
  })

  const colMap = new Map<VeiculoPlanilhaHeader, number>()
  for (const [alias, canon] of Object.entries(ALIASES)) {
    const idx = headerIndex.get(alias)
    if (idx != null && !colMap.has(canon)) colMap.set(canon, idx)
  }

  const missingHeaders = VEICULO_PLANILHA_HEADERS.filter(
    (h) => !colMap.has(h) && (h === 'placa' || h === 'tipo' || h === 'frete_minimo'),
  )
  const headersOk = missingHeaders.length === 0
  const tiposLower = new Set(TIPOS_VEICULO.map((t) => t.toLowerCase()))

  const linhas: LinhaVeiculoPlanilha[] = []
  for (let i = 1; i < nonEmpty.length; i++) {
    const cells = nonEmpty[i] ?? []
    const raw: Record<string, string> = {}
    for (const h of VEICULO_PLANILHA_HEADERS) {
      const idx = colMap.get(h)
      raw[h] = idx != null ? String(cells[idx] ?? '').trim() : ''
    }

    const placa = cell(raw, 'placa').toUpperCase().replace(/[^A-Z0-9]/g, '')
    if (!placa && !cell(raw, 'tipo') && !cell(raw, 'frete_minimo')) continue

    const erros: string[] = []
    if (!placa || placa.length < 7) erros.push('Placa inválida')
    const tipo = cell(raw, 'tipo')
    if (!tipo) erros.push('Tipo obrigatório')
    else if (!tiposLower.has(tipo.toLowerCase()) && tipo.length < 2) {
      erros.push('Tipo inválido')
    }

    let frete = parseMoneyInput(cell(raw, 'frete_minimo'))
    if (!Number.isFinite(frete) || frete <= 0) {
      frete = parseMoneyInput(String(cells[colMap.get('frete_minimo') ?? -1] ?? ''))
    }
    if (!Number.isFinite(frete) || frete <= 0) erros.push('Frete mínimo deve ser > 0')

    const uf = (cell(raw, 'uf_licenciamento') || 'SP').toUpperCase().slice(0, 2)
    if (cell(raw, 'uf_licenciamento') && !UFS.has(uf)) erros.push('UF inválida')

    const risco = mapRisco(cell(raw, 'gerenciamento_risco'))
    const rastreador = cell(raw, 'rastreador_dados')

    let marca = cell(raw, 'marca')
    if (marca && ![...MARCAS].some((m) => m.toLowerCase() === marca.toLowerCase())) {
      marca = 'Outra'
    } else if (marca) {
      marca = [...MARCAS].find((m) => m.toLowerCase() === marca.toLowerCase()) ?? marca
    }

    const situacao = mapSituacao(cell(raw, 'situacao') || 'ativo')
    const qtd_pallets = parseNum(cell(raw, 'qtd_pallets'))
    const capacidade_kg = parseNum(cell(raw, 'capacidade_kg'))
    const cubagem_m3 = parseNum(cell(raw, 'cubagem_m3'))
    const eixos = parseNum(cell(raw, 'eixos'))
    const temp_min = parseNum(cell(raw, 'temp_min'))
    const temp_max = parseNum(cell(raw, 'temp_max'))

    const veiculo: LinhaVeiculoPlanilha['veiculo'] =
      erros.length === 0
        ? {
            placa,
            transportador_id: null,
            renavam: cell(raw, 'renavam') || undefined,
            condutor: cell(raw, 'condutor') || undefined,
            tipo,
            marca: marca || undefined,
            modelo: cell(raw, 'modelo') || undefined,
            cor: cell(raw, 'cor') || undefined,
            ano_fabricacao: cell(raw, 'ano_fabricacao') || undefined,
            ano_modelo: cell(raw, 'ano_modelo') || undefined,
            uf_licenciamento: uf,
            foto_url: '',
            fotos: emptyFotosVeiculo(),
            tipo_carroceria: cell(raw, 'tipo_carroceria') || undefined,
            qtd_pallets: qtd_pallets != null ? Math.min(40, Math.max(0, Math.round(qtd_pallets))) : undefined,
            aclimatacao: cell(raw, 'aclimatacao') || undefined,
            marca_termico: cell(raw, 'marca_termico') || undefined,
            temp_min: temp_min != null ? temp_min : undefined,
            temp_max: temp_max != null ? temp_max : undefined,
            capacidade_kg: capacidade_kg != null ? Math.round(capacidade_kg) : undefined,
            cubagem_m3: cubagem_m3 != null ? cubagem_m3 : undefined,
            eixos: eixos != null ? Math.min(20, Math.max(0, Math.round(eixos))) : undefined,
            frete_minimo: roundMoney(frete),
            disponivel_mapa: true,
            usa_manobrista: false,
            padiado: false,
            gerenciamento_risco: risco,
            rastreador_dados:
              risco === 'rastreador' || risco === 'localizador' ? rastreador : undefined,
            situacao,
          }
        : undefined

    linhas.push({
      linha: i + 1,
      raw,
      ok: erros.length === 0,
      erros,
      veiculo,
    })
  }

  return { headersOk, missingHeaders, linhas }
}

/** Parse CSV/texto (compatibilidade). */
export function parsePlanilhaVeiculos(text: string): {
  headersOk: boolean
  missingHeaders: string[]
  linhas: LinhaVeiculoPlanilha[]
} {
  const cleaned = text.replace(/^\ufeff/, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n')
  const lines = cleaned.split('\n').filter((l) => l.trim().length > 0)
  if (lines.length === 0) {
    return { headersOk: false, missingHeaders: [...VEICULO_PLANILHA_HEADERS], linhas: [] }
  }
  const sep = detectSep(lines[0])
  const rows = lines.map((line) => parseCsvLine(line, sep))
  return parsePlanilhaVeiculosRows(rows)
}

/** Lê arquivo .xlsx / .xls / .csv e devolve linhas validadas. */
export async function parsePlanilhaVeiculosArquivo(file: File): Promise<{
  headersOk: boolean
  missingHeaders: string[]
  linhas: LinhaVeiculoPlanilha[]
}> {
  const name = file.name.toLowerCase()
  if (name.endsWith('.csv') || name.endsWith('.txt')) {
    return parsePlanilhaVeiculos(await file.text())
  }

  const buf = await file.arrayBuffer()
  const wb = XLSX.read(buf, { type: 'array', cellDates: false, raw: false })
  const sheetName = wb.SheetNames[0]
  if (!sheetName) {
    return { headersOk: false, missingHeaders: [...VEICULO_PLANILHA_HEADERS], linhas: [] }
  }
  const sheet = wb.Sheets[sheetName]
  // raw:true preserva número do Excel (650) em vez de "R$ 650.00" que o parser antigo multiplicava
  const aoaRaw = XLSX.utils.sheet_to_json<(string | number | null | undefined)[]>(sheet, {
    header: 1,
    defval: '',
    raw: true,
    blankrows: false,
  })
  const rows = aoaRaw.map((row) =>
    (Array.isArray(row) ? row : []).map((c) => {
      if (typeof c === 'number' && Number.isFinite(c)) {
        // Evita "650.00" com ponto confuso: manda inteiro se for reals inteiros
        return Number.isInteger(c) ? String(c) : String(c)
      }
      return String(c ?? '').trim()
    }),
  )
  return parsePlanilhaVeiculosRows(rows)
}

export function montarVeiculosParaImportacao(
  linhas: LinhaVeiculoPlanilha[],
  transportadorId: string | null,
  existentes: Veiculo[] = [],
  transportador: Transportador | null = null,
): { criar: Veiculo[]; atualizar: Veiculo[]; semEmpresa: number } {
  const tid = (transportadorId || '').trim() || null
  const agora = new Date().toISOString()
  const byPlaca = new Map(
    existentes.map((v) => [normPlacaKey(v.placa), v] as const),
  )
  // Sempre aplica o endereço da transportadora vinculada na importação por planilha
  const patchLoc = transportador ? localizacaoDaTransportadora(transportador) : null

  const criar: Veiculo[] = []
  const atualizar: Veiculo[] = []
  let semEmpresa = 0

  for (const l of linhas) {
    if (!l.ok || !l.veiculo) continue
    if (!tid) {
      semEmpresa++
      continue
    }
    const base = l.veiculo
    const existente = byPlaca.get(base.placa)
    if (existente) {
      atualizar.push({
        ...existente,
        ...base,
        id: existente.id,
        foto_url: existente.foto_url || base.foto_url,
        fotos: existente.fotos ?? base.fotos,
        ...(patchLoc ?? {
          origem_cep: existente.origem_cep,
          origem_cidade: existente.origem_cidade,
          origem_uf: existente.origem_uf,
          origem_endereco: existente.origem_endereco,
          origem_numero: existente.origem_numero,
          origem_bairro: existente.origem_bairro,
          origem_complemento: existente.origem_complemento,
          origem_lat: existente.origem_lat,
          origem_lng: existente.origem_lng,
          raio_km: existente.raio_km,
        }),
        disponivel_mapa: true,
        transportador_id: tid,
        created_at: existente.created_at,
        updated_at: agora,
      })
      continue
    }
    criar.push({
      ...base,
      id: newVeiculoId(),
      transportador_id: tid,
      ...(patchLoc ?? {}),
      disponivel_mapa: true,
      created_at: agora,
      updated_at: agora,
    })
  }

  return { criar, atualizar, semEmpresa }
}

function normPlacaKey(p: string): string {
  return (p || '').replace(/[^A-Z0-9]/gi, '').toUpperCase()
}
