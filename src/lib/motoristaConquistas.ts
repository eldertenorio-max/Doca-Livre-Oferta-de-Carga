/**
 * Gamificação de motoristas — conquistas ouro / prata / bronze
 * calculadas a partir de viagens e avaliações da plataforma.
 */

import type { Carga, Motorista } from '../types'
import { formatCurrency } from './businessRules'
import { avaliacaoDoMotorista } from './mapaFrota'

export type NivelMedalha = 'bronze' | 'prata' | 'ouro' | null

export type ConquistaId =
  | 'entregas'
  | 'avaliacao'
  | 'pontualidade'
  | 'faturamento'
  | 'veterano'
  | 'elite'

export type ConquistaDef = {
  id: ConquistaId
  titulo: string
  icone: string
  descricao: string
  /** Metas: bronze / prata / ouro */
  metas: { bronze: number; prata: number; ouro: number }
  unidade: string
}

export const CONQUISTAS_CATALOGO: ConquistaDef[] = [
  {
    id: 'entregas',
    titulo: 'Entregas finalizadas',
    icone: '🚚',
    descricao: 'Viagens com rota finalizada no sistema.',
    metas: { bronze: 10, prata: 50, ouro: 100 },
    unidade: 'entregas',
  },
  {
    id: 'avaliacao',
    titulo: 'Excelência ★★★★★',
    icone: '⭐',
    descricao: 'Média de avaliações com volume mínimo.',
    metas: { bronze: 40, prata: 45, ouro: 48 }, // 4.0 / 4.5 / 4.8 em décimos
    unidade: 'nota×10',
  },
  {
    id: 'pontualidade',
    titulo: 'Sem atraso',
    icone: '⏱️',
    descricao: 'Entregas finalizadas até a previsão cadastrada.',
    metas: { bronze: 10, prata: 30, ouro: 60 },
    unidade: 'no prazo',
  },
  {
    id: 'faturamento',
    titulo: 'Maior faturamento',
    icone: '💰',
    descricao: 'Soma de fretes fechados nas viagens concluídas.',
    metas: { bronze: 25_000, prata: 100_000, ouro: 300_000 },
    unidade: 'R$',
  },
  {
    id: 'veterano',
    titulo: 'Tempo de casa',
    icone: '📅',
    descricao: 'Dias desde o cadastro na plataforma.',
    metas: { bronze: 90, prata: 180, ouro: 365 },
    unidade: 'dias',
  },
  {
    id: 'elite',
    titulo: 'Motorista Ouro',
    icone: '🏅',
    descricao: 'Combinação: entregas + nota alta + pontualidade.',
    metas: { bronze: 1, prata: 2, ouro: 3 }, // níveis “critérios atendidos”
    unidade: 'critérios',
  },
]

export type ConquistaStatus = {
  def: ConquistaDef
  valor: number
  nivel: NivelMedalha
  progresso: number // 0–1 até a próxima meta (ou ouro)
  proximaMeta: number | null
  labelValor: string
  desbloqueada: boolean
}

export type MotoristaMetricas = {
  entregas: number
  pontuais: number
  atrasadas: number
  faturamento: number
  mediaAvaliacao: number
  totalAvaliacoes: number
  diasCadastro: number
}

export type PainelConquistas = {
  metricas: MotoristaMetricas
  conquistas: ConquistaStatus[]
  medalhas: Array<{ id: ConquistaId; nivel: Exclude<NivelMedalha, null>; titulo: string; icone: string }>
  resumo: string
  /** Classificação geral: bronze/prata/ouro/null */
  classificacaoGeral: NivelMedalha
}

function freteCarga(c: Carga): number {
  const v = c.frete_fechado ?? c.frete_oferta ?? c.frete_tabela ?? 0
  return Number.isFinite(v) && v > 0 ? Number(v) : 0
}

function cargaDoMotorista(c: Carga, m: Motorista): boolean {
  if (c.motorista_id && c.motorista_id === m.id) return true
  if (!c.motorista_id && c.motorista) {
    return c.motorista.trim().toLowerCase() === (m.nome || '').trim().toLowerCase()
  }
  return false
}

function noPrazo(c: Carga): boolean | null {
  if (!c.viagem_finalizada_em || !c.previsao_entrega) return null
  const fim = new Date(c.viagem_finalizada_em).getTime()
  const prev = new Date(c.previsao_entrega).getTime()
  if (!Number.isFinite(fim) || !Number.isFinite(prev)) return null
  // margem de 1 dia
  return fim <= prev + 24 * 60 * 60 * 1000
}

export function metricasDoMotorista(m: Motorista, cargas: Carga[]): MotoristaMetricas {
  const entregas = (cargas ?? []).filter(
    (c) => cargaDoMotorista(c, m) && c.status_viagem === 'rota_finalizada',
  )
  let pontuais = 0
  let atrasadas = 0
  let faturamento = 0
  for (const c of entregas) {
    faturamento += freteCarga(c)
    const p = noPrazo(c)
    if (p === true) pontuais++
    else if (p === false) atrasadas++
  }

  const av = avaliacaoDoMotorista(m)
  const criado = new Date(m.created_at).getTime()
  const diasCadastro = Number.isFinite(criado)
    ? Math.max(0, Math.floor((Date.now() - criado) / (24 * 60 * 60 * 1000)))
    : 0

  return {
    entregas: entregas.length,
    pontuais,
    atrasadas,
    faturamento,
    mediaAvaliacao: av.nota,
    totalAvaliacoes: av.total,
    diasCadastro,
  }
}

