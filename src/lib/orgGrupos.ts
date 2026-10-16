import { appStoreGet, appStoreGetCached, appStoreSet } from './appStore'
import { canonicalTransportadorId, sameTransportadorId } from './transportadorIds'

/** Grupo de hierarquia, no mesmo modelo do Doca Livre.
 * A empresa existe uma vez. Em cada grupo ela tem o próprio pai.
 * A mesma empresa pode participar de vários grupos.
 */

export type MembroGrupo = {
  empresa_id: string
  parent_empresa_id: string | null
  posicao: number
}

export type GrupoHierarquia = {
  id: string
  nome: string
  descricao: string
  empresa_id: string
  created_at: string
  membros: MembroGrupo[]
}

const STORE_KEY = 'org_grupos'

export function loadOrgGrupos(): GrupoHierarquia[] {
  const cached = appStoreGetCached<GrupoHierarquia[] | null>(STORE_KEY, null)
  return Array.isArray(cached) ? cached : []
}

export function saveOrgGrupos(grupos: GrupoHierarquia[]) {
  void appStoreSet(STORE_KEY, grupos)
}

export type NoArvore = {
  id: string
  parent_id: string | null
  nome: string
  tipo: string
  ordem?: number
}

export async function hydrateOrgGrupos(nos: NoArvore[]): Promise<GrupoHierarquia[]> {
  const remote = await appStoreGet<GrupoHierarquia[] | null>(STORE_KEY, null)
  if (Array.isArray(remote) && remote.length) return remote
  const seed = grupoDaArvore(nos)
  if (!seed) {
    saveOrgGrupos([])
    return []
  }
  saveOrgGrupos([seed])
  return [seed]
}

function grupoDaArvore(nos: NoArvore[]): GrupoHierarquia | null {
  if (!nos.length) return null
  const dona =
    nos.find((n) => !n.parent_id && (n.tipo === 'operador_logistico' || n.tipo === 'embarcador')) ??
    nos.find((n) => !n.parent_id) ??
    nos[0]
  return {
    id: `grupo-${dona.id}`,
    nome: dona.nome,
    descricao: 'Grupo criado a partir da árvore que já existia.',
    empresa_id: dona.id,
    created_at: new Date().toISOString(),
    membros: nos.map((n, i) => ({
      empresa_id: n.id,
      parent_empresa_id: n.parent_id,
      posicao: n.ordem ?? i,
    })),
  }
}

/** Própria empresa e todas as que estão abaixo, em todos os grupos. */
export function idsAbaixoNosGrupos(empresaId: string | null | undefined): string[] {
  if (!empresaId) return []
  const grupos = loadOrgGrupos()
  if (!grupos.length) return []
  const filhos = new Map<string, string[]>()
  for (const grupo of grupos) {
    for (const membro of grupo.membros) {
      if (!membro.parent_empresa_id) continue
      const lista = filhos.get(membro.parent_empresa_id) ?? []
      lista.push(membro.empresa_id)
      filhos.set(membro.parent_empresa_id, lista)
    }
  }
  const vistos = new Set<string>([empresaId])
  const pilha = [empresaId]
  while (pilha.length) {
    const atual = pilha.pop()!
    for (const filho of filhos.get(atual) ?? []) {
      if (vistos.has(filho)) continue
      vistos.add(filho)
      pilha.push(filho)
    }
  }
  return [...vistos]
}

export function criarGrupoHierarquia(
  grupos: GrupoHierarquia[],
  input: { nome: string; descricao: string; empresaId: string },
): { grupos: GrupoHierarquia[]; erro?: string } {
  const nome = input.nome.trim()
  if (!nome) return { grupos, erro: 'Informe o nome do grupo.' }
  if (!input.empresaId) return { grupos, erro: 'Escolha a empresa dona do grupo.' }
  const grupo: GrupoHierarquia = {
    id: `grupo-${Date.now().toString(36)}`,
    nome,
    descricao: input.descricao.trim(),
    empresa_id: input.empresaId,
    created_at: new Date().toISOString(),
    membros: [{ empresa_id: input.empresaId, parent_empresa_id: null, posicao: 0 }],
  }
  return { grupos: [...grupos, grupo] }
}

