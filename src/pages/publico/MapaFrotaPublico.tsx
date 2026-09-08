import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { useData } from '../../context/DataContext'
import { LOGO_DOCA_LIVRE_SRC } from '../../lib/brandAssets'
import { geocodificarConsulta } from '../../lib/geocodeEndereco'
import {
  agruparPontosPorCoord,
  distanciaKm,
  frotaIconeHtml,
  LEGENDA_FROTA,
  montarPontosFrota,
  type FrotaIconeGrupo,
  type PontoFrota,
} from '../../lib/mapaFrota'
import {
  estadoBuscasPublicas,
  MAPA_PUBLICO_LIMITE_BUSCAS,
  registrarBuscaPublica,
} from '../../lib/mapaPublicoBuscas'
import '../../styles/mapa-frota.css'
import '../../styles/mapa-publico.css'

function escapeHtml(s: string) {
  return s
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

function labelTipo(p: PontoFrota): string {
  return LEGENDA_FROTA.find((x) => x.grupo === p.icone)?.label || p.tipoVeiculo || 'Veículo'
}

function markerPublicoHtml(p: PontoFrota, qtd = 1): string {
  const tipo = labelTipo(p)
  const badge =
    qtd > 1 ? `<span class="frota-bubble__badge" aria-label="${qtd} veículos">${qtd}</span>` : ''
  return `
    <div class="frota-bubble frota-bubble--ok" title="${escapeHtml(tipo)} em ${escapeHtml(p.cidade || 'Brasil')}">
      ${frotaIconeHtml(p.icone, 'frota-bubble__icon')}
      <span class="frota-bubble__price">${escapeHtml(tipo)}</span>
      ${badge}
    </div>
  `
}

function popupPublicoHtml(p: PontoFrota, qtd: number): string {
  const local = [p.cidade, p.uf].filter(Boolean).join(' / ') || 'Brasil'
  const extra = qtd > 1 ? ` · ${qtd} veículos neste ponto` : ''
  return `
    <div class="mapa-pub-popup">
      <p class="mapa-pub-popup__tipo">${escapeHtml(labelTipo(p))}</p>
      <p class="mapa-pub-popup__local">${escapeHtml(local)}${escapeHtml(extra)}</p>
      <p class="mapa-pub-popup__status">Disponível para carregar</p>
      <p class="mapa-pub-popup__lock">Contato, placa e WhatsApp só para assinante.</p>
      <a class="mapa-pub-popup__cta" href="#/login">Assinar para ver contato</a>
    </div>
  `
}

export function MapaFrotaPublicoPage() {
  const { motoristas, veiculos, transportadores, cargas, refreshTransportadores, user } =
    useData()
  const mapEl = useRef<HTMLDivElement>(null)
  const mapRef = useRef<L.Map | null>(null)
  const layerRef = useRef<L.LayerGroup | null>(null)

  const [busca, setBusca] = useState('')
  const [tipos, setTipos] = useState<FrotaIconeGrupo[]>([])
  const [origem, setOrigem] = useState<{ lat: number; lng: number; label: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const [erro, setErro] = useState('')
  const [restam, setRestam] = useState(() =>
    user ? MAPA_PUBLICO_LIMITE_BUSCAS : estadoBuscasPublicas().restam,
  )
  const [showPaywall, setShowPaywall] = useState(
    () => !user && estadoBuscasPublicas().esgotado,
  )

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', 'light')
    document.title = 'Mapa da frota — Doca Livre Oferta de Carga'
    void refreshTransportadores()
  }, [refreshTransportadores])

  const pontos = useMemo(
    () =>
      montarPontosFrota(motoristas, veiculos, transportadores, cargas).filter((p) => p.disponivel),
    [motoristas, veiculos, transportadores, cargas],
  )

  const filtrados = useMemo(() => {
    return pontos.filter((p) => {
      if (tipos.length > 0 && !tipos.includes(p.icone)) return false
      if (origem) {
        if (distanciaKm(origem.lat, origem.lng, p.lat, p.lng) > 150) return false
      }
      return true
    })
  }, [pontos, tipos, origem])

  const contagem = useMemo(() => {
    const map = new Map<string, number>()
    for (const item of LEGENDA_FROTA) map.set(item.grupo, 0)
    for (const p of origem ? filtrados : pontos) {
      map.set(p.icone, (map.get(p.icone) ?? 0) + 1)
    }
    return LEGENDA_FROTA.map((item) => ({ ...item, qtd: map.get(item.grupo) ?? 0 })).filter(
      (x) => x.qtd > 0,
    )
  }, [pontos, filtrados, origem])

  useEffect(() => {
    if (!mapEl.current || mapRef.current) return
    const map = L.map(mapEl.current, {
      center: [-14.2, -51.9],
      zoom: 4,
      zoomControl: true,
    })
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap',
      maxZoom: 18,
    }).addTo(map)
    layerRef.current = L.layerGroup().addTo(map)
    mapRef.current = map
    const t = window.setTimeout(() => map.invalidateSize(), 80)
    return () => {
      window.clearTimeout(t)
      map.remove()
      mapRef.current = null
      layerRef.current = null
    }
  }, [])

  useEffect(() => {
    const map = mapRef.current
    const layer = layerRef.current
    if (!map || !layer) return
    layer.clearLayers()
    const grupos = agruparPontosPorCoord(filtrados)
    const bounds: L.LatLngExpression[] = []
    for (const grupo of grupos.values()) {
      const p = grupo[0]
      const qtd = grupo.length
      const m = L.marker([p.lat, p.lng], {
        icon: L.divIcon({
          className: 'frota-pin-wrap',
          html: markerPublicoHtml(p, qtd),
          iconSize: [120, 52],
          iconAnchor: [60, 52],
        }),
        title: `${labelTipo(p)} · ${p.cidade || ''}`,
      })
      m.bindPopup(popupPublicoHtml(p, qtd), {
        className: 'frota-leaflet-popup mapa-pub-leaflet',
        maxWidth: 280,
        minWidth: 220,
      })
      m.addTo(layer)
      bounds.push([p.lat, p.lng])
    }
    if (origem && bounds.length > 0) {
      map.fitBounds(L.latLngBounds(bounds).pad(0.18), { maxZoom: 11 })
    } else if (!origem) {
      map.setView([-14.2, -51.9], 4)
    }
  }, [filtrados, origem])

  function toggleTipo(grupo: FrotaIconeGrupo) {
    setTipos((prev) => (prev.length === 1 && prev[0] === grupo ? [] : [grupo]))
  }

  async function buscar() {
    const q = busca.trim()
    if (!q) {
      setErro('Digite uma cidade, UF ou endereço.')
      return
    }
    if (!user && estadoBuscasPublicas().esgotado) {
      setShowPaywall(true)
      setRestam(0)
      return
    }
    setBusy(true)
    setErro('')
    const res = await geocodificarConsulta(q)
    setBusy(false)
    if (!res.ok) {
      setErro(res.erro || 'Não achei esse lugar. Tente a cidade e a UF.')
      return
    }
    if (!user) {
      const consumo = registrarBuscaPublica()
      setRestam(consumo.restam)
      if (!consumo.ok) {
        setShowPaywall(true)
        return
      }
      if (consumo.restam === 0) {
        window.setTimeout(() => setShowPaywall(true), 900)
      }
    }
    setOrigem({ lat: res.coords.lat, lng: res.coords.lng, label: res.display || q })
  }

  const logado = Boolean(user)

  return (
    <div className="mapa-pub">
      <header className="mapa-pub__top">
        <Link to="/mapa" className="mapa-pub__brand">
          <img src={LOGO_DOCA_LIVRE_SRC} alt="Doca Livre" />
          <span>
            <strong>Doca Livre</strong>
            <em>Oferta de carga</em>
          </span>
        </Link>
        <div className="mapa-pub__top-actions">
          {logado ? (
            <Link
              className="mapa-pub__btn mapa-pub__btn--ghost"
              to={user?.role === 'transportador' ? '/transportador' : '/embarcador/mapa-frota'}
            >
              Ir para o sistema
            </Link>
          ) : (
            <>
              <Link className="mapa-pub__btn mapa-pub__btn--ghost" to="/login">
                Entrar
              </Link>
              <Link className="mapa-pub__btn mapa-pub__btn--solid" to="/cadastro-transportador">
                Cadastrar
              </Link>
            </>
          )}
        </div>
      </header>

      <div className="mapa-pub__bar">
        <form
          className="mapa-pub__search"
          onSubmit={(e) => {
            e.preventDefault()
            void buscar()
          }}
        >
          <input
            value={busca}
            onChange={(e) => {
              setBusca(e.target.value)
              setErro('')
            }}
            placeholder="Buscar cidade, UF ou endereço — ex.: Guarulhos SP"
            aria-label="Buscar cidade"
          />
          <button type="submit" disabled={busy}>
            {busy ? 'Buscando…' : 'Buscar'}
          </button>
        </form>
        <p className="mapa-pub__creditos">
          {user
            ? 'Conta logada · buscas ilimitadas neste mapa'
            : restam > 0
              ? `${restam} de ${MAPA_PUBLICO_LIMITE_BUSCAS} buscas grátis restantes`
              : 'Buscas grátis esgotadas'}
        </p>
        {erro ? <p className="mapa-pub__erro">{erro}</p> : null}
        {origem ? (
          <p className="mapa-pub__origem">
            Mostrando frota em até 150 km de <strong>{origem.label}</strong>
            {' · '}
            <button
              type="button"
              onClick={() => {
                setOrigem(null)
                setBusca('')
              }}
            >
              Ver Brasil inteiro
            </button>
          </p>
        ) : (
          <p className="mapa-pub__origem">
            Visão geral do Brasil. Busque uma cidade para aproximar (conta como 1 busca).
          </p>
        )}
      </div>

      <div className="mapa-pub__chips" role="list">
        {contagem.map((item) => (
          <button
            key={item.grupo}
            type="button"
            role="listitem"
            className={`mapa-pub__chip${tipos[0] === item.grupo ? ' is-on' : ''}`}
            onClick={() => toggleTipo(item.grupo)}
          >
            {item.label} <span>{item.qtd}</span>
          </button>
        ))}
      </div>

      <div ref={mapEl} className="mapa-pub__map" role="application" aria-label="Mapa público da frota" />

      <p className="mapa-pub__foot">
        {filtrados.length} veículo{filtrados.length === 1 ? '' : 's'} visível
        {filtrados.length === 1 ? '' : 'is'} · contato só depois da assinatura
      </p>

      {showPaywall ? (
        <div className="mapa-pub-modal" role="dialog" aria-modal="true" aria-labelledby="mapa-pub-pay-title">
          <div className="mapa-pub-modal__card">
            <h2 id="mapa-pub-pay-title">Assine para continuar buscando</h2>
            <p>
              Você usou as {MAPA_PUBLICO_LIMITE_BUSCAS} buscas grátis. Com a assinatura o mapa fica
              ilimitado, você vê WhatsApp e placa e entra no sistema Doca Livre Oferta de Carga.
            </p>
            <div className="mapa-pub-modal__acoes">
              <Link className="mapa-pub__btn mapa-pub__btn--solid" to="/cadastro-transportador">
                Quero assinar
              </Link>
              <Link className="mapa-pub__btn mapa-pub__btn--ghost" to="/login">
                Já tenho conta
              </Link>
            </div>
            <button type="button" className="mapa-pub-modal__fechar" onClick={() => setShowPaywall(false)}>
              Continuar só olhando o mapa
            </button>
          </div>
        </div>
      ) : null}
    </div>
  )
}
