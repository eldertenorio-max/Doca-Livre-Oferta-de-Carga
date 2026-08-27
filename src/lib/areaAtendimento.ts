import { appStoreGet, appStoreGetCached, appStoreSet } from './appStore'
import { ORG_EMBARCADOR_ULTRAFRIO_ID } from './orgHierarchy'
import type { UfBr } from './mapaLogisticaIntel'

export type ModoMarcacaoArea = 'regiao' | 'estado' | 'cidade' | 'bairro' | 'zona'

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
  /** Zonas marcadas (Centro/Norte/Sul/Leste/Oeste) — oficiais em SP, aproximadas nas demais cidades. */
  zonas: BairroAtendido[]
  updatedAt: string
}

/** Recorte gravado com nome (região, estado, cidade ou bairro — o que o embarcador escolheu). */
export type AreaMalhaSalva = AreaAtendimento & {
  id: string
  nome: string
  createdAt: string
}

export type AreaAtendimentoDB = {
  areas: Record<string, AreaAtendimento>
  malhas: Record<string, AreaMalhaSalva>
}

export const MODO_AREA_LABEL: Record<ModoMarcacaoArea, string> = {
  regiao: 'Região',
  estado: 'Estado',
  cidade: 'Cidade',
  bairro: 'Bairro',
  zona: 'Zona',
}

const STORE_KEY = 'area_atendimento'

export function chaveArea(kind: AreaAtendimento['ownerKind'], ownerId: string) {
  return `${kind}:${ownerId}`
}