function nivelPorMetas(valor: number, metas: ConquistaDef['metas']): NivelMedalha {
  if (valor >= metas.ouro) return 'ouro'
  if (valor >= metas.prata) return 'prata'
  if (valor >= metas.bronze) return 'bronze'
  return null
}

function progressoAteProximo(valor: number, metas: ConquistaDef['metas']): {
  progresso: number
  proxima: number | null
} {
  if (valor >= metas.ouro) return { progresso: 1, proxima: null }
  if (valor >= metas.prata) {
    const span = metas.ouro - metas.prata
    return {
      progresso: span > 0 ? Math.min(1, (valor - metas.prata) / span) : 1,
      proxima: metas.ouro,
    }
  }
  if (valor >= metas.bronze) {
    const span = metas.prata - metas.bronze
    return {
      progresso: span > 0 ? Math.min(1, (valor - metas.bronze) / span) : 1,
      proxima: metas.prata,
    }
  }
  const span = metas.bronze
  return {
    progresso: span > 0 ? Math.min(1, valor / span) : 0,
    proxima: metas.bronze,
  }
}

function labelValor(id: ConquistaId, valor: number, m: MotoristaMetricas): string {
  switch (id) {
    case 'entregas':
      return `${valor} entrega${valor === 1 ? '' : 's'}`
    case 'avaliacao':
      return m.totalAvaliacoes > 0
        ? `${m.mediaAvaliacao.toFixed(1).replace('.', ',')} ★ (${m.totalAvaliacoes})`
        : 'Sem avaliações'
    case 'pontualidade':
      return `${valor} no prazo${m.atrasadas > 0 ? ` · ${m.atrasadas} atrasada(s)` : ''}`
    case 'faturamento':
      return formatCurrency(valor)
    case 'veterano':
      return valor >= 365
        ? `${Math.floor(valor / 365)} ano(s)`
        : `${valor} dia${valor === 1 ? '' : 's'}`
    case 'elite':
      return `${valor}/3 critérios`
    default:
      return String(valor)
  }
}

function valorConquista(id: ConquistaId, m: MotoristaMetricas): number {
  switch (id) {
    case 'entregas':
      return m.entregas
    case 'avaliacao': {
      // exige volume mínimo para desbloquear medalha
      if (m.totalAvaliacoes < 3) return 0
      return Math.round(m.mediaAvaliacao * 10)
    }
    case 'pontualidade':
      return m.pontuais
    case 'faturamento':
      return m.faturamento
    case 'veterano':
      return m.diasCadastro
    case 'elite': {
      let c = 0
      if (m.entregas >= 25) c++
      if (m.mediaAvaliacao >= 4.5 && m.totalAvaliacoes >= 3) c++
      if (m.pontuais >= 15 || (m.pontuais >= 5 && m.atrasadas === 0)) c++
      return c
    }
    default:
      return 0
  }
}

export function painelConquistasMotorista(m: Motorista, cargas: Carga[]): PainelConquistas {
  const metricas = metricasDoMotorista(m, cargas)
  const conquistas: ConquistaStatus[] = CONQUISTAS_CATALOGO.map((def) => {
    const valor = valorConquista(def.id, metricas)
    const nivel = nivelPorMetas(valor, def.metas)
    const { progresso, proxima } = progressoAteProximo(valor, def.metas)
    return {
      def,
      valor,
      nivel,
      progresso,
      proximaMeta: proxima,
      labelValor: labelValor(def.id, valor, metricas),
      desbloqueada: nivel != null,
    }
  })

  const medalhas = conquistas
    .filter((c): c is ConquistaStatus & { nivel: Exclude<NivelMedalha, null> } => c.nivel != null)
    .map((c) => ({
      id: c.def.id,
      nivel: c.nivel,
      titulo: c.def.titulo,
      icone: c.def.icone,
    }))

  const nOuro = medalhas.filter((x) => x.nivel === 'ouro').length
  const nPrata = medalhas.filter((x) => x.nivel === 'prata').length
  const nBronze = medalhas.filter((x) => x.nivel === 'bronze').length

  let classificacaoGeral: NivelMedalha = null
  if (nOuro >= 2 || (nOuro >= 1 && nPrata + nBronze >= 2)) classificacaoGeral = 'ouro'
  else if (nPrata >= 2 || nOuro >= 1 || (nPrata >= 1 && nBronze >= 1)) classificacaoGeral = 'prata'
  else if (nBronze >= 1) classificacaoGeral = 'bronze'

  let resumo = 'Ainda sem medalhas — complete viagens e mantenha a nota alta!'
  if (classificacaoGeral === 'ouro') {
    resumo = `Motorista de elite: ${nOuro} ouro · ${nPrata} prata · ${nBronze} bronze.`
  } else if (classificacaoGeral === 'prata') {
    resumo = `Bom ritmo: ${nPrata} prata · ${nBronze} bronze · ${nOuro} ouro.`
  } else if (classificacaoGeral === 'bronze') {
    resumo = `Primeiras conquistas: ${nBronze} medalha(s) bronze. Continue entregando!`
  }

  return { metricas, conquistas, medalhas, resumo, classificacaoGeral }
}

export function labelNivelMedalha(n: NivelMedalha): string {
  if (n === 'ouro') return 'Ouro'
  if (n === 'prata') return 'Prata'
  if (n === 'bronze') return 'Bronze'
  return '—'
}
