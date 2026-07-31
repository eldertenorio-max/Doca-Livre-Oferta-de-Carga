import type { Carga, Rota, Veiculo } from '../types'
import { enderecoPorCoordenadas, geocodificarConsulta } from './geocodeEndereco'
import { loadConfigTransportador } from './configTransportador'

function labelDeEndereco(
  dados: {
    endereco?: string
    numero?: string
    bairro?: string
    cidade?: string
    uf?: string
  },
  display?: string,
  fallback = '',
): string {
  if (display?.trim()) return display.trim()
  const rua =
    dados.endereco && dados.numero
      ? `${dados.endereco}, ${dados.numero}`
      : dados.endereco || dados.numero || ''
  const label = [rua, dados.bairro, dados.cidade, dados.uf]
    .map((p) => (p || '').trim())
    .filter(Boolean)
    .join(', ')
  return label || fallback
}

/**
 * Após finalizar viagem: move origem_* do veículo para o destino da carga
 * (coords da rota cadastrada ou geocode do texto destino).
 */
export async function montarPatchLocalizacaoAposViagem(params: {
  carga: Pick<
    Carga,
    | 'destino'
    | 'rota_id'
    | 'veiculo_id'
    | 'transportador_vencedor_id'
    | 'placa'
  >
  veiculo: Veiculo | undefined
  rota: Rota | undefined
}): Promise<Partial<Veiculo> | null> {
  const { carga, veiculo, rota } = params
  const tid = carga.transportador_vencedor_id
  if (!tid || !carga.veiculo_id || !veiculo) return null

  const cfg = loadConfigTransportador(tid)
  if (!cfg.atualizar_localizacao_ao_finalizar) return null

  let lat = rota?.destino_lat ?? null
  let lng = rota?.destino_lng ?? null
  let enderecoTxt = (carga.destino || '').trim()

  if (
    (lat == null || lng == null || !Number.isFinite(lat) || !Number.isFinite(lng)) &&
    enderecoTxt.length >= 5
  ) {
    const geo = await geocodificarConsulta(enderecoTxt)
    if (geo.ok) {
      lat = geo.coords.lat
      lng = geo.coords.lng
      if (geo.display?.trim()) enderecoTxt = geo.display.trim()
    }
  }

  if (lat == null || lng == null || !Number.isFinite(lat) || !Number.isFinite(lng)) {
    return null
  }

  const rev = await enderecoPorCoordenadas(lat, lng)
  if (rev.ok) {
    return {
      origem_cep: rev.dados.cep || undefined,
      origem_cidade: rev.dados.cidade || undefined,
      origem_uf: rev.dados.uf || undefined,
      origem_endereco: rev.dados.endereco || undefined,
      origem_numero: rev.dados.numero || undefined,
      origem_bairro: rev.dados.bairro || undefined,
      origem_complemento: rev.dados.complemento || undefined,
      origem_lat: lat,
      origem_lng: lng,
      raio_km: veiculo.raio_km && veiculo.raio_km > 0 ? veiculo.raio_km : 50,
    }
  }

  return {
    origem_endereco: labelDeEndereco({}, enderecoTxt, enderecoTxt) || enderecoTxt,
    origem_lat: lat,
    origem_lng: lng,
    raio_km: veiculo.raio_km && veiculo.raio_km > 0 ? veiculo.raio_km : 50,
  }
}
