import { hrefSistema, isLocalDev, isSiteSistema } from './siteOfertaDeCarga'

export const PLANOS_OFERTA_CARGA = [
  {
    id: 'motorista',
    nome: 'Motorista',
    preco: 'R$ 49',
    precoValor: 49,
    periodo: '/mês',
    extra: 'ou R$ 14,90 /semana',
    para: 'Caminhoneiro e transportador',
    itens: ['Rotas ilimitadas', 'Mapa da frota', 'Perfil no sistema'],
    destaque: false,
    ramificacao: 'motorista',
  },
  {
    id: 'start',
    nome: 'Embarcador Start',
    preco: 'R$ 197',
    precoValor: 197,
    periodo: '/mês',
    extra: '2 usuários',
    para: 'Empresa pequena',
    itens: ['Publicar cargas', 'Rotas ilimitadas', 'WhatsApp e placa da frota'],
    destaque: true,
    ramificacao: 'embarcador',
  },
  {
    id: 'pro',
    nome: 'Embarcador Pro',
    preco: 'R$ 397',
    precoValor: 397,
    periodo: '/mês',
    extra: '5 usuários',
    para: 'Operação com time',
    itens: ['Tudo do Start', 'Malha logística', 'Kanban e áreas salvas'],
    destaque: false,
    ramificacao: 'embarcador',
  },
  {
    id: 'empresa',
    nome: 'Empresa',
    preco: 'R$ 890',
    precoValor: 890,
    periodo: '/mês',
    extra: 'ou sob consulta',
    para: 'Várias filiais',
    itens: ['10 usuários', 'Usuários extras', 'Prioridade no suporte'],
    destaque: false,
    ramificacao: 'embarcador',
  },
] as const

export type PlanoOfertaId = (typeof PLANOS_OFERTA_CARGA)[number]['id']

export type RamificacaoCadastro = 'embarcador' | 'unidade' | 'transportadora' | 'motorista'

export const RAMIFICACOES_CADASTRO: Array<{
  id: RamificacaoCadastro
  label: string
  resumo: string
}> = [
  {
    id: 'embarcador',
    label: 'Embarcador',
    resumo: 'Dono da carga: publica ofertas e contrata o transporte.',
  },
  {
    id: 'unidade',
    label: 'Unidade / CD',
    resumo: 'Filial, galpão ou centro de distribuição abaixo do embarcador.',
  },
  {
    id: 'transportadora',
    label: 'Transportadora',
    resumo: 'Empresa de transporte com frota própria ou agregada.',
  },
  {
    id: 'motorista',
    label: 'Motorista / TAC',
    resumo: 'Caminhoneiro autônomo. Acesso de motorista no sistema.',
  },
]

const PLANO_PAGO_KEY = 'doca-plano-pago-v1'

export function planoOfertaPorId(id: string | null | undefined) {
  if (!id) return null
  return PLANOS_OFERTA_CARGA.find((p) => p.id === id) ?? null
}

export function ramificacaoSugeridaDoPlano(id: string | null | undefined): RamificacaoCadastro {
  return planoOfertaPorId(id)?.ramificacao ?? 'transportadora'
}

export type PlanoPagoStatus = 'pendente' | 'comprovante_enviado'

export function marcarPlanoPago(planoId: string, txid: string, status: PlanoPagoStatus = 'pendente') {
  try {
    sessionStorage.setItem(PLANO_PAGO_KEY, JSON.stringify({ planoId, txid, status, at: Date.now() }))
  } catch {
    /* ignore */
  }
}

export function marcarComprovantePlanoEnviado() {
  const atual = lerPlanoPago()
  if (!atual) return
  marcarPlanoPago(atual.planoId, atual.txid, 'comprovante_enviado')
}

export function lerPlanoPago(): { planoId: string; txid: string; status: PlanoPagoStatus } | null {
  try {
    const raw = sessionStorage.getItem(PLANO_PAGO_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as { planoId?: string; txid?: string; status?: PlanoPagoStatus }
    if (!parsed?.planoId) return null
    return {
      planoId: parsed.planoId,
      txid: parsed.txid || '',
      status: parsed.status === 'comprovante_enviado' ? 'comprovante_enviado' : 'pendente',
    }
  } catch {
    return null
  }
}

/** Link do cadastro depois que o PIX do plano foi confirmado (não usar no “Já paguei”). */
export function irCadastroPlanoPago(planoId: string) {
  const path = `/cadastro-transportador?plano=${encodeURIComponent(planoId)}&pago=1`
  if (isLocalDev() || isSiteSistema()) {
    window.location.hash = path
    return
  }
  window.location.assign(hrefSistema(path))
}
