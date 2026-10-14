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

/** Sem rosto gravado, cobra na hora. Com rosto, só quando a data marcada chega. */
export function deveCobrarVerificacaoFacial(t: FacialReferencia | null | undefined): boolean {
  if (!t) return false
  if (!descritorValido(t.facial_descriptor)) return true
  if (!t.facial_proxima_em) return true
  const quando = new Date(t.facial_proxima_em).getTime()
  if (!Number.isFinite(quando)) return true
  return quando <= Date.now()
}
