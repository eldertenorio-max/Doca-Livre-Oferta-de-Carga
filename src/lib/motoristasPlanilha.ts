import * as XLSX from 'xlsx'
import type { Motorista, Veiculo } from '../types'

/** Cabeçalhos do modelo — campos do cadastro (exceto foto). */
export const MOTORISTA_PLANILHA_HEADERS = [
  'nome',
  'cpf',
  'cnh',
  'categoria_cnh',
  'validade_cnh',
  'telefone',
  'placa',
  'autonomo',
  'situacao',
] as const

export type MotoristaPlanilhaHeader = (typeof MOTORISTA_PLANILHA_HEADERS)[number]

const CATEGORIAS_CNH = new Set(['B', 'C', 'D', 'E', 'AB', 'AC', 'AD', 'AE'])

const EXEMPLO_ROW: string[] = [
  'João da Silva',
  '123.456.789-00',
  '12345678900',
  'E',
  '2030-12-31',
  '(11) 99999-0000',
  'ABC1D23',
  'nao',
  'ativo',
]

function unwrapExcelText(v: string): string {
  const s = v.trim()
  const m = s.match(/^="(.*)"$/)
  if (m) return m[1].replace(/""/g, '"')
  if (s.startsWith("'")) return s.slice(1)
  return s
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

function soDigitos(s: string): string {
  return (s || '').replace(/\D/g, '')
}

function normPlaca(p: string): string {
  return (p || '').replace(/[^A-Z0-9]/gi, '').toUpperCase()
}

/** Baixa modelo Excel (.xlsx). */
export function baixarModeloPlanilhaMotoristas() {
  const headers = [...MOTORISTA_PLANILHA_HEADERS]
  const ws = XLSX.utils.aoa_to_sheet([headers, EXEMPLO_ROW])
  ws['!cols'] = headers.map((h) => ({ wch: Math.max(14, h.length + 2) }))

  for (let c = 0; c < headers.length; c++) {
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
  XLSX.utils.book_append_sheet(wb, ws, 'Motoristas')
  XLSX.writeFile(wb, 'modelo-cadastro-motoristas.xlsx')
}

export type LinhaMotoristaPlanilha = {
  linha: number
  raw: Record<string, string>
  ok: boolean
  erros: string[]
  /** Parcial antes de amarrar transportador/veiculo no montar(). */
  motorista?: {
    nome: string
    cpf?: string
    cnh?: string
    categoria_cnh?: string
    validade_cnh?: string
    telefone?: string
    placa: string
    autonomo: boolean
    situacao: 'ativo' | 'inativo'
  }
}

const ALIASES: Record<string, MotoristaPlanilhaHeader> = {
  nome: 'nome',
  motorista: 'nome',
  cpf: 'cpf',
  cnh: 'cnh',
  numero_cnh: 'cnh',
  categoria_cnh: 'categoria_cnh',
  categoria: 'categoria_cnh',
  cat_cnh: 'categoria_cnh',
  validade_cnh: 'validade_cnh',
  validade: 'validade_cnh',
  telefone: 'telefone',
  celular: 'telefone',
  whatsapp: 'telefone',
  placa: 'placa',
  veiculo: 'placa',
  autonomo: 'autonomo',
  situacao: 'situacao',
  status: 'situacao',
}

function cell(raw: Record<string, string>, key: MotoristaPlanilhaHeader): string {
  return unwrapExcelText(raw[key] ?? '')
}

function mapSituacao(v: string): 'ativo' | 'inativo' {
  const s = v.toLowerCase()
  if (s.startsWith('inativ') || s === '0' || s === 'false') return 'inativo'
  return 'ativo'
}

function mapAutonomo(v: string): boolean {
  const s = v
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
  return s === '1' || s === 'sim' || s === 's' || s === 'true' || s === 'autonomo' || s === 'yes'
}

function normalizeValidade(v: string): string | undefined {
  const s = v.trim()
  if (!s) return undefined
  // 31/12/2030 ou 2030-12-31
  const br = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})$/)
  if (br) {
    const dd = br[1].padStart(2, '0')
    const mm = br[2].padStart(2, '0')
    return `${br[3]}-${mm}-${dd}`
  }
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`
  return s
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

export function parsePlanilhaMotoristasRows(rows: string[][]): {
  headersOk: boolean
  missingHeaders: string[]
  linhas: LinhaMotoristaPlanilha[]
} {
  const nonEmpty = rows.filter((r) => r.some((c) => String(c ?? '').trim().length > 0))
  if (nonEmpty.length === 0) {
    return { headersOk: false, missingHeaders: [...MOTORISTA_PLANILHA_HEADERS], linhas: [] }
  }

  const headerCells = (nonEmpty[0] ?? []).map((h) => normalizeHeader(String(h ?? '')))
  const headerIndex = new Map<string, number>()
  headerCells.forEach((h, i) => {
    if (h) headerIndex.set(h, i)
  })

  const colMap = new Map<MotoristaPlanilhaHeader, number>()
  for (const [alias, canon] of Object.entries(ALIASES)) {
    const idx = headerIndex.get(alias)
    if (idx != null && !colMap.has(canon)) colMap.set(canon, idx)
  }

  const missingHeaders = (['nome', 'placa'] as MotoristaPlanilhaHeader[]).filter(
    (h) => !colMap.has(h),
  )
  const headersOk = missingHeaders.length === 0

  const linhas: LinhaMotoristaPlanilha[] = []
  for (let i = 1; i < nonEmpty.length; i++) {
    const cells = nonEmpty[i] ?? []
    const raw: Record<string, string> = {}
    for (const h of MOTORISTA_PLANILHA_HEADERS) {
      const idx = colMap.get(h)
      raw[h] = idx != null ? String(cells[idx] ?? '').trim() : ''
    }

    const nome = cell(raw, 'nome').trim()
    const placa = normPlaca(cell(raw, 'placa'))
    if (!nome && !placa) continue

    const erros: string[] = []
    if (!nome || nome.length < 2) erros.push('Nome obrigatório')
    if (!placa || placa.length < 7) erros.push('Placa inválida ou ausente')

    const catRaw = cell(raw, 'categoria_cnh').toUpperCase().replace(/\s+/g, '')
    let categoria_cnh: string | undefined
    if (catRaw) {
      if (!CATEGORIAS_CNH.has(catRaw)) erros.push('categoria_cnh inválida (use B, C, D, E, AB…)')
      else categoria_cnh = catRaw
    }

    const cpfDigits = soDigitos(cell(raw, 'cpf'))
    if (cpfDigits && cpfDigits.length !== 11) erros.push('CPF deve ter 11 dígitos')

    const cnhDigits = soDigitos(cell(raw, 'cnh'))
    if (cell(raw, 'cnh') && cnhDigits.length < 5) erros.push('CNH inválida')

    const autonomo = mapAutonomo(cell(raw, 'autonomo'))
    const situacao = mapSituacao(cell(raw, 'situacao') || 'ativo')
    const validade_cnh = normalizeValidade(cell(raw, 'validade_cnh'))

    const motorista: LinhaMotoristaPlanilha['motorista'] =
      erros.length === 0
        ? {
            nome,
            cpf: cpfDigits || undefined,
            cnh: cnhDigits || cell(raw, 'cnh') || undefined,
            categoria_cnh,
            validade_cnh,
            telefone: cell(raw, 'telefone') || undefined,
            placa,
            autonomo,
            situacao,
          }
        : undefined

    linhas.push({
      linha: i + 1,
      raw,
      ok: erros.length === 0,
      erros,
      motorista,
    })
  }

  return { headersOk, missingHeaders, linhas }
}

export function parsePlanilhaMotoristas(text: string): {
  headersOk: boolean
  missingHeaders: string[]
  linhas: LinhaMotoristaPlanilha[]
} {
  const cleaned = text.replace(/^\ufeff/, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n')
  const lines = cleaned.split('\n').filter((l) => l.trim().length > 0)
  if (lines.length === 0) {
    return { headersOk: false, missingHeaders: [...MOTORISTA_PLANILHA_HEADERS], linhas: [] }
  }
  const sep = detectSep(lines[0])
  const rows = lines.map((line) => parseCsvLine(line, sep))
  return parsePlanilhaMotoristasRows(rows)
}

export async function parsePlanilhaMotoristasArquivo(file: File): Promise<{
  headersOk: boolean
  missingHeaders: string[]
  linhas: LinhaMotoristaPlanilha[]
}> {
  const name = file.name.toLowerCase()
  if (name.endsWith('.csv') || name.endsWith('.txt')) {
    return parsePlanilhaMotoristas(await file.text())
  }

  const buf = await file.arrayBuffer()
  const wb = XLSX.read(buf, { type: 'array', cellDates: false, raw: false })
  const sheetName = wb.SheetNames[0]
  if (!sheetName) {
    return { headersOk: false, missingHeaders: [...MOTORISTA_PLANILHA_HEADERS], linhas: [] }
  }
  const sheet = wb.Sheets[sheetName]
  const aoa = XLSX.utils.sheet_to_json<(string | number | null | undefined)[]>(sheet, {
    header: 1,
    defval: '',
    raw: false,
    blankrows: false,
  })
  const rows = aoa.map((row) =>
    (Array.isArray(row) ? row : []).map((c) => String(c ?? '').trim()),
  )
  return parsePlanilhaMotoristasRows(rows)
}

function newMotoristaId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `m-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

