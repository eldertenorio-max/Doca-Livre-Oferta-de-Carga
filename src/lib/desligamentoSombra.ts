/** O front só larga o Supabase quando a API já segura o sistema. */

export const DIAS_SUPABASE_SOMENTE_LEITURA = 30

const DIA_MS = 24 * 60 * 60 * 1000

export type FrenteDesligamento = {
  apiNoAr: boolean
  contagensBatem: boolean
  loginNaApi: boolean
  arquivosEspelhados: boolean
}

export function podeDesligarFront(frente: FrenteDesligamento): boolean {
  return (
    frente.apiNoAr &&
    frente.contagensBatem &&
    frente.loginNaApi &&
    frente.arquivosEspelhados
  )
}

/** Enquanto a virada não fecha, o site continua chamando o Supabase. */
export function destinoDoFront(frente: FrenteDesligamento): 'supabase' | 'api' {
  return podeDesligarFront(frente) ? 'api' : 'supabase'
}

export function frontChamaSupabase(frente: FrenteDesligamento): boolean {
  return destinoDoFront(frente) === 'supabase'
}

/** Depois do corte, o Supabase fica só leitura por 30 dias. O site não volta a chamá-lo. */
export function supabaseSomenteLeitura(desligadoEmIso: string, agoraIso: string): boolean {
  const inicio = new Date(desligadoEmIso).getTime()
  const agora = new Date(agoraIso).getTime()
  if (!Number.isFinite(inicio) || !Number.isFinite(agora)) return false
  const fim = inicio + DIAS_SUPABASE_SOMENTE_LEITURA * DIA_MS
  return agora >= inicio && agora < fim
}
