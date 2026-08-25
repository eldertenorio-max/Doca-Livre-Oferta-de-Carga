/** Módulos e permissões do Oferta de Carga. */

export type ModuloAcesso = 'visualizar' | 'editar'
export type ModuloNivel = 'editar' | 'visualizar' | 'bloqueado'

export type OfertaModuloId =
  | 'kanban'
  | 'viagens'
  | 'rotas'
  | 'transportadoras'
  | 'veiculos'
  | 'motoristas'
  | 'mapa_frota'
  | 'mapa_logistica'
  | 'grupos'
  | 'indicadores'
  | 'configuracoes'
  | 'historico'
  | 'hierarquia'
  | 'permissoes'
  | 'kanban_transportador'
  | 'viagens_transportador'
  | 'configuracoes_transportador'
  | 'tarefas'
  | 'tabelas_frete'

export type OfertaPermissao = {
  pode_acessar: boolean
  /** null = todas as telas com editar; {} = nenhuma */
  modulos: Record<string, ModuloAcesso> | null
}

export const OFERTA_MODULOS_CATALOGO: { id: OfertaModuloId; label: string; role?: 'minerva' | 'transportador' | 'ambos' }[] = [
  { id: 'kanban', label: 'Cargas', role: 'minerva' },
  { id: 'viagens', label: 'Viagens', role: 'minerva' },
  { id: 'rotas', label: 'Rotas', role: 'minerva' },
  { id: 'tabelas_frete', label: 'Tabelas de Frete', role: 'minerva' },
  { id: 'transportadoras', label: 'Transportadoras', role: 'minerva' },
  { id: 'veiculos', label: 'Veículos', role: 'ambos' },
  { id: 'motoristas', label: 'Motoristas', role: 'ambos' },
  { id: 'mapa_frota', label: 'Mapa da Frota', role: 'minerva' },
  { id: 'mapa_logistica', label: 'Google Maps da Logística', role: 'minerva' },
  { id: 'grupos', label: 'Grupos', role: 'minerva' },
  { id: 'indicadores', label: 'Indicadores', role: 'minerva' },
  { id: 'configuracoes', label: 'Configurações de Oferta', role: 'minerva' },
  { id: 'historico', label: 'Histórico', role: 'minerva' },
  { id: 'hierarquia', label: 'Hierarquia', role: 'minerva' },
  { id: 'permissoes', label: 'Permissões', role: 'minerva' },
  { id: 'tarefas', label: 'Tarefas', role: 'minerva' },
  { id: 'kanban_transportador', label: 'Ofertas', role: 'transportador' },
  { id: 'viagens_transportador', label: 'Viagens', role: 'transportador' },
  { id: 'configuracoes_transportador', label: 'Configurações', role: 'transportador' },
]

export const DEFAULT_PERMISSAO_MINERVA: OfertaPermissao = {
  pode_acessar: true,
  modulos: {
    kanban: 'editar',
    tarefas: 'editar',
    viagens: 'editar',
    rotas: 'editar',
    tabelas_frete: 'editar',
    transportadoras: 'editar',
    veiculos: 'editar',
    motoristas: 'editar',
    mapa_frota: 'editar',
    mapa_logistica: 'editar',
    grupos: 'editar',
    indicadores: 'editar',
    configuracoes: 'editar',
    historico: 'editar',
  },
}

export const DEFAULT_PERMISSAO_TRANSPORTADOR: OfertaPermissao = {
  pode_acessar: true,
  modulos: {
    kanban_transportador: 'editar',
    viagens_transportador: 'editar',
    veiculos: 'editar',
    motoristas: 'editar',
    configuracoes_transportador: 'editar',
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
  const p = pathname.replace(/^\/minerva(?=\/|$)/, '/embarcador')
  if (p.startsWith('/embarcador/viagens')) return 'viagens'
  if (p.startsWith('/transportador/viagens')) return 'viagens_transportador'
  if (p.startsWith('/embarcador/tarefas') || p.startsWith('/transportador/tarefas')) return 'tarefas'
  if (p.startsWith('/embarcador/rotas')) return 'rotas'
  if (p.startsWith('/embarcador/tabelas-frete')) return 'tabelas_frete'
  if (p.startsWith('/embarcador/transportadores')) return 'transportadoras'
  if (p.startsWith('/embarcador/veiculos') || p.startsWith('/transportador/veiculos'))
    return 'veiculos'
  if (p.startsWith('/embarcador/motoristas') || p.startsWith('/transportador/motoristas'))
    return 'motoristas'
  if (p.startsWith('/embarcador/mapa-frota')) return 'mapa_frota'
  if (p.startsWith('/embarcador/mapa-logistica')) return 'mapa_logistica'
  if (p.startsWith('/embarcador/grupos')) return 'grupos'
  if (p.startsWith('/embarcador/indicadores')) return 'indicadores'
  if (p.startsWith('/embarcador/configuracoes')) return 'configuracoes'
  if (p.startsWith('/transportador/configuracoes')) return 'configuracoes_transportador'
  if (p.startsWith('/embarcador/historico')) return 'historico'
  if (p.startsWith('/embarcador/hierarquia')) return 'hierarquia'
  if (p.startsWith('/embarcador/permissoes') || p.startsWith('/embarcador/config'))
    return 'permissoes'
  if (p === '/embarcador' || p.startsWith('/embarcador/')) return 'kanban'
  if (p.startsWith('/transportador')) return 'kanban_transportador'
  return null
}
