import { useEffect, useMemo, useRef, useState } from 'react'
import L from 'leaflet'
import { MapPin, Search, Users } from 'lucide-react'
import { useData } from '../../context/DataContext'
import {
  acharMunicipio,
  buscarMunicipiosCatalogo,
  carregarCatalogoMunicipios,
  carregarMalhaMunicipios,
  carregarMalhaUfs,
  type GeoProps,
  type MunicipioCat,
} from '../../lib/geoBrasil'
import {
  getArea,
  hydrateAreaDb,
  ownerEmbarcadorId,
  saveAreaDb,
  setArea,
  toggleCidade,
  type AreaAtendimentoDB,
  type CidadeAtendida,
  type ModoMarcacaoArea,
} from '../../lib/areaAtendimento'
import {
  hydrateOrgTree,
  listarEmbarcadores,
  loadOrgTree,
  type OrgNo,
} from '../../lib/orgHierarchy'
import { isLocalSuperUser } from '../../lib/superUsers'
import type { UfBr } from '../../lib/mapaLogisticaIntel'
import type { Transportador } from '../../types'

type Feat = GeoJSON.Feature<GeoJSON.Geometry, GeoProps>

function escapeHtml(s: string) {
  return s
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

function isDiegoElder(user: { usuario?: string | null; email?: string | null } | null) {
  if (!user) return false
  return isLocalSuperUser(user.usuario ?? '') || isLocalSuperUser(user.email ?? '')
}

function styleUf(ativa: boolean): L.PathOptions {
  return {
    color: ativa ? '#0e7490' : '#64748b',
    weight: ativa ? 2 : 1,
    fillColor: ativa ? '#22d3ee' : '#cbd5e1',
    fillOpacity: ativa ? 0.35 : 0.18,
  }
}

function styleMun(selecionada: boolean): L.PathOptions {
  return {
    color: selecionada ? '#b45309' : '#64748b',
    weight: selecionada ? 2 : 0.6,
    fillColor: selecionada ? '#f59e0b' : '#e2e8f0',
    fillOpacity: selecionada ? 0.55 : 0.12,
  }
}

export function AreaAtendimentoView() {
  const { user, transportadores } = useData()
  const mapEl = useRef<HTMLDivElement>(null)
  const mapRef = useRef<L.Map | null>(null)
  const ufsLayerRef = useRef<L.GeoJSON | null>(null)
  const munLayerRef = useRef<L.GeoJSON | null>(null)
  const labelsRef = useRef<L.LayerGroup | null>(null)
  const saveTimer = useRef<number | null>(null)
  const idsRef = useRef<Set<string>>(new Set())
  const modoRef = useRef<ModoMarcacaoArea | null>(null)
  const ownerIdRef = useRef('')
  const abrirUfRef = useRef<(uf: UfBr) => Promise<void>>(async () => {})

  const [tree, setTree] = useState<OrgNo[]>(() => loadOrgTree())
  const [db, setDb] = useState<AreaAtendimentoDB>(() => ({ areas: {} }))
  const [modo, setModo] = useState<ModoMarcacaoArea | null>(null)
  const [ufAtiva, setUfAtiva] = useState<UfBr | null>(null)
  const [carregando, setCarregando] = useState('Carregando mapa do Brasil…')
  const [erro, setErro] = useState('')
  const [busca, setBusca] = useState('')
  const [catalogo, setCatalogo] = useState<MunicipioCat[]>([])
  const [mostrarTudo, setMostrarTudo] = useState(false)
  const [ownerId, setOwnerId] = useState('')

  const superView = isDiegoElder(user)
  const embarcadores = useMemo(() => listarEmbarcadores(tree), [tree])

  useEffect(() => {
    const id = ownerEmbarcadorId({
      empresaOrgId: user?.empresa_org_id,
      embarcadores,
    })
    setOwnerId(id)
  }, [user?.empresa_org_id, embarcadores])

  const area = useMemo(
    () => (ownerId ? getArea(db, 'embarcador', ownerId) : getArea(db, 'embarcador', 'x')),
    [db, ownerId],
  )
  const selecionadas = area.cidades
  const idsSel = useMemo(() => new Set(selecionadas.map((c) => c.id)), [selecionadas])
  idsRef.current = idsSel

  useEffect(() => {
    if (area.cidades.length > 0) setModo('cidade')
  }, [ownerId, area.cidades.length])

  const sugestoes = useMemo(
    () => buscarMunicipiosCatalogo(catalogo, busca, 10),
    [catalogo, busca],
  )

  function persist(nextDb: AreaAtendimentoDB) {
    setDb(nextDb)
    if (saveTimer.current) window.clearTimeout(saveTimer.current)
    saveTimer.current = window.setTimeout(() => saveAreaDb(nextDb), 400)
  }

  function aplicarCidades(cidades: CidadeAtendida[]) {
    if (!ownerId) return
    persist(setArea(db, { ...area, ownerId, ownerKind: 'embarcador', modo: 'cidade', cidades }))
  }

  useEffect(() => {
    void hydrateOrgTree().then(setTree)
    void hydrateAreaDb().then(setDb)
    void carregarCatalogoMunicipios()
      .then(setCatalogo)
      .catch(() => setCatalogo([]))
  }, [])

  useEffect(() => {
    if (!mapEl.current || mapRef.current) return
    const map = L.map(mapEl.current, {
      center: [-14.2, -51.9],
      zoom: 4,
      minZoom: 4,
      maxZoom: 12,
      zoomControl: true,
    })
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap',
      maxZoom: 18,
    }).addTo(map)
    labelsRef.current = L.layerGroup().addTo(map)
    mapRef.current = map
    window.setTimeout(() => map.invalidateSize(), 200)

    void (async () => {
      try {
        const fc = await carregarMalhaUfs()
        const layer = L.geoJSON(fc as GeoJSON.GeoJsonObject, {
          style: () => styleUf(false),
          onEachFeature: (feature, lyr) => {
            const p = (feature as Feat).properties
            lyr.bindTooltip(`${p.nome} (${p.uf})`, { sticky: true })
            lyr.on('click', () => {
              if (!modoRef.current) {
                setErro('Escolha “Cidade” antes de marcar no mapa.')
                return
              }
              setErro('')
              void abrirUfRef.current(p.uf)
            })
          },
        }).addTo(map)
        ufsLayerRef.current = layer
        setCarregando('')
      } catch {
        setCarregando('')
        setErro('Não foi possível carregar a malha do Brasil. Verifique a internet.')
      }
    })()

    return () => {
      map.remove()
      mapRef.current = null
      ufsLayerRef.current = null
      munLayerRef.current = null
      labelsRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  modoRef.current = modo
  ownerIdRef.current = ownerId

  async function abrirUf(uf: UfBr) {
    const map = mapRef.current
    if (!map) return
    setUfAtiva(uf)
    setCarregando(`Carregando cidades de ${uf}…`)
    try {
      const fc = await carregarMalhaMunicipios(uf)
      munLayerRef.current?.remove()
      const layer = L.geoJSON(fc as GeoJSON.GeoJsonObject, {
        style: (feat) => {
          const id = (feat as Feat | undefined)?.properties?.id
          return styleMun(Boolean(id && idsRef.current.has(id)))
        },
        onEachFeature: (feature, lyr) => {
          const p = (feature as Feat).properties
          lyr.bindTooltip(`${p.nome} — ${p.uf}`, { sticky: true })
          lyr.on('click', () => {
            if (!modoRef.current) return
            const center = (lyr as L.Polygon).getBounds?.().getCenter?.()
            const cidade: CidadeAtendida = {
              id: p.id,
              nome: p.nome,
              uf: p.uf,
              lat: center?.lat,
              lng: center?.lng,
            }
            setDb((cur) => {
              const atual = getArea(cur, 'embarcador', ownerIdRef.current)
              const nextArea = toggleCidade(atual, cidade)
              const next = setArea(cur, {
                ...nextArea,
                ownerId: ownerIdRef.current,
                ownerKind: 'embarcador',
                modo: 'cidade',
              })
              if (saveTimer.current) window.clearTimeout(saveTimer.current)
              saveTimer.current = window.setTimeout(() => saveAreaDb(next), 400)
              return next
            })
          })
        },
      }).addTo(map)
      munLayerRef.current = layer
      const b = layer.getBounds()
      if (b.isValid()) map.fitBounds(b.pad(0.04), { maxZoom: 8 })
      setCarregando('')
    } catch {
      setCarregando('')
      setErro(`Não foi possível carregar as cidades de ${uf}.`)
    }
  }
  abrirUfRef.current = abrirUf

  useEffect(() => {
    const layer = munLayerRef.current
    if (!layer) return
    layer.eachLayer((lyr) => {
      const feat = (lyr as L.GeoJSON & { feature?: Feat }).feature
      const id = feat?.properties?.id
      if (!id) return
      ;(lyr as L.Path).setStyle(styleMun(idsSel.has(id)))
    })
  }, [idsSel])

  useEffect(() => {
    const layer = ufsLayerRef.current
    if (!layer) return
    layer.eachLayer((lyr) => {
      const feat = (lyr as L.GeoJSON & { feature?: Feat }).feature
      const uf = feat?.properties?.uf
      ;(lyr as L.Path).setStyle(styleUf(uf === ufAtiva))
    })
  }, [ufAtiva])

  useEffect(() => {
    const group = labelsRef.current
    const map = mapRef.current
    if (!group || !map) return
    group.clearLayers()
    if (!mostrarTudo || !superView) return

    const ativos = (transportadores ?? []).filter((t) => t.situacao === 'ativo')
    const pontos: Array<{ t: Transportador; lat: number; lng: number; chave: string }> = []
    for (const t of ativos) {
      const cidade = (t.origem_cidade || t.cidade || '').trim()
      const uf = (t.origem_uf || t.uf || '').trim().toUpperCase()
      const hit = acharMunicipio(catalogo, cidade, uf)
      const lat = hit?.lat
      const lng = hit?.lng
      if (lat == null || lng == null) continue
      pontos.push({ t, lat, lng, chave: `${hit?.id || cidade}|${uf}` })
    }

    const grupos = new Map<string, typeof pontos>()
    for (const p of pontos) {
      const arr = grupos.get(p.chave) ?? []
      arr.push(p)
      grupos.set(p.chave, arr)
    }

    for (const lista of grupos.values()) {
      lista.forEach((p, i) => {
        const n = lista.length
        const ang = n > 1 ? (2 * Math.PI * i) / n : 0
        const d = n > 1 ? 0.06 : 0
        const lat = p.lat + Math.sin(ang) * d
        const lng = p.lng + Math.cos(ang) * d
        const nome = p.t.nome_fantasia || p.t.razao_social || 'Transportadora'
        const icon = L.divIcon({
          className: 'area-att-pin',
          html: `<span>${escapeHtml(nome)}</span>`,
          iconSize: [0, 0],
          iconAnchor: [0, 12],
        })
        L.marker([lat, lng], { icon, zIndexOffset: 400 })
          .bindTooltip(
            `${escapeHtml(nome)}<br/>${escapeHtml(p.t.origem_cidade || p.t.cidade || '')} — ${escapeHtml(
              (p.t.origem_uf || p.t.uf || '').toUpperCase(),
            )}`,
            { direction: 'top' },
          )
          .addTo(group)
      })
    }
  }, [mostrarTudo, superView, transportadores, catalogo])

  async function escolherSugestao(m: MunicipioCat) {
    if (!modo) {
      setErro('Escolha “Cidade” antes de marcar.')
      return
    }
    setBusca('')
    setErro('')
    const cidade: CidadeAtendida = {
      id: m.id,
      nome: m.nome,
      uf: m.uf,
      lat: m.lat,
      lng: m.lng,
    }
    aplicarCidades(
      selecionadas.some((c) => c.id === m.id)
        ? selecionadas
        : [...selecionadas, cidade],
    )
    await abrirUf(m.uf)
    const map = mapRef.current
    if (map && Number.isFinite(m.lat) && Number.isFinite(m.lng)) {
      map.setView([m.lat, m.lng], 9)
    }
  }

  function voltarEstados() {
    munLayerRef.current?.remove()
    munLayerRef.current = null
    setUfAtiva(null)
    mapRef.current?.setView([-14.2, -51.9], 4)
  }

  const embarcadorNome = embarcadores.find((e) => e.id === ownerId)?.nome || 'Embarcador'

  return (
    <div className="mapa-log__body">
      <aside className="mapa-log__side">
        <section className="mapa-log__panel">
          <h2>Como marcar</h2>
          <p className="mapa-log__empty" style={{ marginBottom: 10 }}>
            Escolha o tipo e depois clique no mapa.
          </p>
          <div className="area-att-modos">
            <button
              type="button"
              className={`area-att-modo${modo === 'cidade' ? ' is-on' : ''}`}
              onClick={() => {
                setModo('cidade')
                setErro('')
                if (ownerId) {
                  persist(setArea(db, { ...area, ownerId, ownerKind: 'embarcador', modo: 'cidade' }))
                }
              }}
            >
              Cidade
            </button>
          </div>
          {!modo ? (
            <p className="mapa-log__empty" style={{ marginTop: 8 }}>
              Selecione <strong>Cidade</strong> para começar a marcar.
            </p>
          ) : (
            <p className="area-att-hint">
              Clique no estado e nas cidades que o embarcador atende. Cidade pintada de laranja
              está na área.
            </p>
          )}
        </section>

        {embarcadores.length > 1 ? (
          <section className="mapa-log__panel">
            <h2>Embarcador</h2>
            <select
              className="area-att-select"
              value={ownerId}
              onChange={(e) => setOwnerId(e.target.value)}
            >
              {embarcadores.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.nome}
                </option>
              ))}
            </select>
          </section>
        ) : null}

        <section className="mapa-log__panel">
          <h2>Buscar cidade</h2>
          <label className="area-att-search">
            <Search size={15} />
            <input
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Ex.: Guarulhos"
              disabled={!modo}
            />
          </label>
          {sugestoes.length > 0 ? (
            <ul className="area-att-sug">
              {sugestoes.map((m) => (
                <li key={m.id}>
                  <button type="button" onClick={() => void escolherSugestao(m)}>
                    {m.nome} — {m.uf}
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </section>

        <section className="mapa-log__panel">
          <h2>
            <MapPin size={14} /> Cidades na área
            <span className="area-att-count">{selecionadas.length}</span>
          </h2>
          <p className="mapa-log__empty" style={{ marginBottom: 8 }}>
            {embarcadorNome}
          </p>
          {selecionadas.length === 0 ? (
            <p className="mapa-log__empty">Nenhuma cidade marcada.</p>
          ) : (
            <ul className="area-att-chips">
              {selecionadas
                .slice()
                .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
                .map((c) => (
                  <li key={c.id}>
                    <button
                      type="button"
                      onClick={() => aplicarCidades(selecionadas.filter((x) => x.id !== c.id))}
                      title="Remover"
                    >
                      {c.nome} — {c.uf} ×
                    </button>
                  </li>
                ))}
            </ul>
          )}
          {selecionadas.length > 0 ? (
            <button
              type="button"
              className="area-att-clear"
              onClick={() => aplicarCidades([])}
            >
              Limpar área
            </button>
          ) : null}
        </section>

        {superView ? (
          <section className="mapa-log__panel">
            <h2>
              <Users size={14} /> Visão Super
            </h2>
            <label className="mapa-log__check">
              <input
                type="checkbox"
                checked={mostrarTudo}
                onChange={(e) => setMostrarTudo(e.target.checked)}
              />
              <span>Mostrar tudo (nome de cada transportadora no lugar que ela escolheu)</span>
            </label>
            <p className="mapa-log__empty">
              Só Diego e Elder. Usa a cidade de origem cadastrada da transportadora.
            </p>
          </section>
        ) : null}
      </aside>

      <div className="mapa-log__map-wrap">
        <div ref={mapEl} className="mapa-log__map" role="application" aria-label="Área de atendimento" />
        <div className="mapa-log__legend">
          <span>
            <i style={{ background: '#22d3ee' }} /> Estado
          </span>
          <span>
            <i style={{ background: '#f59e0b' }} /> Cidade atendida
          </span>
          {superView ? (
            <span>
              <i style={{ background: '#0f172a' }} /> Transportadora
            </span>
          ) : null}
        </div>
        <div className="area-att-mapbar">
          {ufAtiva ? (
            <button type="button" onClick={voltarEstados}>
              ← Voltar aos estados
            </button>
          ) : (
            <span>Brasil · clique no estado para ver as cidades</span>
          )}
          {carregando ? <em>{carregando}</em> : null}
          {erro ? <strong>{erro}</strong> : null}
        </div>
      </div>
    </div>
  )
}
