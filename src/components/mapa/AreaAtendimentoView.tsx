import { useEffect, useMemo, useRef, useState } from 'react'
import L from 'leaflet'
import { Info, List, MapPin, Search, Users, X } from 'lucide-react'
import { useData } from '../../context/DataContext'
import {
  acharMunicipio,
  buscarMunicipiosCatalogo,
  carregarCatalogoMunicipios,
  carregarMalhaBairros,
  carregarMalhaMunicipiosBrasil,
  carregarMalhaRegioes,
  carregarMalhaUfs,
  carregarMalhaZonas,
  type GeoProps,
  type MunicipioCat,
} from '../../lib/geoBrasil'
import { ZONA_SP_COR, MUN_SAO_PAULO_ID, centrosZonasSp } from '../../lib/zonasSaoPaulo'
import {
  areaTemMarca,
  areaVazia,
  getArea,
  hydrateAreaDb,
  malhasDoOwner,
  ownerEmbarcadorId,
  resumoMalha,
  saveAreaDb,
  setArea,
  chaveArea,
  snapshotMalha,
  upsertMalha,
  excluirMalha,
  toggleBairro,
  toggleCidade,
  toggleEstado,
  toggleRegiao,
  toggleZona,
  MODO_AREA_LABEL,
  type AreaAtendimento,
  type AreaAtendimentoDB,
  type AreaMalhaSalva,
  type BairroAtendido,
  type CidadeAtendida,
  type ModoMarcacaoArea,
} from '../../lib/areaAtendimento'
import {
  hydrateOrgTree,
  listarEmbarcadores,
  loadOrgTree,
  type OrgNo,
} from '../../lib/orgHierarchy'
import { REGIOES_BR, regiaoDaUf } from '../../lib/mapaFrota'
import { isLocalSuperUser } from '../../lib/superUsers'
import { UF_CENTRO, UFS_BR, type UfBr } from '../../lib/mapaLogisticaIntel'
import type { Transportador } from '../../types'

type Feat = GeoJSON.Feature<GeoJSON.Geometry, GeoProps>

const REGIAO_COR: Record<string, string> = {
  Norte: '#0d9488',
  Nordeste: '#ea580c',
  'Centro-Oeste': '#ca8a04',
  Sudeste: '#1d4ed8',
  Sul: '#7c3aed',
}

/** Uma cor estável por UF (ângulo de ouro), no mesmo estilo das regiões. */
const UF_COR: Record<string, string> = Object.fromEntries(
  UFS_BR.map((uf, i) => [uf, `hsl(${Math.round((i * 137.508) % 360)} 62% 46%)`]),
) as Record<string, string>

const MODOS: { id: ModoMarcacaoArea; label: string; hint: string; fonte: string }[] = [
  {
    id: 'regiao',
    label: 'Região',
    hint: 'Brasil inteiro por região. Clique para marcar Norte, Nordeste, Centro-Oeste, Sudeste ou Sul.',
    fonte: 'IBGE · Malhas territoriais',
  },
  {
    id: 'estado',
    label: 'Estado',
    hint: 'Brasil inteiro por estado. Cada UF tem uma cor — clique para marcar.',
    fonte: 'IBGE · Malhas territoriais',
  },
  {
    id: 'cidade',
    label: 'Cidade',
    hint: 'Brasil inteiro por município. Cada cidade tem uma cor — clique para marcar.',
    fonte: 'IBGE · Malhas + Localidades',
  },
  {
    id: 'bairro',
    label: 'Bairro',
    hint: 'Clique na cidade para marcar bairro por bairro (distrito/bairro oficial do IBGE).',
    fonte: 'IBGE · Censo 2022',
  },
  {
    id: 'zona',
    label: 'Zona',
    hint: 'Clique na cidade para marcar de uma vez a zona inteira (Norte, Sul, Leste, Oeste, Centro). Em São Paulo usa as regiões oficiais da Prefeitura; nas demais cidades é uma divisão aproximada pela posição geográfica dos bairros.',
    fonte: 'IBGE · Censo 2022 + zonas da Prefeitura (SP)',
  },
]

const FONTES_DIVISAO: { titulo: string; detalhe: string; href: string }[] = [
  {
    titulo: 'Região e Estado',
    detalhe:
      'Contornos oficiais do IBGE — API de Malhas v3 (intrarregião região e UF, qualidade mínima).',
    href: 'https://servicodados.ibge.gov.br/api/docs/malhas?versao=3',
  },
  {
    titulo: 'Cidade (município)',
    detalhe:
      'Malha de municípios do IBGE (API de Malhas v3). Nomes e códigos: API de Localidades do IBGE.',
    href: 'https://servicodados.ibge.gov.br/api/docs/localidades',
  },
  {
    titulo: 'Bairro',
    detalhe: 'Bairros e distritos oficiais do IBGE (Censo 2022), um a um.',
    href: 'https://www.ibge.gov.br/geociencias/organizacao-do-territorio/malhas-territoriais/26565-malhas-de-setores-censitarios-divisoes-intramunicipais.html',
  },
  {
    titulo: 'Zona',
    detalhe:
      'Agrupa os bairros/distritos em 5 zonas (Centro, Norte, Sul, Leste, Oeste). Em São Paulo usa as regiões oficiais da Prefeitura; nas demais cidades é uma divisão aproximada pela posição geográfica.',
    href: 'https://www.ibge.gov.br/geociencias/organizacao-do-territorio/malhas-territoriais/26565-malhas-de-setores-censitarios-divisoes-intramunicipais.html',
  },
  {
    titulo: 'Fundo do mapa',
    detalhe: 'Tiles © OpenStreetMap contributors.',
    href: 'https://www.openstreetmap.org/copyright',
  },
]

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

function corCidade(id: string): string {
  let h = 2166136261
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return `hsl(${(h >>> 0) % 360} 58% 48%)`
}

/** Cor de destaque do que está marcado na malha — bem viva pra saltar aos olhos
 * em cima de qualquer cor de preenchimento (antes era um contorno escuro/preto). */
const COR_DESTAQUE = '#1e3a8a'

