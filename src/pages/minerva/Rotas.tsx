import { useEffect, useMemo, useRef, useState } from 'react'
import { useData } from '../../context/DataContext'
import { formatCurrency, moneyFromDigits } from '../../lib/businessRules'
import { newPontoPassagemId, newRotaId } from '../../lib/rotasSync'
import { buscarCidades, filtrarSugestoes } from '../../lib/cidadesBrasil'
import {
  enderecoPorCoordenadas,
  geocodificarConsulta,
  type EnderecoCampos,
} from '../../lib/geocodeEndereco'
import { fmtMapsCoords, parseMapsCoords } from '../../lib/mapsCoords'
import { rotaOsrmComGeometria } from '../../lib/anttPedagioAberto'
import { distanciaKm } from '../../lib/mapaFrota'
import type { ClassificacaoRota, PontoPassagemRota, Rota } from '../../types'
import { Button, Field, Modal, inputClass } from '../../components/ui/Modal'
import { AddressSuggestInput, PLACEHOLDER_ENDERECO_EXEMPLO } from '../../components/ui/AddressSuggestInput'
import { RotaMapPreview } from '../../components/carga/RotaMapPreview'

const emptyForm = (): Partial<Rota> => ({
  descricao: '',
  origem: '',
  destino: '',
  origem_lat: null,
  origem_lng: null,
  destino_lat: null,
  destino_lng: null,
  pontos_passagem: [],
  classificacao: 'B',
  frete_tabela: 0,
  km: 0,
  situacao: 'ativo',
})

function labelEndereco(dados: EnderecoCampos, display?: string): string {
  if (display?.trim()) return display.trim()
  const rua =
    dados.endereco && dados.numero
      ? `${dados.endereco}, ${dados.numero}`
      : dados.endereco || dados.numero || ''
  return [rua, dados.bairro, dados.cidade, dados.uf]
    .map((p) => (p || '').trim())
    .filter(Boolean)
    .join(', ')
}

function resumoTrajeto(r: Pick<Rota, 'origem' | 'destino' | 'pontos_passagem'>) {
  const vias = (r.pontos_passagem ?? [])
    .map((p) => p.endereco.trim())
    .filter(Boolean)
  if (vias.length === 0) return `${r.origem} → ${r.destino}`
  return `${r.origem} → ${vias.join(' → ')} → ${r.destino}`
}

