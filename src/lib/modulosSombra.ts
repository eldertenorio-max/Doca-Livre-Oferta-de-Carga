import { validarCadastroTransportador, type CadastroTransportadorInput } from './cadastroTransportador'
import { motivoFrotaNaoAtende } from './cargaExigencias'
import type { Carga, Veiculo } from '../types'

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
