import { useEffect, useMemo, useRef, useState } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { useData } from '../../context/DataContext'
import { formatCurrency } from '../../lib/businessRules'
import {
  CAMADAS_DEFAULT,
  corIntensidade,
  labelIntensidade,
  montarSnapshotMapaLogistica,
  raioPorAtividade,
  type CamadasMapaLogistica,
  type RegiaoLogistica,
} from '../../lib/mapaLogisticaIntel'
import { AreaAtendimentoView } from '../../components/mapa/AreaAtendimentoView'
import '../../styles/mapa-logistica.css'

type AbaLogistica = 'radar' | 'area'

export function MapaLogisticaPage() {
  const { cargas, veiculos, motoristas, transportadores } = useData()
  const [aba, setAba] = useState<AbaLogistica>('radar')
  const mapEl = useRef<HTMLDivElement>(null)
  const mapRef = useRef<L.Map | null>(null)
  const layerRef = useRef<L.LayerGroup | null>(null)
  const [camadas, setCamadas] = useState<CamadasMapaLogistica>(CAMADAS_DEFAULT)
  const [selecionada, setSelecionada] = useState<RegiaoLogistica | null>(null)
  const [showFontes, setShowFontes] = useState(false)

  const snap = useMemo(
    () =>
      montarSnapshotMapaLogistica(
        cargas ?? [],
        veiculos ?? [],
        motoristas ?? [],
        transportadores ?? [],
      ),
    [cargas, veiculos, motoristas, transportadores],
  )

  function toggleCamada(key: keyof CamadasMapaLogistica) {
    setCamadas((prev) => ({ ...prev, [key]: !prev[key] }))
  }

  useEffect(() => {
    if (aba !== 'radar') return
    if (!mapEl.current || mapRef.current) return
    const map = L.map(mapEl.current, {
      center: [-14.2, -51.9],
      zoom: 4,
      zoomControl: true,
      minZoom: 4,
      maxZoom: 12,
    })
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap',
      maxZoom: 18,
    }).addTo(map)
    layerRef.current = L.layerGroup().addTo(map)
    mapRef.current = map
    return () => {
      map.remove()
      mapRef.current = null
      layerRef.current = null
    }
  }, [aba])

  useEffect(() => {
    if (aba !== 'radar') return
    const map = mapRef.current
    const layer = layerRef.current
    if (!map || !layer) return
    layer.clearLayers()

    const freteVals = snap.regioes.map((r) => r.freteMedio).filter((v) => v > 0)
    const freteP75 =
      freteVals.length > 0
        ? freteVals.sort((a, b) => a - b)[Math.floor(freteVals.length * 0.75)]
        : Infinity

    for (const r of snap.regioes) {
      if (camadas.semOfertas && !(r.cargasAtivas === 0 && r.veiculosDisponiveis > 0)) continue
      if (camadas.aquecidas && r.intensidade !== 'aquecida' && r.intensidade !== 'critica') continue
      if (camadas.fretesAltos && !(r.freteMedio > 0 && r.freteMedio >= freteP75)) continue

      if (camadas.calor) {
        const circle = L.circle([r.lat, r.lng], {
          radius: raioPorAtividade(r),
          color: corIntensidade(r.intensidade),
          weight: 2,
          fillColor: corIntensidade(r.intensidade),
          fillOpacity: 0.22 + Math.min(0.35, r.indiceCalor / 200),
        })
        circle.on('click', () => setSelecionada(r))
        circle.bindTooltip(
          `<strong>${r.uf} — ${r.nome}</strong><br/>Índice ${r.indiceCalor} · ${r.cargasAtivas} cargas · ${r.veiculosDisponiveis} livres`,
          { sticky: true },
        )
        circle.addTo(layer)
      }

      if (camadas.cargas && r.cargasAtivas > 0) {
        const m = L.circleMarker([r.lat - 0.15, r.lng - 0.15], {
          radius: Math.min(16, 5 + Math.sqrt(r.cargasAtivas) * 2.2),
          color: '#1d4ed8',
          fillColor: '#3b82f6',
          fillOpacity: 0.85,
          weight: 1.5,
        })
        m.bindTooltip(`📦 ${r.cargasAtivas} carga(s) em ${r.uf}`, { sticky: true })
        m.on('click', () => setSelecionada(r))
        m.addTo(layer)
      }

      if (camadas.caminhoes && r.veiculosDisponiveis > 0) {
        const m = L.circleMarker([r.lat + 0.15, r.lng + 0.15], {
          radius: Math.min(16, 5 + Math.sqrt(r.veiculosDisponiveis) * 2.2),
          color: '#047857',
          fillColor: '#10b981',
          fillOpacity: 0.85,
          weight: 1.5,
        })
        m.bindTooltip(`🚛 ${r.veiculosDisponiveis} placa(s) livres em ${r.uf}`, { sticky: true })
        m.on('click', () => setSelecionada(r))
        m.addTo(layer)
      }
    }

    // Cargas com GPS (pin fino)
    if (camadas.cargas) {
      for (const p of snap.pontosCarga.slice(0, 400)) {
        L.circleMarker([p.lat, p.lng], {
          radius: 4,
          color: '#1e3a8a',
          fillColor: '#60a5fa',
          fillOpacity: 0.7,
          weight: 1,
        })
          .bindTooltip(
            `${p.origem} → ${p.destino}<br/>${p.frete > 0 ? formatCurrency(p.frete) : 'Frete n/d'}`,
          )
          .addTo(layer)
      }
    }
  }, [snap, camadas, aba])

  return (
    <div className="mapa-log animate-fade-up">
      <header className="mapa-log__hero">
        <div>
          <p className="mapa-log__eyebrow">Embarcador · Inteligência de frete</p>
          <h1 className="mapa-log__title">
            Malha Logística{' '}
            <span className="mapa-log__stars" aria-hidden>
              ★★★★★
            </span>
          </h1>
          <p className="mapa-log__sub">
            {aba === 'area'
              ? 'Marque a área no mapa do Brasil. Divisão: Região, Estado, Cidade ou Bairro.'
              : 'Mapa de calor do mercado com os dados da sua plataforma: onde há cargas, onde faltam caminhões, regiões aquecidas e frete médio por UF.'}
          </p>
          <div className="mapa-log__tabs" role="tablist">
            <button
              type="button"
              role="tab"
              aria-selected={aba === 'radar'}
              className={`mapa-log__tab${aba === 'radar' ? ' is-on' : ''}`}
              onClick={() => setAba('radar')}
            >
              Mapa de Calor
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={aba === 'area'}
              className={`mapa-log__tab${aba === 'area' ? ' is-on' : ''}`}
              onClick={() => setAba('area')}
            >
              Área de atendimento
            </button>
          </div>
        </div>
        {aba === 'radar' ? (
          <div className="mapa-log__kpis">
            <div className="mapa-log__kpi">
              <span>Cargas ativas</span>
              <strong>{snap.totais.cargasAtivas}</strong>
            </div>
            <div className="mapa-log__kpi">
              <span>Placas livres</span>
              <strong>{snap.totais.veiculosDisponiveis}</strong>
            </div>
            <div className="mapa-log__kpi">
              <span>Motoristas no mapa de calor</span>
              <strong>{snap.totais.motoristas}</strong>
            </div>
            <div className="mapa-log__kpi">
              <span>Frete médio</span>
              <strong>
                {snap.totais.freteMedio > 0 ? formatCurrency(snap.totais.freteMedio) : '—'}
              </strong>
            </div>
            <div className="mapa-log__kpi">
              <span>UFs com atividade</span>
              <strong>{snap.totais.ufsComAtividade}</strong>
            </div>
          </div>
        ) : null}
      </header>

      {aba === 'area' ? <AreaAtendimentoView /> : (
      <div className="mapa-log__body">
        <aside className="mapa-log__side">
          <section className="mapa-log__panel">
            <h2>Camadas</h2>
            {(
              [
                ['calor', '🌡️ Índice de calor logístico'],
                ['cargas', '📦 Demanda de cargas'],
                ['caminhoes', '🚛 Oferta de caminhões'],
                ['fretesAltos', '💰 Fretes acima da média'],
                ['aquecidas', '🔥 Só regiões aquecidas'],
                ['semOfertas', '💤 Frota sem oferta'],
              ] as const
            ).map(([key, label]) => (
              <label key={key} className="mapa-log__check">
                <input
                  type="checkbox"
                  checked={camadas[key]}
                  onChange={() => toggleCamada(key)}
                />
                <span>{label}</span>
              </label>
            ))}
          </section>

          <section className="mapa-log__panel">
            <h2>🔥 Mais aquecidas</h2>
            {snap.rankingAquecidas.length === 0 ? (
              <p className="mapa-log__empty">Publique cargas para ver o ranking.</p>
            ) : (
              <ol className="mapa-log__rank">
                {snap.rankingAquecidas.map((r, i) => (
                  <li key={r.uf}>
                    <button type="button" onClick={() => setSelecionada(r)}>
                      <span className="mapa-log__rank-n">{i + 1}</span>
                      <span>
                        <strong>
                          {r.uf} · {r.nome}
                        </strong>
                        <small>
                          Índice {r.indiceCalor} · {r.cargasAtivas} cargas · {r.veiculosDisponiveis}{' '}
                          livres
                        </small>
                      </span>
                      <span
                        className="mapa-log__dot"
                        style={{ background: corIntensidade(r.intensidade) }}
                      />
                    </button>
                  </li>
                ))}
              </ol>
            )}
          </section>

          <section className="mapa-log__panel">
            <h2>🚨 Falta de caminhão</h2>
            {snap.rankingFaltaCaminhao.length === 0 ? (
              <p className="mapa-log__empty">Nenhum gap relevante agora.</p>
            ) : (
              <ol className="mapa-log__rank">
                {snap.rankingFaltaCaminhao.map((r) => (
                  <li key={r.uf}>
                    <button type="button" onClick={() => setSelecionada(r)}>
                      <span>
                        <strong>
                          {r.uf} · gap {r.gapVeiculos || r.cargasAtivas}
                        </strong>
                        <small>
                          {r.cargasParadas} aguardando · {r.veiculosDisponiveis} livres
                        </small>
                      </span>
                    </button>
                  </li>
                ))}
              </ol>
            )}
          </section>

          <section className="mapa-log__panel">
            <h2>💰 Frete mais alto</h2>
            {snap.rankingFrete.length === 0 ? (
              <p className="mapa-log__empty">Sem frete médio calculável.</p>
            ) : (
              <ol className="mapa-log__rank">
                {snap.rankingFrete.map((r) => (
                  <li key={r.uf}>
                    <button type="button" onClick={() => setSelecionada(r)}>
                      <span>
                        <strong>{r.uf}</strong>
                        <small>{formatCurrency(r.freteMedio)}</small>
                      </span>
                    </button>
                  </li>
                ))}
              </ol>
            )}
          </section>

          <section className="mapa-log__panel mapa-log__panel--fontes">
            <button
              type="button"
              className="mapa-log__fontes-toggle"
              onClick={() => setShowFontes((v) => !v)}
            >
              De onde vêm esses dados? {showFontes ? '▴' : '▾'}
            </button>
            {showFontes ? (
              <ul className="mapa-log__fontes">
                {snap.fontes.map((f) => (
                  <li key={f.id}>
                    <strong>
                      {f.titulo}{' '}
                      <em className={f.status === 'ativo' ? 'is-on' : 'is-off'}>
                        {f.status === 'ativo' ? 'ativo' : 'planejado'}
                      </em>
                    </strong>
                    <span>{f.detalhe}</span>
                  </li>
                ))}
              </ul>
            ) : null}
          </section>
        </aside>

        <div className="mapa-log__map-wrap">
          <div ref={mapEl} className="mapa-log__map" role="application" aria-label="Mapa do Brasil" />
          <div className="mapa-log__legend">
            <span>
              <i style={{ background: '#dc2626' }} /> Crítica
            </span>
            <span>
              <i style={{ background: '#ea580c' }} /> Aquecida
            </span>
            <span>
              <i style={{ background: '#ca8a04' }} /> Equilibrada
            </span>
            <span>
              <i style={{ background: '#64748b' }} /> Fria
            </span>
            <span>
              <i style={{ background: '#3b82f6' }} /> Cargas
            </span>
            <span>
              <i style={{ background: '#10b981' }} /> Caminhões
            </span>
          </div>

          {selecionada ? (
            <div className="mapa-log__detail">
              <header>
                <div>
                  <h3>
                    {selecionada.uf} — {selecionada.nome}
                  </h3>
                  <p style={{ color: corIntensidade(selecionada.intensidade) }}>
                    {labelIntensidade(selecionada.intensidade)} · índice {selecionada.indiceCalor}
                  </p>
                </div>
                <button type="button" onClick={() => setSelecionada(null)} aria-label="Fechar">
                  ×
                </button>
              </header>
              <div className="mapa-log__detail-grid">
                <div>
                  <span>Cargas ativas</span>
                  <strong>{selecionada.cargasAtivas}</strong>
                </div>
                <div>
                  <span>Aguardando motorista</span>
                  <strong>{selecionada.cargasParadas}</strong>
                </div>
                <div>
                  <span>Placas no mapa</span>
                  <strong>{selecionada.veiculos}</strong>
                </div>
                <div>
                  <span>Disponíveis</span>
                  <strong>{selecionada.veiculosDisponiveis}</strong>
                </div>
                <div>
                  <span>Motoristas</span>
                  <strong>{selecionada.motoristas}</strong>
                </div>
                <div>
                  <span>Gap estimado</span>
                  <strong>{selecionada.gapVeiculos}</strong>
                </div>
                <div>
                  <span>Frete médio</span>
                  <strong>
                    {selecionada.freteMedio > 0 ? formatCurrency(selecionada.freteMedio) : '—'}
                  </strong>
                </div>
                <div>
                  <span>R$/km médio</span>
                  <strong>
                    {selecionada.fretePorKmMedio != null
                      ? formatCurrency(selecionada.fretePorKmMedio)
                      : '—'}
                  </strong>
                </div>
              </div>
              <p className="mapa-log__insight">{selecionada.insight}</p>
              {selecionada.rotasTop.length > 0 ? (
                <div className="mapa-log__rotas">
                  <h4>Rotas em movimento</h4>
                  <ul>
                    {selecionada.rotasTop.map((rt) => (
                      <li key={`${rt.origem}-${rt.destino}`}>
                        <span>
                          {rt.origem} → {rt.destino}
                        </span>
                        <span>
                          {rt.qtd}× · {rt.freteMedio > 0 ? formatCurrency(rt.freteMedio) : '—'}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
              {selecionada.tiposVeiculoTop.length > 0 ? (
                <div className="mapa-log__rotas">
                  <h4>Tipos pedidos / no mapa de calor</h4>
                  <ul>
                    {selecionada.tiposVeiculoTop.map((t) => (
                      <li key={t.tipo}>
                        <span>{t.tipo}</span>
                        <span>{t.qtd}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
      )}
    </div>
  )
}
