import type { Motorista, Transportador, Veiculo } from '../types'
import { formatCurrency } from './businessRules'

export type FrotaIconeGrupo = 'van' | 'carreta' | 'bitrem' | 'truck' | 'leve' | 'outros'

export type PontoFrota = {
  id: string
  motoristaId: string
  motoristaNome: string
  transportadorId: string
  transportadorNome: string
  veiculoId: string
  placa: string
  tipoVeiculo: string
  freteMinimo: number
  lat: number
  lng: number
  disponivel: boolean
  icone: FrotaIconeGrupo
  emoji: string
}

export function classificarIconeVeiculo(tipo: string): { grupo: FrotaIconeGrupo; emoji: string } {
  const t = tipo.toLowerCase()
  if (/van|furg|fiorino|utilit/.test(t)) return { grupo: 'van', emoji: '🚐' }
  if (/carreta|vanderleia/.test(t)) return { grupo: 'carreta', emoji: '🚛' }
  if (/bitrem|rodotrem/.test(t)) return { grupo: 'bitrem', emoji: '🚚' }
  if (/truck|toco|bitruck/.test(t)) return { grupo: 'truck', emoji: '🛻' }
  if (/hr|vuc|3\/4|passeio/.test(t)) return { grupo: 'leve', emoji: '🚐' }
  return { grupo: 'outros', emoji: '🚛' }
}

export function labelFreteCurto(valor: number): string {
  if (!Number.isFinite(valor) || valor <= 0) return '—'
  if (valor >= 1000) {
    const k = valor / 1000
    return `R$ ${k >= 10 ? k.toFixed(0) : k.toFixed(1).replace('.', ',')} mil`
  }
  return formatCurrency(valor)
}

/** Pontos no mapa: motorista ativo + veículo + origem do transportador. */
export function montarPontosFrota(
  motoristas: Motorista[],
  veiculos: Veiculo[],
  transportadores: Transportador[],
): PontoFrota[] {
  const veiculoById = new Map(veiculos.map((v) => [v.id, v]))
  const transpById = new Map(transportadores.map((t) => [t.id, t]))
  const pontos: PontoFrota[] = []

  for (const m of motoristas) {
    if (m.situacao !== 'ativo') continue
    if (!m.veiculo_id || !m.transportador_id) continue
    const v = veiculoById.get(m.veiculo_id)
    const t = transpById.get(m.transportador_id)
    if (!v || v.situacao !== 'ativo') continue
    if (!t || t.situacao !== 'ativo') continue
    const lat = t.origem_lat
    const lng = t.origem_lng
    if (lat == null || lng == null || !Number.isFinite(lat) || !Number.isFinite(lng)) continue

    const { grupo, emoji } = classificarIconeVeiculo(v.tipo)
    pontos.push({
      id: `${m.id}-${v.id}`,
      motoristaId: m.id,
      motoristaNome: m.nome,
      transportadorId: t.id,
      transportadorNome: t.nome_fantasia,
      veiculoId: v.id,
      placa: v.placa,
      tipoVeiculo: v.tipo,
      freteMinimo: Number(v.frete_minimo) || 0,
      lat,
      lng,
      disponivel: t.disponivel_mapa !== false,
      icone: grupo,
      emoji,
    })
  }

  return pontos
}
