/**
 * Radar de inteligência logística — agregado a partir dos dados da própria plataforma.
 * Fontes futuras (rastreadores, ANTT, marketplaces) podem entrar como camadas extras.
 */

import type { Carga, Motorista, Transportador, Veiculo } from '../types'
import { montarPontosFrota, type PontoFrota } from './mapaFrota'
import { formatCurrency } from './businessRules'

export const UFS_BR = [
  'AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG', 'PA',
  'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO',
] as const

export type UfBr = (typeof UFS_BR)[number]

/** Centroides aproximados (capital / centro geográfico do estado). */
export const UF_CENTRO: Record<UfBr, { lat: number; lng: number; nome: string }> = {
  AC: { lat: -9.02, lng: -70.81, nome: 'Acre' },
  AL: { lat: -9.57, lng: -36.78, nome: 'Alagoas' },
  AP: { lat: 1.41, lng: -51.77, nome: 'Amapá' },
  AM: { lat: -3.47, lng: -65.1, nome: 'Amazonas' },
  BA: { lat: -12.96, lng: -38.51, nome: 'Bahia' },
  CE: { lat: -5.2, lng: -39.53, nome: 'Ceará' },
  DF: { lat: -15.78, lng: -47.93, nome: 'Distrito Federal' },
  ES: { lat: -19.19, lng: -40.34, nome: 'Espírito Santo' },
  GO: { lat: -15.98, lng: -49.86, nome: 'Goiás' },
  MA: { lat: -5.42, lng: -45.44, nome: 'Maranhão' },
  MT: { lat: -12.64, lng: -55.42, nome: 'Mato Grosso' },
  MS: { lat: -20.51, lng: -54.54, nome: 'Mato Grosso do Sul' },
  MG: { lat: -18.1, lng: -44.38, nome: 'Minas Gerais' },
  PA: { lat: -3.79, lng: -52.48, nome: 'Pará' },
  PB: { lat: -7.28, lng: -36.72, nome: 'Paraíba' },
  PR: { lat: -24.89, lng: -51.55, nome: 'Paraná' },
  PE: { lat: -8.38, lng: -37.86, nome: 'Pernambuco' },
  PI: { lat: -6.6, lng: -42.28, nome: 'Piauí' },
  RJ: { lat: -22.25, lng: -42.66, nome: 'Rio de Janeiro' },
  RN: { lat: -5.81, lng: -36.59, nome: 'Rio Grande do Norte' },
  RS: { lat: -30.17, lng: -53.5, nome: 'Rio Grande do Sul' },
  RO: { lat: -10.83, lng: -63.34, nome: 'Rondônia' },
  RR: { lat: 1.99, lng: -61.33, nome: 'Roraima' },
  SC: { lat: -27.45, lng: -50.95, nome: 'Santa Catarina' },
  SP: { lat: -22.19, lng: -48.79, nome: 'São Paulo' },
  SE: { lat: -10.57, lng: -37.45, nome: 'Sergipe' },
  TO: { lat: -9.46, lng: -48.26, nome: 'Tocantins' },
}

const UFS_SET = new Set<string>(UFS_BR)

export type IntensidadeCalor = 'fria' | 'equilibrada' | 'aquecida' | 'critica'

export type RegiaoLogistica = {
  uf: UfBr
  nome: string
  lat: number
  lng: number
  cargasAtivas: number
  cargasParadas: number
  cargasAlocadas: number
  veiculos: number
  veiculosDisponiveis: number
  motoristas: number
  freteMedio: number
  fretePorKmMedio: number | null
  /** 0–100: quanto maior, mais “quente” (falta de caminhão ou muita demanda). */
  indiceCalor: number
  intensidade: IntensidadeCalor
  gapVeiculos: number
  tiposVeiculoTop: Array<{ tipo: string; qtd: number }>
  rotasTop: Array<{ origem: string; destino: string; qtd: number; freteMedio: number }>
  insight: string
}

export type CamadasMapaLogistica = {
  cargas: boolean
  caminhoes: boolean
  calor: boolean
  fretesAltos: boolean
  semOfertas: boolean
  aquecidas: boolean
}

export const CAMADAS_DEFAULT: CamadasMapaLogistica = {
  cargas: true,
  caminhoes: true,
  calor: true,
  fretesAltos: false,
  semOfertas: false,
  aquecidas: false,
}

export type SnapshotMapaLogistica = {
  geradoEm: string
  regioes: RegiaoLogistica[]
  rankingAquecidas: RegiaoLogistica[]
  rankingFaltaCaminhao: RegiaoLogistica[]
  rankingFrete: RegiaoLogistica[]
  totais: {
    cargasAtivas: number
    veiculosDisponiveis: number
    motoristas: number
    freteMedio: number
    ufsComAtividade: number
  }
  fontes: Array<{ id: string; titulo: string; status: 'ativo' | 'planejado'; detalhe: string }>
  pontosFrota: PontoFrota[]
  pontosCarga: Array<{
    id: string
    lat: number
    lng: number
    origem: string
    destino: string
    frete: number
    status: string
    uf: string | null
  }>
}

