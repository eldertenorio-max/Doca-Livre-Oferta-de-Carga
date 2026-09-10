import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { Info } from 'lucide-react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { useAuth } from '../lib/AuthContext'
import { CATEGORIAS, NIVEIS_INTEGRACAO, categoriaPorId } from '../lib/categorias'
import { LOGO_DOCA_LIVRE_SRC } from '../lib/brandAssets'
import { ORIGEM_META, REGIOES, catValida } from '../lib/painelStats'
import {
  carregarEstadoBuscasPublicas,
  estadoBuscasPublicas,
  MAPA_PUBLICO_LIMITE_BUSCAS,
  registrarBuscaPublicaRemota,
} from '../lib/mapaPublicoBuscas'
import { PLANOS_PUBLICOS } from '../lib/planosPublicos'
import {
  aplicarFiltros,
  cidadesDoCadastro,
  empresasPorNome,
  frasesSugestaoRapida,
  nomeMarca,
  labelTipoSugestao,
  semAcento,
  sugerirBusca,
  todasFuncoesFiltro,
  toggleItem,
  ufsDoCadastro,
  type SugestaoBusca,
} from '../lib/search'
import type { CategoriaId, Empresa, NivelIntegracaoId, OrigemCadastro } from '../types'
import '../styles/mapa.css'
import '../styles/mapa-publico.css'

import { hrefMapaFrota, hrefRota, hrefSistema } from '../../lib/siteOfertaDeCarga'