export type ResultadoMontagemMotorista = {
  ok: Motorista[]
  errosExtras: Array<{ linha: number; erros: string[] }>
}

/**
 * Monta motoristas válidos, resolvendo placa → veiculo_id.
 * transportadorId: empresa do embargador/super ou do logado.
 */
export function montarMotoristasParaImportacao(
  linhas: LinhaMotoristaPlanilha[],
  transportadorId: string | null,
  veiculos: Veiculo[],
  motoristasExistentes: Motorista[],
): ResultadoMontagemMotorista {
  const agora = new Date().toISOString()
  const byPlaca = new Map(
    veiculos.map((v) => [normPlaca(v.placa), v] as const),
  )
  const cpfsExist = new Set(
    motoristasExistentes.map((m) => soDigitos(m.cpf || '')).filter((c) => c.length === 11),
  )
  const seenCpf = new Set<string>()
  const seenPlaca = new Set<string>()
  const ok: Motorista[] = []
  const errosExtras: Array<{ linha: number; erros: string[] }> = []

  for (const l of linhas) {
    if (!l.ok || !l.motorista) continue
    const m = l.motorista
    const erros: string[] = []
    const v = byPlaca.get(m.placa)
    if (!v) {
      erros.push(`Placa ${m.placa} não encontrada no cadastro de veículos`)
    } else if (
      !m.autonomo &&
      transportadorId &&
      v.transportador_id &&
      v.transportador_id !== transportadorId
    ) {
      erros.push(`Placa ${m.placa} pertence a outra transportadora`)
    }

    if (m.cpf) {
      if (cpfsExist.has(m.cpf) || seenCpf.has(m.cpf)) {
        erros.push(`CPF ${m.cpf} já cadastrado ou duplicado na planilha`)
      }
    }
    if (seenPlaca.has(m.placa)) {
      erros.push(`Placa ${m.placa} repetida na planilha`)
    }

    if (erros.length > 0) {
      errosExtras.push({ linha: l.linha, erros })
      continue
    }

    if (m.cpf) seenCpf.add(m.cpf)
    seenPlaca.add(m.placa)

    const tid = m.autonomo ? null : transportadorId
    ok.push({
      id: newMotoristaId(),
      nome: m.nome,
      cpf: m.cpf,
      cnh: m.cnh,
      categoria_cnh: m.categoria_cnh,
      validade_cnh: m.validade_cnh,
      telefone: m.telefone,
      veiculo_id: v!.id,
      transportador_id: tid,
      autonomo: m.autonomo || !tid,
      situacao: m.situacao,
      created_at: agora,
      updated_at: agora,
    })
  }

  return { ok, errosExtras }
}
