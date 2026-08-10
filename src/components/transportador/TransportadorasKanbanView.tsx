import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { Briefcase, MapPin, Plus, ShoppingCart } from 'lucide-react'
import type { Transportador } from '../../types'
import { formatPhoneBr } from '../../lib/phoneBr'
import {
  loadCotacaoIds,
  toggleCotacaoId,
} from '../../lib/cotacaoTransportadores'
import { TransportadorPerfilSite } from './TransportadorPerfilSite'
import '../../styles/transportadoras-kanban.css'

type Props = {
  transportadores: Transportador[]
  veiculosPorTransportador: Record<string, number>
  motoristasPorTransportador: Record<string, number>
  tituloCidade?: string
}

function iniciais(nome: string) {
  return nome
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('')
}

function whatsappLink(raw?: string | null) {
  const d = (raw || '').replace(/\D/g, '')
  if (d.length < 10) return null
  const full = d.startsWith('55') ? d : `55${d}`
  return `https://wa.me/${full}`
}

function coordsDe(t: Transportador): { lat: number; lng: number } | null {
  const lat = t.origem_lat
  const lng = t.origem_lng
  if (lat == null || lng == null || !Number.isFinite(lat) || !Number.isFinite(lng)) return null
  return { lat, lng }
}

function escapeHtml(s: string) {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function localLabel(t: Transportador) {
  const cidade = (t.origem_cidade || t.cidade || '').trim()
  const uf = (t.origem_uf || t.uf || '').trim().toUpperCase()
  if (cidade && uf) return `${cidade}/${uf}`
  return cidade || uf || 'Sem cidade'
}

/** Pin customizado — o ícone padrão do Leaflet quebra no Vite (aparece "Marker"). */
function pinIcon(ativo: boolean) {
  return L.divIcon({
    className: 'transp-kanban-pin',
    html: `<span class="transp-kanban-pin__mark${ativo ? ' is-on' : ''}" aria-hidden="true"></span>`,
    iconSize: [28, 36],
    iconAnchor: [14, 34],
    popupAnchor: [0, -30],
  })
}

function popupHtml(t: Transportador) {
  const nome = escapeHtml(t.nome_fantasia || t.razao_social)
  const local = escapeHtml(localLabel(t))
  const raio = Number(t.raio_km) > 0 ? `${Number(t.raio_km)} km de raio` : ''
  return `<div class="transp-kanban-popup">
    <strong>${nome}</strong>
    <span>${local}</span>
    ${raio ? `<em>${escapeHtml(raio)}</em>` : ''}
  </div>`
}

export function TransportadorasKanbanView({
  transportadores,
  veiculosPorTransportador,
  motoristasPorTransportador,
  tituloCidade,
}: Props) {
  const navigate = useNavigate()
  const mapEl = useRef<HTMLDivElement>(null)
  const mapWrapRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<L.Map | null>(null)
  const markersRef = useRef<Map<string, L.Marker>>(new Map())
  const raioRef = useRef<L.Circle | null>(null)
  const [selecionadoId, setSelecionadoId] = useState<string | null>(null)
  const [perfilId, setPerfilId] = useState<string | null>(null)
  const [cotacaoIds, setCotacaoIds] = useState<string[]>(() => loadCotacaoIds())
  const [msg, setMsg] = useState('')

  const comCoords = useMemo(
    () => transportadores.filter((t) => coordsDe(t)),
    [transportadores],
  )

  const perfil = useMemo(
    () => (perfilId ? transportadores.find((t) => t.id === perfilId) ?? null : null),
    [perfilId, transportadores],
  )

  const titulo =
    tituloCidade?.trim() ||
    (transportadores[0]
      ? `Transportadoras em ${transportadores[0].origem_cidade || transportadores[0].cidade || 'Brasil'}`
      : 'Transportadoras')

  useEffect(() => {
    if (!mapEl.current || mapRef.current) return
    const map = L.map(mapEl.current, {
      center: [-22.9, -47.06],
      zoom: 6,
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
      if (raioRef.current) {
        map.removeLayer(raioRef.current)
        raioRef.current = null
      }
      map.remove()
      mapRef.current = null
      markersRef.current.clear()
    }
  }, [])

  useEffect(() => {
    const el = mapWrapRef.current
    const map = mapRef.current
    if (!el || !map || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(() => {
      map.invalidateSize({ animate: false })
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  useEffect(() => {
    const map = mapRef.current
    if (!map) return

    const keep = new Set(comCoords.map((t) => t.id))
    for (const [id, m] of markersRef.current) {
      if (!keep.has(id)) {
        map.removeLayer(m)
        markersRef.current.delete(id)
      }
    }

    const bounds: L.LatLngExpression[] = []
    for (const t of comCoords) {
      const c = coordsDe(t)!
      bounds.push([c.lat, c.lng])
      const ativo = selecionadoId === t.id
      let m = markersRef.current.get(t.id)
      if (!m) {
        m = L.marker([c.lat, c.lng], {
          icon: pinIcon(ativo),
          title: t.nome_fantasia || t.razao_social,
          riseOnHover: true,
        })
        m.bindPopup(popupHtml(t), { className: 'transp-kanban-leaflet-popup' })
        m.on('click', () => setSelecionadoId(t.id))
        m.addTo(map)
        markersRef.current.set(t.id, m)
      } else {
        m.setLatLng([c.lat, c.lng])
        m.setIcon(pinIcon(ativo))
        m.setPopupContent(popupHtml(t))
      }
    }

    if (raioRef.current) {
      map.removeLayer(raioRef.current)
      raioRef.current = null
    }
    if (selecionadoId) {
      const sel = comCoords.find((t) => t.id === selecionadoId)
      const c = sel ? coordsDe(sel) : null
      if (sel && c) {
        const raioKm = Number(sel.raio_km) || 0
        if (raioKm > 0) {
          raioRef.current = L.circle([c.lat, c.lng], {
            radius: raioKm * 1000,
            color: '#2563eb',
            weight: 2,
            fillColor: '#3b82f6',
            fillOpacity: 0.12,
          }).addTo(map)
        }
      }
    }

    if (!selecionadoId) {
      if (bounds.length === 1) map.setView(bounds[0], 11)
      else if (bounds.length > 1) {
        map.fitBounds(L.latLngBounds(bounds), { padding: [40, 40], maxZoom: 11 })
      }
    }

    window.setTimeout(() => map.invalidateSize(), 60)
  }, [comCoords, selecionadoId])

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

  function flash(text: string) {
    setMsg(text)
    window.setTimeout(() => setMsg(''), 2500)
  }

  function abrirNovaCargaDireta(transportadorIds: string[]) {
    const ids = [...new Set(transportadorIds.filter(Boolean))]
    if (ids.length === 0) return
    navigate('/embarcador', {
      state: {
        novaCarga: true,
        prefillPublicacao: {
          modo: 'negociacao_direta' as const,
          transportadorIds: ids,
        },
      },
    })
  }

  function onAdicionarCotacao(t: Transportador) {
    const jaTinha = cotacaoIds.includes(t.id)
    const next = toggleCotacaoId(t.id)
    setCotacaoIds(next)
    if (!jaTinha && next.includes(t.id)) {
      // Abre Nova carga já em Negociação Direta com esta transportadora
      abrirNovaCargaDireta([t.id])
      return
    }
    flash(`${t.nome_fantasia || t.razao_social} removida da cotação.`)
  }

  function onSolicitarCotacao() {
    if (cotacaoIds.length === 0) {
      flash('Adicione ao menos uma transportadora na cotação.')
      return
    }
    abrirNovaCargaDireta(cotacaoIds)
  }

  function onLocalizar(t: Transportador) {
    const c = coordsDe(t)
    if (!c) {
      flash('Esta transportadora ainda não tem coordenadas de origem no mapa.')
      return
    }
    setSelecionadoId(t.id)
  }

  return (
    <div className="transp-kanban">
      <div className="transp-kanban__bar">
        <div>
          <h2>{titulo}</h2>
          <p>
            Exibindo {transportadores.length} resultado
            {transportadores.length === 1 ? '' : 's'}
            {comCoords.length < transportadores.length
              ? ` · ${comCoords.length} com localização no mapa`
              : ''}
          </p>
        </div>
        <button
          type="button"
          className="transp-kanban__cotacao-btn"
          onClick={onSolicitarCotacao}
          title="Abrir Nova carga em Negociação Direta com as selecionadas"
        >
          <ShoppingCart size={16} />
          Solicitar Cotação
          <span className="transp-kanban__badge">{cotacaoIds.length}</span>
        </button>
      </div>

      {msg ? <p className="transp-kanban__meta">{msg}</p> : null}

      <div className="transp-kanban__layout">
        <div className="transp-kanban__lista">
          {transportadores.length === 0 ? (
            <p className="transp-kanban__meta">Nenhuma transportadora encontrada.</p>
          ) : (
            transportadores.map((t) => {
              const tel = t.contato_telefone || t.telefone
              const wa = whatsappLink(tel)
              const naCotacao = cotacaoIds.includes(t.id)
              const cidade = (t.origem_cidade || t.cidade || '').trim()
              const uf = (t.origem_uf || t.uf || '').trim().toUpperCase()
              const cidadeUf = [cidade, uf].filter(Boolean).join(' / ')
              return (
                <article
                  key={t.id}
                  className={`transp-card${selecionadoId === t.id ? ' is-on' : ''}`}
                >
                  <div className="transp-card__logo">
                    {t.logo_url ? (
                      <img src={t.logo_url} alt="" />
                    ) : (
                      <span>{iniciais(t.nome_fantasia || t.razao_social)}</span>
                    )}
                  </div>
                  <div className="transp-card__info">
                    <h3 className="transp-card__nome">{t.nome_fantasia || t.razao_social}</h3>
                    {tel ? (
                      <p className="transp-card__contato">
                        <PhoneIcon />
                        {formatPhoneBr(tel)}
                      </p>
                    ) : null}
                    {wa ? (
                      <p className="transp-card__contato">
                        <WhatsIcon />
                        <a href={wa} target="_blank" rel="noreferrer">
                          {formatPhoneBr(tel || '')}
                        </a>
                      </p>
                    ) : null}
                    {t.email ? (
                      <p className="transp-card__contato">
                        <MailIcon />
                        <a href={`mailto:${t.email}`}>{t.email}</a>
                      </p>
                    ) : null}
                    {cidadeUf ? (
                      <p className="transp-card__mais transp-card__mais--local">
                        <MapPin size={13} aria-hidden />
                        {cidadeUf}
                      </p>
                    ) : (
                      <p className="transp-card__mais transp-card__mais--local is-empty">
                        Cidade / UF não informados
                      </p>
                    )}
                  </div>
                  <div className="transp-card__acoes">
                    <button
                      type="button"
                      className={`transp-card__acao transp-card__acao--primary${naCotacao ? ' is-on' : ''}`}
                      onClick={() => onAdicionarCotacao(t)}
                    >
                      <Plus size={14} />
                      {naCotacao ? 'na cotação' : 'adicionar na cotação'}
                    </button>
                    <button
                      type="button"
                      className="transp-card__acao"
                      onClick={() => onLocalizar(t)}
                    >
                      <MapPin size={14} color="#dc2626" />
                      localizar no mapa
                    </button>
                    <button
                      type="button"
                      className="transp-card__acao"
                      onClick={() => setPerfilId(t.id)}
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

        <div ref={mapWrapRef} className="transp-kanban__map-wrap">
          <div ref={mapEl} className="transp-kanban__map" />
          <p className="transp-kanban__map-hint">
            Clique em “localizar no mapa” no card para centralizar a transportadora.
          </p>
        </div>
      </div>

      {perfil ? (
        <TransportadorPerfilSite
          transportador={perfil}
          veiculosCount={veiculosPorTransportador[perfil.id] ?? 0}
          motoristasCount={motoristasPorTransportador[perfil.id] ?? 0}
          onClose={() => setPerfilId(null)}
          onLocalizar={() => {
            setPerfilId(null)
            onLocalizar(perfil)
          }}
        />
      ) : null}
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
