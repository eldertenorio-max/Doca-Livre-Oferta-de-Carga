import type { Empresa } from '../types'
import { categoriaPorId } from './categorias'
import { nomeMarca } from './search'

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

const HOST_LIXO =
  /(?:^|\.)(?:gov\.br|olist\.com|seutempo\.com|wikipedia\.org|guiapj\.com|econodata\.com\.br|casadosdados\.com|receitaws\.com\.br|cnpj\.ws|infoplex\.com\.br)$/i
const EMAIL_PUBLICO = /^(gmail|hotmail|outlook|yahoo|uol|bol|ig|terra|icloud|live|msn|proton)\./i

function hostDeUrl(raw?: string | null): string | null {
  const t = (raw || '').trim()
  if (!t) return null
  try {
    const u = new URL(t.includes('://') ? t : `https://${t}`)
    const host = u.hostname.replace(/^www\./i, '').toLowerCase()
    if (!host.includes('.') || HOST_LIXO.test(host)) return null
    return host
  } catch {
    return null
  }
}

function hostDeEmail(email?: string | null): string | null {
  const host = (email || '').split('@')[1]?.trim().toLowerCase() || ''
  if (!host.includes('.') || EMAIL_PUBLICO.test(host) || HOST_LIXO.test(host)) return null
  return host
}

function siteParaLogo(e: Empresa, catalogo: Empresa[] = []): string | undefined {
  if (hostDeUrl(e.site_url)) return e.site_url!.trim()
  if (e.hierarquia_superior) {
    const matriz = catalogo.find((x) => x.id === e.hierarquia_superior)
    if (hostDeUrl(matriz?.site_url)) return matriz!.site_url!.trim()
  }
  const marca = nomeMarca(e)
  const irmao = catalogo.find((x) => x.id !== e.id && nomeMarca(x) === marca && hostDeUrl(x.site_url))
  if (irmao?.site_url) return irmao.site_url
  const emailHost = hostDeEmail(e.email)
  if (emailHost) return `https://${emailHost}`
  const fonte = e.fontes?.find((f) => hostDeUrl(f.url))
  return fonte?.url
}

export function urlsLogoEmpresa(e: Empresa, catalogo: Empresa[] = []): string[] {
  const urls: string[] = []
  if (e.logo_url?.trim()) urls.push(e.logo_url.trim())
  const host = hostDeUrl(siteParaLogo(e, catalogo))
  if (host) {
    const alvo = encodeURIComponent(`https://${host}`)
    urls.push(
      `https://t2.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=${alvo}&size=128`,
    )
    urls.push(`https://icons.duckduckgo.com/ip3/${host}.ico`)
  }
  return [...new Set(urls)]
}

export function logoSrcEmpresa(e: Empresa, catalogo: Empresa[] = []): string | null {
  return urlsLogoEmpresa(e, catalogo)[0] ?? null
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
