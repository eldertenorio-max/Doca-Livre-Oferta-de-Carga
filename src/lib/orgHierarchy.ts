import { appStoreGet, appStoreGetCached, appStoreSet, migrateLocalKeyToAppStore } from './appStore'
import type { GrupoTransportador } from '../types'

/** Hierarquia organizacional do Oferta de Carga.
 * Super Usuários (Diego / Elder) ficam acima de tudo.
 * Abaixo: Embarcador → Unidade → Transportadoras.
 */

export type OrgTipo =
  | 'operador_logistico'
  | 'filial_operador'
  | 'embarcador'
  | 'unidade'
  | 'transportadora'

export type OrgNo = {
  id: string
  parent_id: string | null
  tipo: OrgTipo
  nome: string
  cnpj?: string | null
  codigo?: string | null
  ordem?: number
  transportador_id?: string | null
  children?: OrgNo[]
}

export const ORG_TIPO_LABEL: Record<OrgTipo, string> = {
  operador_logistico: 'Operador Logístico',
  filial_operador: 'Filial do Operador',
  embarcador: 'Embarcador',
  unidade: 'Unidade',
  transportadora: 'Transportadora',
}

export const ORG_EMBARCADOR_ULTRAFRIO_ID = 'org-embarcador-ultrafrio'
export const ORG_UNIDADE_CD_GUARULHOS_ID = 'org-unidade-cd-guarulhos'

export const SUPER_HIERARQUIA = [
  { nome: 'Diego', usuario: 'diego' },
  { nome: 'Elder', usuario: 'elder' },
] as const

/** Tipos antigos: não criar mais (a árvore nova começa no embarcador). */
const ORG_TIPOS_OCULTOS_NO_CADASTRO: OrgTipo[] = ['operador_logistico', 'filial_operador']

export function allowedOrgChildTypes(tipoPai: string | null | undefined): OrgTipo[] {
  const map: Record<string, OrgTipo[]> = {
    '': ['embarcador'],
    embarcador: ['unidade'],
    unidade: ['transportadora'],
    transportadora: [],
    operador_logistico: ['embarcador'],
    filial_operador: ['embarcador', 'unidade'],
  }
  if (!tipoPai) return ['embarcador']
  return (map[tipoPai] ?? []).filter((t) => !ORG_TIPOS_OCULTOS_NO_CADASTRO.includes(t))
}

export function grupoIdDaHierarquia(orgId: string) {
  return `g-org-${orgId}`
}

export const SEED_ORG_TREE: OrgNo[] = [
  {
    id: ORG_EMBARCADOR_ULTRAFRIO_ID,
    parent_id: null,
    tipo: 'embarcador',
    nome: 'Ultrafrio LOG',
    cnpj: '29.288.134/0001-31',
    codigo: 'UFR',
    ordem: 0,
    children: [
      {
        id: ORG_UNIDADE_CD_GUARULHOS_ID,
        parent_id: ORG_EMBARCADOR_ULTRAFRIO_ID,
        tipo: 'unidade',
        nome: 'Ultrafrio Log - CD Guarulhos',
        cnpj: '29.288.134/0001-32',
        codigo: 'CD-GRU',
        ordem: 1,
        children: [],
      },
    ],
  },
]

const ORG_KEY_LEGACY = 'doca-livre-org-v2'
const STORE_KEY = 'org_tree'

export function loadOrgTree(): OrgNo[] {
  const cached = appStoreGetCached<OrgNo[] | null>(STORE_KEY, null)
  if (cached?.length) return structuredClone(cached)
  return structuredClone(SEED_ORG_TREE)
}

export function saveOrgTree(tree: OrgNo[]) {
  void appStoreSet(STORE_KEY, tree)
}

export async function hydrateOrgTree(): Promise<OrgNo[]> {
  await migrateLocalKeyToAppStore(ORG_KEY_LEGACY, STORE_KEY, (raw) => {
    try {
      const parsed = JSON.parse(raw) as OrgNo[]
      return Array.isArray(parsed) && parsed.length ? parsed : null
    } catch {
      return null
    }
  })
  const remote = await appStoreGet<OrgNo[] | null>(STORE_KEY, null)
  if (remote?.length) return structuredClone(remote)
  const seed = structuredClone(SEED_ORG_TREE)
  void appStoreSet(STORE_KEY, seed)
  return seed
}

export function flattenOrg(nodes: OrgNo[], acc: OrgNo[] = []): OrgNo[] {
  for (const n of nodes) {
    acc.push(n)
    if (n.children?.length) flattenOrg(n.children, acc)
  }
  return acc
}