const CARGAS_ATIVAS = new Set([
  'nova_carga',
  'negociando',
  'propostas',
  'alocadas',
  'suspensas',
])

const CARGAS_PARADAS = new Set(['nova_carga', 'negociando', 'propostas', 'suspensas'])

export function extrairUf(texto?: string | null): UfBr | null {
  if (!texto) return null
  const t = texto
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
  // "... - SP" | "SP" | "SAO PAULO/SP"
  const m = t.match(/(?:^|[\s,/\-(])([A-Z]{2})(?:\s*$|[\s)/,])/)
  if (m && UFS_SET.has(m[1])) return m[1] as UfBr
  // nome do estado
  for (const uf of UFS_BR) {
    const nome = UF_CENTRO[uf].nome
      .toUpperCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
    if (t.includes(nome)) return uf
  }
  return null
}

function freteDaCarga(c: Carga): number {
  const v = c.frete_fechado ?? c.frete_oferta ?? c.frete_tabela ?? 0
  return Number.isFinite(v) && v > 0 ? Number(v) : 0
}

function intensidadeFromScore(score: number): IntensidadeCalor {
  if (score >= 80) return 'critica'
  if (score >= 55) return 'aquecida'
  if (score >= 30) return 'equilibrada'
  return 'fria'
}

function corInsight(r: Omit<RegiaoLogistica, 'insight' | 'intensidade'> & { intensidade: IntensidadeCalor }): string {
  if (r.cargasAtivas === 0 && r.veiculosDisponiveis === 0) {
    return 'Sem atividade recente na plataforma nesta UF.'
  }
  if (r.cargasAtivas > 0 && r.veiculosDisponiveis === 0) {
    return `Há ${r.cargasAtivas} carga(s) e nenhum caminhão disponível no radar da frota — região com falta de oferta.`
  }
  if (r.cargasAtivas === 0 && r.veiculosDisponiveis > 0) {
    return `${r.veiculosDisponiveis} veículo(s) disponíveis e poucas/sem ofertas — possível idle de frota.`
  }
  if (r.intensidade === 'critica' || r.gapVeiculos > 0) {
    return `Demanda supera a frota visível (gap ~${r.gapVeiculos} veículo(s)). Frete médio ${formatCurrency(r.freteMedio)}.`
  }
  if (r.intensidade === 'aquecida') {
    return `Mercado aquecido: ${r.cargasAtivas} carga(s) × ${r.veiculosDisponiveis} placa(s) livres.`
  }
  if (r.intensidade === 'equilibrada') {
    return `Mercado equilibrado na UF. Frete médio ${formatCurrency(r.freteMedio)}.`
  }
  return `Atividade baixa. Use como origem de reposicionamento com cautela.`
}