export function RotasPage() {
  const { rotas, salvarRota } = useData()
  const [form, setForm] = useState<Partial<Rota>>(emptyForm)
  const [freteStr, setFreteStr] = useState('')
  const [kmStr, setKmStr] = useState('')
  const [origemMapsStr, setOrigemMapsStr] = useState('')
  const [destinoMapsStr, setDestinoMapsStr] = useState('')
  const [pontosMapsStr, setPontosMapsStr] = useState<Record<string, string>>({})
  const [geoInfo, setGeoInfo] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [mapaRota, setMapaRota] = useState<Rota | null>(null)
  const [search, setSearch] = useState('')

  const pontos = form.pontos_passagem ?? []

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return rotas
    return rotas.filter((r) => {
      const frete = String(r.frete_tabela ?? '')
      const km = String(r.km ?? '')
      const vias = (r.pontos_passagem ?? []).map((p) => p.endereco).join(' ')
      return (
        r.descricao.toLowerCase().includes(q) ||
        r.origem.toLowerCase().includes(q) ||
        r.destino.toLowerCase().includes(q) ||
        vias.toLowerCase().includes(q) ||
        `rota ${r.classificacao}`.toLowerCase().includes(q) ||
        r.classificacao.toLowerCase().includes(q) ||
        r.situacao.toLowerCase().includes(q) ||
        frete.includes(q) ||
        km.includes(q)
      )
    })
  }, [rotas, search])

  const skipGeoOrigem = useRef(false)
  const skipGeoDestino = useRef(false)
  const skipRevOrigem = useRef(false)
  const skipRevDestino = useRef(false)
  const skipGeoPontos = useRef<Set<string>>(new Set())
  const skipRevPontos = useRef<Set<string>>(new Set())
  const lastGeoPontoEndereco = useRef<Record<string, string>>({})
  const lastRevPontoMaps = useRef<Record<string, string>>({})
  const kmManual = useRef(false)

  function carregarForm(r?: Partial<Rota> | null) {
    kmManual.current = false
    skipGeoPontos.current = new Set()
    skipRevPontos.current = new Set()
    lastGeoPontoEndereco.current = {}
    lastRevPontoMaps.current = {}
    if (!r) {
      skipGeoOrigem.current = false
      skipGeoDestino.current = false
      skipRevOrigem.current = false
      skipRevDestino.current = false
      setForm(emptyForm())
      setFreteStr('')
      setKmStr('')
      setOrigemMapsStr('')
      setDestinoMapsStr('')
      setPontosMapsStr({})
      setGeoInfo('')
      return
    }
    const temOrigemCoords = r.origem_lat != null && r.origem_lng != null
    const temDestinoCoords = r.destino_lat != null && r.destino_lng != null
    skipGeoOrigem.current = temOrigemCoords
    skipGeoDestino.current = temDestinoCoords
    skipRevOrigem.current = temOrigemCoords
    skipRevDestino.current = temDestinoCoords
    const pts = (r.pontos_passagem ?? []).map((p) => ({
      ...p,
      id: p.id || newPontoPassagemId(),
    }))
    const maps: Record<string, string> = {}
    for (const p of pts) {
      const tem = p.lat != null && p.lng != null
      if (tem) {
        skipGeoPontos.current.add(p.id)
        skipRevPontos.current.add(p.id)
        maps[p.id] = fmtMapsCoords(p.lat, p.lng)
      }
    }
    kmManual.current =
      Boolean(r.km && r.km > 0) && temOrigemCoords && temDestinoCoords
    setForm({ ...r, pontos_passagem: pts })
    setFreteStr(
      r.frete_tabela && r.frete_tabela > 0
        ? moneyFromDigits(String(Math.round(r.frete_tabela * 100))).display
        : '',
    )
    setKmStr(r.km && r.km > 0 ? String(r.km) : '')
    setOrigemMapsStr(fmtMapsCoords(r.origem_lat, r.origem_lng))
    setDestinoMapsStr(fmtMapsCoords(r.destino_lat, r.destino_lng))
    setPontosMapsStr(maps)
    setGeoInfo('')
  }

  const sugOrigem = useMemo(
    () => (q: string) =>
      filtrarSugestoes(q, [buscarCidades(q, 10), rotas.map((x) => x.origem)], 10),
    [rotas],
  )
  const sugDestino = useMemo(
    () => (q: string) =>
      filtrarSugestoes(q, [buscarCidades(q, 10), rotas.map((x) => x.destino)], 10),
    [rotas],
  )
  const sugPonto = useMemo(
    () => (q: string) => {
      const vias = rotas.flatMap((x) =>
        (x.pontos_passagem ?? []).map((p) => p.endereco),
      )
      return filtrarSugestoes(
        q,
        [buscarCidades(q, 10), rotas.map((x) => x.origem), rotas.map((x) => x.destino), vias],
        10,
      )
    },
    [rotas],
  )

  function setPontos(next: PontoPassagemRota[]) {
    setForm((prev) => ({ ...prev, pontos_passagem: next }))
  }

  function adicionarPontoPassagem() {
    const id = newPontoPassagemId()
    kmManual.current = false
    setPontos([...pontos, { id, endereco: '', lat: null, lng: null }])
    setPontosMapsStr((prev) => ({ ...prev, [id]: '' }))
    setGeoInfo('Informe o endereço do ponto de passagem.')
  }

  function removerPontoPassagem(id: string) {
    kmManual.current = false
    setPontos(pontos.filter((p) => p.id !== id))
    setPontosMapsStr((prev) => {
      const next = { ...prev }
      delete next[id]
      return next
    })
    skipGeoPontos.current.delete(id)
    skipRevPontos.current.delete(id)
  }

  function atualizarPonto(id: string, patch: Partial<PontoPassagemRota>) {
    setForm((prev) => ({
      ...prev,
      pontos_passagem: (prev.pontos_passagem ?? []).map((p) =>
        p.id === id ? { ...p, ...patch } : p,
      ),
    }))
  }

  // Endereço origem → lat/lng
  useEffect(() => {
    const txt = (form.origem || '').trim()
    if (skipGeoOrigem.current) {
      skipGeoOrigem.current = false
      return
    }
    if (txt.length < 5) return
    let cancelled = false
    const timer = window.setTimeout(() => {
      void (async () => {
        setGeoInfo('Localizando origem…')
        const res = await geocodificarConsulta(txt)
        if (cancelled) return
        if (!res.ok) {
          setGeoInfo(`Origem: ${res.erro}`)
          return
        }
        skipRevOrigem.current = true
        setOrigemMapsStr(fmtMapsCoords(res.coords.lat, res.coords.lng))
        setForm((prev) => ({
          ...prev,
          origem_lat: res.coords.lat,
          origem_lng: res.coords.lng,
        }))
        setGeoInfo('Coordenadas da origem preenchidas.')
      })()
    }, 700)
    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [form.origem])

  // Endereço destino → lat/lng
  useEffect(() => {
    const txt = (form.destino || '').trim()
    if (skipGeoDestino.current) {
      skipGeoDestino.current = false
      return
    }
    if (txt.length < 5) return
    let cancelled = false
    const timer = window.setTimeout(() => {
      void (async () => {
        setGeoInfo('Localizando destino…')
        const res = await geocodificarConsulta(txt)
        if (cancelled) return
        if (!res.ok) {
          setGeoInfo(`Destino: ${res.erro}`)
          return
        }
        skipRevDestino.current = true
        setDestinoMapsStr(fmtMapsCoords(res.coords.lat, res.coords.lng))
        setForm((prev) => ({
          ...prev,
          destino_lat: res.coords.lat,
          destino_lng: res.coords.lng,
        }))
        setGeoInfo('Coordenadas do destino preenchidas.')
      })()
    }, 700)
    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [form.destino])

  // Endereços dos pontos de passagem → lat/lng
  useEffect(() => {
    const pendentes = pontos.filter((p) => {
      const end = p.endereco.trim()
      if (end.length < 5) return false
      if (skipGeoPontos.current.has(p.id)) {
        skipGeoPontos.current.delete(p.id)
        lastGeoPontoEndereco.current[p.id] = end
        return false
      }
      if (lastGeoPontoEndereco.current[p.id] === end && p.lat != null && p.lng != null) {
        return false
      }
      return true
    })
    if (pendentes.length === 0) return

    let cancelled = false
    const timer = window.setTimeout(() => {
      void (async () => {
        for (const p of pendentes) {
          if (cancelled) return
          const end = p.endereco.trim()
          setGeoInfo('Localizando ponto de passagem…')
          const res = await geocodificarConsulta(end)
          if (cancelled) return
          if (!res.ok) {
            setGeoInfo(`Ponto de passagem: ${res.erro}`)
            continue
          }
          lastGeoPontoEndereco.current[p.id] = end
          skipRevPontos.current.add(p.id)
          setPontosMapsStr((prev) => ({
            ...prev,
            [p.id]: fmtMapsCoords(res.coords.lat, res.coords.lng),
          }))
          setForm((prev) => ({
            ...prev,
            pontos_passagem: (prev.pontos_passagem ?? []).map((x) =>
              x.id === p.id
                ? { ...x, lat: res.coords.lat, lng: res.coords.lng }
                : x,
            ),
          }))
          setGeoInfo('Coordenadas do ponto de passagem preenchidas.')
        }
      })()
    }, 700)
    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- assinatura dos endereços
  }, [pontos.map((p) => `${p.id}:${p.endereco}`).join('|')])

  // Coordenadas Maps origem → endereço
  useEffect(() => {
    if (skipRevOrigem.current) {
      skipRevOrigem.current = false
      return
    }
    const parsed = parseMapsCoords(origemMapsStr)
    if (!parsed) return
    const { lat, lng } = parsed
    let cancelled = false
    const timer = window.setTimeout(() => {
      void (async () => {
        setGeoInfo('Buscando endereço da origem…')
        const res = await enderecoPorCoordenadas(lat, lng)
        if (cancelled) return
        if (!res.ok) {
          setForm((prev) => ({ ...prev, origem_lat: lat, origem_lng: lng }))
          setGeoInfo(`Origem: ${res.erro}`)
          return
        }
        skipGeoOrigem.current = true
        const label = labelEndereco(res.dados, res.display)
        setForm((prev) => ({
          ...prev,
          origem: label,
          origem_lat: lat,
          origem_lng: lng,
        }))
        setGeoInfo('Endereço da origem preenchido pelas coordenadas.')
      })()
    }, 500)
    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [origemMapsStr])

  // Coordenadas Maps destino → endereço
  useEffect(() => {
    if (skipRevDestino.current) {
      skipRevDestino.current = false
      return
    }
    const parsed = parseMapsCoords(destinoMapsStr)
    if (!parsed) return
    const { lat, lng } = parsed
    let cancelled = false
    const timer = window.setTimeout(() => {
      void (async () => {
        setGeoInfo('Buscando endereço do destino…')
        const res = await enderecoPorCoordenadas(lat, lng)
        if (cancelled) return
        if (!res.ok) {
          setForm((prev) => ({ ...prev, destino_lat: lat, destino_lng: lng }))
          setGeoInfo(`Destino: ${res.erro}`)
          return
        }
        skipGeoDestino.current = true
        const label = labelEndereco(res.dados, res.display)
        setForm((prev) => ({
          ...prev,
          destino: label,
          destino_lat: lat,
          destino_lng: lng,
        }))
        setGeoInfo('Endereço do destino preenchido pelas coordenadas.')
      })()
    }, 500)
    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [destinoMapsStr])

  // Coordenadas Maps dos pontos → endereço
  useEffect(() => {
    const ids = Object.keys(pontosMapsStr)
    if (ids.length === 0) return
    let cancelled = false
    const timer = window.setTimeout(() => {
      void (async () => {
        for (const id of ids) {
          if (cancelled) return
          const mapsVal = pontosMapsStr[id] || ''
          if (skipRevPontos.current.has(id)) {
            skipRevPontos.current.delete(id)
            lastRevPontoMaps.current[id] = mapsVal
            continue
          }
          if (lastRevPontoMaps.current[id] === mapsVal) continue
          const parsed = parseMapsCoords(mapsVal)
          if (!parsed) continue
          const { lat, lng } = parsed
          setGeoInfo('Buscando endereço do ponto de passagem…')
          const res = await enderecoPorCoordenadas(lat, lng)
          if (cancelled) return
          lastRevPontoMaps.current[id] = mapsVal
          if (!res.ok) {
            setForm((prev) => ({
              ...prev,
              pontos_passagem: (prev.pontos_passagem ?? []).map((x) =>
                x.id === id ? { ...x, lat, lng } : x,
              ),
            }))
            setGeoInfo(`Ponto de passagem: ${res.erro}`)
            continue
          }
          skipGeoPontos.current.add(id)
          const label = labelEndereco(res.dados, res.display)
          lastGeoPontoEndereco.current[id] = label
          setForm((prev) => ({
            ...prev,
            pontos_passagem: (prev.pontos_passagem ?? []).map((x) =>
              x.id === id ? { ...x, endereco: label, lat, lng } : x,
            ),
          }))
          setGeoInfo('Endereço do ponto preenchido pelas coordenadas.')
        }
      })()
    }, 500)
    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [Object.entries(pontosMapsStr).map(([k, v]) => `${k}:${v}`).join('|')])

  // Origem + vias + destino com coordenadas → KM automático
  useEffect(() => {
    const olat = form.origem_lat
    const olng = form.origem_lng
    const dlat = form.destino_lat
    const dlng = form.destino_lng
    if (
      olat == null ||
      olng == null ||
      dlat == null ||
      dlng == null ||
      !Number.isFinite(olat) ||
      !Number.isFinite(olng) ||
      !Number.isFinite(dlat) ||
      !Number.isFinite(dlng)
    ) {
      return
    }
    const vias = (form.pontos_passagem ?? []).filter(
      (p) =>
        p.lat != null &&
        p.lng != null &&
        Number.isFinite(p.lat) &&
        Number.isFinite(p.lng),
    )
    // Se há ponto sem coords ainda, espera
    const comEndereco = (form.pontos_passagem ?? []).filter(
      (p) => p.endereco.trim().length >= 5,
    )
    if (comEndereco.some((p) => p.lat == null || p.lng == null)) return

    if (kmManual.current) return

    let cancelled = false
    const timer = window.setTimeout(() => {
      void (async () => {
        setGeoInfo('Calculando distância…')
        const waypoints = vias.map((p) => ({ lat: p.lat!, lng: p.lng! }))
        const rota = await rotaOsrmComGeometria(
          { lat: olat, lng: olng },
          { lat: dlat, lng: dlng },
          { waypoints },
        )
        if (cancelled) return
        let km: number
        if (rota) {
          km = Math.max(1, Math.round(rota.distanciaKm))
          setGeoInfo(`Distância pela rota: ${km} km`)
        } else {
          let acc = 0
          const chain = [
            { lat: olat, lng: olng },
            ...waypoints,
            { lat: dlat, lng: dlng },
          ]
          for (let i = 0; i < chain.length - 1; i++) {
            acc += distanciaKm(
              chain[i].lat,
              chain[i].lng,
              chain[i + 1].lat,
              chain[i + 1].lng,
            )
          }
          km = Math.max(1, Math.round(acc))
          setGeoInfo(`Distância em linha reta (fallback): ${km} km`)
        }
        setKmStr(String(km))
        setForm((prev) => ({ ...prev, km }))
      })()
    }, 400)
    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [
    form.origem_lat,
    form.origem_lng,
    form.destino_lat,
    form.destino_lng,
    pontos.map((p) => `${p.id}:${p.lat}:${p.lng}`).join('|'),
  ])

  function save() {
    if (!form.descricao || !form.origem || !form.destino) return
    const pontosLimpos = (form.pontos_passagem ?? [])
      .filter((p) => p.endereco.trim())
      .map((p) => ({
        id: p.id || newPontoPassagemId(),
        endereco: p.endereco.trim(),
        lat: p.lat ?? null,
        lng: p.lng ?? null,
      }))
    const rota: Rota = {
      id: editingId ?? newRotaId(),
      descricao: form.descricao!,
      origem: form.origem!,
      destino: form.destino!,
      origem_lat: form.origem_lat ?? null,
      origem_lng: form.origem_lng ?? null,
      destino_lat: form.destino_lat ?? null,
      destino_lng: form.destino_lng ?? null,
      pontos_passagem: pontosLimpos,
      classificacao: (form.classificacao as ClassificacaoRota) ?? 'B',
      frete_tabela: Number(form.frete_tabela) || 0,
      km: Number(form.km) || 0,
      situacao: (form.situacao as 'ativo' | 'inativo') ?? 'ativo',
    }
    salvarRota(rota)
    setEditingId(null)
    carregarForm(null)
  }

  const waypointsPreview = pontos
    .map((p) => p.endereco.trim())
    .filter((a) => a.length >= 3)

  return (
    <div className="w-full space-y-6 animate-fade-up">
      <header>
        <h2 className="font-display text-2xl font-bold">Rotas de Frete</h2>
        <p className="text-sm text-ink-muted">
          Cadastro de rotas de frete com classificação ABC e pontos de passagem.
        </p>
      </header>

      <div className="cadastro-toolbar">
        <input
          className="cadastro-search"
          placeholder="Pesquisar rota..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <div className="cadastro-table-wrap cadastro-table-wrap--scroll">
        <table className="cadastro-table">
          <thead>
            <tr>
              <th>Descrição</th>
              <th>Classificação</th>
              <th>Frete Sugestão</th>
              <th>KM</th>
              <th>Situação</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {filtered.map((r) => (
              <tr key={r.id}>
                <td>
                  <p className="font-medium">{r.descricao}</p>
                  <p className="text-xs text-ink-muted">{resumoTrajeto(r)}</p>
                </td>
                <td>
                  <span
                    className={`rounded px-2 py-0.5 text-xs font-bold text-white ${
                      r.classificacao === 'A'
                        ? 'bg-emerald-500'
                        : r.classificacao === 'B'
                          ? 'bg-amber-500'
                          : 'bg-brand'
                    }`}
                  >
                    Rota {r.classificacao}
                  </span>
                </td>
                <td>{formatCurrency(r.frete_tabela)}</td>
                <td>{r.km}</td>
                <td className="capitalize">{r.situacao}</td>
                <td>
                  <div className="flex flex-wrap items-center justify-end gap-2">
                    <button
                      type="button"
                      className="rounded-md border border-ink/20 bg-white px-2 py-1 text-xs font-bold text-ink hover:bg-ink/5"
                      onClick={() => setMapaRota(r)}
                    >
                      Ver mapa
                    </button>
                    <button
                      type="button"
                      className="text-xs font-semibold text-ink hover:underline"
                      onClick={() => {
                        setEditingId(r.id)
                        carregarForm(r)
                      }}
                    >
                      Editar
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-ink-muted">
                  Nenhuma rota encontrada.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <Modal
        open={Boolean(mapaRota)}
        title={mapaRota ? `Mapa — ${mapaRota.descricao}` : 'Mapa da rota'}
        onClose={() => setMapaRota(null)}
        wide
      >
        {mapaRota && (
          <div className="space-y-2">
            <p className="text-xs text-ink-muted">
              {resumoTrajeto(mapaRota)}
              {mapaRota.km > 0 ? ` · ${mapaRota.km} km cadastrados` : ''}
            </p>
            <RotaMapPreview
              key={mapaRota.id}
              origem={mapaRota.origem}
              destino={mapaRota.destino}
              waypoints={(mapaRota.pontos_passagem ?? []).map((p) => p.endereco)}
              className="h-[360px] min-h-[360px] w-full"
            />
          </div>
        )}
      </Modal>

      <div className="rounded-xl border border-ink/10 bg-white p-4">
        <h3 className="mb-3 font-display font-semibold">
          {editingId ? 'Editar rota' : 'Nova rota'}
        </h3>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Descrição">
            <input
              className={inputClass}
              value={form.descricao ?? ''}
              onChange={(e) => setForm({ ...form, descricao: e.target.value })}
            />
          </Field>
          <Field label="Classificação">
            <select
              className={inputClass}
              value={form.classificacao}
              onChange={(e) =>
                setForm({ ...form, classificacao: e.target.value as ClassificacaoRota })
              }
            >
              <option value="A">A</option>
              <option value="B">B</option>
              <option value="C">C</option>
            </select>
          </Field>
          <Field label="Origem">
            <AddressSuggestInput
              value={form.origem ?? ''}
              onChange={(origem) => {
                kmManual.current = false
                setForm({ ...form, origem })
              }}
              localSuggestions={sugOrigem}
              minChars={2}
              placeholder={PLACEHOLDER_ENDERECO_EXEMPLO}
            />
          </Field>
          <Field label="Destino">
            <AddressSuggestInput
              value={form.destino ?? ''}
              onChange={(destino) => {
                kmManual.current = false
                setForm({ ...form, destino })
              }}
              localSuggestions={sugDestino}
              minChars={2}
              placeholder={PLACEHOLDER_ENDERECO_EXEMPLO}
            />
          </Field>
          <Field label="Coordenadas origem (Maps)">
            <input
              className={inputClass}
              inputMode="text"
              placeholder="-23.5613545,-46.6590692,17"
              value={origemMapsStr}
              onChange={(e) => {
                kmManual.current = false
                setOrigemMapsStr(e.target.value)
              }}
            />
            <p className="mt-1 text-[11px] text-ink-muted">
              Cole lat,lng ou lat,lng,zoom do Google Maps.
            </p>
          </Field>
          <Field label="Coordenadas destino (Maps)">
            <input
              className={inputClass}
              inputMode="text"
              placeholder="-22.9068470,-43.1728970,17"
              value={destinoMapsStr}
              onChange={(e) => {
                kmManual.current = false
                setDestinoMapsStr(e.target.value)
              }}
            />
            <p className="mt-1 text-[11px] text-ink-muted">
              Cole lat,lng ou lat,lng,zoom do Google Maps.
            </p>
          </Field>

          <div className="sm:col-span-2 rounded-lg border border-dashed border-ink/20 bg-ink/[0.02] p-3">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-sm font-bold text-ink">Pontos de passagem</p>
                <p className="text-[11px] text-ink-muted">
                  Opcional: endereços intermediários entre origem e destino.
                </p>
              </div>
              <button
                type="button"
                className="rounded-md border border-ink/20 bg-white px-3 py-1.5 text-xs font-bold text-ink hover:bg-ink/5"
                onClick={adicionarPontoPassagem}
              >
                + Adicionar ponto
              </button>
            </div>

            {pontos.length === 0 ? (
              <p className="text-xs text-ink-muted">
                Rota direta A → B. Clique em “Adicionar ponto” se quiser incluir
                paradas no caminho.
              </p>
            ) : (
              <div className="space-y-3">
                {pontos.map((p, idx) => (
                  <div
                    key={p.id}
                    className="grid gap-3 rounded-md border border-ink/10 bg-white p-3 sm:grid-cols-2"
                  >
                    <Field label={`Ponto ${idx + 1} — endereço`}>
                      <AddressSuggestInput
                        value={p.endereco}
                        onChange={(endereco) => {
                          kmManual.current = false
                          atualizarPonto(p.id, { endereco, lat: null, lng: null })
                        }}
                        localSuggestions={sugPonto}
                        minChars={2}
                        placeholder={PLACEHOLDER_ENDERECO_EXEMPLO}
                      />
                    </Field>
                    <Field label={`Ponto ${idx + 1} — coordenadas (Maps)`}>
                      <div className="flex gap-2">
                        <input
                          className={inputClass}
                          inputMode="text"
                          placeholder="-23.5613545,-46.6590692,17"
                          value={pontosMapsStr[p.id] ?? ''}
                          onChange={(e) => {
                            kmManual.current = false
                            setPontosMapsStr((prev) => ({
                              ...prev,
                              [p.id]: e.target.value,
                            }))
                          }}
                        />
                        <button
                          type="button"
                          className="shrink-0 rounded-md border border-red-200 px-2 text-xs font-bold text-red-700 hover:bg-red-50"
                          onClick={() => removerPontoPassagem(p.id)}
                          title="Remover ponto"
                        >
                          Remover
                        </button>
                      </div>
                    </Field>
                  </div>
                ))}
              </div>
            )}
          </div>

          <Field label="Frete Sugestão">
            <input
              className={inputClass}
              inputMode="decimal"
              placeholder="0,00"
              value={freteStr}
              onChange={(e) => {
                const digits = e.target.value.replace(/\D/g, '')
                if (!digits) {
                  setFreteStr('')
                  setForm({ ...form, frete_tabela: 0 })
                  return
                }
                const { display, value } = moneyFromDigits(digits)
                setFreteStr(display)
                setForm({ ...form, frete_tabela: value })
              }}
            />
          </Field>
          <Field label="KM">
            <input
              className={inputClass}
              inputMode="decimal"
              placeholder="0"
              value={kmStr}
              onChange={(e) => {
                const raw = e.target.value.replace(/[^\d.,]/g, '')
                kmManual.current = true
                setKmStr(raw)
                const n = Number(raw.replace(',', '.'))
                setForm({ ...form, km: Number.isFinite(n) ? n : 0 })
              }}
            />
          </Field>
        </div>
        {geoInfo ? (
          <p className="mt-2 text-xs text-ink-muted">{geoInfo}</p>
        ) : null}
        <div className="mt-4">
          <p className="mb-2 text-xs font-bold text-ink">Mapa da rota</p>
          <RotaMapPreview
            key={`${editingId ?? 'nova'}|${form.origem ?? ''}|${form.destino ?? ''}|${waypointsPreview.join('|')}|${form.origem_lat ?? ''}|${form.destino_lat ?? ''}`}
            origem={form.origem ?? ''}
            destino={form.destino ?? ''}
            waypoints={waypointsPreview}
            className="h-[280px] min-h-[280px] w-full"
          />
        </div>
        <Button variant="success" className="mt-4" onClick={save}>
          {editingId ? 'Salvar' : 'Adicionar'}
        </Button>
      </div>
    </div>
  )
}
