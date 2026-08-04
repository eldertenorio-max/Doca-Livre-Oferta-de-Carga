import type { Transportador, Veiculo } from '../types'

export function veiculoSemLocalizacaoMapa(v: Pick<Veiculo, 'origem_lat' | 'origem_lng'>): boolean {
  return (
    v.origem_lat == null ||
    v.origem_lng == null ||
    !Number.isFinite(Number(v.origem_lat)) ||
    !Number.isFinite(Number(v.origem_lng))
  )
}

export function transportadorTemOrigemMapa(
  t: Pick<Transportador, 'origem_lat' | 'origem_lng'>,
): boolean {
  return (
    t.origem_lat != null &&
    t.origem_lng != null &&
    Number.isFinite(Number(t.origem_lat)) &&
    Number.isFinite(Number(t.origem_lng))
  )
}

/** Copia endereço/coords de origem da transportadora para o veículo. */
export function localizacaoDaTransportadora(
  t: Transportador,
): Partial<Veiculo> | null {
  const hasCoords = transportadorTemOrigemMapa(t)
  const cidade = (t.origem_cidade || t.cidade || '').trim()
  const endereco = (t.origem_endereco || t.endereco || '').trim()
  const cep = (t.origem_cep || t.cep || '').trim()
  const hasAddress = Boolean(cidade || endereco || cep)
  if (!hasCoords && !hasAddress) return null
  return {
    origem_cep: cep || undefined,
    origem_cidade: cidade || undefined,
    origem_uf: ((t.origem_uf || t.uf || 'SP').trim().toUpperCase().slice(0, 2) ||
      'SP') as string,
    origem_endereco: endereco || undefined,
    origem_numero: (t.origem_numero || t.numero || '').trim() || undefined,
    origem_bairro: (t.origem_bairro || t.bairro || '').trim() || undefined,
    origem_complemento:
      (t.origem_complemento || t.complemento || '').trim() || undefined,
    origem_lat: hasCoords ? Number(t.origem_lat) : null,
    origem_lng: hasCoords ? Number(t.origem_lng) : null,
    raio_km:
      t.raio_km != null && Number(t.raio_km) > 0 ? Number(t.raio_km) : 50,
  }
}

/**
 * Preenche veículos sem lat/lng com a origem da transportadora.
 * Não sobrescreve localização já cadastrada na placa.
 */
export function preencherVeiculosComOrigemTransportadora(
  veiculos: Veiculo[],
  transportadores: Transportador[],
): { veiculos: Veiculo[]; alterados: number } {
  const byId = new Map(transportadores.map((t) => [t.id, t]))
  let alterados = 0
  const now = new Date().toISOString()
  const next = veiculos.map((v) => {
    if (!veiculoSemLocalizacaoMapa(v)) return v
    if (!v.transportador_id) return v
    const t = byId.get(v.transportador_id)
    if (!t) return v
    const patch = localizacaoDaTransportadora(t)
    if (!patch) return v
    alterados += 1
    return {
      ...v,
      ...patch,
      // Mantém raio próprio se já existir
      raio_km:
        v.raio_km != null && Number(v.raio_km) > 0
          ? Number(v.raio_km)
          : patch.raio_km,
      updated_at: now,
    }
  })
  return { veiculos: next, alterados }
}
