/** Rotas da Logística dentro do sistema Oferta de Carga. */
export const LOGISTICA_BASE = '/embarcador/mapa-logistica'

export const rotasLogistica = {
  mapa: LOGISTICA_BASE,
  painel: `${LOGISTICA_BASE}/painel`,
  hierarquia: `${LOGISTICA_BASE}/hierarquia`,
  kanban: `${LOGISTICA_BASE}/kanban`,
  feed: `${LOGISTICA_BASE}/feed`,
  feedNotificacoes: `${LOGISTICA_BASE}/feed/notificacoes`,
  perfil: `${LOGISTICA_BASE}/perfil`,
  empresa: (slug: string) => `${LOGISTICA_BASE}/empresa/${slug}`,
}

export function rotaInicial() {
  return rotasLogistica.mapa
}
