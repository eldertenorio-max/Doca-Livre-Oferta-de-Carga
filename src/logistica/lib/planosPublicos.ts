export const PLANOS_PUBLICOS = [
  {
    id: 'motorista',
    nome: 'Motorista',
    preco: 'R$ 49',
    periodo: '/mês',
    extra: 'ou R$ 14,90 /semana',
    para: 'Caminhoneiro e consultor',
    itens: ['Mapa ilimitado', 'Buscar empresas da rede', 'Perfil no sistema'],
    destaque: false,
  },
  {
    id: 'start',
    nome: 'Embarcador Start',
    preco: 'R$ 197',
    periodo: '/mês',
    extra: '2 usuários',
    para: 'Empresa pequena',
    itens: ['Cadastro da empresa', 'Mapa ilimitado', 'Contato e WhatsApp'],
    destaque: true,
  },
  {
    id: 'pro',
    nome: 'Embarcador Pro',
    preco: 'R$ 397',
    periodo: '/mês',
    extra: '5 usuários',
    para: 'Operação com time',
    itens: ['Tudo do Start', 'Feed notícias', 'Kanban de empresas'],
    destaque: false,
  },
  {
    id: 'empresa',
    nome: 'Empresa',
    preco: 'R$ 890',
    periodo: '/mês',
    extra: 'ou sob consulta',
    para: 'Várias filiais',
    itens: ['10 usuários', 'Hierarquia da rede', 'Prioridade no suporte'],
    destaque: false,
  },
] as const

export type PlanoPublicoId = (typeof PLANOS_PUBLICOS)[number]['id']

export function planoPublicoPorId(id: string | null | undefined) {
  return PLANOS_PUBLICOS.find((p) => p.id === id) ?? null
}