export function excluirGrupoHierarquia(grupos: GrupoHierarquia[], id: string) {
  return grupos.filter((g) => g.id !== id)
}

function criariaCiclo(membros: MembroGrupo[], empresaId: string, parentId: string | null) {
  let atual = parentId
  const vistos = new Set<string>()
  while (atual) {
    if (atual === empresaId || vistos.has(atual)) return true
    vistos.add(atual)
    atual = membros.find((m) => m.empresa_id === atual)?.parent_empresa_id ?? null
  }
  return false
}

export function adicionarMembroGrupo(
  grupos: GrupoHierarquia[],
  grupoId: string,
  empresaId: string,
  parentId: string | null,
  paiAceito: boolean,
): { grupos: GrupoHierarquia[]; erro?: string } {
  const grupo = grupos.find((g) => g.id === grupoId)
  if (!grupo) return { grupos, erro: 'Grupo não encontrado.' }
  if (grupo.membros.some((m) => m.empresa_id === empresaId)) {
    return { grupos, erro: 'Esta empresa já está neste grupo.' }
  }
  if (parentId && !grupo.membros.some((m) => m.empresa_id === parentId)) {
    return { grupos, erro: 'O pai precisa já estar neste grupo.' }
  }
  if (!paiAceito) {
    return {
      grupos,
      erro: parentId
        ? 'Esse tipo de empresa não pode ficar abaixo do pai escolhido.'
        : 'Só operador logístico ou embarcador pode ficar no topo do grupo.',
    }
  }
  if (criariaCiclo(grupo.membros, empresaId, parentId)) {
    return { grupos, erro: 'Esse pai fecharia um ciclo no grupo.' }
  }
  return {
    grupos: grupos.map((g) =>
      g.id !== grupoId
        ? g
        : {
            ...g,
            membros: [
              ...g.membros,
              { empresa_id: empresaId, parent_empresa_id: parentId, posicao: g.membros.length },
            ],
          },
    ),
  }
}

export function removerMembroGrupo(grupos: GrupoHierarquia[], grupoId: string, empresaId: string) {
  return grupos.map((grupo) => {
    if (grupo.id !== grupoId) return grupo
    if (grupo.empresa_id === empresaId) return grupo
    const saiu = grupo.membros.find((m) => m.empresa_id === empresaId)
    if (!saiu) return grupo
    return {
      ...grupo,
      membros: grupo.membros
        .filter((m) => m.empresa_id !== empresaId)
        .map((m) =>
          m.parent_empresa_id === empresaId ? { ...m, parent_empresa_id: saiu.parent_empresa_id } : m,
        ),
    }
  })
}

export type NoGrupo = {
  id: string
  filhos: NoGrupo[]
}

/** Conta entra na hierarquia quando a empresa dela é membro do grupo. */
export function contaPertenceAoGrupo(
  conta: { role?: string; empresa_org_id?: string | null; transportador_id?: string | null },
  grupo: GrupoHierarquia,
  nos: Array<{ id: string; transportador_id?: string | null }>,
): boolean {
  if (conta.role === 'super') return false
  const ids = new Set(grupo.membros.map((m) => m.empresa_id))
  const org = (conta.empresa_org_id || '').trim()
  if (org && ids.has(org)) return true
  const tid = canonicalTransportadorId(
    org.startsWith('transportador:') ? org.slice('transportador:'.length) : conta.transportador_id,
  )
  if (!tid) return false
  return nos.some((n) => ids.has(n.id) && n.transportador_id && sameTransportadorId(n.transportador_id, tid))
}

export function arvoreDoGrupo(grupo: GrupoHierarquia): NoGrupo[] {
  const porPai = new Map<string | null, MembroGrupo[]>()
  for (const membro of grupo.membros) {
    const lista = porPai.get(membro.parent_empresa_id) ?? []
    lista.push(membro)
    porPai.set(membro.parent_empresa_id, lista)
  }
  function nos(parentId: string | null): NoGrupo[] {
    return (porPai.get(parentId) ?? [])
      .slice()
      .sort((a, b) => a.posicao - b.posicao)
      .map((membro) => ({ id: membro.empresa_id, filhos: nos(membro.empresa_id) }))
  }
  return nos(null)
}
