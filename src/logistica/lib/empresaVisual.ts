import type { Empresa } from '../types'
import { categoriaPorId } from './categorias'

export function iniciaisEmpresa(nome: string) {
  return nome
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('')
}

export function formatPhoneBr(raw?: string | null) {
  const d = (raw || '').replace(/\D/g, '')
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`
  return (raw || '').trim()
}

export function whatsappLink(raw?: string | null) {
  const d = (raw || '').replace(/\D/g, '')
  if (d.length < 10) return null
  const full = d.startsWith('55') ? d : `55${d}`
  return `https://wa.me/${full}`
}

export function logoSrcEmpresa(e: Empresa): string | null {
  if (e.logo_url?.trim()) return e.logo_url.trim()
  if (!e.site_url) return null
  try {
    const host = new URL(e.site_url).hostname
    return `https://www.google.com/s2/favicons?domain=${host}&sz=128`
  } catch {
    return null
  }
}

export function oQueFaz(e: Empresa) {
  const cat = categoriaPorId(e.categoria)
  const detalhes = (e.especialidades.length ? e.especialidades : e.servicos).slice(0, 3)
  return {
    categoria: cat.label,
    emoji: cat.emoji,
    detalhe: detalhes.join(' · '),
  }
}

const LISTA_KEY = 'mapa-logistica-lista-empresas'

export function loadListaEmpresas(): string[] {
  try {
    const raw = localStorage.getItem(LISTA_KEY)
    const parsed = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed) ? parsed.filter((x) => typeof x === 'string') : []
  } catch {
    return []
  }
}

export function toggleListaEmpresa(id: string): string[] {
  const atual = loadListaEmpresas()
  const next = atual.includes(id) ? atual.filter((x) => x !== id) : [...atual, id]
  localStorage.setItem(LISTA_KEY, JSON.stringify(next))
  return next
}
