import { validarCadastroTransportador, type CadastroTransportadorInput } from './cadastroTransportador'
import { motivoFrotaNaoAtende } from './cargaExigencias'
import { montarPontosFrota } from './mapaFrota'
import { gerarPixCopiaECola, type PixBrCodeOpts } from './pixBrCode'
import type { Carga, Motorista, NotificacaoInApp, Transportador, Veiculo } from '../types'

/** Mesma recusa do cadastro público. null = pode gravar. */
export function parecerCadastro(input: CadastroTransportadorInput): string | null {
  return validarCadastroTransportador(input)
}

/**
 * A oferta aparece para o grupo mesmo sem frota compatível.
 * O lance só segue quando a frota atende.
 */
export function parecerLance(
  carga: Carga,
  veiculos: Veiculo[],
  transportadorId: string,
): { mostraOferta: true; podeEnviar: boolean; motivo: string | null } {
  const motivo = motivoFrotaNaoAtende(carga, veiculos, transportadorId)
  return { mostraOferta: true, podeEnviar: motivo == null, motivo }
}

/** Placas do filtro padrão do mapa: indisponível fica de fora. */
export function placasNoMapaPadrao(
  motoristas: Motorista[],
  veiculos: Veiculo[],
  transportadores: Transportador[],
): string[] {
  return montarPontosFrota(motoristas, veiculos, transportadores)
    .filter((p) => p.disponivel)
    .map((p) => p.placa)
}

const TITULOS_AVISO = new Set(['Nova carga publicada', 'Nova oferta de carga', 'Negociação reaberta'])

export function ehAvisoCarga(n: Pick<NotificacaoInApp, 'chave' | 'titulo'>): boolean {
  return Boolean(n.chave?.startsWith('carga-aviso:')) || TITULOS_AVISO.has(n.titulo)
}

/** Um aviso por carga e mensagem. A lista já vem da mais nova para a mais antiga. */
export function deduplicarAvisosCarga<
  T extends Pick<NotificacaoInApp, 'carga_id' | 'mensagem' | 'chave' | 'titulo'>,
>(lista: T[]): T[] {
  return lista.filter((n) => {
    if (!n.carga_id || !n.mensagem) return true
    if (!ehAvisoCarga(n)) return true
    return (
      lista.find(
        (o) => o.carga_id === n.carga_id && o.mensagem === n.mensagem && ehAvisoCarga(o),
      ) === n
    )
  })
}

/** Mesmo BR Code de hoje. O valor entra com duas casas. */
export function parecerPix(opts: PixBrCodeOpts): string {
  return gerarPixCopiaECola(opts)
}

/** Igual ao portal-otp: seis dígitos, o resto é ignorado. */
export function codigoEmailAceito(codigoRaw: string): boolean {
  const codigo = (codigoRaw || '').replace(/\D/g, '')
  return /^\d{6}$/.test(codigo)
}
