import {
  consultarEstadoBuscasPublicas,
  estadoBuscasPublicas,
  MAPA_PUBLICO_LIMITE_BUSCAS,
  registrarBuscaPublica,
  type EstadoBuscasPublicas,
} from '../../lib/mapaPublicoBuscas'

export { estadoBuscasPublicas, MAPA_PUBLICO_LIMITE_BUSCAS }
export type { EstadoBuscasPublicas }

export type ConsumoBuscaPublica = EstadoBuscasPublicas & {
  ok: boolean
}

export function carregarEstadoBuscasPublicas(): Promise<EstadoBuscasPublicas> {
  return consultarEstadoBuscasPublicas()
}

export function registrarBuscaPublicaRemota(): Promise<ConsumoBuscaPublica> {
  return registrarBuscaPublica()
}
