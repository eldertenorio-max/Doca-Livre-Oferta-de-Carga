import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { useData } from '../../context/DataContext'
import { AddressSuggestInput } from '../../components/ui/AddressSuggestInput'
import { LOGO_DOCA_LIVRE_SRC } from '../../lib/brandAssets'
import { geocodificarConsulta, type SugestaoEndereco } from '../../lib/geocodeEndereco'
import { sugerirCidadesComCoords } from '../../lib/municipiosSedes'
import { UF_CENTRO, UFS_BR } from '../../lib/mapaLogisticaIntel'
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

const LINK_MAPA_LOGISTICA =
  'https://doca-livre-mapa-da-log-stica.onrender.com/?_v=mapa-publico-planos-v1#/mapa'

const PLANOS_PUBLICOS = [
  {
    id: 'motorista',
    nome: 'Motorista',
    preco: 'R$ 49',
    periodo: '/mês',
    extra: 'ou R$ 14,90 /semana',
    para: 'Caminhoneiro e transportador',
    itens: ['Mapa ilimitado', 'Ver ofertas de carga', 'Perfil no sistema'],
    destaque: false,
  },
  {
    id: 'start',
    nome: 'Embarcador Start',
    preco: 'R$ 197',
    periodo: '/mês',
    extra: '2 usuários',
    para: 'Empresa pequena',
    itens: ['Publicar cargas', 'Mapa ilimitado', 'WhatsApp e placa da frota'],
    destaque: true,
  },
  {
    id: 'pro',
    nome: 'Embarcador Pro',
    preco: 'R$ 397',
    periodo: '/mês',
    extra: '5 usuários',
    para: 'Operação com time',
    itens: ['Tudo do Start', 'Malha logística', 'Kanban e áreas salvas'],
    destaque: false,
  },
  {
    id: 'empresa',
    nome: 'Empresa',
    preco: 'R$ 890',
    periodo: '/mês',
    extra: 'ou sob consulta',
    para: 'Várias filiais',
    itens: ['10 usuários', 'Usuários extras', 'Prioridade no suporte'],
    destaque: false,
  },
] as const

function popupPublicoHtml(p: PontoFrota, qtd: number): string {
  const local = [p.cidade, p.uf].filter(Boolean).join(' / ') || 'Brasil'
  const extra = qtd > 1 ? ` · ${qtd} veículos neste ponto` : ''
  return `
    <div class="mapa-pub-popup">
      <p class="mapa-pub-popup__tipo">${escapeHtml(labelTipo(p))}</p>
      <p class="mapa-pub-popup__local">${escapeHtml(local)}${escapeHtml(extra)}</p>
      <p class="mapa-pub-popup__status">Disponível para carregar</p>
      <p class="mapa-pub-popup__lock">Contato, placa e WhatsApp só para assinante.</p>
      <button type="button" class="mapa-pub-popup__cta js-mapa-pub-assinar">Assinar para ver contato</button>
    </div>
  `
}

