/**
 * Cliente QualP API (roteirização + pedágios + tabela frete + combustível).
 * Docs: https://docs.qualp.com.br/ | https://api.qualp.com.br/docs/
 * Auth: header Access-Token (QualP Pro).
 */

import { roundMoney } from './businessRules'
import { CATEGORIAS_ANTT, type TabelaAntt } from './anttCoeficientes'
import { eixosDoVeiculo, formatDuracaoAntt, listarPisosAntt } from './anttFrete'
import type { AnttCalculo, AnttPisoCategoria, AnttRotaCustos } from './anttFrete'

const QUALP_BASE = 'https://api.qualp.com.br'

export function qualpToken(): string {
  return (import.meta.env.VITE_QUALP_ACCESS_TOKEN as string | undefined)?.trim() || ''
}

export function qualpDisponivel(): boolean {
  return Boolean(qualpToken())
}

/** load_type da API Tabela Frete QualP */
function loadTypeQualp(categoriaId: number): string {
  const map: Record<number, string> = {
    1: 'granel_solido',
    2: 'granel_liquido',
    3: 'frigorificada_ou_aquecida',
    4: 'conteinerizada',
    5: 'carga_geral',
    6: 'neogranel',
    7: 'perigosa_granel_solido',
    8: 'perigosa_granel_liquido',
    9: 'perigosa_frigorificada_ou_aquecida',
    10: 'perigosa_conteinerizada',
    11: 'perigosa_carga_geral',
    12: 'granel_pressurizada',
  }
  return map[categoriaId] || 'carga_geral'
}

function num(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return v
  if (typeof v === 'string') {
    const n = Number(v.replace(/\./g, '').replace(',', '.'))
    if (Number.isFinite(n)) return n
    const n2 = Number(v)
    if (Number.isFinite(n2)) return n2
  }
  return null
}

function dig(obj: unknown, ...keys: string[]): unknown {
  let cur: unknown = obj
  for (const k of keys) {
    if (!cur || typeof cur !== 'object') return undefined
    cur = (cur as Record<string, unknown>)[k]
  }
  return cur
}

function firstNum(obj: unknown, paths: string[][]): number | null {
  for (const p of paths) {
    const v = dig(obj, ...p)
    const n = num(v)
    if (n != null) return n
  }
  return null
}

export type QualpPracaPedagio = {
  nome: string
  valor: number
  tipo?: string
  free_flow?: boolean
}

function parsePracas(data: unknown): QualpPracaPedagio[] {
  const candidates = [
    dig(data, 'tolls'),
    dig(data, 'data', 'tolls'),
    dig(data, 'route', 'tolls'),
    dig(data, 'result', 'tolls'),
  ]
  for (const c of candidates) {
    if (!Array.isArray(c)) continue
    const out: QualpPracaPedagio[] = []
    for (const item of c) {
      if (!item || typeof item !== 'object') continue
      const o = item as Record<string, unknown>
      const nome = String(o.name || o.nome || o.plaza || o.concessionaire || 'Praça')
      const valor =
        num(o.price) ??
        num(o.valor) ??
        num(o.value) ??
        num(o.toll_price) ??
        num(o.total) ??
        0
      const tipo = String(o.type || o.tipo || o.model || '').trim() || undefined
      const free =
        /free.?flow|ocr|livre/i.test(tipo || '') ||
        o.free_flow === true ||
        o.freeflow === true ||
        o.ocr === true
      out.push({ nome, valor: roundMoney(valor), tipo, free_flow: free })
    }
    if (out.length) return out
  }
  return []
}

function parsePisosQualp(data: unknown, fallback: AnttPisoCategoria[]): AnttPisoCategoria[] {
  const table =
    dig(data, 'freight_table') ||
    dig(data, 'data', 'freight_table') ||
    dig(data, 'freightTable') ||
    dig(data, 'show', 'freight_table')
  if (!table || typeof table !== 'object') return fallback

  // Formatos possíveis: array de { load, value } ou mapa por categoria
  if (Array.isArray(table)) {
    const byLabel = new Map<string, number>()
    for (const row of table) {
      if (!row || typeof row !== 'object') continue
      const r = row as Record<string, unknown>
      const label = String(r.load_type || r.load || r.categoria || r.name || '').trim()
      const valor =
        num(r.freight_cost) ??
        num(r.total) ??
        num(r.value) ??
        num(r.valor) ??
        num(r.piso)
      if (label && valor != null) byLabel.set(label.toLowerCase(), roundMoney(valor))
    }
    if (byLabel.size === 0) return fallback
    return CATEGORIAS_ANTT.map((c) => {
      const key = loadTypeQualp(c.id).replace(/_/g, ' ')
      let found: number | null = null
      for (const [k, v] of byLabel) {
        if (k.includes(key) || key.includes(k) || k.includes(c.label.toLowerCase())) {
          found = v
          break
        }
      }
      return { id: c.id, label: c.label, valor: found }
    })
  }

  return fallback
}

