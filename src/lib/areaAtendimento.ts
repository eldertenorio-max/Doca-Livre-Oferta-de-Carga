import { appStoreGet, appStoreGetCached, appStoreSet } from './appStore'
import { ORG_EMBARCADOR_ULTRAFRIO_ID } from './orgHierarchy'
import type { UfBr } from './mapaLogisticaIntel'

export type ModoMarcacaoArea = 'cidade'

export type CidadeAtendida = {
  id: string
  nome: string
  uf: UfBr | string
  lat?: number
  lng?: number
}

export type AreaAtendimento = {
  ownerId: string
  ownerKind: 'embarcador' | 'transportadora'
  modo: ModoMarcacaoArea
  cidades: CidadeAtendida[]
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
    modo: 'cidade',
    cidades: [],
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
  return db.areas[chaveArea(kind, ownerId)] ?? areaVazia(kind, ownerId)
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
    cidades: existe
      ? area.cidades.filter((c) => c.id !== cidade.id)
      : [...area.cidades, cidade],
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