function styleDivisao(cor: string, ativa: boolean): L.PathOptions {
  return {
    color: ativa ? COR_DESTAQUE : cor,
    weight: ativa ? 3.6 : 1.3,
    fillColor: cor,
    fillOpacity: ativa ? 0.52 : 0.28,
  }
}

function styleEstado(uf: string | undefined, ativa: boolean): L.PathOptions {
  return styleDivisao((uf && UF_COR[uf]) || '#94a3b8', ativa)
}

function styleMun(
  id: string,
  selecionada: boolean,
  nome?: string,
  tipo?: GeoProps['tipo'],
  zona?: string,
): L.PathOptions {
  const zonaNome = tipo === 'zona' ? nome : zona
  if (zonaNome && ZONA_SP_COR[zonaNome]) {
    const base = styleDivisao(ZONA_SP_COR[zonaNome], selecionada)
    return { ...base, weight: selecionada ? 3.6 : 1.15, fillOpacity: selecionada ? 0.55 : 0.38 }
  }
  return styleDivisao(corCidade(id), selecionada)
}

/** Dá zoom só no(s) polígono(s) que batem com `match` dentro da camada, pra
 * "isolar" visualmente o que foi buscado (cidade/estado/região) em vez de
 * deixar o zoom genérico mostrando um monte de vizinhos por cima. */
function focarFeature(layer: L.GeoJSON | null, map: L.Map, match: (p: GeoProps) => boolean): boolean {
  if (!layer) return false
  let bounds: L.LatLngBounds | undefined
  layer.eachLayer((lyr) => {
    const poly = lyr as L.Polygon<GeoProps>
    const props = poly.feature?.properties
    if (!props || !match(props)) return
    const b = poly.getBounds?.()
    if (!b?.isValid()) return
    bounds = bounds ? bounds.extend(b) : L.latLngBounds(b.getSouthWest(), b.getNorthEast())
  })
  if (bounds && bounds.isValid()) {
    map.fitBounds(bounds.pad(0.15), { maxZoom: 13 })
    return true
  }
  return false
}

function bairroEstaSel(bp: GeoProps, ids: Set<string>): boolean {
  if (ids.has(bp.id)) return true
  if (bp.zonaId && ids.has(bp.zonaId)) return true
  return false
}

function styleRegiao(nome: string, ativa: boolean): L.PathOptions {
  return styleDivisao(REGIAO_COR[nome] ?? '#64748b', ativa)
}

