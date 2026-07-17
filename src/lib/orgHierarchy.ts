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

export function allowedOrgChildTypes(tipoPai: string | null | undefined): OrgTipo[] {
  const map: Record<string, OrgTipo[]> = {
    '': ['operador_logistico'],
    operador_logistico: ['filial_operador', 'embarcador'],
    filial_operador: ['embarcador', 'unidade', 'transportadora'],
    embarcador: ['unidade'],
    unidade: ['transportadora'],
    transportadora: [],
  }
  if (!tipoPai) return ['operador_logistico']
  return map[tipoPai] ?? []
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
                    transportador_id: 't1',
                    ordem: 1,
                  },
                  {
                    id: 'org-t2',
                    parent_id: 'org-unidade-jb',
                    tipo: 'transportadora',
                    nome: 'Log Nova Era',
                    transportador_id: 't2',
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

const ORG_KEY = 'doca-livre-org-v2'

export function loadOrgTree(): OrgNo[] {
  try {
    const raw = localStorage.getItem(ORG_KEY)
    if (raw) return JSON.parse(raw) as OrgNo[]
  } catch {
    /* ignore */
  }
  return structuredClone(SEED_ORG_TREE)
}

export function saveOrgTree(tree: OrgNo[]) {
  localStorage.setItem(ORG_KEY, JSON.stringify(tree))
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
