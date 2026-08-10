import type { PortalAccount } from './portalAuth'
import type { Transportador } from '../types'

/** WhatsApp fixo para envio das credenciais (pedido do embarcador). */
export const WHATSAPP_CREDENCIAIS_DIGITS = '553591368282'

export function mensagemCredenciaisTransportador(
  t: Pick<Transportador, 'nome_fantasia' | 'razao_social'>,
  conta: Pick<PortalAccount, 'usuario' | 'password'> | null,
): string {
  const nome = (t.nome_fantasia || t.razao_social || 'transportadora').trim()
  const usuario = (conta?.usuario || '').trim() || '(sem usuário cadastrado)'
  const senha = (conta?.password || '').trim() || '(senha não disponível neste aparelho)'

  return [
    `Olá, ${nome}!`,
    '',
    'Seguem seus dados de acesso ao Doca Livre — Oferta de Carga:',
    '',
    `Usuário: ${usuario}`,
    `Senha: ${senha}`,
    '',
    'Por favor, cadastre as placas dos seus veículos e os seus motoristas no sistema.',
    '',
    'Aviso: ainda estamos em desenvolvimento — neste momento estamos apenas criando o banco de veículos.',
    '',
    'Qualquer dúvida, estamos à disposição.',
  ].join('\n')
}

export function whatsappCredenciaisHref(mensagem: string): string {
  return `https://wa.me/${WHATSAPP_CREDENCIAIS_DIGITS}?text=${encodeURIComponent(mensagem)}`
}

export function emailCredenciaisHref(
  email: string,
  mensagem: string,
  nomeTransportadora: string,
): string | null {
  const to = (email || '').trim()
  if (!to || !to.includes('@')) return null
  const subject = `Acesso Doca Livre — ${nomeTransportadora}`
  return `mailto:${to}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(mensagem)}`
}