export function upsertOrgNo(tree: OrgNo[], no: OrgNo): OrgNo[] {
  const clone = structuredClone(tree)

  function remove(nodes: OrgNo[]): OrgNo[] {
    return nodes
      .filter((n) => n.id !== no.id)
      .map((n) => ({ ...n, children: n.children ? remove(n.children) : [] }))
  }

  function insert(nodes: OrgNo[]): boolean {
    if (!no.parent_id) {
      nodes.push({ ...no, children: no.children ?? [] })
      return true
    }
    for (const n of nodes) {
      if (n.id === no.parent_id) {
        n.children = [...(n.children ?? []).filter((c) => c.id !== no.id), { ...no, children: no.children ?? [] }]
        return true
      }
      if (n.children && insert(n.children)) return true
    }
    return false
  }

  const cleaned = remove(clone)
  if (!no.parent_id) {
    return [...cleaned.filter((n) => n.id !== no.id), { ...no, children: no.children ?? [] }]
  }
  insert(cleaned)
  return cleaned
}

export function deleteOrgNo(tree: OrgNo[], id: string): OrgNo[] {
  function walk(nodes: OrgNo[]): OrgNo[] {
    return nodes
      .filter((n) => n.id !== id)
      .map((n) => ({ ...n, children: n.children ? walk(n.children) : [] }))
  }
  return walk(structuredClone(tree))
}

/** Pai padrão: unidade CD Guarulhos, senão a 1ª unidade, senão o 1º embarcador. */
export function findDefaultTransportadoraParentId(tree: OrgNo[]): string | null {
  const flat = flattenOrg(tree)
  if (flat.some((n) => n.id === ORG_UNIDADE_CD_GUARULHOS_ID)) {
    return ORG_UNIDADE_CD_GUARULHOS_ID
  }
  return (
    flat.find((n) => n.tipo === 'unidade')?.id ??
    flat.find((n) => n.tipo === 'embarcador')?.id ??
    null
  )
}

export function findOrgNo(tree: OrgNo[], id: string | null | undefined): OrgNo | null {
  if (!id) return null
  return flattenOrg(tree).find((n) => n.id === id) ?? null
}

export function listarEmbarcadores(tree: OrgNo[]): OrgNo[] {
  return flattenOrg(tree).filter((n) => n.tipo === 'embarcador')
}

export function listarUnidades(tree: OrgNo[], embarcadorId?: string | null): OrgNo[] {
  const all = flattenOrg(tree).filter((n) => n.tipo === 'unidade')
  if (!embarcadorId) return all
  return all.filter((n) => n.parent_id === embarcadorId)
}

/** IDs de transportadoras abaixo deste nó (unidade ou embarcador). */
export function tidsSobNo(tree: OrgNo[], orgId: string | null | undefined): string[] {
  const no = findOrgNo(tree, orgId)
  if (!no) return []
  const ids = new Set<string>()
  function walk(n: OrgNo) {
    if (n.tipo === 'transportadora' && n.transportador_id) ids.add(n.transportador_id)
    for (const c of n.children ?? []) walk(c)
  }
  walk(no)
  return [...ids]
}

export function gruposDaHierarquia(tree: OrgNo[]): GrupoTransportador[] {
  const agora = new Date().toISOString()
  return flattenOrg(tree)
    .filter((n) => n.tipo === 'embarcador' || n.tipo === 'unidade')
    .map((n) => ({
      id: grupoIdDaHierarquia(n.id),
      descricao: n.tipo === 'embarcador' ? `Embarcador: ${n.nome}` : `Unidade: ${n.nome}`,
      situacao: 'ativo' as const,
      observacao: 'Sincronizado da hierarquia (quem vê as publicações)',
      transportador_ids: tidsSobNo(tree, n.id),
      updated_at: agora,
    }))
}

function precisaMigrar(tree: OrgNo[]): boolean {
  if (!tree.length) return true
  const flat = flattenOrg(tree)
  if (flat.some((n) => n.tipo === 'operador_logistico' || n.tipo === 'filial_operador')) {
    return true
  }
  if (!flat.some((n) => n.id === ORG_EMBARCADOR_ULTRAFRIO_ID)) return true
  if (!flat.some((n) => n.id === ORG_UNIDADE_CD_GUARULHOS_ID)) return true
  return false
}

