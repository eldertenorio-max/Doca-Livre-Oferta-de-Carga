/** Pontos estáveis do rosto (Face Mesh) para comparar a mesma pessoa. */
const PONTOS = [1, 4, 10, 33, 61, 133, 152, 159, 263, 291, 362, 386, 13, 14, 168, 454]

/** Distância média aceita entre o rosto ao vivo e o do cadastro. */
export const FACIAL_DISTANCIA_MAX = 0.16

export type FacialCaptura = {
  imagemDataUrl: string
  descriptor: number[]
}

export type FacialReferencia = {
  facial_descriptor?: number[] | null
  facial_proxima_em?: string | null
  facial_foto_url?: string | null
  facial_verificado_em?: string | null
}

export function descritorDoRosto(landmarks: Array<{ x: number; y: number }>): number[] | null {
  if (landmarks.length < 468) return null
  const left = landmarks[33]
  const right = landmarks[263]
  if (!left || !right) return null
  const iod = Math.hypot(right.x - left.x, right.y - left.y)
  if (iod < 0.02) return null
  const cx = (left.x + right.x) / 2
  const cy = (left.y + right.y) / 2
  const out: number[] = []
  for (const i of PONTOS) {
    const p = landmarks[i]
    if (!p || !Number.isFinite(p.x) || !Number.isFinite(p.y)) return null
    out.push((p.x - cx) / iod, (p.y - cy) / iod)
  }
  return out
}

export function distanciaFacial(a: number[], b: number[]): number {
  if (!a.length || a.length !== b.length) return Number.POSITIVE_INFINITY
  let soma = 0
  for (let i = 0; i < a.length; i++) {
    const d = a[i] - b[i]
    soma += d * d
  }
  return Math.sqrt(soma / a.length)
}

export function mesmoRosto(atual: number[], referencia: number[]): boolean {
  return distanciaFacial(atual, referencia) <= FACIAL_DISTANCIA_MAX
}

/** Próxima cobrança entre 14 e 35 dias — não é em todo login. */
export function agendarProximaFacial(desde = new Date()): string {
  const dias = 14 + Math.floor(Math.random() * 22)
  return new Date(desde.getTime() + dias * 24 * 60 * 60 * 1000).toISOString()
}

export function descritorValido(valor: unknown): number[] | null {
  let bruto: unknown = valor
  if (typeof valor === 'string') {
    try {
      bruto = JSON.parse(valor) as unknown
    } catch {
      return null
    }
  }
  const lista = Array.isArray(bruto) ? bruto : null
  if (!lista || lista.length < 8) return null
  const nums = lista.map((n) => Number(n))
  if (nums.some((n) => !Number.isFinite(n))) return null
  return nums
}

/** Por enquanto a facial é só da transportadora. Motorista, embarcador e unidade ficam de fora. */
export function facialParaTransportadora(ramificacao: string | null | undefined): boolean {
  const r = (ramificacao || '').trim().toLowerCase()
  return !r || r === 'transportadora'
}

const FACIAL_LOCAL_KEY = 'doca-facial-verificacao-v1'

/** Cópia neste aparelho: o sync do Kanban não pode apagar o rosto já confirmado. */
export function guardarFacialLocal(transportadorId: string, campos: FacialReferencia) {
  const id = transportadorId.trim()
  if (!id || !descritorValido(campos.facial_descriptor)) return
  try {
    const bruto = localStorage.getItem(FACIAL_LOCAL_KEY)
    const all = bruto ? (JSON.parse(bruto) as Record<string, FacialReferencia>) : {}
    all[id] = {
      facial_descriptor: descritorValido(campos.facial_descriptor),
      facial_foto_url: campos.facial_foto_url || null,
      facial_verificado_em: campos.facial_verificado_em || null,
      facial_proxima_em: campos.facial_proxima_em || null,
    }
    localStorage.setItem(FACIAL_LOCAL_KEY, JSON.stringify(all))
  } catch {
    /* quota */
  }
}

export function lerFacialLocal(transportadorId: string | null | undefined): FacialReferencia | null {
  const id = (transportadorId || '').trim()
  if (!id) return null
  try {
    const bruto = localStorage.getItem(FACIAL_LOCAL_KEY)
    if (!bruto) return null
    const all = JSON.parse(bruto) as Record<string, FacialReferencia>
    const item = all[id]
    if (!item || !descritorValido(item.facial_descriptor)) return null
    return item
  } catch {
    return null
  }
}

function quandoFacial(iso?: string | null): number {
  if (!iso) return 0
  const n = new Date(iso).getTime()
  return Number.isFinite(n) ? n : 0
}

/** Fica com a verificação mais recente. Sync sem rosto não apaga a que já foi salva. */
export function preservarVerificacaoFacial<T extends FacialReferencia>(
  remoto: T,
  local?: FacialReferencia | null,
): T {
  if (!local) return remoto
  const localDesc = descritorValido(local.facial_descriptor)
  const remotoDesc = descritorValido(remoto.facial_descriptor)
  const ficarLocal =
    Boolean(localDesc) && (!remotoDesc || quandoFacial(local.facial_verificado_em) >= quandoFacial(remoto.facial_verificado_em))
  if (!ficarLocal) {
    return {
      ...remoto,
      facial_descriptor: remotoDesc ?? localDesc ?? remoto.facial_descriptor,
      facial_foto_url: remoto.facial_foto_url || local.facial_foto_url,
      facial_verificado_em: remoto.facial_verificado_em || local.facial_verificado_em,
      facial_proxima_em: remoto.facial_proxima_em || local.facial_proxima_em,
    }
  }
  return {
    ...remoto,
    facial_descriptor: localDesc,
    facial_foto_url: local.facial_foto_url || remoto.facial_foto_url,
    facial_verificado_em: local.facial_verificado_em,
    facial_proxima_em: local.facial_proxima_em || remoto.facial_proxima_em,
  }
}

/** Sem rosto gravado, cobra na hora. Com rosto, só quando a data marcada chega. */
export function deveCobrarVerificacaoFacial(t: FacialReferencia | null | undefined): boolean {
  if (!t) return false
  if (!descritorValido(t.facial_descriptor)) return true
  if (!t.facial_proxima_em) return true
  const quando = new Date(t.facial_proxima_em).getTime()
  if (!Number.isFinite(quando)) return true
  return quando <= Date.now()
}