export function AreaAtendimentoView() {
  const { user, transportadores } = useData()
  const mapEl = useRef<HTMLDivElement>(null)
  const mapRef = useRef<L.Map | null>(null)
  const ufsLayerRef = useRef<L.GeoJSON | null>(null)
  const munLayerRef = useRef<L.GeoJSON | null>(null)
  const regLayerRef = useRef<L.GeoJSON | null>(null)
  const bairroLayerRef = useRef<L.GeoJSON | null>(null)
  const zonaLabelsRef = useRef<L.LayerGroup | null>(null)
  const labelsRef = useRef<L.LayerGroup | null>(null)
  const saveTimer = useRef<number | null>(null)
  const idsRef = useRef<Set<string>>(new Set())
  const bairroIdsRef = useRef<Set<string>>(new Set())
  const zonaIdsRef = useRef<Set<string>>(new Set())
  const estadosRef = useRef<Set<string>>(new Set())
  const regioesRef = useRef<Set<string>>(new Set())
  const modoRef = useRef<ModoMarcacaoArea | null>(null)
  const ownerIdRef = useRef('')
  const persistPatchRef = useRef<(fn: (a: AreaAtendimento) => AreaAtendimento) => void>(() => {})
  const mostrarRegioesRef = useRef<() => Promise<void>>(async () => {})
  const mostrarCidadesRef = useRef<() => Promise<void>>(async () => {})
  const abrirBairrosRef = useRef<(p: GeoProps, bounds?: L.LatLngBounds) => Promise<void>>(async () => {})
  const abrirZonasRef = useRef<(p: GeoProps, bounds?: L.LatLngBounds) => Promise<void>>(async () => {})

  const [tree, setTree] = useState<OrgNo[]>(() => loadOrgTree())
  const [db, setDb] = useState<AreaAtendimentoDB>(() => ({ areas: {}, malhas: {} }))
  const [modo, setModo] = useState<ModoMarcacaoArea | null>(null)
  const [ufAtiva, setUfAtiva] = useState<UfBr | null>(null)
  const [munAtiva, setMunAtiva] = useState<{ id: string; nome: string; uf?: UfBr } | null>(null)
  const [carregando, setCarregando] = useState('Carregando mapa do Brasil…')
  const [erro, setErro] = useState('')
  const [busca, setBusca] = useState('')
  const [catalogo, setCatalogo] = useState<MunicipioCat[]>([])
  const [mostrarTudo, setMostrarTudo] = useState(false)
  const [ownerId, setOwnerId] = useState('')
  const [nomeMalha, setNomeMalha] = useState('')
  const [editandoId, setEditandoId] = useState<string | null>(null)
  const [msgSalva, setMsgSalva] = useState('')
  const [showFontes, setShowFontes] = useState(false)
  const [showSalvarHint, setShowSalvarHint] = useState(false)
  const [showMalhas, setShowMalhas] = useState(false)

  const superView = isDiegoElder(user)
  const embarcadores = useMemo(() => listarEmbarcadores(tree), [tree])

  useEffect(() => {
    const id = ownerEmbarcadorId({
      empresaOrgId: user?.empresa_org_id,
      embarcadores,
    })
    setOwnerId((prev) => (prev && embarcadores.some((e) => e.id === prev) ? prev : id))
  }, [user?.empresa_org_id, embarcadores])

  const area = useMemo(
    () => (ownerId ? getArea(db, 'embarcador', ownerId) : getArea(db, 'embarcador', 'x')),
    [db, ownerId],
  )
  const selecionadas = area.cidades
  const estadosSel = area.estados
  const regioesSel = area.regioes
  const bairrosSel = area.bairros
  const zonasSel = area.zonas
  const idsSel = useMemo(() => new Set(selecionadas.map((c) => c.id)), [selecionadas])
  const idsBairro = useMemo(() => new Set(bairrosSel.map((b) => b.id)), [bairrosSel])
  const idsZona = useMemo(() => new Set(zonasSel.map((z) => z.id)), [zonasSel])
  idsRef.current = idsSel
  bairroIdsRef.current = idsBairro
  zonaIdsRef.current = idsZona
  estadosRef.current = new Set(estadosSel.map((e) => e.toUpperCase()))
  regioesRef.current = new Set(regioesSel)

  useEffect(() => {
    if (!ownerId) return
    const raw = db.areas[chaveArea('embarcador', ownerId)]
    if (!raw) return
    if (
      raw.modo === 'estado' ||
      raw.modo === 'cidade' ||
      raw.modo === 'regiao' ||
      raw.modo === 'bairro' ||
      raw.modo === 'zona'
    ) {
      setModo(raw.modo)
    }
  }, [ownerId, db])

  const sugestoesCidade = useMemo(
    () => buscarMunicipiosCatalogo(catalogo, busca, 10),
    [catalogo, busca],
  )
  const sugestoesEstado = useMemo(() => {
    const q = busca.trim().toLowerCase()
    if (q.length < 1) return []
    return UFS_BR.filter(
      (uf) =>
        uf.toLowerCase().includes(q) || UF_CENTRO[uf].nome.toLowerCase().includes(q),
    ).slice(0, 10)
  }, [busca])
  const sugestoesRegiao = useMemo(() => {
    const q = busca.trim().toLowerCase()
    if (q.length < 1) return [...REGIOES_BR]
    return REGIOES_BR.filter((r) => r.toLowerCase().includes(q))
  }, [busca])

  // Se o que foi digitado não bate com nada no modo atual (ex.: digitou "São
  // Paulo" em Região), mas bate em outro (Estado/Cidade/Região), pula sozinho
  // pro modo certo — sem precisar clicar manualmente.
  useEffect(() => {
    if (!busca.trim()) return
    if (modo !== 'regiao' && modo !== 'estado' && modo !== 'cidade') return
    const atual =
      modo === 'estado'
        ? sugestoesEstado.length
        : modo === 'cidade'
          ? sugestoesCidade.length
          : sugestoesRegiao.length
    if (atual > 0) return
    if (sugestoesEstado.length > 0) escolherModo('estado')
    else if (sugestoesCidade.length > 0) escolherModo('cidade')
    else if (sugestoesRegiao.length > 0) escolherModo('regiao')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [busca, modo, sugestoesEstado, sugestoesCidade, sugestoesRegiao])

  function persist(nextDb: AreaAtendimentoDB) {
    setDb(nextDb)
    if (saveTimer.current) window.clearTimeout(saveTimer.current)
    saveTimer.current = window.setTimeout(() => saveAreaDb(nextDb), 400)
  }

  function persistPatch(fn: (a: AreaAtendimento) => AreaAtendimento) {
    setDb((cur) => {
      const oid = ownerIdRef.current
      if (!oid) return cur
      const atual = getArea(cur, 'embarcador', oid)
      const next = setArea(cur, { ...fn(atual), ownerId: oid, ownerKind: 'embarcador' })
      if (saveTimer.current) window.clearTimeout(saveTimer.current)
      saveTimer.current = window.setTimeout(() => saveAreaDb(next), 400)
      return next
    })
  }
  persistPatchRef.current = persistPatch

  const malhasOwner = useMemo(
    () => (ownerId ? malhasDoOwner(db, 'embarcador', ownerId) : []),
    [db, ownerId],
  )

  function salvarAreaNomeada() {
    if (!ownerId) return
    const nome = nomeMalha.trim()
    if (!nome) {
      setMsgSalva('')
      setErro('Dê um nome para esta área.')
      return
    }
    if (!areaTemMarca(area, modo)) {
      setMsgSalva('')
      setErro('Marque no mapa o recorte em que você trabalha (região, estado, cidade ou bairro).')
      return
    }
    const modoSave = modo ?? area.modo
    const rascunho: AreaAtendimento = {
      ...area,
      ownerId,
      ownerKind: 'embarcador',
      modo: modoSave,
    }
    const malha = snapshotMalha({
      area: rascunho,
      nome,
      id: editandoId,
      previa: editandoId ? db.malhas[editandoId] : null,
    })
    persist(upsertMalha(setArea(db, rascunho), malha))
    setEditandoId(malha.id)
    setErro('')
    setShowMalhas(true)
    setMsgSalva(
      editandoId
        ? 'Alterações salvas. Pode continuar editando e salvar de novo.'
        : 'Área salva. Clique nela na lista para reabrir.',
    )
  }

  function novaAreaNomeada() {
    if (!ownerId) return
    setEditandoId(null)
    setNomeMalha('')
    setMsgSalva('')
    setErro('')
    setShowSalvarHint(true)
    persistPatch(() => areaVazia('embarcador', ownerIdRef.current))
    voltarBrasil()
  }

  function abrirMalhaSalva(m: AreaMalhaSalva) {
    setNomeMalha(m.nome)
    setEditandoId(m.id)
    setMsgSalva(`Mostrando “${m.nome}” no mapa. Para editar, ajuste e salve de novo.`)
    setErro('')
    setShowMalhas(true)
    persistPatch(() => ({
      ownerId: ownerIdRef.current,
      ownerKind: 'embarcador' as const,
      modo: m.modo,
      cidades: m.cidades,
      estados: m.estados,
      regioes: m.regioes,
      bairros: m.bairros,
      zonas: m.zonas,
      updatedAt: new Date().toISOString(),
    }))
    setModo(m.modo)
    if (m.modo === 'bairro') {
      const b = m.bairros[0]
      if (b?.municipioId) {
        void abrirBairros({
          id: b.municipioId,
          nome: b.municipioNome || '',
          uf: (b.uf as UfBr) || undefined,
        })
        return
      }
    }
    if (m.modo === 'zona') {
      const z = m.zonas[0]
      if (z?.municipioId) {
        void abrirZonas({
          id: z.municipioId,
          nome: z.municipioNome || '',
          uf: (z.uf as UfBr) || undefined,
        })
        return
      }
    }
    voltarBrasil()
  }

  function removerMalhaSalva(id: string) {
    persist(excluirMalha(db, id))
    if (editandoId === id) {
      setEditandoId(null)
      setNomeMalha('')
      setMsgSalva('Área excluída.')
    }
  }

  function aplicarCidades(cidades: CidadeAtendida[]) {
    if (!ownerId) return
    persist(setArea(db, { ...area, ownerId, ownerKind: 'embarcador', modo: 'cidade', cidades }))
  }

  useEffect(() => {
    void hydrateOrgTree().then(setTree)
    void hydrateAreaDb().then((remote) => {
      setDb((cur) => ({
        areas: { ...remote.areas, ...cur.areas },
        malhas: { ...remote.malhas, ...cur.malhas },
      }))
    })
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
      maxZoom: 14,
      zoomControl: true,
      preferCanvas: true,
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
          style: (feat) => {
            const uf = (feat as Feat | undefined)?.properties?.uf
            return styleEstado(uf, Boolean(uf && estadosRef.current.has(uf)))
          },
          onEachFeature: (feature, lyr) => {
            const p = (feature as Feat).properties
            const uf = p.uf
            lyr.bindTooltip(`${p.nome}${uf ? ` (${uf})` : ''}`, { sticky: true })
            lyr.on('click', () => {
              const m = modoRef.current
              if (!m) {
                setErro('Escolha Região, Estado, Cidade, Bairro ou Zona.')
                return
              }
              if (!uf) return
              setErro('')
              if (m === 'estado') persistPatchRef.current((a) => toggleEstado(a, uf))
              else if (m === 'regiao') {
                const r = regiaoDaUf(uf)
                if (r) persistPatchRef.current((a) => toggleRegiao(a, r))
              }
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
      regLayerRef.current = null
      bairroLayerRef.current = null
      zonaLabelsRef.current = null
      labelsRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  modoRef.current = modo
  ownerIdRef.current = ownerId

  async function mostrarCidadesBrasil() {
    const map = mapRef.current
    if (!map) return
    if (munLayerRef.current) {
      if (!map.hasLayer(munLayerRef.current)) munLayerRef.current.addTo(map)
      return
    }
    setCarregando('Carregando municípios do Brasil…')
    try {
      const fc = await carregarMalhaMunicipiosBrasil()
      const canvas = L.canvas({ padding: 0.5 })
      const layer = L.geoJSON(fc as GeoJSON.GeoJsonObject, {
        renderer: canvas,
        style: (feat) => {
          const id = (feat as Feat | undefined)?.properties?.id
          return id ? styleMun(id, idsRef.current.has(id)) : styleMun('', false)
        },
        onEachFeature: (feature, lyr) => {
          const p = (feature as Feat).properties
          lyr.bindTooltip(`${p.nome}${p.uf ? ` — ${p.uf}` : ''}`, { sticky: true })
          lyr.on('click', () => {
            const m = modoRef.current
            if (!m) return
            setErro('')
            if (m === 'cidade') {
              const center = (lyr as L.Polygon).getBounds?.().getCenter?.()
              persistPatchRef.current((a) =>
                toggleCidade(a, {
                  id: p.id,
                  nome: p.nome,
                  uf: p.uf || '',
                  lat: center?.lat,
                  lng: center?.lng,
                }),
              )
              return
            }
            if (m === 'bairro') {
              const b = (lyr as L.Polygon).getBounds?.()
              if (b?.isValid()) void abrirBairrosRef.current(p, b)
              return
            }
            if (m === 'zona') {
              const b = (lyr as L.Polygon).getBounds?.()
              if (b?.isValid()) void abrirZonasRef.current(p, b)
            }
          })
        },
      }).addTo(map)
      munLayerRef.current = layer
      setCarregando('')
    } catch {
      setCarregando('')
      setErro('Não foi possível carregar as cidades do Brasil. Verifique a internet.')
    }
  }
  mostrarCidadesRef.current = mostrarCidadesBrasil

  function limparRotulosZona() {
    zonaLabelsRef.current?.remove()
    zonaLabelsRef.current = null
  }

  async function abrirDivisaoIntramunicipal(
    p: GeoProps,
    tipoModo: 'bairro' | 'zona',
    bounds?: L.LatLngBounds,
  ) {
    const map = mapRef.current
    if (!map) return
    setMunAtiva({ id: p.id, nome: p.nome, uf: p.uf })
    setCarregando(
      tipoModo === 'zona'
        ? `Carregando zonas de ${p.nome}…`
        : p.id === MUN_SAO_PAULO_ID
          ? `Carregando distritos de ${p.nome}…`
          : `Carregando bairros de ${p.nome} (IBGE)…`,
    )
    try {
      const fc = await (tipoModo === 'zona'
        ? carregarMalhaZonas({ municipioId: p.id, uf: p.uf })
        : carregarMalhaBairros({ municipioId: p.id, uf: p.uf }))
      limparRotulosZona()
      bairroLayerRef.current?.remove()
      munLayerRef.current && map.hasLayer(munLayerRef.current) && map.removeLayer(munLayerRef.current)
      const idsAtivos = tipoModo === 'zona' ? zonaIdsRef.current : bairroIdsRef.current
      const layer = L.geoJSON(fc as GeoJSON.GeoJsonObject, {
        renderer: L.svg({ padding: 0.5 }),
        style: (feat) => {
          const props = (feat as Feat | undefined)?.properties
          const id = props?.id ?? ''
          return styleMun(
            id,
            props ? bairroEstaSel(props, idsAtivos) : false,
            props?.nome,
            props?.tipo,
            props?.zona,
          )
        },
        onEachFeature: (feature, lyr) => {
          const bp = (feature as Feat).properties
          if (tipoModo !== 'zona') {
            lyr.bindTooltip(bp.nome, {
              permanent: true,
              direction: 'center',
              className: bp.tipo === 'zona' ? 'area-zona-label' : 'area-bairro-label',
              opacity: 0.95,
            })
          } else {
            lyr.bindTooltip(bp.zona ? `${bp.nome} · ${bp.zona}` : bp.nome, { sticky: true })
          }
          lyr.on('click', () => {
            if (modoRef.current !== tipoModo) return
            const center = (lyr as L.Polygon).getBounds?.().getCenter?.()
            if (tipoModo === 'zona') {
              const item: BairroAtendido = {
                id: bp.zonaId || bp.id,
                nome: bp.zona || bp.nome,
                municipioId: p.id,
                municipioNome: p.nome,
                uf: bp.uf || p.uf || '',
                lat: center?.lat,
                lng: center?.lng,
              }
              persistPatchRef.current((a) => toggleZona(a, item))
              return
            }
            const item: BairroAtendido = {
              id: bp.id,
              nome: bp.nome,
              municipioId: p.id,
              municipioNome: p.nome,
              uf: bp.uf || p.uf || '',
              lat: center?.lat,
              lng: center?.lng,
            }
            persistPatchRef.current((a) => toggleBairro(a, item))
          })
        },
      }).addTo(map)
      bairroLayerRef.current = layer
      const zonas = centrosZonasSp(fc)
      if (zonas.length >= 2) {
        const group = L.layerGroup().addTo(map)
        zonaLabelsRef.current = group
        for (const z of zonas) {
          L.marker([z.lat, z.lng], {
            interactive: false,
            keyboard: false,
            zIndexOffset: 900,
            icon: L.divIcon({
              className: 'area-zona-pin',
              html: `<span>${escapeHtml(z.nome)}</span>`,
              iconSize: [0, 0],
              iconAnchor: [0, 0],
            }),
          }).addTo(group)
        }
      }
      const camada = layer.getBounds()
      if (camada.isValid()) map.fitBounds(camada.pad(0.06), { maxZoom: 13 })
      else if (bounds?.isValid()) map.fitBounds(bounds.pad(0.06), { maxZoom: 13 })
      setCarregando('')
    } catch {
      setCarregando('')
      setErro(
        tipoModo === 'zona'
          ? `Não há divisão suficiente para calcular zonas em ${p.nome}. Tente outra cidade ou marque o município em Cidade.`
          : `Não há divisão de bairro/distrito do IBGE para ${p.nome}. Tente outra cidade ou marque o município em Cidade.`,
      )
    }
  }

  async function abrirBairros(p: GeoProps, bounds?: L.LatLngBounds) {
    return abrirDivisaoIntramunicipal(p, 'bairro', bounds)
  }
  async function abrirZonas(p: GeoProps, bounds?: L.LatLngBounds) {
    return abrirDivisaoIntramunicipal(p, 'zona', bounds)
  }
  abrirBairrosRef.current = abrirBairros
  abrirZonasRef.current = abrirZonas

  async function mostrarRegioes() {
    const map = mapRef.current
    if (!map) return
    if (regLayerRef.current) {
      if (!map.hasLayer(regLayerRef.current)) regLayerRef.current.addTo(map)
      return
    }
    setCarregando('Carregando regiões do Brasil…')
    try {
      const fc = await carregarMalhaRegioes()
      const layer = L.geoJSON(fc as GeoJSON.GeoJsonObject, {
        style: (feat) => {
          const nome = (feat as Feat | undefined)?.properties?.nome ?? ''
          return styleRegiao(nome, regioesRef.current.has(nome))
        },
        onEachFeature: (feature, lyr) => {
          const p = (feature as Feat).properties
          lyr.bindTooltip(p.nome, { sticky: true })
          lyr.on('click', () => {
            if (modoRef.current !== 'regiao') return
            setErro('')
            persistPatchRef.current((a) => toggleRegiao(a, p.nome))
          })
        },
      }).addTo(map)
      regLayerRef.current = layer
      setCarregando('')
    } catch {
      setCarregando('')
      setErro('Não foi possível carregar as regiões. Clique no estado para marcar a região.')
    }
  }
  mostrarRegioesRef.current = mostrarRegioes

  /** Fecha a camada de bairro/zona aberta, sem mexer no zoom/posição do mapa. */
  function fecharCamadaMunicipio() {
    limparRotulosZona()
    bairroLayerRef.current?.remove()
    bairroLayerRef.current = null
    setMunAtiva(null)
    setUfAtiva(null)
  }

  function voltarBrasil() {
    fecharCamadaMunicipio()
    mapRef.current?.setView([-14.2, -51.9], 4)
  }

  function escolherModo(m: ModoMarcacaoArea) {
    setErro('')
    // Bairro <-> Zona são as duas "sub-visões" de uma mesma cidade: se já tem
    // uma cidade aberta, só troca a camada (bairro por zona ou vice-versa) em
    // vez de fechar tudo e voltar pra lista geral de cidades do Brasil.
    const trocaDentroDaMesmaCidade =
      (m === 'bairro' || m === 'zona') &&
      (modoRef.current === 'bairro' || modoRef.current === 'zona') &&
      munAtiva
    setModo(m)
    if (trocaDentroDaMesmaCidade && munAtiva) {
      const p: GeoProps = { id: munAtiva.id, nome: munAtiva.nome, uf: munAtiva.uf }
      if (m === 'zona') void abrirZonasRef.current(p)
      else void abrirBairrosRef.current(p)
    } else {
      // Só fecha a camada de bairro/zona aberta; mantém o zoom/posição atual
      // do mapa (trocar de modo não deve "sair fora" pra visão do Brasil).
      fecharCamadaMunicipio()
    }
    if (ownerId) {
      persist(setArea(db, { ...area, ownerId, ownerKind: 'embarcador', modo: m }))
    }
  }

  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    const ufs = ufsLayerRef.current
    const regs = regLayerRef.current
    const muns = munLayerRef.current
    const bairros = bairroLayerRef.current
    const hide = (lyr: L.GeoJSON | null) => {
      if (lyr && map.hasLayer(lyr)) map.removeLayer(lyr)
    }
    const show = (lyr: L.GeoJSON | null) => {
      if (lyr && !map.hasLayer(lyr)) lyr.addTo(map)
    }
    if (modo === 'regiao') {
      hide(ufs)
      hide(muns)
      hide(bairros)
      void mostrarRegioesRef.current()
    } else if (modo === 'estado') {
      hide(regs)
      hide(muns)
      hide(bairros)
      show(ufs)
    } else if (modo === 'cidade') {
      hide(ufs)
      hide(regs)
      hide(bairros)
      void mostrarCidadesRef.current()
    } else if (modo === 'bairro' || modo === 'zona') {
      hide(ufs)
      hide(regs)
      if (!munAtiva) {
        hide(bairros)
        void mostrarCidadesRef.current()
      }
    } else {
      hide(regs)
      hide(muns)
      hide(bairros)
      show(ufs)
    }
  }, [modo, munAtiva])

  useEffect(() => {
    const layer = munLayerRef.current
    if (!layer) return
    layer.eachLayer((lyr) => {
      const feat = (lyr as L.GeoJSON & { feature?: Feat }).feature
      const id = feat?.properties?.id
      if (!id) return
      ;(lyr as L.Path).setStyle(styleMun(id, idsSel.has(id)))
    })
  }, [idsSel])

  useEffect(() => {
    const layer = bairroLayerRef.current
    if (!layer) return
    const idsAtivos = modo === 'zona' ? idsZona : idsBairro
    layer.eachLayer((lyr) => {
      const feat = (lyr as L.GeoJSON & { feature?: Feat }).feature
      const id = feat?.properties?.id
      if (!id) return
      ;(lyr as L.Path).setStyle(
        styleMun(
          id,
          feat?.properties ? bairroEstaSel(feat.properties, idsAtivos) : idsAtivos.has(id),
          feat?.properties?.nome,
          feat?.properties?.tipo,
          feat?.properties?.zona,
        ),
      )
    })
  }, [idsBairro, idsZona, modo])

  useEffect(() => {
    const layer = ufsLayerRef.current
    if (!layer) return
    layer.eachLayer((lyr) => {
      const feat = (lyr as L.GeoJSON & { feature?: Feat }).feature
      const uf = feat?.properties?.uf
      if (modo === 'estado') {
        ;(lyr as L.Path).setStyle(styleEstado(uf, Boolean(uf && estadosRef.current.has(uf))))
      } else if (modo === 'cidade') {
        ;(lyr as L.Path).setStyle(styleEstado(uf, uf === ufAtiva))
      } else if (modo === 'regiao') {
        const r = uf ? regiaoDaUf(uf) : null
        ;(lyr as L.Path).setStyle(
          styleDivisao(
            (r && REGIAO_COR[r]) || '#94a3b8',
            Boolean(r && regioesRef.current.has(r)),
          ),
        )
      } else {
        ;(lyr as L.Path).setStyle(styleEstado(uf, false))
      }
    })
  }, [ufAtiva, modo, estadosSel, regioesSel])

  useEffect(() => {
    const layer = regLayerRef.current
    if (!layer) return
    layer.eachLayer((lyr) => {
      const feat = (lyr as L.GeoJSON & { feature?: Feat }).feature
      const nome = feat?.properties?.nome ?? ''
      ;(lyr as L.Path).setStyle(styleRegiao(nome, regioesRef.current.has(nome)))
    })
  }, [regioesSel])

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

  async function escolherSugestaoCidade(m: MunicipioCat) {
    setErro('')
    if (modo === 'bairro') {
      await abrirBairros({ id: m.id, nome: m.nome, uf: m.uf })
      return
    }
    if (modo === 'zona') {
      await abrirZonas({ id: m.id, nome: m.nome, uf: m.uf })
      return
    }
    if (modo !== 'cidade') {
      setErro('Escolha “Cidade” para marcar município.')
      return
    }
    persistPatch((a) =>
      a.cidades.some((c) => c.id === m.id)
        ? a
        : toggleCidade(a, { id: m.id, nome: m.nome, uf: m.uf, lat: m.lat, lng: m.lng }),
    )
    const map = mapRef.current
    if (map) {
      const achou = focarFeature(munLayerRef.current, map, (p) => p.id === m.id)
      if (!achou && Number.isFinite(m.lat) && Number.isFinite(m.lng)) {
        map.setView([m.lat, m.lng], 11)
      }
    }
  }

  function escolherSugestaoEstado(uf: UfBr) {
    persistPatch((a) => toggleEstado(a, uf))
    const map = mapRef.current
    if (map) focarFeature(ufsLayerRef.current, map, (p) => p.uf === uf)
  }

  function escolherSugestaoRegiao(r: string) {
    persistPatch((a) => toggleRegiao(a, r))
    const map = mapRef.current
    if (map) focarFeature(regLayerRef.current, map, (p) => p.nome === r)
  }

  const embarcadorNome = embarcadores.find((e) => e.id === ownerId)?.nome || 'Embarcador'
  const modoMeta = MODOS.find((x) => x.id === modo)
  const hint = modoMeta?.hint
  const fonteAtiva = modoMeta?.fonte
  const qtdLista =
    modo === 'estado'
      ? estadosSel.length
      : modo === 'regiao'
        ? regioesSel.length
        : modo === 'bairro'
          ? bairrosSel.length
          : modo === 'zona'
            ? zonasSel.length
            : selecionadas.length

  return (
    <div className="mapa-log__body">
      <aside className="mapa-log__side">
        {embarcadores.length > 1 ? (
          <section className="mapa-log__panel">
            <h2>Embarcador</h2>
            <select
              className="area-att-select"
              value={ownerId}
              onChange={(e) => {
                setOwnerId(e.target.value)
                setEditandoId(null)
                setNomeMalha('')
                setMsgSalva('')
              }}
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
          <h2>
            {modo === 'estado'
              ? 'Buscar estado'
              : modo === 'regiao'
                ? 'Buscar região'
                : modo === 'bairro'
                  ? 'Buscar cidade (bairros)'
                  : modo === 'zona'
                    ? 'Buscar cidade (zonas)'
                    : 'Buscar cidade'}
          </h2>
          <label className="area-att-search">
            <Search size={15} />
            <input
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder={
                modo === 'estado'
                  ? 'Ex.: São Paulo'
                  : modo === 'regiao'
                    ? 'Ex.: Sudeste'
                    : 'Ex.: Guarulhos'
              }
              disabled={!modo}
            />
            {busca ? (
              <button
                type="button"
                className="area-att-search-clear"
                title="Limpar busca"
                aria-label="Limpar busca"
                onClick={() => setBusca('')}
              >
                <X size={14} />
              </button>
            ) : null}
          </label>
          {(modo === 'cidade' || modo === 'bairro' || modo === 'zona') &&
          sugestoesCidade.length > 0 ? (
            <ul className="area-att-sug">
              {sugestoesCidade.map((m) => (
                <li key={m.id}>
                  <button type="button" onClick={() => void escolherSugestaoCidade(m)}>
                    {m.nome} — {m.uf}
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
          {modo === 'estado' && sugestoesEstado.length > 0 ? (
            <ul className="area-att-sug">
              {sugestoesEstado.map((uf) => (
                <li key={uf}>
                  <button type="button" onClick={() => escolherSugestaoEstado(uf)}>
                    {UF_CENTRO[uf].nome} — {uf}
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
          {modo === 'regiao' && sugestoesRegiao.length > 0 ? (
            <ul className="area-att-sug">
              {sugestoesRegiao.map((r) => (
                <li key={r}>
                  <button type="button" onClick={() => escolherSugestaoRegiao(r)}>
                    {r}
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </section>

        <section className="mapa-log__panel">
          <h2>
            <MapPin size={14} />{' '}
            {modo === 'estado'
              ? 'Estados na área'
              : modo === 'regiao'
                ? 'Regiões na área'
                : modo === 'bairro'
                  ? 'Bairros na área'
                  : modo === 'zona'
                    ? 'Zonas na área'
                    : 'Cidades na área'}
            <span className="area-att-count">{qtdLista}</span>
          </h2>
          <p className="mapa-log__empty" style={{ marginBottom: 8 }}>
            {embarcadorNome}
          </p>
          {modo === 'estado' ? (
            estadosSel.length === 0 ? (
              <p className="mapa-log__empty">Nenhum estado marcado.</p>
            ) : (
              <ul className="area-att-chips">
                {estadosSel
                  .slice()
                  .sort((a, b) => a.localeCompare(b, 'pt-BR'))
                  .map((uf) => (
                    <li key={uf}>
                      <button
                        type="button"
                        onClick={() => persistPatch((a) => toggleEstado(a, uf))}
                        title="Remover"
                      >
                        {UF_CENTRO[uf as UfBr]?.nome ?? uf} — {uf} ×
                      </button>
                    </li>
                  ))}
              </ul>
            )
          ) : modo === 'regiao' ? (
            regioesSel.length === 0 ? (
              <p className="mapa-log__empty">Nenhuma região marcada.</p>
            ) : (
              <ul className="area-att-chips">
                {regioesSel.map((r) => (
                  <li key={r}>
                    <button
                      type="button"
                      onClick={() => persistPatch((a) => toggleRegiao(a, r))}
                      title="Remover"
                    >
                      {r} ×
                    </button>
                  </li>
                ))}
              </ul>
            )
          ) : modo === 'bairro' ? (
            bairrosSel.length === 0 ? (
              <p className="mapa-log__empty">Nenhum bairro marcado.</p>
            ) : (
              <ul className="area-att-chips">
                {bairrosSel
                  .slice()
                  .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
                  .map((b) => (
                    <li key={b.id}>
                      <button
                        type="button"
                        onClick={() => persistPatch((a) => toggleBairro(a, b))}
                        title="Remover"
                      >
                        {b.nome}
                        {b.municipioNome ? ` · ${b.municipioNome}` : ''} ×
                      </button>
                    </li>
                  ))}
              </ul>
            )
          ) : modo === 'zona' ? (
            zonasSel.length === 0 ? (
              <p className="mapa-log__empty">Nenhuma zona marcada.</p>
            ) : (
              <ul className="area-att-chips">
                {zonasSel
                  .slice()
                  .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
                  .map((z) => (
                    <li key={z.id}>
                      <button
                        type="button"
                        onClick={() => persistPatch((a) => toggleZona(a, z))}
                        title="Remover"
                      >
                        {z.nome}
                        {z.municipioNome ? ` · ${z.municipioNome}` : ''} ×
                      </button>
                    </li>
                  ))}
              </ul>
            )
          ) : selecionadas.length === 0 ? (
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
          {qtdLista > 0 ? (
            <button
              type="button"
              className="area-att-clear"
              onClick={() => {
                if (modo === 'estado') persistPatch((a) => ({ ...a, estados: [] }))
                else if (modo === 'regiao') persistPatch((a) => ({ ...a, regioes: [] }))
                else if (modo === 'bairro') persistPatch((a) => ({ ...a, bairros: [] }))
                else if (modo === 'zona') persistPatch((a) => ({ ...a, zonas: [] }))
                else aplicarCidades([])
              }}
            >
              Limpar área
            </button>
          ) : null}
        </section>

        <section className="mapa-log__panel">
          <div className="area-att-info-head">
            <h2>Salvar minha malha</h2>
            <button
              type="button"
              className={`area-att-info${showSalvarHint ? ' is-on' : ''}`}
              aria-label="Como salvar a área"
              aria-expanded={showSalvarHint}
              title="Como salvar a área"
              onClick={() => setShowSalvarHint((v) => !v)}
            >
              <Info size={16} />
            </button>
          </div>
          {showSalvarHint ? (
            <div className="area-att-info-pop">
              <p className="mapa-log__empty" style={{ marginBottom: 6 }}>
                Área nova e limpa. Agora é só:
              </p>
              <ol className="area-att-passos">
                <li>
                  Escolha um modo lá em cima do mapa (Região, Estado, Cidade, Bairro ou Zona).
                </li>
                <li>Clique no mapa (ou use a busca) para marcar o recorte que você quer.</li>
                <li>Dê um nome aqui embaixo, em “Ex.: Grande São Paulo”.</li>
                <li>
                  Clique em <strong>Salvar área</strong>.
                </li>
              </ol>
            </div>
          ) : null}
          {editandoId ? (
            <p className="area-att-editando">Editando área salva</p>
          ) : null}
          <label className="area-att-search">
            <input
              value={nomeMalha}
              onChange={(e) => {
                setNomeMalha(e.target.value)
                setMsgSalva('')
              }}
              placeholder="Ex.: Grande São Paulo"
              maxLength={80}
            />
          </label>
          <div className="area-att-acoes">
            <button type="button" className="is-save" onClick={salvarAreaNomeada}>
              {editandoId ? 'Salvar alterações' : 'Salvar área'}
            </button>
            <button type="button" className="is-nova" onClick={novaAreaNomeada}>
              Nova
            </button>
          </div>
          {msgSalva ? <p className="area-att-ok">{msgSalva}</p> : null}
        </section>

        <section className="mapa-log__panel">
          <div className="area-att-info-head">
            <h2>Minhas áreas salvas</h2>
            <button
              type="button"
              className={`area-att-listar${showMalhas ? ' is-on' : ''}`}
              aria-expanded={showMalhas}
              title="Listar áreas salvas"
              onClick={() => setShowMalhas((v) => !v)}
            >
              <List size={14} />
              {showMalhas ? 'Ocultar' : 'Listar'}
              {malhasOwner.length > 0 ? ` (${malhasOwner.length})` : ''}
            </button>
          </div>
          {showMalhas ? (
            malhasOwner.length === 0 ? (
              <p className="mapa-log__empty">Nenhuma área salva ainda.</p>
            ) : (
              <ul className="area-att-malhas">
                {malhasOwner.map((m) => (
                  <li key={m.id} className={editandoId === m.id ? 'is-on' : undefined}>
                    <button
                      type="button"
                      className="area-att-malha-nome"
                      title="Mostrar esta área no mapa"
                      onClick={() => abrirMalhaSalva(m)}
                    >
                      <strong>{m.nome}</strong>
                      <em>
                        {MODO_AREA_LABEL[m.modo]} · {resumoMalha(m)}
                      </em>
                    </button>
                    <div className="area-att-malha-btns">
                      <button type="button" onClick={() => abrirMalhaSalva(m)}>
                        Editar
                      </button>
                      <button
                        type="button"
                        className="is-del"
                        onClick={() => removerMalhaSalva(m.id)}
                      >
                        Excluir
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )
          ) : (
            <p className="mapa-log__empty">
              Clique para ver as áreas que você já salvou e reabrir qualquer uma no mapa.
            </p>
          )}
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
            {REGIOES_BR.map((r) => (
              <i key={r} style={{ background: REGIAO_COR[r] }} />
            ))}{' '}
            Região
          </span>
          <span>
            {UFS_BR.slice(0, 6).map((uf) => (
              <i key={uf} style={{ background: UF_COR[uf] }} />
            ))}{' '}
            Estado
          </span>
          <span>
            <i style={{ background: 'hsl(28 58% 48%)' }} />
            <i style={{ background: 'hsl(168 58% 48%)' }} />
            <i style={{ background: 'hsl(262 58% 48%)' }} /> Cidade
          </span>
          <span>
            <i style={{ background: '#16a34a' }} />
            <i style={{ background: '#dc2626' }} />
            <i style={{ background: '#2563eb' }} /> Bairro / zona
          </span>
          {superView ? (
            <span>
              <i style={{ background: '#0f172a' }} /> Transportadora
            </span>
          ) : null}
        </div>
        <div className="area-att-map-top">
          <div className="area-att-mapmodos">
            {MODOS.map((op) => (
              <button
                key={op.id}
                type="button"
                className={`area-att-mapmodo${modo === op.id ? ' is-on' : ''}`}
                title={op.hint}
                onClick={() => escolherModo(op.id)}
              >
                {op.label}
              </button>
            ))}
            <button
              type="button"
              className={`area-att-info${showFontes ? ' is-on' : ''}`}
              aria-label="Como marcar a área"
              aria-expanded={showFontes}
              title="Como marcar a área"
              onClick={() => setShowFontes((v) => !v)}
            >
              <Info size={15} />
            </button>
          </div>
          {showFontes ? (
            <div className="area-att-info-pop">
              {modo ? (
                <p className="area-att-hint" style={{ marginTop: 0 }}>
                  {hint}
                  {fonteAtiva ? (
                    <>
                      <br />
                      <em>Fonte: {fonteAtiva}</em>
                    </>
                  ) : null}
                </p>
              ) : (
                <p className="mapa-log__empty" style={{ marginBottom: 8 }}>
                  Selecione Região, Estado, Cidade, Bairro ou Zona. Clique no mapa, dê um nome e
                  salve. Depois abra a área salva para editar do seu jeito.
                </p>
              )}
              <ul className="mapa-log__fontes">
                {FONTES_DIVISAO.map((f) => (
                  <li key={f.titulo}>
                    <strong>{f.titulo}</strong>
                    <span>{f.detalhe}</span>
                    <a href={f.href} target="_blank" rel="noreferrer">
                      Abrir documentação →
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          <div className="area-att-mapbar">
            {(modo === 'bairro' || modo === 'zona') && munAtiva ? (
              <button type="button" onClick={voltarBrasil}>
                ← Voltar às cidades do Brasil
              </button>
            ) : (
              <span>
                {modo === 'regiao'
                  ? 'Brasil inteiro · dividido por região'
                  : modo === 'estado'
                    ? 'Brasil inteiro · dividido por estado'
                    : modo === 'cidade'
                      ? 'Brasil inteiro · dividido por cidade'
                      : modo === 'bairro'
                        ? 'Brasil inteiro · clique na cidade para ver os bairros'
                        : modo === 'zona'
                          ? 'Brasil inteiro · clique na cidade para ver as zonas'
                          : 'Brasil · escolha Região, Estado, Cidade, Bairro ou Zona'}
                {fonteAtiva ? ` · Fonte: ${fonteAtiva}` : ''}
              </span>
            )}
            {carregando ? <em>{carregando}</em> : null}
            {erro ? <strong>{erro}</strong> : null}
          </div>
        </div>
      </div>
    </div>
  )
}