/**
 * Calcula rota QualP (pedágios reais, combustível, distância/tempo) + pisos ANTT.
 */
export async function calcularViaQualp(params: {
  origem: string
  destino: string
  veiculo: string
  tabela: TabelaAntt
  categoriaId?: number | null
}): Promise<{ ok: true; data: AnttCalculo } | { ok: false; erro: string }> {
  const token = qualpToken()
  if (!token) return { ok: false, erro: 'Token QualP não configurado (VITE_QUALP_ACCESS_TOKEN).' }

  const eixos = eixosDoVeiculo(params.veiculo)
  const kmFuel =
    eixos <= 2 ? 8 : eixos <= 3 ? 5.5 : eixos <= 4 ? 4.2 : eixos <= 5 ? 3.5 : eixos <= 6 ? 3.2 : 2.8

  const body = {
    locations: [params.origem.trim(), params.destino.trim()],
    config: {
      route: {
        type_route: 'efficient',
        calculate_return: false,
      },
      vehicle: {
        type: 'truck',
        axis: eixos,
      },
      freight_table: {
        category: params.tabela,
        freight_load: 'all',
        axis: eixos,
      },
      fuel_consumption: {
        fuel_price: 5.94,
        km_fuel: kmFuel,
      },
    },
    show: {
      tolls: true,
      freight_table: true,
      fuel_consumption: true,
      link_to_qualp: true,
      link_to_qualp_report: true,
    },
  }

  let res: Response
  try {
    res = await fetch(`${QUALP_BASE}/rotas/v4`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'Access-Token': token,
      },
      body: JSON.stringify(body),
    })
  } catch {
    return { ok: false, erro: 'Falha de rede ao consultar a QualP.' }
  }

  if (res.status === 401 || res.status === 403) {
    return { ok: false, erro: 'Token QualP inválido ou sem permissão. Confira VITE_QUALP_ACCESS_TOKEN.' }
  }
  if (!res.ok) {
    const txt = await res.text().catch(() => '')
    return {
      ok: false,
      erro: `QualP retornou HTTP ${res.status}${txt ? `: ${txt.slice(0, 160)}` : ''}`,
    }
  }

  const raw = (await res.json()) as unknown
  const distanciaKm =
    firstNum(raw, [
      ['distance'],
      ['distance_km'],
      ['data', 'distance'],
      ['data', 'distance_km'],
      ['route', 'distance'],
      ['result', 'distance'],
      ['resumo', 'distancia'],
      ['summary', 'distance'],
    ]) ?? 0

  const duracaoMinRaw =
    firstNum(raw, [
      ['duration'],
      ['duration_min'],
      ['time'],
      ['data', 'duration'],
      ['data', 'time'],
      ['route', 'duration'],
      ['resumo', 'tempo'],
      ['summary', 'duration'],
    ]) ?? 0
  // QualP pode devolver segundos
  const duracaoMin = duracaoMinRaw > 1000 ? duracaoMinRaw / 60 : duracaoMinRaw

  const combustivel =
    firstNum(raw, [
      ['fuel_consumption', 'total_cost'],
      ['fuel_consumption', 'cost'],
      ['fuel', 'cost'],
      ['data', 'fuel_consumption', 'total_cost'],
      ['data', 'fuel_cost'],
      ['consumo_combustivel', 'custo'],
    ]) ?? 0

  const pedagio =
    firstNum(raw, [
      ['tolls_total'],
      ['total_tolls'],
      ['toll', 'total'],
      ['data', 'tolls_total'],
      ['data', 'total_tolls'],
      ['resumo', 'pedagio'],
      ['summary', 'tolls'],
    ]) ?? null

  const pracas = parsePracas(raw)
  const pedagioFinal =
    pedagio != null
      ? roundMoney(pedagio)
      : roundMoney(pracas.reduce((s, p) => s + p.valor, 0))

  const eixosOk = eixos
  const pedagioPorEixo = eixosOk > 0 ? roundMoney(pedagioFinal / eixosOk) : 0

  const { pisos: pisosLocal, eixosUtilizados } = listarPisosAntt(
    params.tabela,
    eixos,
    Math.max(1, distanciaKm),
  )
  const pisos = parsePisosQualp(raw, pisosLocal)

  // Se QualP não trouxe pisos por categoria, completa via endpoint tabela-frete (todas)
  let pisosFinais = pisos
  if (pisos.every((p) => p.valor == null) && distanciaKm > 0) {
    pisosFinais = await buscarTodosPisosQualp(params.tabela, eixosUtilizados, distanciaKm)
  }

  const link =
    (dig(raw, 'link_to_qualp') as string) ||
    (dig(raw, 'data', 'link_to_qualp') as string) ||
    (dig(raw, 'links', 'qualp') as string) ||
    undefined

  const rota: AnttRotaCustos = {
    distancia_km: Math.max(1, Math.round(distanciaKm)),
    duracao_min: Math.round(duracaoMin),
    duracao_label: formatDuracaoAntt(duracaoMin),
    pedagio: pedagioFinal,
    pedagio_por_eixo: pedagioPorEixo,
    combustivel: roundMoney(combustivel),
    custo_total: roundMoney(pedagioFinal + combustivel),
    vale_pedagio: pedagioFinal,
    pracas,
    free_flow: pracas.some((p) => p.free_flow),
    link_qualp: typeof link === 'string' ? link : undefined,
    provedor: 'qualp',
  }

  const cat =
    params.categoriaId != null
      ? CATEGORIAS_ANTT.find((c) => c.id === params.categoriaId) ?? null
      : null
  const pisoSel =
    cat != null ? (pisosFinais.find((p) => p.id === cat.id)?.valor ?? null) : null

  return {
    ok: true,
    data: {
      tabela: params.tabela,
      eixos,
      eixos_utilizados: eixosUtilizados,
      categoria_id: cat?.id ?? null,
      categoria_label: cat?.label ?? null,
      pisos: pisosFinais,
      piso_selecionado: pisoSel,
      rota,
      fonte: 'QualP API · Resolução ANTT 6.084/2026 · Vale-Pedágio Res. 6.024/2023',
    },
  }
}

