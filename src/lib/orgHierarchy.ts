import { appStoreGet, appStoreGetCached, appStoreSet, migrateLocalKeyToAppStore } from './appStore'

/** Hierarquia organizacional do Oferta de Carga. */

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

/** Tipos ainda existentes em dados antigos, mas sem opção de criar novos. */
const ORG_TIPOS_OCULTOS_NO_CADASTRO: OrgTipo[] = ['filial_operador', 'unidade']

export function allowedOrgChildTypes(tipoPai: string | null | undefined): OrgTipo[] {
  const map: Record<string, OrgTipo[]> = {
    '': ['operador_logistico'],
    operador_logistico: ['embarcador', 'transportadora'],
    filial_operador: ['embarcador', 'transportadora'],
    embarcador: ['transportadora'],
    unidade: ['transportadora'],
    transportadora: [],
  }
  if (!tipoPai) return ['operador_logistico']
  return (map[tipoPai] ?? []).filter((t) => !ORG_TIPOS_OCULTOS_NO_CADASTRO.includes(t))
}

export const SEED_ORG_TREE: OrgNo[] = [
  {
    id: 'org-root',
    parent_id: null,
    tipo: 'operador_logistico',
    nome: 'Doca Livre',
    codigo: 'DL',
    ordem: 0,
    children: [
      {
        id: 'org-filial-sp',
        parent_id: 'org-root',
        tipo: 'filial_operador',
        nome: 'Filial São Paulo',
        codigo: 'SP',
        ordem: 1,
        children: [
          {
            id: 'org-embarcador-doca',
            parent_id: 'org-filial-sp',
            tipo: 'embarcador',
            nome: 'Doca Livre Oferta de Carga',
            codigo: 'DLOC',
            ordem: 1,
            children: [
              {
                id: 'org-unidade-jb',
                parent_id: 'org-embarcador-doca',
                tipo: 'unidade',
                nome: 'Unidade José Bonifácio',
                codigo: 'JB',
                ordem: 1,
                children: [
                  {
                    id: 'org-t1',
                    parent_id: 'org-unidade-jb',
                    tipo: 'transportadora',
                    nome: 'Santos Transportes',
                    transportador_id: '11111111-1111-1111-1111-111111111111',
                    ordem: 1,
                  },
                  {
                    id: 'org-t2',
                    parent_id: 'org-unidade-jb',
                    tipo: 'transportadora',
                    nome: 'Log Nova Era',
                    transportador_id: '22222222-2222-2222-2222-222222222222',
                    ordem: 2,
                  },
                ],
              },
            ],
          },
        ],
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

/** Pai padrão para transportadoras: 1º embarcador, senão operador (sem exigir filial/unidade). */
export function findDefaultTransportadoraParentId(tree: OrgNo[]): string | null {
  const flat = flattenOrg(tree)
  return (
    flat.find((n) => n.tipo === 'embarcador')?.id ??
    flat.find((n) => n.tipo === 'unidade')?.id ??
    flat.find((n) => n.tipo === 'filial_operador')?.id ??
    flat.find((n) => n.tipo === 'operador_logistico')?.id ??
    null
  )
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
    // Árvore vazia: cria raiz mínima + transportadora
    const root: OrgNo = {
      id: 'org-root',
      parent_id: null,
      tipo: 'operador_logistico',
      nome: 'Doca Livre',
      codigo: 'DL',
      ordem: 0,
      children: [
        {
          id: `org-${t.id}`,
          parent_id: 'org-root',
          tipo: 'transportadora',
          nome: t.nome_fantasia,
          cnpj: t.cnpj ?? null,
          transportador_id: t.id,
          ordem: 1,
          children: [],
        },
      ],
    }
    const next = [root]
    saveOrgTree(next)
    return next
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
