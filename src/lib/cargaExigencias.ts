import type { Carga, Veiculo } from '../types'
import { sameTransportadorId } from './transportadorIds'
import { aclimatacaoComTermico } from './termicoVeiculo'

export const MARCA_SEM_ESPECIFICA = 'Sem marca específica'
export const MODELO_SEM_ESPECIFICO = 'Sem modelo específico'

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

export type ModeloRiscoOpcao = { marca: string; modelo: string; label: string }

export const MODELOS_RASTREADOR: ModeloRiscoOpcao[] = [
  { marca: 'Autotrac', modelo: 'AT-1500', label: 'Autotrac AT-1500' },
  { marca: 'Autotrac', modelo: 'AT-1700', label: 'Autotrac AT-1700' },
  { marca: 'Autotrac', modelo: 'AT-2100', label: 'Autotrac AT-2100' },
  { marca: 'Omnilink', modelo: 'Omnilink Satelital', label: 'Omnilink Satelital' },
  { marca: 'Omnilink', modelo: 'Omnilink 4G', label: 'Omnilink 4G' },
  { marca: 'Sascar', modelo: 'SascarSat', label: 'Sascar SascarSat' },
  { marca: 'Sascar', modelo: 'Sascar 4G', label: 'Sascar 4G' },
  { marca: 'OnixSat', modelo: 'OnixSat 4G', label: 'OnixSat 4G' },
  { marca: 'OnixSat', modelo: 'OnixSat 3G', label: 'OnixSat 3G' },
  { marca: 'Ceabs', modelo: 'Guardian', label: 'Ceabs Guardian' },
  { marca: 'Ceabs', modelo: 'Ceabs 4G', label: 'Ceabs 4G' },
  { marca: 'SigaBem', modelo: 'SigaBem Sat', label: 'SigaBem Sat' },
  { marca: 'SigaBem', modelo: 'SigaBem 4G', label: 'SigaBem 4G' },
  { marca: 'Positron', modelo: 'Cyber', label: 'Positron Cyber' },
  { marca: 'Ituran', modelo: 'Frotas Sat', label: 'Ituran Frotas Sat' },
  { marca: MARCA_SEM_ESPECIFICA, modelo: MODELO_SEM_ESPECIFICO, label: MODELO_SEM_ESPECIFICO },
]

export const MODELOS_LOCALIZADOR: ModeloRiscoOpcao[] = [
  { marca: 'Ituran', modelo: 'Ituran Light', label: 'Ituran Light' },
  { marca: 'Ituran', modelo: 'Ituran Frotas', label: 'Ituran Frotas' },
  { marca: 'Ituran', modelo: 'Ituran Plus', label: 'Ituran Plus' },
  { marca: 'Positron', modelo: 'Tracker', label: 'Positron Tracker' },
  { marca: 'Positron', modelo: 'Exact', label: 'Positron Exact' },
  { marca: 'Cobli', modelo: 'Cobli Go', label: 'Cobli Go' },
  { marca: 'Cobli', modelo: 'Cobli One', label: 'Cobli One' },
  { marca: 'Infleet', modelo: 'Infleet Tracker', label: 'Infleet Tracker' },
  { marca: 'OnixSat', modelo: 'Localizador 4G', label: 'OnixSat Localizador 4G' },
  { marca: 'Sascar', modelo: 'Localizador', label: 'Sascar Localizador' },
  { marca: MARCA_SEM_ESPECIFICA, modelo: MODELO_SEM_ESPECIFICO, label: MODELO_SEM_ESPECIFICO },
]

export function modeloRiscoQualquer(modelo?: string | null): boolean {
  const s = (modelo || '').trim().toLowerCase()
  return !s || s === 'sem_modelo' || s === MODELO_SEM_ESPECIFICO.toLowerCase()
}

export function parseModeloRiscoOpcao(
  label: string,
  catalogo: ModeloRiscoOpcao[],
): ModeloRiscoOpcao {
  const hit = catalogo.find((o) => o.label === label)
  if (hit) return hit
  return {
    marca: MARCA_SEM_ESPECIFICA,
    modelo: MODELO_SEM_ESPECIFICO,
    label: MODELO_SEM_ESPECIFICO,
  }
}

export function labelModeloRisco(
  marca?: string | null,
  modelo?: string | null,
  catalogo: ModeloRiscoOpcao[] = MODELOS_RASTREADOR,
): string {
  if (modeloRiscoQualquer(modelo)) return MODELO_SEM_ESPECIFICO
  const m = (modelo || '').trim()
  const hit =
    catalogo.find((o) => o.modelo === m || o.label === m) ||
    catalogo.find(
      (o) =>
        o.marca === (marca || '').trim() &&
        o.modelo.toLowerCase() === m.toLowerCase(),
    )
  if (hit) return hit.label
  const marcaTxt = (marca || '').trim()
  if (marcaTxt && marcaTxt !== MARCA_SEM_ESPECIFICA) return `${marcaTxt} ${m}`.trim()
  return m
}

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

export function modeloRiscoCombina(
  exigido?: string | null,
  doVeiculoMarca?: string | null,
  doVeiculoModelo?: string | null,
  textoLivre?: string | null,
): boolean {
  if (modeloRiscoQualquer(exigido)) return true
  const want = norm(exigido)
  if (!want) return true
  const modeloV = norm(doVeiculoModelo)
  const marcaV = norm(doVeiculoMarca)
  const composto = [marcaV, modeloV].filter(Boolean).join(' ')
  const texto = norm(textoLivre)
  if (modeloV && (modeloV === want || want.endsWith(modeloV) || modeloV === want.replace(marcaV, '').trim())) {
    return true
  }
  if (composto && (composto === want || want.includes(composto))) return true
  if (texto && (texto === want || texto.includes(want))) return true
  return false
}

function atendeRiscoTipo(
  preciso: 'rastreador' | 'localizador',
  v: Veiculo,
  marca?: string | null,
  modelo?: string | null,
): boolean {
  if (v.gerenciamento_risco !== preciso) return false
  const vMarca = preciso === 'rastreador' ? v.marca_rastreador : v.marca_localizador
  const vModelo = preciso === 'rastreador' ? v.modelo_rastreador : v.modelo_localizador
  if (!modeloRiscoQualquer(modelo)) {
    return modeloRiscoCombina(modelo, vMarca, vModelo, v.rastreador_dados)
  }
  return marcaRiscoCombina(marca, vMarca, v.rastreador_dados)
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
    return atendeRiscoTipo('rastreador', v, carga.marca_rastreador, carga.modelo_rastreador)
  }
  if (risco === 'localizador') {
    return atendeRiscoTipo('localizador', v, carga.marca_localizador, carga.modelo_localizador)
  }
  if (risco === 'ambos') {
    return (
      atendeRiscoTipo('rastreador', v, carga.marca_rastreador, carga.modelo_rastreador) ||
      atendeRiscoTipo('localizador', v, carga.marca_localizador, carga.modelo_localizador)
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
    const rast = base.some((v) =>
      atendeRiscoTipo('rastreador', v, carga.marca_rastreador, carga.modelo_rastreador),
    )
    const loc = base.some((v) =>
      atendeRiscoTipo('localizador', v, carga.marca_localizador, carga.modelo_localizador),
    )
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
