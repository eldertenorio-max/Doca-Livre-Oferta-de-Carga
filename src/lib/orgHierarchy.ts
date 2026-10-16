import { appStoreGet, appStoreGetCached, appStoreSet, migrateLocalKeyToAppStore } from './appStore'
import { hydrateOrgGrupos, idsAbaixoNosGrupos } from './orgGrupos'
import { canonicalTransportadorId, sameTransportadorId } from './transportadorIds'
import type { GrupoTransportador } from '../types'

/** Hierarquia organizacional do Oferta de Carga, igual à do Doca Livre.
 * Super Usuários ficam acima de tudo.
 * Abaixo: Operador Logístico → Filial do Operador → Embarcador → Unidade → Transportadora.
 * O embarcador também pode ficar direto no operador. Unidade e transportadora também podem ficar na filial.
 * Quem está num ponto vê a si mesmo e quem está abaixo. Quem está acima vê esse ponto.
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
  { nome: 'Wenderson', usuario: 'wenderson' },
] as const

/** Pais permitidos de cada tipo, como no Doca Livre. */
const PAIS_VALIDOS: Record<OrgTipo, OrgTipo[]> = {
  operador_logistico: [],
  filial_operador: ['operador_logistico'],
  embarcador: ['filial_operador', 'operador_logistico'],
  unidade: ['embarcador', 'filial_operador'],
  transportadora: ['unidade', 'filial_operador'],
}

/** Quem pode nascer em cada ponto. No topo: operador logístico ou embarcador. */
export function allowedOrgChildTypes(tipoPai: string | null | undefined): OrgTipo[] {
  const tipos: OrgTipo[] = [
    'operador_logistico',
    'filial_operador',
    'embarcador',
    'unidade',
    'transportadora',
  ]
  if (!tipoPai) return ['operador_logistico', 'embarcador']
  return tipos.filter((t) => PAIS_VALIDOS[t].includes(tipoPai as OrgTipo))
}

