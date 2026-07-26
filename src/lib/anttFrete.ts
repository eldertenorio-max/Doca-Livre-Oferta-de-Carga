import {
  ANTT_FONTE,
  CATEGORIAS_ANTT,
  COEFICIENTES_ANTT,
  EIXOS_ANTT,
  type TabelaAntt,
} from './anttCoeficientes'
import { roundMoney } from './businessRules'
import { geocodificarConsulta } from './geocodeEndereco'

export type { TabelaAntt }
export { TABELAS_ANTT, CATEGORIAS_ANTT, ANTT_FONTE } from './anttCoeficientes'

export type AnttPisoCategoria = {
  id: number
  label: string
  valor: number | null
}

export type AnttPracaPedagio = {
  nome: string
  valor: number
  tipo?: string
  free_flow?: boolean
}

export type AnttRotaCustos = {
  distancia_km: number
  duracao_min: number
  duracao_label: string
  pedagio: number
  pedagio_por_eixo: number
  combustivel: number
  custo_total: number
  /** Vale-Pedágio obrigatório (Res. ANTT 6.024/2023) — em geral = pedágio da rota */
  vale_pedagio?: number
  pracas?: AnttPracaPedagio[]
  free_flow?: boolean
  provedor?: 'antt_aberto' | 'local'
}

export type AnttCalculo = {
  tabela: TabelaAntt
  eixos: number
  eixos_utilizados: number
  categoria_id: number | null
  categoria_label: string | null
  pisos: AnttPisoCategoria[]
  piso_selecionado: number | null
  rota: AnttRotaCustos
  fonte: string
}

/** Mapeia tipo de veículo do cadastro → eixos carregados ANTT. */
export function eixosDoVeiculo(tipo: string): number {
  const t = tipo.trim().toLowerCase()
  if (/rodotrem|bitrem\s*9|9\s*eixos/.test(t)) return 9
  if (/bitrem\s*7|7\s*eixos|bitrem/.test(t)) return 7
  if (/carreta\s*4|4[ºo]\s*eixo|vanderl[eé]ia|carreta\s*ls|\bls\b/.test(t)) return 6
  if (/carreta/.test(t)) return 5
  if (/bitruck/.test(t)) return 4
  if (/\btruck\b|\btoco\b/.test(t)) return 3
  if (/fiorino|\bvlc\b|vuc|3\/4|hr|utilit|van|furg/.test(t)) return 2
  return 5
}

function resolverEixos(tipoCarga: number, tabela: TabelaAntt, eixos: number): number {
  const mapa = COEFICIENTES_ANTT[tabela][tipoCarga]
  if (!mapa) return eixos
  if (mapa[eixos]?.ccd != null && mapa[eixos]?.cc != null) return eixos
  // Imediatamente inferior, senão superior (regra ANTT)
  const menores = EIXOS_ANTT.filter((e) => e < eixos).reverse()
  for (const e of menores) {
    if (mapa[e]?.ccd != null && mapa[e]?.cc != null) return e
  }
  const maiores = EIXOS_ANTT.filter((e) => e > eixos)
  for (const e of maiores) {
    if (mapa[e]?.ccd != null && mapa[e]?.cc != null) return e
  }
  return eixos
}

export function calcularPisoAntt(
  tabela: TabelaAntt,
  tipoCarga: number,
  eixos: number,
  distanciaKm: number,
  retornoVazio = false,
): { valor: number; eixosUtilizados: number; ccd: number; cc: number } | null {
  const eixosOk = resolverEixos(tipoCarga, tabela, eixos)
  const pair = COEFICIENTES_ANTT[tabela][tipoCarga]?.[eixosOk]
  if (!pair || pair.ccd == null || pair.cc == null) return null
  const fator = retornoVazio ? 1.92 : 1
  const valor = roundMoney(pair.ccd * distanciaKm * fator + pair.cc)
  return { valor, eixosUtilizados: eixosOk, ccd: pair.ccd, cc: pair.cc }
}

export function listarPisosAntt(
  tabela: TabelaAntt,
  eixos: number,
  distanciaKm: number,
): { pisos: AnttPisoCategoria[]; eixosUtilizados: number } {
  let eixosUtilizados = eixos
  const pisos = CATEGORIAS_ANTT.map((c) => {
    const r = calcularPisoAntt(tabela, c.id, eixos, distanciaKm)
    if (r) eixosUtilizados = r.eixosUtilizados
    return { id: c.id, label: c.label, valor: r?.valor ?? null }
  })
  return { pisos, eixosUtilizados }
}

export function formatDuracaoAntt(minutos: number): string {
  const m = Math.max(0, Math.round(minutos))
  const h = Math.floor(m / 60)
  const rest = m % 60
  if (h <= 0) return `${rest} m`
  return `${h} h ${String(rest).padStart(2, '0')} m`
}

