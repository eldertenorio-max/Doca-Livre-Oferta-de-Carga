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
  pedagio: number
  dataCalculo: string
}

export type FreteMinimoComparativo = {
  id: TabelaAntt
  letra: string
  titulo: string
  valor: number | null
}

export type FreteMinimoResultado = {
  km: number
  tabela: TabelaAntt
  tabelaTitulo: string
  tabelaSub: string
  categoriaId: number
  categoriaLabel: string
  eixos: number
  eixosUtilizados: number
  retornoVazio: boolean
  dataCalculo: string
  ccd: number
  cc: number
  fatorRetorno: number
  deslocamento: number
  cargaDescarga: number
  piso: number
  pisoPorKm: number
  margemPct: number
  margemValor: number
  icmsPct: number
  icmsValor: number
  toneladas: number | null
  porTonelada: number | null
  pedagio: number
  total: number
  totalPorKm: number
  comparativoTabelas: FreteMinimoComparativo[]
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
  const fatorRetorno = p.retornoVazio ? 1.92 : 1
  const deslocamento = roundMoney(piso.ccd * p.km * fatorRetorno)
  const cargaDescarga = piso.cc
  const margemValor = roundMoney(piso.valor * (margemPct / 100))
  const base = roundMoney(piso.valor + margemValor)
  const icmsValor = roundMoney(base * (icmsPct / 100))
  const pedagio = Math.max(0, Number.isFinite(p.pedagio) ? p.pedagio : 0)
  const total = roundMoney(base + icmsValor + pedagio)
  const porTonelada = toneladas ? roundMoney(total / toneladas) : null
  const tab = TABELAS_FRETE_MINIMO.find((t) => t.id === p.tabela) ?? TABELAS_FRETE_MINIMO[0]
  const comparativoTabelas: FreteMinimoComparativo[] = TABELAS_FRETE_MINIMO.map((t) => {
    const outro = calcularPisoAntt(t.id, cat.id, p.eixos, p.km, p.retornoVazio)
    return { id: t.id, letra: t.letra, titulo: t.titulo, valor: outro?.valor ?? null }
  })

  return {
    ok: true,
    data: {
      km: p.km,
      tabela: p.tabela,
      tabelaTitulo: tab.titulo,
      tabelaSub: tab.sub,
      categoriaId: cat.id,
      categoriaLabel: cat.label,
      eixos: p.eixos,
      eixosUtilizados: piso.eixosUtilizados,
      retornoVazio: p.retornoVazio,
      dataCalculo: p.dataCalculo,
      ccd: piso.ccd,
      cc: piso.cc,
      fatorRetorno,
      deslocamento,
      cargaDescarga,
      piso: piso.valor,
      pisoPorKm: roundMoney(piso.valor / p.km),
      margemPct,
      margemValor,
      icmsPct,
      icmsValor,
      toneladas,
      porTonelada,
      pedagio: roundMoney(pedagio),
      total,
      totalPorKm: roundMoney(total / p.km),
      comparativoTabelas,
      fonte: ANTT_FONTE,
    },
  }
}
