import { appStoreGet, appStoreGetCached, appStoreSet } from './appStore'
import { ORG_EMBARCADOR_ULTRAFRIO_ID } from './orgHierarchy'
import type { UfBr } from './mapaLogisticaIntel'

export type ModoMarcacaoArea = 'regiao' | 'estado' | 'cidade' | 'bairro'

export type CidadeAtendida = {
  id: string
  nome: string
  uf: UfBr | string
  lat?: number
  lng?: number
}

export type BairroAtendido = {
  id: string
  nome: string
  municipioId: string
  municipioNome?: string
  uf: UfBr | string
  lat?: number
  lng?: number
}

export type AreaAtendimento = {
  ownerId: string
  ownerKind: 'embarcador' | 'transportadora'
  modo: ModoMarcacaoArea
  cidades: CidadeAtendida[]
  estados: string[]
  regioes: string[]
  bairros: BairroAtendido[]
  updatedAt: string
}

export type AreaAtendimentoDB = {
  areas: Record<string, AreaAtendimento>
}

const STORE_KEY = 'area_atendimento'

export function chaveArea(kind: AreaAtendimento['ownerKind'], ownerId: string) {
  return `${kind}:${ownerId}`
}

export function areaVazia(
  kind: AreaAtendimento['ownerKind'],
  ownerId: string,
): AreaAtendimento {
  return {
    ownerId,
    ownerKind: kind,
    modo: 'regiao',
    cidades: [],
    estados: [],
    regioes: [],
    bairros: [],
    updatedAt: new Date().toISOString(),
  }
}

export function loadAreaDb(): AreaAtendimentoDB {
  return appStoreGetCached<AreaAtendimentoDB>(STORE_KEY, { areas: {} })
}

export async function hydrateAreaDb(): Promise<AreaAtendimentoDB> {
  const db = await appStoreGet<AreaAtendimentoDB>(STORE_KEY, { areas: {} })
  if (!db?.areas) return { areas: {} }
  return db
}

export function saveAreaDb(db: AreaAtendimentoDB) {
  void appStoreSet(STORE_KEY, db)
}

export function getArea(
  db: AreaAtendimentoDB,
  kind: AreaAtendimento['ownerKind'],
  ownerId: string,
): AreaAtendimento {
  const raw = db.areas[chaveArea(kind, ownerId)]
  if (!raw) return areaVazia(kind, ownerId)
  const modo: ModoMarcacaoArea =
    raw.modo === 'estado' ||
    raw.modo === 'regiao' ||
    raw.modo === 'cidade' ||
    raw.modo === 'bairro'
      ? raw.modo
      : 'regiao'
  return {
    ...areaVazia(kind, ownerId),
    ...raw,
    modo,
    cidades: Array.isArray(raw.cidades) ? raw.cidades : [],
    estados: Array.isArray(raw.estados) ? raw.estados : [],
    regioes: Array.isArray(raw.regioes) ? raw.regioes : [],
    bairros: Array.isArray(raw.bairros) ? raw.bairros : [],
  }
}

export function setArea(db: AreaAtendimentoDB, area: AreaAtendimento): AreaAtendimentoDB {
  return {
    areas: {
      ...db.areas,
      [chaveArea(area.ownerKind, area.ownerId)]: {
        ...area,
        updatedAt: new Date().toISOString(),
      },
    },
  }
}

export function toggleCidade(area: AreaAtendimento, cidade: CidadeAtendida): AreaAtendimento {
  const existe = area.cidades.some((c) => c.id === cidade.id)
  return {
    ...area,
    modo: 'cidade',
    cidades: existe
      ? area.cidades.filter((c) => c.id !== cidade.id)
      : [...area.cidades, cidade],
  }
}

export function toggleEstado(area: AreaAtendimento, uf: string): AreaAtendimento {
  const sigla = uf.trim().toUpperCase()
  const existe = area.estados.some((e) => e.toUpperCase() === sigla)
  return {
    ...area,
    modo: 'estado',
    estados: existe
      ? area.estados.filter((e) => e.toUpperCase() !== sigla)
      : [...area.estados, sigla],
  }
}

export function toggleRegiao(area: AreaAtendimento, nome: string): AreaAtendimento {
  const key = nome.trim()
  const existe = area.regioes.some((r) => r === key)
  return {
    ...area,
    modo: 'regiao',
    regioes: existe ? area.regioes.filter((r) => r !== key) : [...area.regioes, key],
  }
}

export function toggleBairro(area: AreaAtendimento, bairro: BairroAtendido): AreaAtendimento {
  const existe = area.bairros.some((b) => b.id === bairro.id)
  return {
    ...area,
    modo: 'bairro',
    bairros: existe ? area.bairros.filter((b) => b.id !== bairro.id) : [...area.bairros, bairro],
  }
}

/** Embarcador cuja área este usuário edita. */
export function ownerEmbarcadorId(opts: {
  empresaOrgId?: string | null
  embarcadores: Array<{ id: string }>
}): string {
  const org = (opts.empresaOrgId || '').trim()
  if (org && opts.embarcadores.some((e) => e.id === org)) return org
  if (opts.embarcadores.some((e) => e.id === ORG_EMBARCADOR_ULTRAFRIO_ID)) {
    return ORG_EMBARCADOR_ULTRAFRIO_ID
  }
  return opts.embarcadores[0]?.id || ORG_EMBARCADOR_ULTRAFRIO_ID
}