/** Consumo médio (km/l) por faixa de eixos — estimativa operacional. */
function consumoKmL(eixos: number): number {
  if (eixos <= 2) return 8
  if (eixos <= 3) return 5.5
  if (eixos <= 4) return 4.2
  if (eixos <= 5) return 3.5
  if (eixos <= 6) return 3.2
  if (eixos <= 7) return 2.9
  return 2.6
}

const DIESEL_RS = 5.94
/** Pedágio médio por eixo por km (calibrado em rotas BR típicas). */
const PEDAGIO_EIXO_POR_KM = 0.0526

export function estimarCustosRota(distanciaKm: number, eixos: number, duracaoMin: number): AnttRotaCustos {
  const km = Math.max(1, Math.round(distanciaKm))
  const pedagioPorEixo = roundMoney(km * PEDAGIO_EIXO_POR_KM)
  const pedagio = roundMoney(pedagioPorEixo * eixos)
  const litros = km / consumoKmL(eixos)
  const combustivel = roundMoney(litros * DIESEL_RS)
  return {
    distancia_km: km,
    duracao_min: Math.round(duracaoMin),
    duracao_label: formatDuracaoAntt(duracaoMin),
    pedagio,
    pedagio_por_eixo: pedagioPorEixo,
    combustivel,
    custo_total: roundMoney(pedagio + combustivel),
  }
}

/**
 * Cálculo gratuito e automático:
 * - Rota: OSRM (OpenStreetMap)
 * - Pisos: coeficientes oficiais Res. ANTT 6.084/2026
 * - Pedágio / Vale-Pedágio: praças dos Dados Abertos ANTT na rota
 */
export async function calcularAnttCompleto(params: {
  origem: string
  destino: string
  veiculo: string
  tabela: TabelaAntt
  categoriaId?: number | null
  retornoVazio?: boolean
}): Promise<{ ok: true; data: AnttCalculo } | { ok: false; erro: string }> {
  const origemTxt = params.origem.trim()
  const destinoTxt = params.destino.trim()
  if (!origemTxt || !destinoTxt) {
    return { ok: false, erro: 'Informe origem e destino para calcular a ANTT.' }
  }
  if (!params.veiculo.trim()) {
    return { ok: false, erro: 'Selecione o tipo de veículo para definir os eixos.' }
  }

  const [o, d] = await Promise.all([
    geocodificarConsulta(origemTxt),
    geocodificarConsulta(destinoTxt),
  ])
  if (!o.ok) return { ok: false, erro: `Origem: ${o.erro}` }
  if (!d.ok) return { ok: false, erro: `Destino: ${d.erro}` }

  const { rotaOsrmComGeometria, calcularPedagioNaRota } = await import('./anttPedagioAberto')
  const rotaGeo = await rotaOsrmComGeometria(o.coords, d.coords)
  if (!rotaGeo) {
    return { ok: false, erro: 'Não foi possível calcular a rota entre origem e destino.' }
  }

  const eixos = eixosDoVeiculo(params.veiculo)
  const { pisos, eixosUtilizados } = listarPisosAntt(
    params.tabela,
    eixos,
    rotaGeo.distanciaKm,
  )

  const rota = estimarCustosRota(rotaGeo.distanciaKm, eixosUtilizados, rotaGeo.duracaoMin)

  let pedFonte = 'estimativa por km'
  try {
    const ped = await calcularPedagioNaRota(rotaGeo.polyline, eixosUtilizados)
    if (ped.pracas.length > 0) {
      rota.pedagio = ped.pedagio
      rota.pedagio_por_eixo = ped.pedagio_por_eixo
      rota.vale_pedagio = ped.vale_pedagio
      rota.pracas = ped.pracas
      rota.free_flow = ped.free_flow
      rota.custo_total = roundMoney(rota.pedagio + rota.combustivel)
      rota.provedor = 'antt_aberto'
      pedFonte = ped.fonte
    } else {
      rota.vale_pedagio = rota.pedagio
      rota.provedor = 'local'
      pedFonte =
        'nenhuma praça ANTT cruzou a rota — pedágio estimado por km (estaduais/municipais podem não estar na base federal)'
    }
  } catch {
    rota.vale_pedagio = rota.pedagio
    rota.provedor = 'local'
    pedFonte = 'falha ao carregar praças ANTT — pedágio estimado por km'
  }

  const cat =
    params.categoriaId != null
      ? CATEGORIAS_ANTT.find((c) => c.id === params.categoriaId) ?? null
      : null
  const pisoSel =
    cat != null ? (pisos.find((p) => p.id === cat.id)?.valor ?? null) : null

  return {
    ok: true,
    data: {
      tabela: params.tabela,
      eixos,
      eixos_utilizados: eixosUtilizados,
      categoria_id: cat?.id ?? null,
      categoria_label: cat?.label ?? null,
      pisos,
      piso_selecionado: pisoSel,
      rota,
      fonte: `${ANTT_FONTE} · rota OSRM · ${pedFonte}`,
    },
  }
}