function escapeHtml(s: string) {
  return s
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

function temCoordenada(e: Empresa) {
  return Number.isFinite(e.lat) && Number.isFinite(e.lng)
}

function pinIcon(e: Empresa, selecionada = false) {
  const cat = categoriaPorId(e.categoria)
  const tamanho = selecionada ? 48 : 36
  return L.divIcon({
    className: `pin-empresa${selecionada ? ' is-selecionada' : ''}`,
    html: `<div class="pin-empresa__inner${selecionada ? ' is-selecionada' : ''}" style="background:${cat.cor}" title="${escapeHtml(e.nome_fantasia)}">${cat.emoji}</div>`,
    iconSize: [tamanho, tamanho],
    iconAnchor: [tamanho / 2, tamanho],
    popupAnchor: [0, -tamanho + 4],
  })
}

function popupInternoHtml(e: Empresa) {
  const cat = categoriaPorId(e.categoria)
  return `<div class="mapa-popup"><h3>${escapeHtml(e.nome_fantasia)}</h3><p>${escapeHtml(cat.label)} · ${escapeHtml(e.cidade)}/${escapeHtml(e.uf)}</p></div>`
}

function popupPublicoHtml(e: Empresa) {
  const cat = categoriaPorId(e.categoria)
  return `
    <div class="mapa-pub-popup">
      <p class="mapa-pub-popup__tipo">${escapeHtml(e.nome_fantasia)}</p>
      <p class="mapa-pub-popup__local">${escapeHtml(cat.label)} · ${escapeHtml(e.cidade)} / ${escapeHtml(e.uf)}</p>
      <p class="mapa-pub-popup__lock">Contato, WhatsApp e CNPJ só para assinante.</p>
      <button type="button" class="mapa-pub-popup__cta js-mapa-pub-assinar">Assinar para ver contato</button>
    </div>
  `
}

function destacarTrecho(texto: string, query: string) {
  const q = semAcento(query).trim()
  if (!q) return texto
  let plain = ''
  const map: number[] = []
  for (let i = 0; i < texto.length; i++) {
    const ch = semAcento(texto[i])
    if (!ch) continue
    map.push(i)
    plain += ch
  }
  const idx = plain.indexOf(q)
  if (idx < 0 || map[idx] == null) return texto
  const start = map[idx]
  const endIdx = map[idx + q.length - 1]
  if (endIdx == null) return texto
  const end = endIdx + 1
  return (
    <>
      {texto.slice(0, start)}
      <mark>{texto.slice(start, end)}</mark>
      {texto.slice(end)}
    </>
  )
}

export function MapaPage({ publico = false }: { publico?: boolean }) {
  const { empresas, sessao } = useAuth()
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const [searchParams] = useSearchParams()
  const mapEl = useRef<HTMLDivElement>(null)
  const mapRef = useRef<L.Map | null>(null)
  const layerRef = useRef<L.LayerGroup | null>(null)
  const markersRef = useRef(new Map<string, L.Marker>())
  const manterFocoRef = useRef(false)
  const [query, setQuery] = useState('')
  const catParam = searchParams.get('cat')
  const [categoria, setCategoria] = useState<CategoriaId | null>(() =>
    catValida(catParam) ? catParam : null,
  )
  const [ufs, setUfs] = useState<string[]>([])
  const [regioes, setRegioes] = useState<string[]>([])
  const [niveis, setNiveis] = useState<NivelIntegracaoId[]>([])
  const [origens, setOrigens] = useState<OrigemCadastro[]>([])
  const [funcoes, setFuncoes] = useState<string[]>([])
  const [cidades, setCidades] = useState<string[]>([])
  const [selecionada, setSelecionada] = useState<string | null>(null)
  const [sugestoesAbertas, setSugestoesAbertas] = useState(false)
  const [sugestaoAtiva, setSugestaoAtiva] = useState(0)
  const [legendaAberta, setLegendaAberta] = useState(false)
  const [filtroAberto, setFiltroAberto] = useState<string | null>(null)
  const [filtrosReset, setFiltrosReset] = useState(0)
  const buscaWrapRef = useRef<HTMLDivElement>(null)
  const filtrosWrapRef = useRef<HTMLDivElement>(null)
  const legendaWrapRef = useRef<HTMLDivElement>(null)
  // Mantém o endereço em que o mapa já está (raiz para visitante) ao filtrar.
  const basePath = publico ? pathname : '/embarcador/mapa-logistica'
  const visitante = publico && !sessao
  const [restam, setRestam] = useState(() =>
    visitante ? estadoBuscasPublicas().restam : MAPA_PUBLICO_LIMITE_BUSCAS,
  )
  const [showPaywall, setShowPaywall] = useState<false | 'buscas' | 'contato'>(false)
  const consumindoRef = useRef(false)

  useEffect(() => {
    if (catValida(catParam)) setCategoria(catParam)
  }, [catParam])

  useEffect(() => {
    if (!visitante) return
    void carregarEstadoBuscasPublicas().then((estado) => {
      setRestam(estado.restam)
    })
  }, [visitante])

  const filtros = useMemo(
    () => ({ query, categoria, ufs, regioes, niveis, origens, funcoes, cidades }),
    [query, categoria, ufs, regioes, niveis, origens, funcoes, cidades],
  )

  const filtradas = useMemo(() => aplicarFiltros(empresas, filtros), [empresas, filtros])

  const porNome = useMemo(
    () => (query.trim().length >= 2 ? empresasPorNome(empresas, query) : []),
    [empresas, query],
  )

  const listaExibida = useMemo(() => {
    if (porNome.length === 0) return filtradas
    const ids = new Set(porNome.map((e) => e.id))
    return filtradas.filter((e) => ids.has(e.id))
  }, [filtradas, porNome])

  const escolhaDeUnidade = porNome.length > 1
  const pinsNoMapa = useMemo(
    () => (escolhaDeUnidade ? listaExibida.filter((e) => e.id === selecionada) : listaExibida),
    [escolhaDeUnidade, listaExibida, selecionada],
  )

  const sugestoes = useMemo(() => sugerirBusca(query, empresas, 10), [query, empresas])

  const contagem = useMemo(() => {
    const base = aplicarFiltros(empresas, { ...filtros, categoria: null })
    return Object.fromEntries(
      CATEGORIAS.map((c) => [c.id, base.filter((e) => e.categoria === c.id).length]),
    ) as Record<CategoriaId, number>
  }, [filtros, empresas])

  const ufsOpcoes = useMemo(() => ufsDoCadastro(empresas), [empresas])
  const cidadesOpcoes = useMemo(() => cidadesDoCadastro(empresas), [empresas])
  const funcoesOpcoes = useMemo(() => todasFuncoesFiltro(), [])

  const chipsAtivos = useMemo(() => {
    const chips: { key: string; label: string; limpar: () => void }[] = []
    if (query.trim()) chips.push({ key: 'q', label: `Busca: ${query.trim()}`, limpar: () => setQuery('') })
    if (categoria) {
      chips.push({
        key: 'cat',
        label: categoriaPorId(categoria).label,
        limpar: () => {
          setCategoria(null)
          navigate(basePath)
        },
      })
    }
    for (const uf of ufs) chips.push({ key: `uf-${uf}`, label: uf, limpar: () => setUfs((a) => toggleItem(a, uf)) })
    for (const r of regioes) {
      const nome = REGIOES.find((x) => x.id === r)?.label ?? r
      chips.push({ key: `reg-${r}`, label: nome, limpar: () => setRegioes((a) => toggleItem(a, r)) })
    }
    for (const n of niveis) {
      const nome = NIVEIS_INTEGRACAO.find((x) => x.id === n)?.label ?? n
      chips.push({ key: `niv-${n}`, label: nome, limpar: () => setNiveis((a) => toggleItem(a, n)) })
    }
    for (const o of origens) {
      chips.push({
        key: `ori-${o}`,
        label: ORIGEM_META[o].label,
        limpar: () => setOrigens((a) => toggleItem(a, o)),
      })
    }
    for (const fn of funcoes) {
      chips.push({ key: `fn-${fn}`, label: fn, limpar: () => setFuncoes((a) => toggleItem(a, fn)) })
    }
    for (const c of cidades) {
      chips.push({ key: `cid-${c}`, label: c, limpar: () => setCidades((a) => toggleItem(a, c)) })
    }
    return chips
  }, [query, categoria, ufs, regioes, niveis, origens, funcoes, cidades, navigate, basePath])

  useEffect(() => {
    if (!mapEl.current || mapRef.current) return
    const map = L.map(mapEl.current, {
      center: [-22.5, -47.2],
      zoom: 5,
      minZoom: 4,
      maxZoom: 16,
    })
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap',
      maxZoom: 19,
    }).addTo(map)
    layerRef.current = L.layerGroup().addTo(map)
    mapRef.current = map
    window.setTimeout(() => map.invalidateSize(), 120)
    return () => {
      map.remove()
      mapRef.current = null
      layerRef.current = null
    }
  }, [])

  useEffect(() => {
    if (manterFocoRef.current) {
      manterFocoRef.current = false
      return
    }
    setSelecionada(null)
  }, [query, categoria, ufs, regioes, niveis, origens, funcoes, cidades])

  useEffect(() => {
    const map = mapRef.current
    const layer = layerRef.current
    if (!map || !layer) return
    layer.clearLayers()
    markersRef.current.clear()

    for (const e of pinsNoMapa) {
      if (!temCoordenada(e)) continue
      const marker = L.marker([e.lat, e.lng], {
        icon: pinIcon(e, false),
        riseOnHover: true,
        title: e.nome_fantasia,
      })
      const cat = categoriaPorId(e.categoria)
      marker.bindPopup(visitante ? popupPublicoHtml(e) : popupInternoHtml(e), {
        className: visitante ? 'mapa-pub-leaflet' : '',
        maxWidth: 280,
        minWidth: 220,
        autoPanPadding: [48, 72],
      })
      if (!visitante) {
        marker.bindTooltip(
          `<strong>${escapeHtml(e.nome_fantasia)}</strong><br/>${cat.label}<br/>${e.cidade}/${e.uf}`,
          { direction: 'top', offset: [0, -28] },
        )
        marker.on('click', () => {
          manterFocoRef.current = true
          setSelecionada(e.id)
          navigate(`/embarcador/mapa-logistica/empresa/${e.slug}?from=mapa`)
        })
      } else {
        marker.on('click', () => {
          manterFocoRef.current = true
          setSelecionada(e.id)
        })
      }
      marker.addTo(layer)
      markersRef.current.set(e.id, marker)
    }

    if (escolhaDeUnidade && !selecionada) {
      map.setView([-14.2, -51.9], 4)
    } else if (!selecionada) {
      const comPonto = pinsNoMapa.filter(temCoordenada)
      if (comPonto.length === 1) {
        map.setView([comPonto[0].lat, comPonto[0].lng], 12)
      } else if (comPonto.length > 1) {
        const bounds = L.latLngBounds(comPonto.map((e) => [e.lat, e.lng] as [number, number]))
        map.fitBounds(bounds.pad(0.18), { maxZoom: 12, padding: [36, 36] })
      }
    }
    window.setTimeout(() => map.invalidateSize(), 80)
  }, [pinsNoMapa, navigate, visitante, escolhaDeUnidade, selecionada])

  useEffect(() => {
    for (const e of listaExibida) {
      const m = markersRef.current.get(e.id)
      if (!m) continue
      const ativo = Boolean(selecionada) && e.id === selecionada
      m.setIcon(pinIcon(e, ativo))
      m.setZIndexOffset(ativo ? 2000 : 0)
    }
    if (!selecionada) return
    const map = mapRef.current
    const marker = markersRef.current.get(selecionada)
    const e = listaExibida.find((x) => x.id === selecionada && temCoordenada(x))
    if (!map || !marker || !e) return
    map.invalidateSize()
    map.setView([e.lat, e.lng], Math.max(map.getZoom(), 14), { animate: true })
    window.setTimeout(() => {
      marker.openPopup()
      map.panTo([e.lat, e.lng], { animate: true })
    }, 120)
  }, [selecionada])

  function irPara(e: Empresa) {
    if (!temCoordenada(e)) return
    manterFocoRef.current = true
    setSelecionada(e.id)
    window.setTimeout(() => {
      document.getElementById(`emp-lista-${e.id}`)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
    }, 50)
  }

  async function consumirBusca() {
    if (!visitante) return true
    if (consumindoRef.current) return false
    consumindoRef.current = true
    try {
      const consumo = await registrarBuscaPublicaRemota()
      setRestam(consumo.restam)
      if (!consumo.ok) {
        setShowPaywall('buscas')
        return false
      }
      return true
    } finally {
      consumindoRef.current = false
    }
  }

  function abrirEmpresa(e: Empresa) {
    if (visitante) {
      setShowPaywall('contato')
      return
    }
    navigate(`/embarcador/mapa-logistica/empresa/${e.slug}?from=mapa`)
  }

  async function aplicarSugestao(s: SugestaoBusca) {
    if (!(await consumirBusca())) return
    if (s.tipo !== 'empresa') setQuery('')
    if (s.tipo === 'funcao') setFuncoes((a) => toggleItem(a, s.texto))
    else if (s.tipo === 'categoria') {
      const id = (s.valor as CategoriaId) || CATEGORIAS.find((c) => semAcento(c.label) === semAcento(s.texto))?.id
      if (id) {
        setCategoria(id)
        navigate(`${basePath}?cat=${id}`)
      }
    } else if (s.tipo === 'uf') setUfs((a) => toggleItem(a, s.valor || s.texto))
    else if (s.tipo === 'regiao') setRegioes((a) => toggleItem(a, s.valor || s.texto))
    else if (s.tipo === 'nivel') setNiveis((a) => toggleItem(a, (s.valor || s.texto) as NivelIntegracaoId))
    else if (s.tipo === 'origem') setOrigens((a) => toggleItem(a, (s.valor || s.texto) as OrigemCadastro))
    else if (s.tipo === 'lugar') setCidades((a) => toggleItem(a, s.valor || s.texto))
    else if (s.tipo === 'empresa') {
      if (!s.valor) {
        setQuery(s.texto)
      } else {
        const e = empresas.find((x) => x.id === s.valor)
        if (!e) {
          setQuery(s.texto)
        } else {
          const marca = nomeMarca(e)
          const irmaos = empresasPorNome(empresas, marca)
          setQuery(marca)
          const filialEspecifica = Boolean(e.hierarquia_superior) || e.nome_fantasia.includes(' — ')
          if (irmaos.length <= 1 || filialEspecifica) irPara(e)
        }
      }
    }
    setSugestoesAbertas(false)
    setSugestaoAtiva(0)
  }

  function limparPesquisa() {
    setQuery('')
    setSugestoesAbertas(false)
    setSugestaoAtiva(0)
  }

  function limparSoFiltros() {
    setCategoria(null)
    setUfs([])
    setRegioes([])
    setNiveis([])
    setOrigens([])
    setFuncoes([])
    setCidades([])
    setFiltroAberto(null)
    setFiltrosReset((n) => n + 1)
    navigate(basePath)
  }

  function limparFiltros() {
    limparPesquisa()
    limparSoFiltros()
  }

  function setCat(next: CategoriaId | null) {
    setCategoria(next)
    navigate(next ? `${basePath}?cat=${next}` : basePath)
  }

  // O popup do Leaflet corta a subida do evento, por isso escuto na descida (captura).
  useEffect(() => {
    function abrirPaywall(ev: MouseEvent) {
      const el = ev.target as HTMLElement | null
      if (!el?.closest?.('.js-mapa-pub-assinar')) return
      ev.preventDefault()
      setShowPaywall('contato')
    }
    document.addEventListener('click', abrirPaywall, true)
    return () => document.removeEventListener('click', abrirPaywall, true)
  }, [])

  useEffect(() => {
    function fecharFora(ev: MouseEvent) {
      const alvo = ev.target as Node
      if (!buscaWrapRef.current?.contains(alvo)) {
        setSugestoesAbertas(false)
      }
      if (!filtrosWrapRef.current?.contains(alvo)) {
        setFiltroAberto(null)
      }
      if (!legendaWrapRef.current?.contains(alvo)) {
        setLegendaAberta(false)
      }
    }
    document.addEventListener('mousedown', fecharFora)
    return () => document.removeEventListener('mousedown', fecharFora)
  }, [])

  return (
    <div className={`mapa-log animate-fade-up${publico ? ' mapa-log--publico' : ''}`}>
      {publico ? (
        <header className="mapa-log__brandbar">
          <Link to={basePath} className="mapa-log__brand">
            <img src={LOGO_DOCA_LIVRE_SRC} alt="Doca Livre" />
            <span>
              <strong>Doca Livre</strong>
              <em>Mapa da Logística</em>
            </span>
          </Link>
          <div className="mapa-log__head-acoes">
            <a className="mapa-log__btn mapa-log__btn--ghost" href={hrefMapaFrota()}>
              Mapa da Frota
            </a>
            <a className="mapa-log__btn mapa-log__btn--ghost" href={hrefRota()}>
              Calcular rota
            </a>
            <a className="mapa-log__btn mapa-log__btn--ghost" href={hrefSistema('/login')}>
              Entrar
            </a>
            <a className="mapa-log__btn mapa-log__btn--solid" href={hrefSistema('/cadastro-logistica')}>
              Cadastrar
            </a>
          </div>
        </header>
      ) : null}
      <div className="mapa-log__body">
        <header className="mapa-log__head">
          <div>
            <h1 className="mapa-log__title">Mapa da Logística</h1>
            <p className="mapa-log__sub">
              Clique no campo, digite e escolha a sugestão. O mapa mostra só as empresas selecionadas.
            </p>
          </div>
          {!publico ? (
            <div className="mapa-log__head-acoes">
              <a className="mapa-log__btn mapa-log__btn--ghost" href={hrefMapaFrota()}>
                Mapa da Frota
              </a>
              <a className="mapa-log__btn mapa-log__btn--ghost" href={hrefRota()}>
                Calcular rota
              </a>
            </div>
          ) : null}
        </header>

      <div className="mapa-log__layout">
        <aside className={`mapa-log__lista${escolhaDeUnidade ? ' is-escolha' : ''}`}>
          <div className="mapa-log__search">
            <label className="mapa-log__cats-title" htmlFor="busca-mapa">
              Pesquisar
            </label>
            <div className="mapa-log__busca-wrap" ref={buscaWrapRef}>
              <input
                id="busca-mapa"
                className={`mapa-log__input${query ? ' mapa-log__input--com-limpar' : ''}`}
                placeholder="Clique e escolha, ou digite: empilhadeira, SP, WMS…"
                value={query}
                autoComplete="off"
                spellCheck={false}
                role="combobox"
                aria-expanded={sugestoesAbertas && sugestoes.length > 0}
                aria-controls="sugestoes-busca"
                aria-autocomplete="list"
                aria-activedescendant={
                  sugestoesAbertas && sugestoes[sugestaoAtiva]
                    ? `sugestao-${sugestaoAtiva}`
                    : undefined
                }
                onFocus={() => {
                  setSugestoesAbertas(true)
                  setSugestaoAtiva(0)
                }}
                onChange={(ev) => {
                  setQuery(ev.target.value)
                  setSugestoesAbertas(true)
                  setSugestaoAtiva(0)
                }}
                onKeyDown={(ev) => {
                  if (!sugestoesAbertas || sugestoes.length === 0) {
                    if (ev.key === 'Escape') setSugestoesAbertas(false)
                    return
                  }
                  if (ev.key === 'ArrowDown') {
                    ev.preventDefault()
                    setSugestaoAtiva((i) => (i + 1) % sugestoes.length)
                  } else if (ev.key === 'ArrowUp') {
                    ev.preventDefault()
                    setSugestaoAtiva((i) => (i - 1 + sugestoes.length) % sugestoes.length)
                  } else if (ev.key === 'Enter') {
                    ev.preventDefault()
                    aplicarSugestao(sugestoes[sugestaoAtiva])
                  } else if (ev.key === 'Escape') {
                    setSugestoesAbertas(false)
                  }
                }}
              />
              {query.trim() ? (
                <button
                  type="button"
                  className="mapa-log__busca-x"
                  aria-label="Limpar campo de pesquisa"
                  onMouseDown={(ev) => ev.preventDefault()}
                  onClick={limparPesquisa}
                >
                  ×
                </button>
              ) : null}
              {sugestoesAbertas && sugestoes.length > 0 ? (
                <ul id="sugestoes-busca" className="mapa-log__sugestoes" role="listbox">
                  {sugestoes.map((s, i) => (
                    <li key={`${s.tipo}-${s.valor ?? s.texto}`} role="option" aria-selected={i === sugestaoAtiva}>
                      <button
                        type="button"
                        id={`sugestao-${i}`}
                        className={`mapa-log__sugestao${i === sugestaoAtiva ? ' is-on' : ''}`}
                        onMouseEnter={() => setSugestaoAtiva(i)}
                        onMouseDown={(ev) => ev.preventDefault()}
                        onClick={() => aplicarSugestao(s)}
                      >
                        <span className="mapa-log__sugestao-texto">
                          {destacarTrecho(s.texto, query)}
                        </span>
                        <span className="mapa-log__sugestao-tipo">
                          {labelTipoSugestao(s.tipo)}
                          {s.detalhe ? ` · ${s.detalhe}` : ''}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
            <p className="mapa-log__hint">
              Clique no campo para ver as sugestões, ou digite para filtrar a lista.
              {publico
                ? visitante
                  ? restam > 0
                    ? ` ${restam} de ${MAPA_PUBLICO_LIMITE_BUSCAS} buscas grátis restantes hoje.`
                    : ' Buscas grátis de hoje esgotadas.'
                  : ' Conta logada · buscas ilimitadas.'
                : ''}
            </p>
            {visitante && restam === 0 ? (
              <button type="button" className="mapa-log__assinar" onClick={() => setShowPaywall('buscas')}>
                Assinar para continuar
              </button>
            ) : null}
            <button type="button" className="mapa-log__btn-limpar" onClick={limparPesquisa}>
              Limpar pesquisa
            </button>
          </div>

          {chipsAtivos.length > 0 ? (
            <div className="mapa-log__ativos">
              {chipsAtivos.map((c) => (
                <button key={c.key} type="button" className="mapa-log__chip is-on" onClick={c.limpar}>
                  {c.label} ×
                </button>
              ))}
              <button type="button" className="mapa-log__limpar" onClick={limparFiltros}>
                Limpar tudo
              </button>
            </div>
          ) : null}

          <div className="mapa-log__filtros" ref={filtrosWrapRef} key={filtrosReset}>
            <FiltroCampo
              id="rapidas"
              titulo="Sugestões rápidas"
              placeholder="Digite ou clique para ver sugestões"
              aberto={filtroAberto === 'rapidas'}
              onFoco={() => setFiltroAberto('rapidas')}
              permitirLivre
              opcoes={frasesSugestaoRapida().map((s) => ({
                id: s.texto,
                label: s.texto,
                detalhe: s.detalhe,
                ativo: funcoes.includes(s.texto),
              }))}
              onEscolher={(id) => setFuncoes((a) => toggleItem(a, id))}
            />
            <FiltroCampo
              id="categorias"
              titulo="Categorias"
              placeholder="Digite a categoria"
              aberto={filtroAberto === 'categorias'}
              onFoco={() => setFiltroAberto('categorias')}
              opcoes={[
                {
                  id: '',
                  label: 'Todas',
                  detalhe: `${aplicarFiltros(empresas, { ...filtros, categoria: null }).length} empresas`,
                  ativo: categoria == null,
                },
                ...CATEGORIAS.map((c) => ({
                  id: c.id,
                  label: `${c.emoji} ${c.label}`,
                  detalhe: `${contagem[c.id] ?? 0} empresas`,
                  ativo: categoria === c.id,
                })),
              ]}
              onEscolher={(id) => setCat(id ? (id as CategoriaId) : null)}
            />
            <FiltroCampo
              id="funcao"
              titulo="Função"
              placeholder="Digite a função, ex.: empilhadeira"
              aberto={filtroAberto === 'funcao'}
              onFoco={() => setFiltroAberto('funcao')}
              permitirLivre
              opcoes={funcoesOpcoes.map((fn) => ({
                id: fn,
                label: fn,
                ativo: funcoes.includes(fn),
              }))}
              onEscolher={(id) => setFuncoes((a) => toggleItem(a, id))}
            />
            <FiltroCampo
              id="estado"
              titulo="Estado"
              placeholder="Digite a UF, ex.: SP"
              aberto={filtroAberto === 'estado'}
              onFoco={() => setFiltroAberto('estado')}
              opcoes={ufsOpcoes.map((u) => ({
                id: u.uf,
                label: u.uf,
                detalhe: `${u.qtd} empresas`,
                ativo: ufs.includes(u.uf),
              }))}
              onEscolher={(id) => setUfs((a) => toggleItem(a, id.toUpperCase()))}
            />
            <FiltroCampo
              id="regiao"
              titulo="Região"
              placeholder="Digite a região, ex.: Sudeste"
              aberto={filtroAberto === 'regiao'}
              onFoco={() => setFiltroAberto('regiao')}
              opcoes={REGIOES.map((r) => ({
                id: r.id,
                label: r.label,
                detalhe: r.ufs.join(', '),
                ativo: regioes.includes(r.id),
              }))}
              onEscolher={(id) => setRegioes((a) => toggleItem(a, id))}
            />
            <FiltroCampo
              id="cidade"
              titulo="Cidade"
              placeholder="Digite a cidade"
              aberto={filtroAberto === 'cidade'}
              onFoco={() => setFiltroAberto('cidade')}
              permitirLivre
              opcoes={cidadesOpcoes.map((c) => ({
                id: c.cidade,
                label: c.cidade,
                detalhe: `${c.uf} · ${c.qtd}`,
                ativo: cidades.includes(c.cidade),
              }))}
              onEscolher={(id) => setCidades((a) => toggleItem(a, id))}
            />
            <FiltroCampo
              id="nivel"
              titulo="Nível de integração"
              placeholder="Digite o nível"
              aberto={filtroAberto === 'nivel'}
              onFoco={() => setFiltroAberto('nivel')}
              opcoes={NIVEIS_INTEGRACAO.map((n) => ({
                id: n.id,
                label: n.label,
                detalhe: n.resumo,
                ativo: niveis.includes(n.id),
              }))}
              onEscolher={(id) => setNiveis((a) => toggleItem(a, id as NivelIntegracaoId))}
            />
            <FiltroCampo
              id="origem"
              titulo="Origem do cadastro"
              placeholder="Digite a origem"
              aberto={filtroAberto === 'origem'}
              onFoco={() => setFiltroAberto('origem')}
              opcoes={(Object.keys(ORIGEM_META) as OrigemCadastro[]).map((id) => ({
                id,
                label: ORIGEM_META[id].label,
                ativo: origens.includes(id),
              }))}
              onEscolher={(id) => setOrigens((a) => toggleItem(a, id as OrigemCadastro))}
            />
            <button type="button" className="mapa-log__btn-limpar" onClick={limparSoFiltros}>
              Limpar filtros
            </button>
          </div>

          <p className="mapa-log__result">
            {escolhaDeUnidade
              ? `Escolha a unidade (${listaExibida.length}) — clique na lista para ver no mapa`
              : porNome.length > 0
                ? `${listaExibida.length} empresa(s) para “${query.trim()}” — clique para ver no mapa`
                : `${listaExibida.length} empresa(s) no mapa`}
          </p>
          <ul className="mapa-log__empresas">
            {listaExibida.map((e) => {
              const cat = categoriaPorId(e.categoria)
              return (
                <li key={e.id} id={`emp-lista-${e.id}`} style={{ display: 'flex', gap: 4, alignItems: 'stretch' }}>
                  <button
                    type="button"
                    className={`mapa-log__emp${selecionada === e.id ? ' is-on' : ''}`}
                    onClick={() => irPara(e)}
                  >
                    <span className="mapa-log__cat-ico" style={{ background: cat.corFundo }}>
                      {cat.emoji}
                    </span>
                    <span>
                      <span className="mapa-log__emp-nome">
                        {escolhaDeUnidade && !e.hierarquia_superior
                          ? `${e.nome_fantasia} (matriz)`
                          : e.nome_fantasia}
                      </span>
                      <span className="mapa-log__emp-meta">
                        {cat.label} · {e.cidade}/{e.uf}
                      </span>
                    </span>
                  </button>
                  <button
                    type="button"
                    className="mapa-log__emp"
                    style={{ width: 'auto', flexShrink: 0, fontSize: '0.72rem', fontWeight: 800 }}
                    onClick={() => abrirEmpresa(e)}
                  >
                    Ver página
                  </button>
                </li>
              )
            })}
          </ul>
        </aside>

        <div className="mapa-log__map-wrap">
          <div ref={mapEl} className="mapa-log__map" />
          <div className="mapa-log__legenda-wrap" ref={legendaWrapRef}>
            {legendaAberta ? (
              <div className="mapa-log__legenda" role="dialog" aria-label="Ícones por categoria">
                <strong>Ícones por categoria</strong>
                {CATEGORIAS.filter((c) => (contagem[c.id] ?? 0) > 0).map((c) => (
                  <div className="mapa-log__legenda-row" key={c.id}>
                    <span>{c.emoji}</span>
                    <span>{c.label}</span>
                  </div>
                ))}
              </div>
            ) : null}
            <button
              type="button"
              className={`mapa-log__info${legendaAberta ? ' is-on' : ''}`}
              aria-label={legendaAberta ? 'Fechar ícones por categoria' : 'Ver ícones por categoria'}
              aria-expanded={legendaAberta}
              onClick={() => setLegendaAberta((aberta) => !aberta)}
            >
              <Info size={18} strokeWidth={2.4} />
            </button>
          </div>
        </div>
      </div>
      </div>

      {showPaywall ? (
        <div className="mapa-pub-modal" role="dialog" aria-modal="true" aria-labelledby="mapa-pub-pay-title">
          <div className="mapa-pub-modal__card mapa-pub-modal__card--planos">
            <h2 id="mapa-pub-pay-title">Escolha um plano</h2>
            <p>
              {showPaywall === 'contato'
                ? 'Telefone, WhatsApp e CNPJ das empresas ficam liberados para assinantes. Assine para falar direto com quem você achou no mapa.'
                : `As ${MAPA_PUBLICO_LIMITE_BUSCAS} buscas grátis de hoje acabaram. Assine para continuar no mapa e ver contato das empresas.`}
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
                  <a className="mapa-pub__btn mapa-pub__btn--solid" href={hrefSistema(`/cadastro-logistica?plano=${plano.id}`)}>
                    Assinar {plano.nome}
                  </a>
                </article>
              ))}
            </div>
            <div className="mapa-pub-modal__acoes">
              <a className="mapa-pub__btn mapa-pub__btn--ghost" href={hrefSistema('/login')}>
                Já tenho conta
              </a>
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

function FiltroCampo({
  id,
  titulo,
  placeholder,
  opcoes,
  aberto,
  onFoco,
  onEscolher,
  permitirLivre,
}: {
  id: string
  titulo: string
  placeholder: string
  opcoes: { id: string; label: string; detalhe?: string; ativo?: boolean }[]
  aberto: boolean
  onFoco: () => void
  onEscolher: (id: string) => void
  permitirLivre?: boolean
}) {
  const [texto, setTexto] = useState('')
  const [ativa, setAtiva] = useState(0)

  const lista = useMemo(() => {
    const q = semAcento(texto).trim()
    if (!q) return opcoes
    return opcoes.filter(
      (o) =>
        semAcento(o.label).includes(q) ||
        semAcento(o.detalhe ?? '').includes(q) ||
        semAcento(o.id).includes(q),
    )
  }, [opcoes, texto])

  useEffect(() => {
    setAtiva(0)
  }, [texto, aberto])

  function escolher(opcaoId: string) {
    onEscolher(opcaoId)
    setTexto('')
  }

  function confirmarLivre() {
    const digitado = texto.trim()
    if (!digitado) return
    const exata = lista.find((o) => semAcento(o.label) === semAcento(digitado) || semAcento(o.id) === semAcento(digitado))
    if (exata) escolher(exata.id)
    else if (lista.length === 1) escolher(lista[0].id)
    else if (permitirLivre) escolher(digitado)
  }

  return (
    <div className="mapa-log__filtro">
      <label className="mapa-log__filtro-label" htmlFor={`filtro-${id}`}>
        {titulo}
      </label>
      <input
        id={`filtro-${id}`}
        className="mapa-log__input"
        placeholder={placeholder}
        value={texto}
        autoComplete="off"
        spellCheck={false}
        role="combobox"
        aria-expanded={aberto}
        aria-controls={`filtro-lista-${id}`}
        onFocus={onFoco}
        onClick={onFoco}
        onChange={(ev) => {
          setTexto(ev.target.value)
          onFoco()
        }}
        onKeyDown={(ev) => {
          if (!aberto) {
            if (ev.key === 'ArrowDown' || ev.key === 'Enter') onFoco()
            return
          }
          if (ev.key === 'ArrowDown') {
            ev.preventDefault()
            setAtiva((i) => (lista.length ? (i + 1) % lista.length : 0))
          } else if (ev.key === 'ArrowUp') {
            ev.preventDefault()
            setAtiva((i) => (lista.length ? (i - 1 + lista.length) % lista.length : 0))
          } else if (ev.key === 'Enter') {
            ev.preventDefault()
            if (lista[ativa]) escolher(lista[ativa].id)
            else confirmarLivre()
          } else if (ev.key === 'Escape') {
            setTexto('')
          }
        }}
      />
      {aberto ? (
        <ul id={`filtro-lista-${id}`} className="mapa-log__filtro-lista" role="listbox">
          {lista.length === 0 ? (
            <li className="mapa-log__filtro-vazia">
              {permitirLivre && texto.trim()
                ? `Enter para usar “${texto.trim()}”`
                : 'Nenhuma sugestão. Continue digitando.'}
            </li>
          ) : (
            lista.map((o, i) => (
              <li key={`${o.id}-${o.label}`} role="option" aria-selected={i === ativa}>
                <button
                  type="button"
                  className={`mapa-log__sugestao${i === ativa ? ' is-on' : ''}${o.ativo ? ' is-picked' : ''}`}
                  onMouseEnter={() => setAtiva(i)}
                  onMouseDown={(ev) => ev.preventDefault()}
                  onClick={() => escolher(o.id)}
                >
                  <span className="mapa-log__sugestao-texto">{destacarTrecho(o.label, texto)}</span>
                  <span className="mapa-log__sugestao-tipo">
                    {o.ativo ? 'Selecionado' : o.detalhe || 'Sugestão'}
                  </span>
                </button>
              </li>
            ))
          )}
        </ul>
      ) : null}
    </div>
  )
}
