import { getAllCities } from 'easy-location-br'

export function normalizarTexto(s: string): string {
  return s
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .trim()
}

type CidadeIndex = {
  label: string
  nomeNorm: string
  capital: boolean
}

let index: CidadeIndex[] | null = null

function getIndex(): CidadeIndex[] {
  if (index) return index
  index = getAllCities().map((c) => ({
    label: `${c.name} - ${c.stateId}`,
    nomeNorm: normalizarTexto(c.name),
    capital: Boolean(c.capital),
  }))
  return index
}

/** Busca municípios BR no formato "Cidade - UF". */
export function buscarCidades(query: string, limit = 14): string[] {
  const q = normalizarTexto(query)
  if (q.length < 2) return []

  const starts: CidadeIndex[] = []
  const includes: CidadeIndex[] = []

  for (const c of getIndex()) {
    if (c.nomeNorm.startsWith(q)) {
      starts.push(c)
      continue
    }
    const palavras = c.nomeNorm.split(/\s+/)
    if (palavras.some((p) => p.startsWith(q))) {
      starts.push(c)
      continue
    }
    if (c.nomeNorm.includes(q)) includes.push(c)
  }

  const rank = (a: CidadeIndex, b: CidadeIndex) =>
    Number(b.capital) - Number(a.capital) || a.label.localeCompare(b.label, 'pt-BR')

  starts.sort(rank)
  includes.sort(rank)

  const out: string[] = []
  const seen = new Set<string>()
  for (const c of [...starts, ...includes]) {
    if (seen.has(c.label)) continue
    seen.add(c.label)
    out.push(c.label)
    if (out.length >= limit) break
  }
  return out
}

/** Une listas, prioriza matches e remove vazios/duplicados. */
export function filtrarSugestoes(
  query: string,
  listas: (string | undefined | null)[][],
  limit = 12,
): string[] {
  const q = normalizarTexto(query)
  const seen = new Set<string>()
  const starts: string[] = []
  const rest: string[] = []

  for (const lista of listas) {
    for (const raw of lista) {
      const v = raw?.trim()
      if (!v) continue
      const key = v.toLowerCase()
      if (seen.has(key)) continue
      const n = normalizarTexto(v)
      if (q && !n.includes(q)) continue
      seen.add(key)
      if (!q || n.startsWith(q)) starts.push(v)
      else rest.push(v)
    }
  }

  return [...starts, ...rest].slice(0, limit)
}