/** Tipos que o Super pode criar em cada ponto. O cadastro público não usa esta lista. */
export function tiposCadastroSuper(tipoPai: string | null | undefined): OrgTipo[] {
  return allowedOrgChildTypes(tipoPai)
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
  const tree = remote?.length ? structuredClone(remote) : structuredClone(SEED_ORG_TREE)
  if (!remote?.length) void appStoreSet(STORE_KEY, tree)
  await hydrateOrgGrupos(flattenOrg(tree))
  return tree
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

/** Do ponto até a raiz, sem incluir o próprio ponto. */
export function ancestraisOrg(tree: OrgNo[], id: string): OrgNo[] {
  const byId = new Map(flattenOrg(tree).map((n) => [n.id, n]))
  const out: OrgNo[] = []
  const seen = new Set<string>()
  let cur = byId.get(id)
  while (cur?.parent_id && !seen.has(cur.parent_id)) {
    seen.add(cur.parent_id)
    const pai = byId.get(cur.parent_id)
    if (!pai) break
    out.push(pai)
    cur = pai
  }
  return out
}

/** Todos os pontos abaixo, sem incluir o próprio ponto. */
export function descendentesOrg(tree: OrgNo[], id: string): OrgNo[] {
  const no = findOrgNo(tree, id)
  if (!no) return []
  const out: OrgNo[] = []
  function walk(n: OrgNo) {
    for (const c of n.children ?? []) {
      out.push(c)
      walk(c)
    }
  }
  walk(no)
  return out
}

/** Este ponto enxerga a si mesmo e quem está abaixo dele, na árvore e nos grupos. */
export function nosVisiveis(tree: OrgNo[], orgId: string | null | undefined): OrgNo[] {
  const no = findOrgNo(tree, orgId)
  const daArvore = no ? [no, ...descendentesOrg(tree, no.id)] : []
  const porId = new Map(daArvore.map((n) => [n.id, n]))
  for (const id of idsAbaixoNosGrupos(orgId)) {
    if (porId.has(id)) continue
    const extra = findOrgNo(tree, id)
    if (extra) porId.set(id, extra)
  }
  return [...porId.values()]
}

/** Quem enxerga este ponto: ele mesmo e quem está acima. */
export function quemVeEsteNo(tree: OrgNo[], orgId: string): OrgNo[] {
  const no = findOrgNo(tree, orgId)
  if (!no) return []
  return [...ancestraisOrg(tree, orgId).reverse(), no]
}

/** Marca da carga publicada por quem está neste ponto. */
export function marcasPublicacaoDoNo(tree: OrgNo[], orgId: string | null | undefined): {
  org_embarcador_id: string | null
  org_unidade_id: string | null
} {
  const no = findOrgNo(tree, orgId)
  if (!no) return { org_embarcador_id: null, org_unidade_id: null }
  const cadeia = [no, ...ancestraisOrg(tree, no.id)]
  const ancora =
    cadeia.find((n) => n.tipo === 'embarcador' || n.tipo === 'operador_logistico') ?? no
  const unidade = cadeia.find((n) => n.tipo === 'unidade' || n.tipo === 'filial_operador')
  const publicaNaUnidade =
    no.tipo === 'unidade' || no.tipo === 'filial_operador' || no.tipo === 'transportadora'
  return {
    org_embarcador_id: ancora.id,
    org_unidade_id: publicaNaUnidade ? (unidade?.id ?? null) : null,
  }
}

export function cargaPertenceAoEscopo(
  carga: {
    org_embarcador_id?: string | null
    org_unidade_id?: string | null
    grupo_ids?: string[] | null
  },
  visiveis: Set<string>,
): boolean {
  const tags = [carga.org_unidade_id, carga.org_embarcador_id].filter((id): id is string => Boolean(id))
  if (tags.some((id) => visiveis.has(id))) return true
  return (carga.grupo_ids ?? []).some((grupo) => {
    const prefixo = 'g-org-'
    if (!grupo.startsWith(prefixo)) return false
    return visiveis.has(grupo.slice(prefixo.length))
  })
}

function parentAceitaTransportadora(tree: OrgNo[], parentId: string | null | undefined) {
  const pai = findOrgNo(tree, parentId)
  if (!pai) return false
  return PAIS_VALIDOS.transportadora.includes(pai.tipo)
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
  for (const id of idsAbaixoNosGrupos(orgId)) {
    const extra = findOrgNo(tree, id)
    if (extra?.tipo === 'transportadora' && extra.transportador_id) ids.add(extra.transportador_id)
  }
  return [...ids]
}

export function gruposDaHierarquia(tree: OrgNo[]): GrupoTransportador[] {
  const agora = new Date().toISOString()
  return flattenOrg(tree)
    .filter(
      (n) =>
        n.tipo === 'embarcador' ||
        n.tipo === 'unidade' ||
        n.tipo === 'operador_logistico' ||
        n.tipo === 'filial_operador',
    )
    .map((n) => ({
      id: grupoIdDaHierarquia(n.id),
      descricao: `${ORG_TIPO_LABEL[n.tipo]}: ${n.nome}`,
      situacao: 'ativo' as const,
      observacao: 'Sincronizado da hierarquia (quem vê as publicações)',
      transportador_ids: tidsSobNo(tree, n.id),
      updated_at: agora,
    }))
}

function normCnpj(s?: string | null) {
  return (s || '').replace(/\D/g, '')
}

function mesmoNomeOrg(a?: string | null, b?: string | null) {
  return (a || '').trim().toLowerCase() === (b || '').trim().toLowerCase() && Boolean((a || '').trim())
}

function acharNoTransportadora(
  tree: OrgNo[],
  t: { id?: string | null; nome_fantasia?: string | null; cnpj?: string | null },
): OrgNo | null {
  const flat = flattenOrg(tree).filter((n) => n.tipo === 'transportadora')
  const byId = flat.find((n) => sameTransportadorId(n.transportador_id, t.id))
  if (byId) return byId
  const cnpj = normCnpj(t.cnpj)
  if (cnpj.length >= 8) {
    const byCnpj = flat.find((n) => normCnpj(n.cnpj) === cnpj)
    if (byCnpj) return byCnpj
  }
  const nome = (t.nome_fantasia || '').trim()
  if (nome) {
    const byNome = flat.find((n) => mesmoNomeOrg(n.nome, nome))
    if (byNome) return byNome
  }
  return null
}

function chaveDedupeTransportadora(n: OrgNo): string {
  const tid = canonicalTransportadorId(n.transportador_id)
  if (tid) return `id:${tid}`
  const cnpj = normCnpj(n.cnpj)
  if (cnpj.length >= 8) return `cnpj:${cnpj}`
  const nome = (n.nome || '').trim().toLowerCase()
  if (nome) return `nome:${nome}`
  return `node:${n.id}`
}

function melhorNoTransportadora(a: OrgNo, b: OrgNo): OrgNo {
  const aCan = canonicalTransportadorId(a.transportador_id)
  const bCan = canonicalTransportadorId(b.transportador_id)
  const aUuid = Boolean(aCan && aCan.includes('-') && aCan.length > 8)
  const bUuid = Boolean(bCan && bCan.includes('-') && bCan.length > 8)
  if (aUuid !== bUuid) return aUuid ? a : b
  if (Boolean(a.transportador_id) !== Boolean(b.transportador_id)) {
    return a.transportador_id ? a : b
  }
  if (Boolean(normCnpj(a.cnpj)) !== Boolean(normCnpj(b.cnpj))) {
    return normCnpj(a.cnpj) ? a : b
  }
  return a
}

/** Junta nós repetidos (mesmo UUID/legado, CNPJ ou nome). */
export function dedupeTransportadorasNaArvore(
  tree: OrgNo[],
  transportadores: { id: string; nome_fantasia: string; cnpj?: string | null }[] = [],
): OrgNo[] {
  const nodes = flattenOrg(tree).filter((x) => x.tipo === 'transportadora')
  if (nodes.length < 2 && transportadores.length === 0) return tree

  const parent = new Map<string, string>()
  const find = (id: string): string => {
    const p = parent.get(id) ?? id
    if (p !== id) {
      const r = find(p)
      parent.set(id, r)
      return r
    }
    return p
  }
  const union = (a: string, b: string) => {
    const ra = find(a)
    const rb = find(b)
    if (ra !== rb) parent.set(ra, rb)
  }
  for (const n of nodes) parent.set(n.id, n.id)

  const byTid = new Map<string, string>()
  const byCnpj = new Map<string, string>()
  const byNome = new Map<string, string>()
  for (const n of nodes) {
    const tid = canonicalTransportadorId(n.transportador_id)
    if (tid) {
      const prev = byTid.get(tid)
      if (prev) union(prev, n.id)
      byTid.set(tid, n.id)
    }
    const cnpj = normCnpj(n.cnpj)
    if (cnpj.length >= 8) {
      const prev = byCnpj.get(cnpj)
      if (prev) union(prev, n.id)
      byCnpj.set(cnpj, n.id)
    }
    const nome = (n.nome || '').trim().toLowerCase()
    if (nome) {
      const prev = byNome.get(nome)
      if (prev) union(prev, n.id)
      byNome.set(nome, n.id)
    }
  }
  for (const t of transportadores) {
    const cnpj = normCnpj(t.cnpj)
    const nome = (t.nome_fantasia || '').trim().toLowerCase()
    const ligados = nodes.filter(
      (n) =>
        sameTransportadorId(n.transportador_id, t.id) ||
        (cnpj.length >= 8 && normCnpj(n.cnpj) === cnpj) ||
        (nome && (n.nome || '').trim().toLowerCase() === nome),
    )
    for (let i = 1; i < ligados.length; i++) union(ligados[0].id, ligados[i].id)
  }

  const grupos = new Map<string, OrgNo[]>()
  for (const n of nodes) {
    const r = find(n.id)
    const arr = grupos.get(r) ?? []
    arr.push(n)
    grupos.set(r, arr)
  }

  const drop = new Set<string>()
  const patch = new Map<string, Partial<OrgNo>>()

  for (const nos of grupos.values()) {
    let keeper = nos[0]
    for (const n of nos.slice(1)) keeper = melhorNoTransportadora(keeper, n)
    const t = transportadores.find(
      (x) =>
        sameTransportadorId(x.id, keeper.transportador_id) ||
        nos.some(
          (n) =>
            sameTransportadorId(x.id, n.transportador_id) ||
            (normCnpj(x.cnpj) && normCnpj(x.cnpj) === normCnpj(n.cnpj)) ||
            mesmoNomeOrg(x.nome_fantasia, n.nome),
        ),
    )
    patch.set(keeper.id, {
      transportador_id: t?.id ?? keeper.transportador_id,
      nome: t?.nome_fantasia ?? keeper.nome,
      cnpj: t?.cnpj ?? keeper.cnpj,
    })
    for (const n of nos) {
      if (n.id !== keeper.id) drop.add(n.id)
    }
  }

  if (drop.size === 0 && patch.size === 0) return tree

  function walk(list: OrgNo[]): OrgNo[] {
    return list
      .filter((n) => !drop.has(n.id))
      .map((n) => {
        const extra = patch.get(n.id)
        const merged = extra ? { ...n, ...extra } : n
        return { ...merged, children: merged.children ? walk(merged.children) : [] }
      })
  }

  return walk(structuredClone(tree))
}

function precisaMigrar(tree: OrgNo[]): boolean {
  if (!tree.length) return true
  const flat = flattenOrg(tree)
  return !flat.some(
    (n) =>
      n.tipo === 'embarcador' ||
      n.tipo === 'operador_logistico' ||
      n.tipo === 'filial_operador' ||
      n.tipo === 'unidade',
  )
}

function coletarTransportadoras(
  tree: OrgNo[],
  transportadores: { id: string; nome_fantasia: string; cnpj?: string | null; situacao?: string }[],
): OrgNo[] {
  const byKey = new Map<string, OrgNo>()
  function keyOf(n: OrgNo) {
    return chaveDedupeTransportadora(n)
  }
  for (const n of flattenOrg(tree)) {
    if (n.tipo !== 'transportadora') continue
    const k = keyOf(n)
    const prev = byKey.get(k)
    byKey.set(k, {
      ...(prev ? melhorNoTransportadora(prev, n) : n),
      parent_id: ORG_UNIDADE_CD_GUARULHOS_ID,
      children: [],
    })
  }
  for (const t of transportadores) {
    if (t.situacao === 'inativo' || t.situacao === 'recusado') continue
    const k = `id:${canonicalTransportadorId(t.id) || t.id}`
    const prev =
      byKey.get(k) ||
      acharNoTransportadora([...byKey.values()].map((n) => n), t) ||
      [...byKey.values()].find(
        (n) =>
          sameTransportadorId(n.transportador_id, t.id) ||
          (normCnpj(t.cnpj) && normCnpj(n.cnpj) === normCnpj(t.cnpj)) ||
          mesmoNomeOrg(n.nome, t.nome_fantasia),
      )
    const no: OrgNo = {
      id: prev?.id ?? `org-${t.id}`,
      parent_id: ORG_UNIDADE_CD_GUARULHOS_ID,
      tipo: 'transportadora',
      nome: t.nome_fantasia || prev?.nome || t.id,
      cnpj: t.cnpj ?? prev?.cnpj ?? null,
      transportador_id: t.id,
      ordem: prev?.ordem ?? byKey.size,
      children: [],
    }
    if (prev) {
      for (const [oldK, val] of byKey) {
        if (val.id === prev.id) byKey.delete(oldK)
      }
    }
    byKey.set(k, no)
  }
  return [...byKey.values()].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
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
  tree = dedupeTransportadorasNaArvore(tree, transportadores)
  if (precisaMigrar(tree)) {
    tree = montarArvoreUltrafrio(tree, transportadores)
    tree = dedupeTransportadorasNaArvore(tree, transportadores)
    saveOrgTree(tree)
    return tree
  }
  return syncTodasTransportadorasNaHierarquia(transportadores)
}

function aplicarTransportadoraNaArvore(
  tree: OrgNo[],
  t: { id: string; nome_fantasia: string; cnpj?: string | null; parentId?: string | null },
): OrgNo[] {
  const existing = acharNoTransportadora(tree, t)
  const parentEscolhido =
    t.parentId && parentAceitaTransportadora(tree, t.parentId) ? t.parentId : null
  let parentId = parentEscolhido ?? existing?.parent_id ?? findDefaultTransportadoraParentId(tree)
  let base = tree
  if (!parentId) {
    const jaTemPadrao = flattenOrg(base).some((n) => n.id === ORG_EMBARCADOR_ULTRAFRIO_ID)
    if (!jaTemPadrao) base = [...base, ...structuredClone(SEED_ORG_TREE)]
    parentId = parentEscolhido ?? existing?.parent_id ?? findDefaultTransportadoraParentId(base)
  }
  if (!parentId) return base

  const flat = flattenOrg(base)
  const siblings = flat.filter((n) => n.parent_id === parentId)
  const no: OrgNo = {
    id: existing?.id ?? `org-${t.id}`,
    parent_id: parentId,
    tipo: 'transportadora',
    nome: t.nome_fantasia || existing?.nome || t.id,
    cnpj: t.cnpj ?? existing?.cnpj ?? null,
    transportador_id: t.id,
    ordem: existing?.ordem ?? siblings.length + 1,
    children: existing?.children ?? [],
  }
  return upsertOrgNo(base, no)
}

/**
 * Inclui ou atualiza o nó da transportadora na hierarquia (Supabase).
 * Usado ao criar/editar transportadora no cadastro ou no cadastro público.
 */
export function syncTransportadoraNaHierarquia(t: {
  id: string
  nome_fantasia: string
  cnpj?: string | null
  /** Unidade ou embarcador escolhido no cadastro. Sem isso, fica no pai que já tinha. */
  parentId?: string | null
}): OrgNo[] {
  const next = aplicarTransportadoraNaArvore(
    dedupeTransportadorasNaArvore(loadOrgTree(), [t]),
    t,
  )
  saveOrgTree(next)
  return next
}

export function removeTransportadoraDaHierarquia(transportadorId: string): OrgNo[] {
  const tree = loadOrgTree()
  const node = flattenOrg(tree).find((n) => sameTransportadorId(n.transportador_id, transportadorId))
  if (!node) return tree
  const next = deleteOrgNo(tree, node.id)
  saveOrgTree(next)
  return next
}

/** Garante que todas as transportadoras ativas/pendentes existam na árvore. */
export function syncTodasTransportadorasNaHierarquia(
  transportadores: { id: string; nome_fantasia: string; cnpj?: string | null; situacao?: string }[],
): OrgNo[] {
  let tree = dedupeTransportadorasNaArvore(loadOrgTree(), transportadores)
  for (const t of transportadores) {
    if (t.situacao === 'inativo' || t.situacao === 'recusado') continue
    tree = aplicarTransportadoraNaArvore(tree, t)
  }
  tree = dedupeTransportadorasNaArvore(tree, transportadores)
  saveOrgTree(tree)
  return tree
}
