/** Créditos avulsos de cálculo de rota (PIX), neste aparelho. */

const STORAGE_KEY = 'doca-rota-publico-creditos-v1'
const TX_KEY = 'doca-rota-publico-pix-tx-v1'

export type PacoteCreditoRota = {
  id: string
  creditos: number
  preco: number
  titulo: string
  sub: string
  destaque?: boolean
}

export const PACOTES_CREDITO_ROTA: PacoteCreditoRota[] = [
  {
    id: '5',
    creditos: 5,
    preco: 9.9,
    titulo: '5 créditos',
    sub: '5 cálculos de rota',
    destaque: true,
  },
  {
    id: '15',
    creditos: 15,
    preco: 24.9,
    titulo: '15 créditos',
    sub: '15 cálculos de rota',
  },
  {
    id: '30',
    creditos: 30,
    preco: 39.9,
    titulo: '30 créditos',
    sub: '30 cálculos de rota',
  },
]

function lerCreditos(): number {
  try {
    const n = Number(localStorage.getItem(STORAGE_KEY))
    return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0
  } catch {
    return 0
  }
}

function gravarCreditos(n: number) {
  try {
    localStorage.setItem(STORAGE_KEY, String(Math.max(0, Math.floor(n))))
  } catch {
    /* ignore */
  }
}

export function creditosRotaPublico(): number {
  return lerCreditos()
}

export function consumirCreditoRotaPublico(): boolean {
  const n = lerCreditos()
  if (n < 1) return false
  gravarCreditos(n - 1)
  return true
}

export function creditarPacoteRotaPublico(pacote: PacoteCreditoRota, txid: string): boolean {
  const id = txid.trim()
  if (!id) return false
  try {
    const raw = localStorage.getItem(TX_KEY)
    const usados = raw ? (JSON.parse(raw) as string[]) : []
    if (usados.includes(id)) return false
    usados.push(id)
    localStorage.setItem(TX_KEY, JSON.stringify(usados.slice(-80)))
  } catch {
    return false
  }
  gravarCreditos(lerCreditos() + pacote.creditos)
  return true
}

export function novoTxidPix() {
  return `DOC${Date.now().toString(36).toUpperCase()}`.replace(/[^A-Z0-9]/g, '').slice(0, 25)
}