export function montarSnapshotMapaLogistica(
  cargas: Carga[],
  veiculos: Veiculo[],
  motoristas: Motorista[],
  transportadores: Transportador[],
): SnapshotMapaLogistica {
  const pontosFrota = montarPontosFrota(motoristas, veiculos, transportadores, cargas)

  type Acc = {
    cargasAtivas: number
    cargasParadas: number
    cargasAlocadas: number
    freteSoma: number
    freteN: number
    kmSoma: number
    kmN: number
    tipos: Map<string, number>
    rotas: Map<string, { origem: string; destino: string; qtd: number; freteSoma: number }>
    veiculos: number
    veiculosDisponiveis: number
    motoristas: Set<string>
    latSum: number
    lngSum: number
    geoN: number
  }

  const byUf = new Map<UfBr, Acc>()
  function acc(uf: UfBr): Acc {
    let a = byUf.get(uf)
    if (!a) {
      a = {
        cargasAtivas: 0,
        cargasParadas: 0,
        cargasAlocadas: 0,
        freteSoma: 0,
        freteN: 0,
        kmSoma: 0,
        kmN: 0,
        tipos: new Map(),
        rotas: new Map(),
        veiculos: 0,
        veiculosDisponiveis: 0,
        motoristas: new Set(),
        latSum: 0,
        lngSum: 0,
        geoN: 0,
      }
      byUf.set(uf, a)
    }
    return a
  }

  const pontosCarga: SnapshotMapaLogistica['pontosCarga'] = []

  for (const c of cargas) {
    if (!CARGAS_ATIVAS.has(c.status)) continue
    const ufOrig = extrairUf(c.origem)
    const keyUf = ufOrig
    if (keyUf) {
      const a = acc(keyUf)
      a.cargasAtivas++
      if (CARGAS_PARADAS.has(c.status)) a.cargasParadas++
      if (c.status === 'alocadas') a.cargasAlocadas++
      const frete = freteDaCarga(c)
      if (frete > 0) {
        a.freteSoma += frete
        a.freteN++
      }
      const km = c.antt?.rota?.distancia_km
      if (km != null && km > 0 && frete > 0) {
        a.kmSoma += frete / km
        a.kmN++
      }
      const tipo = (c.veiculo || c.tipo_carga || 'Outros').trim() || 'Outros'
      a.tipos.set(tipo, (a.tipos.get(tipo) ?? 0) + 1)
      const rotaKey = `${c.origem}|${c.destino}`
      const r = a.rotas.get(rotaKey) ?? {
        origem: c.origem,
        destino: c.destino,
        qtd: 0,
        freteSoma: 0,
      }
      r.qtd++
      r.freteSoma += frete
      a.rotas.set(rotaKey, r)
      if (c.origem_lat != null && c.origem_lng != null) {
        a.latSum += Number(c.origem_lat)
        a.lngSum += Number(c.origem_lng)
        a.geoN++
      }
    }

    if (
      c.origem_lat != null &&
      c.origem_lng != null &&
      Number.isFinite(Number(c.origem_lat)) &&
      Number.isFinite(Number(c.origem_lng))
    ) {
      pontosCarga.push({
        id: c.id,
        lat: Number(c.origem_lat),
        lng: Number(c.origem_lng),
        origem: c.origem,
        destino: c.destino,
        frete: freteDaCarga(c),
        status: c.status,
        uf: keyUf,
      })
    }
  }

  for (const p of pontosFrota) {
    const uf = (p.uf || '').toUpperCase()
    if (!UFS_SET.has(uf)) continue
    const a = acc(uf as UfBr)
    a.veiculos++
    if (p.disponivel) a.veiculosDisponiveis++
    if (p.motoristaId) a.motoristas.add(p.motoristaId)
    a.latSum += p.lat
    a.lngSum += p.lng
    a.geoN++
    const tipo = (p.tipoVeiculo || 'Outros').trim() || 'Outros'
    a.tipos.set(tipo, (a.tipos.get(tipo) ?? 0) + 1)
  }

  // Motoristas sem pin no mapa, conta por UF da empresa/placa
  const veiculoById = new Map(veiculos.map((v) => [v.id, v]))
  const transpById = new Map(transportadores.map((t) => [t.id, t]))
  for (const m of motoristas) {
    if (m.situacao !== 'ativo') continue
    let uf: string | null = null
    if (m.veiculo_id) {
      const v = veiculoById.get(m.veiculo_id)
      if (v) uf = (v.origem_uf || '').toUpperCase()
    }
    if ((!uf || !UFS_SET.has(uf)) && m.transportador_id) {
      const t = transpById.get(m.transportador_id)
      uf = (t?.origem_uf || t?.uf || '').toUpperCase()
    }
    if (uf && UFS_SET.has(uf)) {
      acc(uf as UfBr).motoristas.add(m.id)
    }
  }

  const regioes: RegiaoLogistica[] = []
  for (const uf of UFS_BR) {
    const a = byUf.get(uf)
    const centro = UF_CENTRO[uf]
    if (!a) {
      // não lista estado zerado no ranking, mas podemos pular
      continue
    }
    if (
      a.cargasAtivas === 0 &&
      a.veiculos === 0 &&
      a.motoristas.size === 0
    ) {
      continue
    }

    const freteMedio = a.freteN > 0 ? a.freteSoma / a.freteN : 0
    const fretePorKmMedio = a.kmN > 0 ? a.kmSoma / a.kmN : null
    const disp = a.veiculosDisponiveis
    const gap = Math.max(0, a.cargasParadas - disp)

    // Score: demanda + gap + frete relativo
    let score = 0
    score += Math.min(40, a.cargasAtivas * 4)
    score += Math.min(35, gap * 6)
    if (a.cargasAtivas > 0 && disp === 0) score += 20
    if (disp > a.cargasAtivas * 2 && a.cargasAtivas > 0) score -= 10
    if (a.cargasAtivas === 0 && disp > 0) score = Math.min(25, disp * 2)
    score = Math.max(0, Math.min(100, Math.round(score)))

    const intensidade = intensidadeFromScore(score)

    const tiposVeiculoTop = [...a.tipos.entries()]
      .map(([tipo, qtd]) => ({ tipo, qtd }))
      .sort((x, y) => y.qtd - x.qtd)
      .slice(0, 5)

    const rotasTop = [...a.rotas.values()]
      .map((r) => ({
        origem: r.origem,
        destino: r.destino,
        qtd: r.qtd,
        freteMedio: r.qtd > 0 ? r.freteSoma / r.qtd : 0,
      }))
      .sort((x, y) => y.qtd - x.qtd)
      .slice(0, 5)

    const lat = a.geoN > 0 ? a.latSum / a.geoN : centro.lat
    const lng = a.geoN > 0 ? a.lngSum / a.geoN : centro.lng

    const base = {
      uf,
      nome: centro.nome,
      lat,
      lng,
      cargasAtivas: a.cargasAtivas,
      cargasParadas: a.cargasParadas,
      cargasAlocadas: a.cargasAlocadas,
      veiculos: a.veiculos,
      veiculosDisponiveis: disp,
      motoristas: a.motoristas.size,
      freteMedio,
      fretePorKmMedio,
      indiceCalor: score,
      intensidade,
      gapVeiculos: gap,
      tiposVeiculoTop,
      rotasTop,
    }
    regioes.push({
      ...base,
      insight: corInsight(base),
    })
  }

  regioes.sort((a, b) => b.indiceCalor - a.indiceCalor)

  const rankingAquecidas = [...regioes]
    .filter((r) => r.cargasAtivas > 0)
    .sort((a, b) => b.indiceCalor - a.indiceCalor || b.cargasAtivas - a.cargasAtivas)
    .slice(0, 8)

  const rankingFaltaCaminhao = [...regioes]
    .filter((r) => r.gapVeiculos > 0 || (r.cargasAtivas > 0 && r.veiculosDisponiveis === 0))
    .sort((a, b) => b.gapVeiculos - a.gapVeiculos || b.cargasAtivas - a.cargasAtivas)
    .slice(0, 8)

  const rankingFrete = [...regioes]
    .filter((r) => r.freteMedio > 0)
    .sort((a, b) => b.freteMedio - a.freteMedio)
    .slice(0, 8)

  let freteSoma = 0
  let freteN = 0
  let cargos = 0
  let veics = 0
  let mots = 0
  for (const r of regioes) {
    cargos += r.cargasAtivas
    veics += r.veiculosDisponiveis
    mots += r.motoristas
    if (r.freteMedio > 0) {
      freteSoma += r.freteMedio * Math.max(1, r.cargasAtivas)
      freteN += Math.max(1, r.cargasAtivas)
    }
  }

  return {
    geradoEm: new Date().toISOString(),
    regioes,
    rankingAquecidas,
    rankingFaltaCaminhao,
    rankingFrete,
    totais: {
      cargasAtivas: cargos,
      veiculosDisponiveis: veics,
      motoristas: mots,
      freteMedio: freteN > 0 ? freteSoma / freteN : 0,
      ufsComAtividade: regioes.length,
    },
    fontes: [
      {
        id: 'plataforma',
        titulo: 'Dados da plataforma Doca Livre',
        status: 'ativo',
        detalhe:
          'Cargas publicadas, fretes, alocações, veículos/motoristas e localização da frota no mapa.',
      },
      {
        id: 'gps',
        titulo: 'GPS / disponibilidade da frota',
        status: 'ativo',
        detalhe:
          'Posição e disponibilidade das placas cadastradas (Mapa da Frota) por UF.',
      },
      {
        id: 'risco',
        titulo: 'Gerenciadoras de risco / rastreadores',
        status: 'planejado',
        detalhe: 'Volume de veículos em corredores e status em tempo real via API.',
      },
      {
        id: 'governo',
        titulo: 'Dados públicos (ANTT, DNIT, IBGE)',
        status: 'planejado',
        detalhe: 'Frota RNTRC, obras/interdições e polos econômicos por região.',
      },
      {
        id: 'mercado',
        titulo: 'Marketplaces e embarcadores parceiros',
        status: 'planejado',
        detalhe: 'Sinal de demanda externa para enriquecer o calor regional.',
      },
      {
        id: 'ia',
        titulo: 'IA preditiva (7 dias)',
        status: 'planejado',
        detalhe: 'Previsão de colheita, sazonalidade e recomendação de reposicionamento.',
      },
    ],
    pontosFrota,
    pontosCarga,
  }
}

export function corIntensidade(intensidade: IntensidadeCalor): string {
  switch (intensidade) {
    case 'critica':
      return '#dc2626'
    case 'aquecida':
      return '#ea580c'
    case 'equilibrada':
      return '#ca8a04'
    default:
      return '#64748b'
  }
}

export function labelIntensidade(intensidade: IntensidadeCalor): string {
  switch (intensidade) {
    case 'critica':
      return 'Crítica — falta caminhão'
    case 'aquecida':
      return 'Aquecida'
    case 'equilibrada':
      return 'Equilibrada'
    default:
      return 'Fria / baixa demanda'
  }
}

export function raioPorAtividade(r: RegiaoLogistica): number {
  const base = 40_000
  const boost = Math.min(220_000, (r.cargasAtivas + r.veiculosDisponiveis) * 8_000 + r.indiceCalor * 1_200)
  return base + boost
}
