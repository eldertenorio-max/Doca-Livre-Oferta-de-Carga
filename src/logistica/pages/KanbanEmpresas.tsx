import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { Briefcase, MapPin } from 'lucide-react'
import { useAuth } from '../lib/AuthContext'
import { CATEGORIAS, categoriaPorId } from '../lib/categorias'
import { catValida } from '../lib/painelStats'
import { filtrarEmpresas } from '../lib/search'
import {
  formatPhoneBr,
  iniciaisEmpresa,
  logoSrcEmpresa,
  oQueFaz,
  whatsappLink,
} from '../lib/empresaVisual'
import type { CategoriaId, Empresa } from '../types'
import '../styles/kanban-empresas.css'

function pinIcon(ativo: boolean) {
  return L.divIcon({
    className: 'emp-kanban-pin',
    html: `<span class="emp-kanban-pin__mark${ativo ? ' is-on' : ''}" aria-hidden="true"></span>`,
    iconSize: [28, 36],
    iconAnchor: [14, 34],
    popupAnchor: [0, -30],
  })
}

function escapeHtml(s: string) {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function popupHtml(e: Empresa) {
  const faz = oQueFaz(e)
  return `<div class="emp-kanban-popup">
    <strong>${escapeHtml(e.nome_fantasia)}</strong>
    <span>${escapeHtml(e.cidade)} / ${escapeHtml(e.uf)}</span>
    <em>${escapeHtml(faz.categoria)}${faz.detalhe ? ` · ${escapeHtml(faz.detalhe)}` : ''}</em>
  </div>`
}

const PAGE_SIZE = 10

function paginasVisiveis(atual: number, total: number) {
  const janela = 5
  let inicio = Math.max(1, atual - 2)
  const fim = Math.min(total, inicio + janela - 1)
  inicio = Math.max(1, fim - janela + 1)
  return Array.from({ length: fim - inicio + 1 }, (_, i) => inicio + i)
}

export function KanbanEmpresasPage() {
  const { empresas } = useAuth()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const mapEl = useRef<HTMLDivElement>(null)
  const mapWrapRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<L.Map | null>(null)
  const markersRef = useRef<Map<string, L.Marker>>(new Map())
  const [query, setQuery] = useState('')
  const catParam = searchParams.get('cat')
  const [categoria, setCategoria] = useState<CategoriaId | null>(() =>
    catValida(catParam) ? catParam : null,
  )
  const [selecionadoId, setSelecionadoId] = useState<string | null>(null)
  const [pagina, setPagina] = useState(1)
  const [logoQuebrou, setLogoQuebrou] = useState<Record<string, boolean>>({})
  const listaRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (catValida(catParam)) setCategoria(catParam)
  }, [catParam])

  const filtradas = useMemo(() => {
    return [...filtrarEmpresas(empresas, query, categoria)].sort((a, b) =>
      a.nome_fantasia.localeCompare(b.nome_fantasia, 'pt-BR'),
    )
  }, [query, categoria, empresas])

  const totalPaginas = Math.max(1, Math.ceil(filtradas.length / PAGE_SIZE))
  const paginaAtual = Math.min(pagina, totalPaginas)
  const paginaItens = filtradas.slice((paginaAtual - 1) * PAGE_SIZE, paginaAtual * PAGE_SIZE)

  useEffect(() => {
    setPagina(1)
  }, [query, categoria])

  useEffect(() => {
    listaRef.current?.scrollTo({ top: 0 })
  }, [paginaAtual])

  useEffect(() => {
    if (!mapEl.current || mapRef.current) return
    const map = L.map(mapEl.current, {
      center: [-22.5, -47.2],
      zoom: 5,
      zoomControl: true,
    })
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap',
      maxZoom: 18,
    }).addTo(map)
    mapRef.current = map
    const t = window.setTimeout(() => map.invalidateSize(), 80)
    return () => {
      window.clearTimeout(t)
      map.remove()
      mapRef.current = null
      markersRef.current.clear()
    }
  }, [])

  useEffect(() => {
    const el = mapWrapRef.current
    const map = mapRef.current
    if (!el || !map || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(() => map.invalidateSize({ animate: false }))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    const keep = new Set(filtradas.map((e) => e.id))
    for (const [id, m] of markersRef.current) {
      if (!keep.has(id)) {
        map.removeLayer(m)
        markersRef.current.delete(id)
      }
    }
    const bounds: L.LatLngExpression[] = []
    for (const e of filtradas) {
      bounds.push([e.lat, e.lng])
      const ativo = selecionadoId === e.id
      let m = markersRef.current.get(e.id)
      if (!m) {
        m = L.marker([e.lat, e.lng], {
          icon: pinIcon(ativo),
          title: e.nome_fantasia,
          riseOnHover: true,
        })
        m.bindPopup(popupHtml(e), { className: 'emp-kanban-leaflet-popup' })
        m.on('click', () => setSelecionadoId(e.id))
        m.addTo(map)
        markersRef.current.set(e.id, m)
      } else {
        m.setLatLng([e.lat, e.lng])
        m.setIcon(pinIcon(ativo))
        m.setPopupContent(popupHtml(e))
      }
    }
    if (!selecionadoId) {
      if (bounds.length === 1) map.setView(bounds[0], 11)
      else if (bounds.length > 1) {
        map.fitBounds(L.latLngBounds(bounds), { padding: [40, 40], maxZoom: 10 })
      }
    }
    window.setTimeout(() => map.invalidateSize(), 60)
  }, [filtradas, selecionadoId])

  useEffect(() => {
    if (!selecionadoId) return
    const map = mapRef.current
    const m = markersRef.current.get(selecionadoId)
    if (!map || !m) return
    const ll = m.getLatLng()
    map.invalidateSize()
    map.setView(ll, Math.max(map.getZoom(), 12), { animate: true })
    window.setTimeout(() => {
      m.openPopup()
      map.panTo(ll, { animate: true })
    }, 80)
  }, [selecionadoId])

  useEffect(() => {
    if (!selecionadoId) return
    const idx = filtradas.findIndex((e) => e.id === selecionadoId)
    if (idx < 0) return
    const alvo = Math.floor(idx / PAGE_SIZE) + 1
    setPagina((atual) => (atual === alvo ? atual : alvo))
  }, [selecionadoId, filtradas])

  function onLocalizar(e: Empresa) {
    setSelecionadoId(e.id)
    window.setTimeout(() => {
      document.getElementById(`card-${e.id}`)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
    }, 50)
  }

  function aplicarCategoria(id: CategoriaId | null) {
    setCategoria(id)
    navigate(id ? `/embarcador/mapa-logistica/kanban?cat=${id}` : '/embarcador/mapa-logistica/kanban')
  }

  const inicio = filtradas.length === 0 ? 0 : (paginaAtual - 1) * PAGE_SIZE + 1
  const fim = Math.min(paginaAtual * PAGE_SIZE, filtradas.length)

  return (
    <div className="emp-kanban animate-fade-up">
      <div className="emp-kanban__bar">
        <div>
          <h2>Kanban de empresas</h2>
          <p>
            {filtradas.length} empresa{filtradas.length === 1 ? '' : 's'}
            {categoria ? ` · ${categoriaPorId(categoria).label}` : ''}
            {filtradas.length > 0 ? ` · ${inicio}–${fim}` : ''}
          </p>
        </div>
      </div>

      <div className="emp-kanban__filtros">
        <input
          className="emp-kanban__busca"
          placeholder="Buscar por nome, o que faz, cidade…"
          value={query}
          onChange={(ev) => setQuery(ev.target.value)}
        />
        <div className="emp-kanban__cats">
          <button
            type="button"
            className={`emp-kanban__cat${categoria == null ? ' is-on' : ''}`}
            onClick={() => aplicarCategoria(null)}
          >
            Todas
          </button>
          {CATEGORIAS.map((c) => (
            <button
              key={c.id}
              type="button"
              className={`emp-kanban__cat${categoria === c.id ? ' is-on' : ''}`}
              onClick={() => aplicarCategoria(categoria === c.id ? null : c.id)}
            >
              {c.emoji} {c.label}
            </button>
          ))}
        </div>
      </div>

      <div className="emp-kanban__layout">
        <div className="emp-kanban__lista">
          <div className="emp-kanban__cards" ref={listaRef}>
            {filtradas.length === 0 ? (
              <p className="emp-kanban__meta">Nenhuma empresa encontrada.</p>
            ) : (
              paginaItens.map((e) => {
                const tel = e.telefone
                const wa = whatsappLink(tel)
                const faz = oQueFaz(e)
                const logo = logoQuebrou[e.id] ? null : logoSrcEmpresa(e)
                return (
                  <article
                    key={e.id}
                    id={`card-${e.id}`}
                    className={`emp-card${selecionadoId === e.id ? ' is-on' : ''}`}
                  >
                    <div className="emp-card__logo">
                      {logo ? (
                        <img
                          src={logo}
                          alt=""
                          onError={() => setLogoQuebrou((m) => ({ ...m, [e.id]: true }))}
                        />
                      ) : (
                        <span>{iniciaisEmpresa(e.nome_fantasia || e.razao_social)}</span>
                      )}
                    </div>
                    <div className="emp-card__info">
                      <h3 className="emp-card__nome">{e.nome_fantasia}</h3>
                      <p className="emp-card__faz">
                        {faz.emoji} {faz.categoria}
                        {faz.detalhe ? ` · ${faz.detalhe}` : ''}
                      </p>
                      {tel ? (
                        <p className="emp-card__contato">
                          <PhoneIcon />
                          {formatPhoneBr(tel)}
                        </p>
                      ) : null}
                      {wa ? (
                        <p className="emp-card__contato">
                          <WhatsIcon />
                          <a href={wa} target="_blank" rel="noreferrer">
                            {formatPhoneBr(tel || '')}
                          </a>
                        </p>
                      ) : null}
                      {e.email ? (
                        <p className="emp-card__contato">
                          <MailIcon />
                          <a href={`mailto:${e.email}`}>{e.email}</a>
                        </p>
                      ) : null}
                      <p className="emp-card__mais emp-card__mais--local">
                        <MapPin size={13} aria-hidden />
                        {e.cidade} / {e.uf}
                      </p>
                    </div>
                    <div className="emp-card__acoes">
                      <button type="button" className="emp-card__acao" onClick={() => onLocalizar(e)}>
                        <MapPin size={14} color="#dc2626" />
                        localizar no mapa
                      </button>
                      <button
                        type="button"
                        className="emp-card__acao"
                        onClick={() => navigate(`/embarcador/mapa-logistica/empresa/${e.slug}?from=kanban`)}
                      >
                        <Briefcase size={14} />
                        ver perfil
                      </button>
                    </div>
                  </article>
                )
              })
            )}
          </div>

          {filtradas.length > 0 ? (
            <nav className="emp-kanban__pager" aria-label="Paginação">
              <button
                type="button"
                className="emp-kanban__page-btn"
                disabled={paginaAtual <= 1}
                onClick={() => setPagina((p) => Math.max(1, p - 1))}
              >
                Anterior
              </button>
              {paginasVisiveis(paginaAtual, totalPaginas).map((n) => (
                <button
                  key={n}
                  type="button"
                  className={`emp-kanban__page-btn${n === paginaAtual ? ' is-on' : ''}`}
                  onClick={() => setPagina(n)}
                  aria-current={n === paginaAtual ? 'page' : undefined}
                >
                  {n}
                </button>
              ))}
              <button
                type="button"
                className="emp-kanban__page-btn"
                disabled={paginaAtual >= totalPaginas}
                onClick={() => setPagina((p) => Math.min(totalPaginas, p + 1))}
              >
                Próxima
              </button>
            </nav>
          ) : null}
        </div>

        <div ref={mapWrapRef} className="emp-kanban__map-wrap">
          <div ref={mapEl} className="emp-kanban__map" />
          <p className="emp-kanban__map-hint">
            Clique em “localizar no mapa” no card para centralizar a empresa.
          </p>
        </div>
      </div>
    </div>
  )
}

function PhoneIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M6 3h4l1 5-2.5 1.5a12 12 0 0 0 6 6L16 13l5 1v4a2 2 0 0 1-2 2A16 16 0 0 1 4 5a2 2 0 0 1 2-2z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function WhatsIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" aria-hidden>
      <path
        fill="#25D366"
        d="M12.04 2C6.58 2 2.15 6.4 2.15 11.84c0 1.97.52 3.89 1.5 5.58L2 22l4.74-1.56a10 10 0 0 0 5.3 1.44h.01c5.46 0 9.89-4.4 9.89-9.84C21.94 6.4 17.5 2 12.04 2z"
      />
      <path
        fill="#fff"
        d="M17.47 14.38c-.27-.14-1.6-.79-1.85-.88-.25-.09-.43-.14-.61.14-.18.27-.7.88-.86 1.06-.16.18-.32.2-.59.07-.27-.14-1.14-.42-2.17-1.34-.8-.71-1.34-1.59-1.5-1.86-.16-.27-.02-.42.12-.55.12-.12.27-.32.41-.48.14-.16.18-.27.27-.45.09-.18.05-.34-.02-.48-.07-.14-.61-1.47-.84-2.01-.22-.53-.45-.46-.61-.47h-.52c-.18 0-.48.07-.73.34-.25.27-.96.94-.96 2.29s.98 2.65 1.12 2.83c.14.18 1.93 2.95 4.68 4.14.65.28 1.16.45 1.56.57.66.21 1.25.18 1.72.11.53-.08 1.6-.65 1.83-1.28.22-.63.22-1.17.16-1.28-.07-.11-.25-.18-.52-.32z"
      />
    </svg>
  )
}

function MailIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
      <rect x="3" y="5" width="18" height="14" rx="2" stroke="currentColor" strokeWidth="1.8" />
      <path d="m4 7 8 6 8-6" stroke="currentColor" strokeWidth="1.8" />
    </svg>
  )
}
