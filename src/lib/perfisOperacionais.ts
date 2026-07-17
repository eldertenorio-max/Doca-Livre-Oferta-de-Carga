/**
 * Perfis da especificação PPT §9:
 * Administrador | Operador | Consulta
 */
import type { OfertaPermissao } from './portalModules'

export type PerfilOperacional = 'administrador' | 'operador' | 'consulta'

export const PERFIL_OPERACIONAL_LABEL: Record<PerfilOperacional, string> = {
  administrador: 'Administrador',
  operador: 'Operador',
  consulta: 'Consulta',
}

/** Administrador: cadastrar, configurar, publicar, cancelar */
export const PERMISSAO_ADMINISTRADOR: OfertaPermissao = {
  pode_acessar: true,
  modulos: {
    kanban: 'editar',
    rotas: 'editar',
    transportadoras: 'editar',
    veiculos: 'editar',
    grupos: 'editar',
    indicadores: 'editar',
    configuracoes: 'editar',
    historico: 'editar',
    hierarquia: 'editar',
    permissoes: 'editar',
  },
}

/** Operador: publicar e acompanhar */
export const PERMISSAO_OPERADOR: OfertaPermissao = {
  pode_acessar: true,
  modulos: {
    kanban: 'editar',
    rotas: 'visualizar',
    transportadoras: 'visualizar',
    veiculos: 'visualizar',
    grupos: 'visualizar',
    indicadores: 'visualizar',
    configuracoes: 'visualizar',
    historico: 'visualizar',
  },
}

/** Consulta: apenas visualizar */
export const PERMISSAO_CONSULTA: OfertaPermissao = {
  pode_acessar: true,
  modulos: {
    kanban: 'visualizar',
    rotas: 'visualizar',
    transportadoras: 'visualizar',
    veiculos: 'visualizar',
    grupos: 'visualizar',
    indicadores: 'visualizar',
    historico: 'visualizar',
  },
}

export function permissaoPorPerfil(perfil: PerfilOperacional): OfertaPermissao {
  if (perfil === 'administrador') return structuredClone(PERMISSAO_ADMINISTRADOR)
  if (perfil === 'operador') return structuredClone(PERMISSAO_OPERADOR)
  return structuredClone(PERMISSAO_CONSULTA)
}
