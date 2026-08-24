import type { Carga, Veiculo } from '../types'
import { sameTransportadorId } from './transportadorIds'
import { aclimatacaoComTermico } from './termicoVeiculo'

export const MARCA_SEM_ESPECIFICA = 'Sem marca específica'

export const MARCAS_RASTREADOR = [
  'Autotrac',
  'Omnilink',
  'Sascar',
  'OnixSat',
  'Ituran',
  'Positron',
  'Ceabs',
  'SigaBem',
  MARCA_SEM_ESPECIFICA,
] as const

export const MARCAS_LOCALIZADOR = [
  'Ituran',
  'Positron',
  'Cobli',
  'Infleet',
  'OnixSat',
  'Sascar',
  MARCA_SEM_ESPECIFICA,
] as const

export function marcaRiscoQualquer(marca?: string | null): boolean {
  const s = (marca || '').trim().toLowerCase()
  return !s || s === 'sem_marca' || s === MARCA_SEM_ESPECIFICA.toLowerCase()
}

function norm(s?: string | null): string {
  return (s || '').trim().toLowerCase()
}

export function marcaRiscoCombina(
  exigida?: string | null,
  doVeiculo?: string | null,
  textoLivre?: string | null,
): boolean {
  if (marcaRiscoQualquer(exigida)) return true
  const want = norm(exigida)
  if (!want) return true
  if (norm(doVeiculo) === want) return true
  if (textoLivre && textoLivre.toLowerCase().includes(want)) return true
  return false
}

function veiculoAtivo(v: Veiculo): boolean {
  return v.situacao !== 'inativo'
}

function atendeTemp(carga: Carga, v: Veiculo): boolean {
  const cmin = carga.temp_min
  const cmax = carga.temp_max
  if (cmin == null && cmax == null) return true
  if (!aclimatacaoComTermico(v.aclimatacao)) return false
  if (cmin != null && (v.temp_min == null || v.temp_min > cmin)) return false
  if (cmax != null && (v.temp_max == null || v.temp_max < cmax)) return false
  return true
}

function atendeAjudante(carga: Carga, v: Veiculo): boolean {
  if (!carga.exige_ajudante) return true
  return Boolean(v.usa_manobrista)
}

function atendeRiscoTipo(
  preciso: 'rastreador' | 'localizador',
  v: Veiculo,
  marca?: string | null,
): boolean {
  if (v.gerenciamento_risco !== preciso) return false
  if (preciso === 'rastreador') {
    return marcaRiscoCombina(marca, v.marca_rastreador, v.rastreador_dados)
  }
  return marcaRiscoCombina(marca, v.marca_localizador, v.rastreador_dados)
}

export function temExigenciaDeFrota(
  carga: Pick<
    Carga,
    'temp_min' | 'temp_max' | 'exige_ajudante' | 'gerenciamento_risco'
  >,
): boolean {
  if (carga.temp_min != null || carga.temp_max != null) return true
  if (carga.exige_ajudante) return true
  const r = carga.gerenciamento_risco
  return r === 'rastreador' || r === 'localizador' || r === 'ambos'
}

export function veiculoAtendeCarga(carga: Carga, v: Veiculo): boolean {
  if (!veiculoAtivo(v)) return false
  if (!atendeTemp(carga, v)) return false
  if (!atendeAjudante(carga, v)) return false
  const risco = carga.gerenciamento_risco
  if (!risco || risco === 'nao') return true
  if (risco === 'rastreador') {
    return atendeRiscoTipo('rastreador', v, carga.marca_rastreador)
  }
  if (risco === 'localizador') {
    return atendeRiscoTipo('localizador', v, carga.marca_localizador)
  }
  if (risco === 'ambos') {
    return (
      atendeRiscoTipo('rastreador', v, carga.marca_rastreador) ||
      atendeRiscoTipo('localizador', v, carga.marca_localizador)
    )
  }
  return true
}

export function transportadorAtendeCarga(
  carga: Carga,
  veiculos: Veiculo[],
  transportadorId: string,
): boolean {
  if (!temExigenciaDeFrota(carga)) return true
  const meus = veiculos.filter(
    (v) => veiculoAtivo(v) && sameTransportadorId(v.transportador_id, transportadorId),
  )
  if (carga.gerenciamento_risco === 'ambos') {
    const base = meus.filter((v) => atendeTemp(carga, v) && atendeAjudante(carga, v))
    const rast = base.some((v) => atendeRiscoTipo('rastreador', v, carga.marca_rastreador))
    const loc = base.some((v) => atendeRiscoTipo('localizador', v, carga.marca_localizador))
    return rast && loc
  }
  return meus.some((v) => veiculoAtendeCarga(carga, v))
}

export function filtrarTidsPorExigencias(
  carga: Carga,
  veiculos: Veiculo[],
  tids: string[],
): string[] {
  if (!temExigenciaDeFrota(carga)) return tids
  return tids.filter((tid) => transportadorAtendeCarga(carga, veiculos, tid))
}

export function labelFaixaTemperatura(c: Pick<Carga, 'temp_min' | 'temp_max'>): string {
  if (c.temp_min == null && c.temp_max == null) return ''
  const min = c.temp_min != null ? `${c.temp_min}°C` : '—'
  const max = c.temp_max != null ? `${c.temp_max}°C` : '—'
  return `${min} a ${max}`
}
