import { flattenOrg, nosVisiveis, type OrgNo } from './orgHierarchy'
import { canOpenModulo, OFERTA_MODULOS_CATALOGO, type OfertaModuloId } from './portalModules'
import { isSuperSession } from './superUsers'

/** Sessão usada pela API para calcular o mesmo escopo que o front mostra hoje. */
export type SessaoEscopo = {
  role?: string | null
  is_superuser?: boolean | null
  usuario?: string | null
  email?: string | null
  empresa_org_id?: string | null
  transportador_id?: string | null
  permissoes_modulos?: Record<string, 'visualizar' | 'editar'> | null
}

function papelMenu(sessao: SessaoEscopo): 'minerva' | 'transportador' | null {
  if (isSuperSession(sessao) || sessao.role === 'minerva') return 'minerva'
  if (sessao.role === 'transportador') return 'transportador'
  return null
}

/** IDs da hierarquia que esta sessão pode ver. Super vê a árvore inteira. */
export function idsVisiveisSombra(tree: OrgNo[], sessao: SessaoEscopo): string[] {
  if (isSuperSession(sessao)) return flattenOrg(tree).map((n) => n.id)
  if (sessao.role === 'transportador') {
    const no = flattenOrg(tree).find(
      (n) => n.tipo === 'transportadora' && n.transportador_id === sessao.transportador_id,
    )
    if (!no) return []
    return nosVisiveis(tree, no.id).map((n) => n.id)
  }
  if (sessao.role === 'minerva') {
    if (!sessao.empresa_org_id) return []
    return nosVisiveis(tree, sessao.empresa_org_id).map((n) => n.id)
  }
  return []
}

/** Telas abertas para o papel, com o mapa de permissão da conta. */
export function modulosAbertosSombra(sessao: SessaoEscopo): OfertaModuloId[] {
  const papel = papelMenu(sessao)
  if (!papel) return []
  const mapa = isSuperSession(sessao) ? null : sessao.permissoes_modulos
  return OFERTA_MODULOS_CATALOGO.filter(
    (m) => (!m.role || m.role === 'ambos' || m.role === papel) && canOpenModulo(mapa, m.id),
  ).map((m) => m.id)
}
