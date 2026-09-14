import { ANTT_FONTE, CATEGORIAS_ANTT, type TabelaAntt } from './anttCoeficientes'
import { calcularPisoAntt } from './anttFrete'
import { roundMoney } from './businessRules'

export type FreteMinimoEntrada = {
  km: number
  tabela: TabelaAntt
  categoriaId: number
  eixos: number
  retornoVazio: boolean
  extras: boolean
  margemPct: number
  icmsPct: number
  toneladas: number | null
  dataCalculo: string
}

export type FreteMinimoResultado = {
  km: number
  tabela: TabelaAntt
  categoriaId: number
  categoriaLabel: string
  eixos: number
  eixosUtilizados: number
  retornoVazio: boolean
  dataCalculo: string
  ccd: number
  cc: number
  piso: number
  margemPct: number
  margemValor: number
  icmsPct: number
  icmsValor: number
  toneladas: number | null
  porTonelada: number | null
  total: number
  fonte: string
}

export const TABELAS_FRETE_MINIMO: {
  id: TabelaAntt
  letra: string
  titulo: string
  sub: string
}[] = [
  { id: 'A', letra: 'A', titulo: 'Lotação', sub: 'Veículo do contratante' },
  { id: 'B', letra: 'B', titulo: 'Agregado', sub: 'Veículo de terceiro' },
  { id: 'C', letra: 'C', titulo: 'Lotação AD', sub: 'Alto desempenho' },
  { id: 'D', letra: 'D', titulo: 'Agregado AD', sub: 'Alto desempenho' },
]

export function parseNumeroBr(raw: string): number {
  const n = Number(String(raw).trim().replace(/\./g, '').replace(',', '.'))
  return Number.isFinite(n) ? n : NaN
}

export function formatarKm(n: number): string {
  return n.toLocaleString('pt-BR', { maximumFractionDigits: 1 })
}

export function hojeISODate(): string {
  const d = new Date()
  const z = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}`
}

export function calcularFreteMinimo(
  p: FreteMinimoEntrada,
): { ok: true; data: FreteMinimoResultado } | { ok: false; erro: string } {
  if (!(p.km > 0)) return { ok: false, erro: 'Informe os quilômetros rodados.' }
  if (!Number.isFinite(p.eixos) || p.eixos < 2 || p.eixos > 9) {
    return { ok: false, erro: 'Informe um número de eixos válido.' }
  }
  const cat = CATEGORIAS_ANTT.find((c) => c.id === p.categoriaId)
  if (!cat) return { ok: false, erro: 'Selecione o tipo de carga.' }

  const piso = calcularPisoAntt(p.tabela, p.categoriaId, p.eixos, p.km, p.retornoVazio)
  if (!piso) {
    return {
      ok: false,
      erro: 'Não há coeficiente ANTT para essa combinação de tabela, carga e eixos.',
    }
  }

  const margemPct = p.extras ? Math.max(0, p.margemPct) : 0
  const icmsPct = p.extras ? Math.max(0, p.icmsPct) : 0
  const toneladas = p.extras && p.toneladas != null && p.toneladas > 0 ? p.toneladas : null
  const margemValor = roundMoney(piso.valor * (margemPct / 100))
  const base = roundMoney(piso.valor + margemValor)
  const icmsValor = roundMoney(base * (icmsPct / 100))
  const total = roundMoney(base + icmsValor)
  const porTonelada = toneladas ? roundMoney(total / toneladas) : null

  return {
    ok: true,
    data: {
      km: p.km,
      tabela: p.tabela,
      categoriaId: cat.id,
      categoriaLabel: cat.label,
      eixos: p.eixos,
      eixosUtilizados: piso.eixosUtilizados,
      retornoVazio: p.retornoVazio,
      dataCalculo: p.dataCalculo,
      ccd: piso.ccd,
      cc: piso.cc,
      piso: piso.valor,
      margemPct,
      margemValor,
      icmsPct,
      icmsValor,
      toneladas,
      porTonelada,
      total,
      fonte: ANTT_FONTE,
    },
  }
}
