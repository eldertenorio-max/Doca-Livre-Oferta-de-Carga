const STORAGE_KEY = 'doca-livre-cotacao-transportadores'

export function loadCotacaoIds(): string[] {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed.map(String).filter(Boolean)
  } catch {
    return []
  }
}

export function saveCotacaoIds(ids: string[]) {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify([...new Set(ids)]))
  } catch {
    /* ignore */
  }
}

export function toggleCotacaoId(id: string): string[] {
  const cur = loadCotacaoIds()
  const next = cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]
  saveCotacaoIds(next)
  return next
}

export function clearCotacaoIds() {
  saveCotacaoIds([])
}