function coletarTransportadoras(
  tree: OrgNo[],
  transportadores: { id: string; nome_fantasia: string; cnpj?: string | null; situacao?: string }[],
): OrgNo[] {
  const byTid = new Map<string, OrgNo>()
  for (const n of flattenOrg(tree)) {
    if (n.tipo !== 'transportadora' || !n.transportador_id) continue
    byTid.set(n.transportador_id, {
      ...n,
      parent_id: ORG_UNIDADE_CD_GUARULHOS_ID,
      children: [],
    })
  }
  for (const t of transportadores) {
    if (t.situacao === 'inativo' || t.situacao === 'recusado') continue
    const prev = byTid.get(t.id)
    byTid.set(t.id, {
      id: prev?.id ?? `org-${t.id}`,
      parent_id: ORG_UNIDADE_CD_GUARULHOS_ID,
      tipo: 'transportadora',
      nome: t.nome_fantasia || prev?.nome || t.id,
      cnpj: t.cnpj ?? prev?.cnpj ?? null,
      transportador_id: t.id,
      ordem: prev?.ordem ?? byTid.size,
      children: [],
    })
  }
  return [...byTid.values()].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
}

function montarArvoreUltrafrio(
  treeAntiga: OrgNo[],
  transportadores: { id: string; nome_fantasia: string; cnpj?: string | null; situacao?: string }[],
): OrgNo[] {
  const filhos = coletarTransportadoras(treeAntiga, transportadores)
  return [
    {
      id: ORG_EMBARCADOR_ULTRAFRIO_ID,
      parent_id: null,
      tipo: 'embarcador',
      nome: 'Ultrafrio LOG',
      cnpj: '29.288.134/0001-31',
      codigo: 'UFR',
      ordem: 0,
      children: [
        {
          id: ORG_UNIDADE_CD_GUARULHOS_ID,
          parent_id: ORG_EMBARCADOR_ULTRAFRIO_ID,
          tipo: 'unidade',
          nome: 'Ultrafrio Log - CD Guarulhos',
          cnpj: '29.288.134/0001-32',
          codigo: 'CD-GRU',
          ordem: 1,
          children: filhos,
        },
      ],
    },
  ]
}

/** Garante Super → Ultrafrio LOG (embarcador) → CD Guarulhos (unidade) → transportadoras. */
export function ensureHierarquiaPadrao(
  transportadores: { id: string; nome_fantasia: string; cnpj?: string | null; situacao?: string }[],
): OrgNo[] {
  let tree = loadOrgTree()
  if (precisaMigrar(tree)) {
    tree = montarArvoreUltrafrio(tree, transportadores)
    saveOrgTree(tree)
    return tree
  }
  return syncTodasTransportadorasNaHierarquia(transportadores)
}

/**
 * Inclui ou atualiza o nó da transportadora na hierarquia (Supabase).
 * Usado ao criar/editar transportadora no cadastro ou no cadastro público.
 */
export function syncTransportadoraNaHierarquia(t: {
  id: string
  nome_fantasia: string
  cnpj?: string | null
}): OrgNo[] {
  const tree = loadOrgTree()
  const flat = flattenOrg(tree)
  const existing = flat.find((n) => n.transportador_id === t.id)
  const parentId =
    existing?.parent_id ?? findDefaultTransportadoraParentId(tree)
  if (!parentId) {
    const seed = montarArvoreUltrafrio([], [t])
    saveOrgTree(seed)
    return seed
  }

  const siblings = flat.filter((n) => n.parent_id === parentId)
  const no: OrgNo = {
    id: existing?.id ?? `org-${t.id}`,
    parent_id: parentId,
    tipo: 'transportadora',
    nome: t.nome_fantasia,
    cnpj: t.cnpj ?? null,
    transportador_id: t.id,
    ordem: existing?.ordem ?? siblings.length + 1,
    children: existing?.children ?? [],
  }
  const next = upsertOrgNo(tree, no)
  saveOrgTree(next)
  return next
}

export function removeTransportadoraDaHierarquia(transportadorId: string): OrgNo[] {
  const tree = loadOrgTree()
  const node = flattenOrg(tree).find((n) => n.transportador_id === transportadorId)
  if (!node) return tree
  const next = deleteOrgNo(tree, node.id)
  saveOrgTree(next)
  return next
}

/** Garante que todas as transportadoras ativas/pendentes existam na árvore. */
export function syncTodasTransportadorasNaHierarquia(
  transportadores: { id: string; nome_fantasia: string; cnpj?: string | null; situacao?: string }[],
): OrgNo[] {
  let tree = loadOrgTree()
  for (const t of transportadores) {
    if (t.situacao === 'inativo' || t.situacao === 'recusado') continue
    tree = syncTransportadoraNaHierarquia(t)
  }
  return tree
}
