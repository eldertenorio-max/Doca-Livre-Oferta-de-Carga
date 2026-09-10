import type { CategoriaId, Empresa, PapelHierarquia } from '../types'
import { SUPERIORES_PADRAO } from './hierarquia'

/** Mesmas opções da árvore organizacional do Doca Livre (Oferta de Carga). */
export const PAPEIS_HIERARQUIA: {
  id: PapelHierarquia
  label: string
  resumo: string
  cor: string
  corFundo: string
}[] = [
  {
    id: 'operador_logistico',
    label: 'Operador logístico',
    resumo: 'Opera armazenagem, frota e a cadeia do cliente (3PL).',
    cor: '#7c3aed',
    corFundo: '#ede9fe',
  },
  {
    id: 'filial_operador',
    label: 'Filial do operador',
    resumo: 'Unidade ou filial ligada a um operador logístico.',
    cor: '#4338ca',
    corFundo: '#e0e7ff',
  },
  {
    id: 'embarcador',
    label: 'Embarcador',
    resumo: 'Dono da carga: contrata transporte e publica a demanda.',
    cor: '#0891b2',
    corFundo: '#cffafe',
  },
  {
    id: 'unidade',
    label: 'Unidade',
    resumo: 'CD, galpão ou unidade operacional abaixo do embarcador.',
    cor: '#16a34a',
    corFundo: '#dcfce7',
  },
  {
    id: 'transportadora',
    label: 'Transportador',
    resumo: 'Executa o transporte da carga com frota própria ou agregada.',
    cor: '#d97706',
    corFundo: '#ffedd5',
  },
]

export const ORG_TIPO_LABEL: Record<PapelHierarquia, string> = {
  operador_logistico: 'Operador logístico',
  filial_operador: 'Filial do operador',
  embarcador: 'Embarcador',
  unidade: 'Unidade',
  transportadora: 'Transportador',
}

/** Encadeamento oficial: Super → operador → embarcador → unidade → transportador. */
export function filhosPermitidos(tipoPai: PapelHierarquia | 'super' | null): PapelHierarquia[] {
  if (!tipoPai || tipoPai === 'super') return ['operador_logistico', 'embarcador']
  const map: Record<PapelHierarquia, PapelHierarquia[]> = {
    operador_logistico: ['filial_operador', 'embarcador'],
    filial_operador: ['embarcador', 'unidade'],
    embarcador: ['unidade'],
    unidade: ['transportadora'],
    transportadora: [],
  }
  return map[tipoPai] ?? []
}

export const SUPER_HIERARQUIA = SUPERIORES_PADRAO.map((s) => ({
  nome: s.id,
  label: s.label,
}))

const EMBARCADORES_CONHECIDOS = new Set([
  'ultrafrio-log',
  'amaggi',
  'cargill-brasil',
  'bunge-brasil',
  'copersucar',
  'eldorado-brasil',
  'suzano',
])

const CATEGORIA_PARA_PAPEL: Partial<Record<CategoriaId, PapelHierarquia>> = {
  operadores_logisticos: 'operador_logistico',
  transportadoras: 'transportadora',
  armazenagem: 'unidade',
}

export function papelPorId(id?: PapelHierarquia | null) {
  return PAPEIS_HIERARQUIA.find((p) => p.id === id) ?? null
}

export function labelPapelHierarquia(id?: PapelHierarquia | null) {
  return papelPorId(id)?.label ?? '—'
}

export function categoriaPadraoDoPapel(papel: PapelHierarquia): CategoriaId {
  if (papel === 'transportadora') return 'transportadoras'
  if (papel === 'unidade') return 'armazenagem'
  return 'operadores_logisticos'
}

export function papelHierarquiaDaEmpresa(e: Empresa): PapelHierarquia {
  if (e.papel_hierarquia) return e.papel_hierarquia
  if (EMBARCADORES_CONHECIDOS.has(e.slug)) return 'embarcador'
  const tags = e.tags.map((t) => t.toLowerCase())
  if (tags.includes('embarcador') || tags.includes('embarcadora')) return 'embarcador'
  if (tags.includes('filial do operador') || tags.includes('filial_operador')) return 'filial_operador'
  return CATEGORIA_PARA_PAPEL[e.categoria] ?? 'operador_logistico'
}

export function contarHierarquia(empresas: Empresa[]) {
  const porPapel = Object.fromEntries(PAPEIS_HIERARQUIA.map((p) => [p.id, [] as Empresa[]])) as Record<
    PapelHierarquia,
    Empresa[]
  >
  for (const e of empresas) {
    porPapel[papelHierarquiaDaEmpresa(e)].push(e)
  }
  const totais = PAPEIS_HIERARQUIA.map((p) => ({
    ...p,
    empresas: porPapel[p.id].slice().sort((a, b) => a.nome_fantasia.localeCompare(b.nome_fantasia, 'pt-BR')),
    qtd: porPapel[p.id].length,
  }))
  return {
    total: empresas.length,
    operadores: totais.find((t) => t.id === 'operador_logistico')!,
    filiais: totais.find((t) => t.id === 'filial_operador')!,
    embarcadores: totais.find((t) => t.id === 'embarcador')!,
    unidades: totais.find((t) => t.id === 'unidade')!,
    transportadores: totais.find((t) => t.id === 'transportadora')!,
    totais,
  }
}
