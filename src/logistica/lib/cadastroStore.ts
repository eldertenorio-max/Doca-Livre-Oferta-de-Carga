import { EMPRESAS } from '../data/empresas'
import type { Empresa } from '../types'
import { slugify } from './search'
import { salvarEmpresaRemota, tabelaAindaNaoExiste } from './supabaseSync'

const KEY = 'mapa-logistica-empresas-cadastro-v1'

function loadJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return fallback
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

export function loadEmpresasCadastro(): Empresa[] {
  const lista = loadJson<Empresa[]>(KEY, [])
  return Array.isArray(lista) ? lista : []
}

export async function saveEmpresaCadastro(empresa: Empresa) {
  const lista = loadEmpresasCadastro().filter((e) => e.id !== empresa.id && e.slug !== empresa.slug)
  lista.push(empresa)
  localStorage.setItem(KEY, JSON.stringify(lista))
  try {
    await salvarEmpresaRemota(empresa)
  } catch (err) {
    if (!tabelaAindaNaoExiste(err)) throw err
  }
}

export function listarEmpresas(): Empresa[] {
  const extra = loadEmpresasCadastro()
  const ids = new Set(extra.map((e) => e.id))
  const slugs = new Set(extra.map((e) => e.slug))
  return [...EMPRESAS.filter((e) => !ids.has(e.id) && !slugs.has(e.slug)), ...extra]
}

export function empresaPorSlugCatalogo(slug: string) {
  return listarEmpresas().find((e) => e.slug === slug)
}

export function slugEmpresaUnico(nome: string) {
  const base = slugify(nome) || 'empresa'
  const usados = new Set(listarEmpresas().map((e) => e.slug))
  if (!usados.has(base)) return base
  let i = 2
  while (usados.has(`${base}-${i}`)) i += 1
  return `${base}-${i}`
}
