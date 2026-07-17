/** Módulos e permissões do Oferta de Carga. */

export type ModuloAcesso = 'visualizar' | 'editar'
export type ModuloNivel = 'editar' | 'visualizar' | 'bloqueado'

export type OfertaModuloId =
  | 'kanban'
  | 'rotas'
  | 'transportadoras'
  | 'veiculos'
  | 'grupos'
  | 'indicadores'
  | 'hierarquia'
  | 'permissoes'
  | 'kanban_transportador'

export type OfertaPermissao = {
  pode_acessar: boolean
  /** null = todas as telas com editar; {} = nenhuma */
  modulos: Record<string, ModuloAcesso> | null
}

export const OFERTA_MODULOS_CATALOGO: { id: OfertaModuloId; label: string; role?: 'minerva' | 'transportador' | 'ambos' }[] = [
  { id: 'kanban', label: 'Kanban Cargas', role: 'minerva' },
  { id: 'rotas', label: 'Rotas', role: 'minerva' },
  { id: 'transportadoras', label: 'Transportadoras', role: 'minerva' },
  { id: 'veiculos', label: 'Veículos', role: 'ambos' },
  { id: 'grupos', label: 'Grupos', role: 'minerva' },
  { id: 'indicadores', label: 'Indicadores', role: 'minerva' },
  { id: 'hierarquia', label: 'Hierarquia', role: 'minerva' },
  { id: 'permissoes', label: 'Permissões', role: 'minerva' },
  { id: 'kanban_transportador', label: 'Kanban Ofertas', role: 'transportador' },
]

export const DEFAULT_PERMISSAO_MINERVA: OfertaPermissao = {
  pode_acessar: true,
  modulos: {
    kanban: 'editar',
    rotas: 'editar',
    transportadoras: 'editar',
    veiculos: 'editar',
    grupos: 'editar',
    indicadores: 'editar',
  },
}

export const DEFAULT_PERMISSAO_TRANSPORTADOR: OfertaPermissao = {
  pode_acessar: true,
  modulos: {
    kanban_transportador: 'editar',
    veiculos: 'editar',
  },
}

export const SUPER_PERMISSAO: OfertaPermissao = {
  pode_acessar: true,
  modulos: null,
}

export function acessoModulo(
  map: Record<string, ModuloAcesso> | null | undefined,
  id: string,
): ModuloNivel {
  if (map == null) return 'editar'
  const v = map[id]
  if (v === 'editar') return 'editar'
  if (v === 'visualizar') return 'visualizar'
  return 'bloqueado'
}

export function canOpenModulo(
  map: Record<string, ModuloAcesso> | null | undefined,
  id: string,
): boolean {
  const a = acessoModulo(map, id)
  return a === 'editar' || a === 'visualizar'
}

export function canEditModulo(
  map: Record<string, ModuloAcesso> | null | undefined,
  id: string,
): boolean {
  return acessoModulo(map, id) === 'editar'
}

/** Mapeia rota → módulo */
export function moduloFromPath(pathname: string): OfertaModuloId | null {
  if (pathname.startsWith('/minerva/rotas')) return 'rotas'
  if (pathname.startsWith('/minerva/transportadores')) return 'transportadoras'
  if (pathname.startsWith('/minerva/veiculos') || pathname.startsWith('/transportador/veiculos'))
    return 'veiculos'
  if (pathname.startsWith('/minerva/grupos')) return 'grupos'
  if (pathname.startsWith('/minerva/indicadores')) return 'indicadores'
  if (pathname.startsWith('/minerva/hierarquia')) return 'hierarquia'
  if (pathname.startsWith('/minerva/permissoes') || pathname.startsWith('/minerva/config'))
    return 'permissoes'
  if (pathname === '/minerva' || pathname.startsWith('/minerva/')) return 'kanban'
  if (pathname.startsWith('/transportador')) return 'kanban_transportador'
  return null
}