export function MapaFrotaPublicoPage() {
  const { motoristas, veiculos, transportadores, cargas, refreshTransportadores, user } =
    useData()
  const mapEl = useRef<HTMLDivElement>(null)
  const mapRef = useRef<L.Map | null>(null)
  const layerRef = useRef<L.LayerGroup | null>(null)
  const origemFitRef = useRef('')

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

  useEffect(() => {
    function onAssinar(ev: MouseEvent) {
      const el = ev.target as HTMLElement | null
      if (!el?.closest?.('.js-mapa-pub-assinar')) return
      ev.preventDefault()
      setShowPaywall(true)
    }
    document.addEventListener('click', onAssinar)
    return () => document.removeEventListener('click', onAssinar)
  }, [])

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
    // Só muda o zoom quando a busca muda — redesenhar pins (sync da frota)
    // não pode trazer o mapa de volta pro Brasil.
    const chaveOrigem = origem ? `${origem.lat.toFixed(5)},${origem.lng.toFixed(5)}` : ''
    if (origemFitRef.current === chaveOrigem) return
    origemFitRef.current = chaveOrigem
    if (origem && bounds.length > 0) {
      map.fitBounds(L.latLngBounds(bounds).pad(0.18), { maxZoom: 11 })
    } else if (!origem && chaveOrigem === '') {
      map.setView([-14.2, -51.9], 4)
    }
  }, [filtrados, origem])

  function toggleTipo(grupo: FrotaIconeGrupo) {
    setTipos((prev) => (prev.length === 1 && prev[0] === grupo ? [] : [grupo]))
  }

  const cidadesFrota = useMemo(() => {
    const set = new Set<string>()
    for (const p of pontos) {
      const label = [p.cidade, p.uf].filter(Boolean).join(' — ')
      if (label) set.add(label)
    }
    return Array.from(set)
  }, [pontos])

  function sugestoesLocais(query: string): string[] {
    const q = query.trim().toLowerCase()
    if (q.length < 1) return []
    const out: string[] = []
    const seen = new Set<string>()
    const add = (s: string) => {
      const k = s.toLowerCase()
      if (!s || seen.has(k)) return
      if (!k.includes(q)) return
      seen.add(k)
      out.push(s)
    }
    for (const c of sugerirCidadesComCoords(query, 8)) add(c.label)
    for (const label of cidadesFrota) add(label)
    for (const uf of UFS_BR) {
      const nome = UF_CENTRO[uf].nome
      if (uf.toLowerCase().includes(q) || nome.toLowerCase().includes(q)) {
        add(`${nome} — ${uf}`)
      }
    }
    return out.slice(0, 10)
  }

  async function aplicarBusca(
    texto: string,
    coords?: { lat: number; lng: number; label: string },
  ) {
    const q = texto.trim()
    if (!q) {
      setErro('Digite uma cidade, UF ou endereço.')
      return
    }
    if (!user && estadoBuscasPublicas().esgotado) {
      setShowPaywall(true)
      setRestam(0)
      return
    }
    let lat = coords?.lat
    let lng = coords?.lng
    let label = coords?.label || q
    if (lat == null || lng == null) {
      setBusy(true)
      setErro('')
      const res = await geocodificarConsulta(q)
      setBusy(false)
      if (!res.ok) {
        setErro(res.erro || 'Não achei esse lugar. Tente a cidade e a UF.')
        return
      }
      lat = res.coords.lat
      lng = res.coords.lng
      label = res.display || q
    }
    if (!user) {
      const consumo = registrarBuscaPublica()
      setRestam(consumo.restam)
      if (!consumo.ok || consumo.restam === 0) {
        setShowPaywall(true)
        if (!consumo.ok) return
      }
    }
    setErro('')
    setOrigem({ lat, lng, label })
  }

  function escolherSugestao(sug: SugestaoEndereco) {
    void aplicarBusca(sug.label, { lat: sug.lat, lng: sug.lng, label: sug.label })
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
            void aplicarBusca(busca)
          }}
        >
          <AddressSuggestInput
            value={busca}
            onChange={(v) => {
              setBusca(v)
              setErro('')
            }}
            onPick={escolherSugestao}
            localSuggestions={sugestoesLocais}
            minChars={2}
            placeholder="Buscar cidade, UF ou endereço — ex.: Guarulhos SP"
            className="mapa-pub__q"
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
        {!user && restam === 0 ? (
          <div className="mapa-pub__cta-esgotado">
            <span>Para continuar buscando e ver contato da frota, assine o Doca Livre.</span>
            <button type="button" onClick={() => setShowPaywall(true)}>
              Assinar para continuar
            </button>
          </div>
        ) : null}
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

      <div className="mapa-pub__map-wrap">
        <a
          className="mapa-pub__logistica"
          href={LINK_MAPA_LOGISTICA}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Abrir mapa da logística em nova aba"
        >
          Abrir mapa da logística
        </a>
        <div ref={mapEl} className="mapa-pub__map" role="application" aria-label="Mapa público da frota" />
      </div>

      <p className="mapa-pub__foot">
        {filtrados.length} veículo{filtrados.length === 1 ? '' : 's'} visível
        {filtrados.length === 1 ? '' : 'is'} · contato só depois da assinatura
      </p>

      {showPaywall ? (
        <div className="mapa-pub-modal" role="dialog" aria-modal="true" aria-labelledby="mapa-pub-pay-title">
          <div className="mapa-pub-modal__card mapa-pub-modal__card--planos">
            <h2 id="mapa-pub-pay-title">Escolha um plano</h2>
            <p>
              As {MAPA_PUBLICO_LIMITE_BUSCAS} buscas grátis acabaram. Assine para continuar no mapa
              e entrar no sistema Doca Livre Oferta de Carga.
            </p>
            <div className="mapa-pub-planos">
              {PLANOS_PUBLICOS.map((plano) => (
                <article
                  key={plano.id}
                  className={`mapa-pub-plano${plano.destaque ? ' is-destaque' : ''}`}
                >
                  {plano.destaque ? <span className="mapa-pub-plano__tag">Mais escolhido</span> : null}
                  <h3>{plano.nome}</h3>
                  <p className="mapa-pub-plano__para">{plano.para}</p>
                  <p className="mapa-pub-plano__preco">
                    <strong>{plano.preco}</strong>
                    <small>{plano.periodo}</small>
                  </p>
                  <p className="mapa-pub-plano__extra">{plano.extra}</p>
                  <ul>
                    {plano.itens.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                  <Link
                    className="mapa-pub__btn mapa-pub__btn--solid"
                    to={`/cadastro-transportador?plano=${plano.id}`}
                  >
                    Assinar {plano.nome}
                  </Link>
                </article>
              ))}
            </div>
            <div className="mapa-pub-modal__acoes">
              <Link className="mapa-pub__btn mapa-pub__btn--ghost" to="/login">
                Já tenho conta
              </Link>
              <button type="button" className="mapa-pub-modal__fechar" onClick={() => setShowPaywall(false)}>
                Continuar só olhando o mapa
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
