import { useEffect, useMemo, useRef, useState } from 'react'
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

export function TransportadorasKanbanView({
  transportadores,
  veiculosPorTransportador,
  motoristasPorTransportador,
  tituloCidade,
}: Props) {
  const mapEl = useRef<HTMLDivElement>(null)
  const mapRef = useRef<L.Map | null>(null)
  const markersRef = useRef<Map<string, L.Marker>>(new Map())
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
      center: [-23.55, -46.63],
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
      let m = markersRef.current.get(t.id)
      if (!m) {
        m = L.marker([c.lat, c.lng], {
          title: t.nome_fantasia,
        })
        m.bindPopup(`<strong>${t.nome_fantasia}</strong><br/>${t.cidade}/${t.uf}`)
        m.on('click', () => setSelecionadoId(t.id))
        m.addTo(map)
        markersRef.current.set(t.id, m)
      } else {
        m.setLatLng([c.lat, c.lng])
      }
    }

    if (!selecionadoId) {
      if (bounds.length === 1) map.setView(bounds[0], 10)
      else if (bounds.length > 1) {
        map.fitBounds(L.latLngBounds(bounds), { padding: [36, 36], maxZoom: 11 })
      }
    }

    window.setTimeout(() => map.invalidateSize(), 60)
  }, [comCoords, selecionadoId])

  useEffect(() => {
    if (!selecionadoId) return
    const map = mapRef.current
    const m = markersRef.current.get(selecionadoId)
    if (!map || !m) return
    map.setView(m.getLatLng(), Math.max(map.getZoom(), 12), { animate: true })
    m.openPopup()
  }, [selecionadoId])

  function flash(text: string) {
    setMsg(text)
    window.setTimeout(() => setMsg(''), 2500)
  }

  function onAdicionarCotacao(t: Transportador) {
    const next = toggleCotacaoId(t.id)
    setCotacaoIds(next)
    flash(
      next.includes(t.id)
        ? `${t.nome_fantasia} adicionada à cotação.`
        : `${t.nome_fantasia} removida da cotação.`,
    )
  }

  function onLocalizar(t: Transportador) {
    const c = coordsDe(t)
    if (!c) {
      flash('Esta transportadora ainda não tem coordenadas de origem no mapa.')
      return
    }
    setSelecionadoId(t.id)
    const map = mapRef.current
    const m = markersRef.current.get(t.id)
    if (map && m) {
      map.setView([c.lat, c.lng], 12, { animate: true })
      m.openPopup()
    }
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
          onClick={() =>
            flash(
              cotacaoIds.length
                ? `${cotacaoIds.length} transportadora(s) na cotação.`
                : 'Nenhuma transportadora na cotação ainda.',
            )
          }
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
                    <button
                      type="button"
                      className="transp-card__mais"
                      onClick={() => setPerfilId(t.id)}
                    >
                      + Ver mais informações
                    </button>
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

        <div className="transp-kanban__map-wrap">
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
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M12 3a8 8 0 0 0-6.9 12.1L4 21l6.1-1.1A8 8 0 1 0 12 3z"
        stroke="#16a34a"
        strokeWidth="1.8"
      />
      <path
        d="M9.5 9.5c.5 2 2.5 4 4.5 4.5l1.2-1.2c.2-.2.5-.2.7 0l1.4 1.1c.2.2.2.5 0 .7l-.8.9c-.3.3-.7.4-1.1.3-2.4-.5-5.4-3.3-6.2-6.2-.1-.4 0-.8.3-1.1l.9-.8c.2-.2.5-.2.7 0L11 9c.2.2.2.5 0 .7L9.5 9.5z"
        fill="#16a34a"
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