export function uidMalha() {
  return `malha-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
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
    zonas: [],
    updatedAt: new Date().toISOString(),
  }
}

function asModo(raw: unknown): ModoMarcacaoArea {
  if (
    raw === 'estado' ||
    raw === 'regiao' ||
    raw === 'cidade' ||
    raw === 'bairro' ||
    raw === 'zona'
  )
    return raw
  return 'regiao'
}

function asMalha(raw: Partial<AreaMalhaSalva> | null | undefined): AreaMalhaSalva | null {
  const id = (raw?.id || '').trim()
  const nome = (raw?.nome || '').trim()
  const ownerId = (raw?.ownerId || '').trim()
  if (!id || !nome || !ownerId) return null
  const kind = raw?.ownerKind === 'transportadora' ? 'transportadora' : 'embarcador'
  const base = areaVazia(kind, ownerId)
  return {
    ...base,
    ...raw,
    id,
    nome,
    ownerId,
    ownerKind: kind,
    modo: asModo(raw?.modo),
    cidades: Array.isArray(raw?.cidades) ? raw.cidades : [],
    estados: Array.isArray(raw?.estados) ? raw.estados : [],
    regioes: Array.isArray(raw?.regioes) ? raw.regioes : [],
    bairros: Array.isArray(raw?.bairros) ? raw.bairros : [],
    zonas: Array.isArray(raw?.zonas) ? raw.zonas : [],
    createdAt: raw?.createdAt || raw?.updatedAt || new Date().toISOString(),
    updatedAt: raw?.updatedAt || new Date().toISOString(),
  }
}

export function normalizeAreaDb(raw: Partial<AreaAtendimentoDB> | null | undefined): AreaAtendimentoDB {
  const areas =
    raw?.areas && typeof raw.areas === 'object' && !Array.isArray(raw.areas) ? raw.areas : {}
  const malhas: Record<string, AreaMalhaSalva> = {}
  const src = raw?.malhas
  if (src && typeof src === 'object') {
    for (const [k, v] of Object.entries(src)) {
      const m = asMalha(v)
      if (m) malhas[k] = m
    }
  }
  return { areas, malhas }
}

export function loadAreaDb(): AreaAtendimentoDB {
  return normalizeAreaDb(appStoreGetCached<Partial<AreaAtendimentoDB> | null>(STORE_KEY, null))
}

export async function hydrateAreaDb(): Promise<AreaAtendimentoDB> {
  const db = await appStoreGet<Partial<AreaAtendimentoDB> | null>(STORE_KEY, null)
  return normalizeAreaDb(db)
}

export function saveAreaDb(db: AreaAtendimentoDB) {
  void appStoreSet(STORE_KEY, normalizeAreaDb(db))
}

export function getArea(
  db: AreaAtendimentoDB,
  kind: AreaAtendimento['ownerKind'],
  ownerId: string,
): AreaAtendimento {
  const raw = db.areas[chaveArea(kind, ownerId)]
  if (!raw) return areaVazia(kind, ownerId)
  const modo = asModo(raw.modo)
  return {
    ...areaVazia(kind, ownerId),
    ...raw,
    modo,
    cidades: Array.isArray(raw.cidades) ? raw.cidades : [],
    estados: Array.isArray(raw.estados) ? raw.estados : [],
    regioes: Array.isArray(raw.regioes) ? raw.regioes : [],
    bairros: Array.isArray(raw.bairros) ? raw.bairros : [],
    zonas: Array.isArray(raw.zonas) ? raw.zonas : [],
  }
}

export function setArea(db: AreaAtendimentoDB, area: AreaAtendimento): AreaAtendimentoDB {
  const next = normalizeAreaDb(db)
  return {
    ...next,
    areas: {
      ...next.areas,
      [chaveArea(area.ownerKind, area.ownerId)]: {
        ...area,
        updatedAt: new Date().toISOString(),
      },
    },
  }
}

export function areaTemMarca(area: AreaAtendimento, modo?: ModoMarcacaoArea | null): boolean {
  const m = modo ?? area.modo
  if (m === 'regiao') return area.regioes.length > 0
  if (m === 'estado') return area.estados.length > 0
  if (m === 'cidade') return area.cidades.length > 0
  if (m === 'bairro') return area.bairros.length > 0
  if (m === 'zona') return area.zonas.length > 0
  return (
    area.regioes.length +
      area.estados.length +
      area.cidades.length +
      area.bairros.length +
      area.zonas.length >
    0
  )
}

export function resumoMalha(
  m: Pick<AreaMalhaSalva, 'modo' | 'regioes' | 'estados' | 'cidades' | 'bairros' | 'zonas'>,
): string {
  if (m.modo === 'regiao') return m.regioes.join(', ') || '—'
  if (m.modo === 'estado') return m.estados.join(', ') || '—'
  if (m.modo === 'cidade') {
    const nomes = m.cidades.map((c) => c.nome)
    if (nomes.length <= 3) return nomes.join(', ') || '—'
    return `${nomes.slice(0, 3).join(', ')} +${nomes.length - 3}`
  }
  const nomes = (m.modo === 'zona' ? m.zonas : m.bairros).map((b) => b.nome)
  if (nomes.length <= 3) return nomes.join(', ') || '—'
  return `${nomes.slice(0, 3).join(', ')} +${nomes.length - 3}`
}

export function malhasDoOwner(
  db: AreaAtendimentoDB,
  kind: AreaAtendimento['ownerKind'],
  ownerId: string,
): AreaMalhaSalva[] {
  return Object.values(normalizeAreaDb(db).malhas)
    .filter((m) => m.ownerKind === kind && m.ownerId === ownerId)
    .sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''))
}

export function snapshotMalha(opts: {
  area: AreaAtendimento
  nome: string
  id?: string | null
  previa?: AreaMalhaSalva | null
}): AreaMalhaSalva {
  const agora = new Date().toISOString()
  const id = (opts.id || '').trim() || uidMalha()
  return {
    ...opts.area,
    id,
    nome: opts.nome.trim(),
    createdAt: opts.previa?.createdAt || agora,
    updatedAt: agora,
  }
}

export function upsertMalha(db: AreaAtendimentoDB, malha: AreaMalhaSalva): AreaAtendimentoDB {
  const next = normalizeAreaDb(db)
  return {
    ...next,
    malhas: {
      ...next.malhas,
      [malha.id]: malha,
    },
  }
}

export function excluirMalha(db: AreaAtendimentoDB, id: string): AreaAtendimentoDB {
  const next = normalizeAreaDb(db)
  const malhas = { ...next.malhas }
  delete malhas[id]
  return { ...next, malhas }
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

export function toggleZona(area: AreaAtendimento, zona: BairroAtendido): AreaAtendimento {
  const existe = area.zonas.some((z) => z.id === zona.id)
  return {
    ...area,
    modo: 'zona',
    zonas: existe ? area.zonas.filter((z) => z.id !== zona.id) : [...area.zonas, zona],
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