async function buscarTodosPisosQualp(
  tabela: TabelaAntt,
  eixos: number,
  distanceKm: number,
): Promise<AnttPisoCategoria[]> {
  const token = qualpToken()
  const out: AnttPisoCategoria[] = []
  await Promise.all(
    CATEGORIAS_ANTT.map(async (c) => {
      try {
        const res = await fetch(`${QUALP_BASE}/tabela-frete/v1`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
            'Access-Token': token,
          },
          body: JSON.stringify({
            distance: Math.round(distanceKm),
            axis: eixos,
            freight_type: tabela,
            load_type: loadTypeQualp(c.id),
            is_empty_return: false,
          }),
        })
        if (!res.ok) {
          out.push({ id: c.id, label: c.label, valor: null })
          return
        }
        const raw = (await res.json()) as unknown
        const freight =
          firstNum(raw, [
            ['data', 'freight_cost'],
            ['freight_cost'],
            ['data', 'total'],
          ]) ?? 0
        const loadUnload =
          firstNum(raw, [
            ['data', 'load_unload_cost'],
            ['load_unload_cost'],
          ]) ?? 0
        // freight_cost na QualP costuma ser só CCD×km; total = frete + CC
        const total = freight + loadUnload > 0 ? freight + loadUnload : freight
        out.push({ id: c.id, label: c.label, valor: roundMoney(total) })
      } catch {
        out.push({ id: c.id, label: c.label, valor: null })
      }
    }),
  )
  // mantém ordem do catálogo
  return CATEGORIAS_ANTT.map(
    (c) => out.find((o) => o.id === c.id) ?? { id: c.id, label: c.label, valor: null },
  )
}
