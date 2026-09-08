const STORAGE_KEY = 'doca-mapa-publico-buscas-v1'
const LIMITE = 2
const JANELA_MS = 24 * 60 * 60 * 1000

type Registro = {
  n: number
  inicio: number
}

export const MAPA_PUBLICO_LIMITE_BUSCAS = LIMITE

function ler(): Registro {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { n: 0, inicio: Date.now() }
    const parsed = JSON.parse(raw) as Registro
    if (!parsed || typeof parsed.n !== 'number' || typeof parsed.inicio !== 'number') {
      return { n: 0, inicio: Date.now() }
    }
    if (Date.now() - parsed.inicio >= JANELA_MS) return { n: 0, inicio: Date.now() }
    return parsed
  } catch {
    return { n: 0, inicio: Date.now() }
  }
}

function gravar(reg: Registro) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(reg))
  } catch {
    /* ignore */
  }
}

export function estadoBuscasPublicas(): {
  usadas: number
  restam: number
  esgotado: boolean
} {
  const reg = ler()
  const usadas = Math.min(LIMITE, Math.max(0, reg.n))
  const restam = Math.max(0, LIMITE - usadas)
  return { usadas, restam, esgotado: restam <= 0 }
}

/** Consome 1 busca se ainda houver crédito. Não consome se já esgotou. */
export function registrarBuscaPublica(): {
  ok: boolean
  usadas: number
  restam: number
} {
  const reg = ler()
  if (reg.n >= LIMITE) return { ok: false, usadas: LIMITE, restam: 0 }
  const inicio = reg.n === 0 ? Date.now() : reg.inicio
  const n = reg.n + 1
  gravar({ n, inicio })
  return { ok: true, usadas: n, restam: Math.max(0, LIMITE - n) }
}
