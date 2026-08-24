import { useEffect, useMemo, useRef, useState } from 'react'
import { ChevronDown, ChevronUp, Plus, Trash2 } from 'lucide-react'
import { isCargaEphemeral, useData } from '../../context/DataContext'
import {
  formatCurrency,
  formatMoneyInput,
  parseMoneyInput,
} from '../../lib/businessRules'
import {
  asSeqDistribuicao,
  flagSim,
  labelTipoOferta,
} from '../../lib/cargaDefaults'
import { buscarCidades, filtrarSugestoes } from '../../lib/cidadesBrasil'
import { cnpjDigits, formatCnpj, isValidCnpj } from '../../lib/cnpj'
import { buscarDadosPorCnpj, montarEnderecoCnpj } from '../../lib/cnpjLookup'
import { TIPOS_CARGA } from '../../lib/tiposCarga'
import { GRUPOS_VEICULO_DISTRIBUICAO, isVeiculoPesado } from '../../lib/tiposVeiculo'
import type { Carga, PontoPassagemRota, SeqDistribuicao } from '../../types'
import { Button, Field, inputClass } from '../ui/Modal'
import { CargaExigenciasFields } from './CargaExigenciasFields'
import {
  MARCA_SEM_ESPECIFICA,
  MODELO_SEM_ESPECIFICO,
  MODELOS_LOCALIZADOR,
  MODELOS_RASTREADOR,
  labelFaixaTemperatura,
  labelModeloRisco,
} from '../../lib/cargaExigencias'
import { CnpjInput } from '../ui/CnpjInput'
import { SuggestInput } from '../ui/SuggestInput'
import {
  AddressSuggestInput,
  PLACEHOLDER_ENDERECO_EXEMPLO,
} from '../ui/AddressSuggestInput'
import { VeiculoSuggestInput } from '../ui/VeiculoSuggestInput'
import { RotaMapPreview } from './RotaMapPreview'
import { fmtMapsCoords, parseMapsCoords } from '../../lib/mapsCoords'
import {
  enderecoPorCoordenadas,
  geocodificarConsulta,
  type EnderecoCampos,
  type SugestaoEndereco,
} from '../../lib/geocodeEndereco'
import { newPontoPassagemId } from '../../lib/rotasSync'
import {
  cidadesParaForm,
  clientesParaForm,
  emptyCidadeDistForm,
  emptyClienteDistForm,
  formParaCidades,
  formParaClientes,
  seqInicial,
  type CidadeDistForm,
  type ClienteDistForm,
} from '../../lib/distribuicaoForm'

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

function reordenarPontos<T>(lista: T[], indice: number, direcao: -1 | 1): T[] {
  const destino = indice + direcao
  if (destino < 0 || destino >= lista.length) return lista
  const next = [...lista]
  const [item] = next.splice(indice, 1)
  next.splice(destino, 0, item)
  return next
}

function toDateInput(iso: string) {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function fromDateInput(value: string) {
  if (!value) return new Date().toISOString()
  const d = new Date(`${value}T12:00:00`)
  return d.toISOString()
}

type Props = {
  carga: Carga
  canEdit: boolean
  onSaved?: () => void
  onGoPublish?: () => void
  onPersisted?: (carga: Carga, opts?: { irParaPublicar?: boolean }) => void
}

export function CargaDistribuicaoDados({
  carga,
  canEdit,
  onSaved,
  onGoPublish,
  onPersisted,
}: Props) {
  const { cargas, atualizarCarga, criarCarga } = useData()
  const editavel = canEdit && carga.status === 'nova_carga'

  const [numeroCarga, setNumeroCarga] = useState(carga.numero)
  const [veiculo, setVeiculo] = useState(
    isVeiculoPesado(carga.veiculo) ? '' : carga.veiculo,
  )
  const [numEntregas, setNumEntregas] = useState(String(carga.num_entregas || 1))
  const [qtdNfs, setQtdNfs] = useState(String(carga.qtd_nfs || 1))
  const [peso, setPeso] = useState(formatMoneyInput(carga.peso || 0))
  const [valorMerc, setValorMerc] = useState(
    formatMoneyInput(carga.valor_mercadorias || 0),
  )
  const [volumes, setVolumes] = useState(String(carga.volumes || 0))
  const [tipoCarga, setTipoCarga] = useState(carga.tipo_carga)
  const [risco, setRisco] = useState<NonNullable<Carga['gerenciamento_risco']>>(
    carga.gerenciamento_risco ?? 'nao',
  )
  const [marcaRastreador, setMarcaRastreador] = useState(
    carga.marca_rastreador || MARCA_SEM_ESPECIFICA,
  )
  const [marcaLocalizador, setMarcaLocalizador] = useState(
    carga.marca_localizador || MARCA_SEM_ESPECIFICA,
  )
  const [modeloRastreador, setModeloRastreador] = useState(
    carga.modelo_rastreador || MODELO_SEM_ESPECIFICO,
  )
  const [modeloLocalizador, setModeloLocalizador] = useState(
    carga.modelo_localizador || MODELO_SEM_ESPECIFICO,
  )
  const [tempMin, setTempMin] = useState<number | undefined>(carga.temp_min)
  const [tempMax, setTempMax] = useState<number | undefined>(carga.temp_max)
  const [exigeAjudante, setExigeAjudante] = useState(Boolean(carga.exige_ajudante))
  const [origem, setOrigem] = useState(carga.origem)
  const [origemLat, setOrigemLat] = useState<number | null>(carga.origem_lat ?? null)
  const [origemLng, setOrigemLng] = useState<number | null>(carga.origem_lng ?? null)
  const [origemMapsStr, setOrigemMapsStr] = useState(
    fmtMapsCoords(carga.origem_lat, carga.origem_lng),
  )
  const [retornaOrigem, setRetornaOrigem] = useState(flagSim(carga.retorna_origem))
  const [seqDistribuicao, setSeqDistribuicao] = useState<SeqDistribuicao | null>(() =>
    seqInicial(carga.seq_distribuicao, carga.clientes_distribuicao ?? []),
  )
  const [clientesDist, setClientesDist] = useState<ClienteDistForm[]>(() =>
    clientesParaForm(carga.clientes_distribuicao ?? []),
  )
  const [cidadesDist, setCidadesDist] = useState<CidadeDistForm[]>(() =>
    cidadesParaForm(carga.clientes_distribuicao ?? []),
  )
  const [dataCarreg, setDataCarreg] = useState(toDateInput(carga.data_carregamento))
  const [previsao, setPrevisao] = useState(toDateInput(carga.previsao_entrega))
  const [observacao, setObservacao] = useState(carga.observacao ?? '')
  const [error, setError] = useState('')
  const [info, setInfo] = useState('')

  const skipGeoOrigem = useRef(false)
  const skipRevOrigem = useRef(false)
  const skipRevClientes = useRef<Record<string, boolean>>({})
  const skipRevCidades = useRef<Record<string, boolean>>({})
  const ultimoCnpjCliente = useRef<Record<string, string>>({})
  const cnpjTimers = useRef<Record<string, number>>({})

  useEffect(() => {
    const temO =
      carga.origem_lat != null &&
      carga.origem_lng != null &&
      Number.isFinite(carga.origem_lat) &&
      Number.isFinite(carga.origem_lng)
    skipGeoOrigem.current = temO
    skipRevOrigem.current = temO
    setNumeroCarga(carga.numero)
    setVeiculo(isVeiculoPesado(carga.veiculo) ? '' : carga.veiculo)
    setNumEntregas(String(carga.num_entregas || 1))
    setQtdNfs(String(carga.qtd_nfs || 1))
    setPeso(formatMoneyInput(carga.peso || 0))
    setValorMerc(formatMoneyInput(carga.valor_mercadorias || 0))
    setVolumes(String(carga.volumes || 0))
    setTipoCarga(carga.tipo_carga)
    setRisco(carga.gerenciamento_risco ?? 'nao')
    setMarcaRastreador(carga.marca_rastreador || MARCA_SEM_ESPECIFICA)
    setMarcaLocalizador(carga.marca_localizador || MARCA_SEM_ESPECIFICA)
    setModeloRastreador(carga.modelo_rastreador || MODELO_SEM_ESPECIFICO)
    setModeloLocalizador(carga.modelo_localizador || MODELO_SEM_ESPECIFICO)
    setTempMin(carga.temp_min)
    setTempMax(carga.temp_max)
    setExigeAjudante(Boolean(carga.exige_ajudante))
    setOrigem(carga.origem)
    setOrigemLat(carga.origem_lat ?? null)
    setOrigemLng(carga.origem_lng ?? null)
    setOrigemMapsStr(fmtMapsCoords(carga.origem_lat, carga.origem_lng))
    setRetornaOrigem(flagSim(carga.retorna_origem))
    setSeqDistribuicao(
      seqInicial(carga.seq_distribuicao, carga.clientes_distribuicao ?? []),
    )
    setClientesDist(clientesParaForm(carga.clientes_distribuicao ?? []))
    setCidadesDist(cidadesParaForm(carga.clientes_distribuicao ?? []))
    setDataCarreg(toDateInput(carga.data_carregamento))
    setPrevisao(toDateInput(carga.previsao_entrega))
    setObservacao(carga.observacao ?? '')
    setError('')
    setInfo('')
    ultimoCnpjCliente.current = {}
  }, [carga.id, carga.updated_at])

  const historico = useMemo(() => {
    const outras = cargas.filter((c) => c.id !== carga.id)
    return {
      origem: outras.map((c) => c.origem),
      tipo: outras.map((c) => c.tipo_carga),
      peso: outras.map((c) => (c.peso > 0 ? formatMoneyInput(c.peso) : '')),
      volumes: outras.map((c) => (c.volumes > 0 ? String(c.volumes) : '')),
      entregas: outras.map((c) =>
        c.num_entregas > 0 ? String(c.num_entregas) : '',
      ),
      nfs: outras.map((c) => (c.qtd_nfs && c.qtd_nfs > 0 ? String(c.qtd_nfs) : '')),
      valorMerc: outras.map((c) =>
        c.valor_mercadorias > 0 ? formatMoneyInput(c.valor_mercadorias) : '',
      ),
      obs: outras.map((c) => c.observacao),
    }
  }, [cargas, carga.id])

  const sugOrigem = useMemo(
    () => (q: string) =>
      filtrarSugestoes(q, [buscarCidades(q, 14), historico.origem], 14),
    [historico.origem],
  )
  const sugTipo = useMemo(
    () => (q: string) => {
      const catalog = [...TIPOS_CARGA]
      const qt = q.trim()
      if (!qt) return catalog
      const exact = catalog.some((t) => t.toLowerCase() === qt.toLowerCase())
      if (exact) return catalog
      const matched = filtrarSugestoes(qt, [catalog], 20)
      if (matched.length === 0) return catalog
      return filtrarSugestoes(qt, [catalog, historico.tipo], 20)
    },
    [historico.tipo],
  )
  const sugPeso = useMemo(
    () => (q: string) => filtrarSugestoes(q, [historico.peso], 8),
    [historico.peso],
  )
  const sugVolumes = useMemo(
    () => (q: string) => filtrarSugestoes(q, [historico.volumes], 8),
    [historico.volumes],
  )
  const sugEntregas = useMemo(
    () => (q: string) => filtrarSugestoes(q, [historico.entregas], 8),
    [historico.entregas],
  )
  const sugNfs = useMemo(
    () => (q: string) => filtrarSugestoes(q, [historico.nfs], 8),
    [historico.nfs],
  )
  const sugValorMerc = useMemo(
    () => (q: string) => filtrarSugestoes(q, [historico.valorMerc], 8),
    [historico.valorMerc],
  )
  const sugObs = useMemo(
    () => (q: string) => filtrarSugestoes(q, [historico.obs], 8),
    [historico.obs],
  )
  const sugCidade = useMemo(
    () => (q: string) => buscarCidades(q, 14),
    [],
  )

  const modoClientes = seqDistribuicao === 'clientes'
  const modoCidades = seqDistribuicao === 'cidades'

  const rotaMapa = useMemo(() => {
    const rows = modoCidades
      ? cidadesDist.map((c) => ({
          id: c.id,
          endereco: c.cidade,
          lat: c.lat,
          lng: c.lng,
        }))
      : clientesDist.map((c) => ({
          id: c.id,
          endereco: c.endereco || c.nome,
          lat: c.lat,
          lng: c.lng,
        }))
    const filled = rows.filter(
      (r) => r.endereco.trim() || (r.lat != null && r.lng != null),
    )
    if (retornaOrigem) {
      return {
        destino: origem,
        destinoLat: origemLat,
        destinoLng: origemLng,
        waypoints: filled,
      }
    }
    const last = filled[filled.length - 1]
    return {
      destino: last?.endereco || origem,
      destinoLat: last?.lat ?? null,
      destinoLng: last?.lng ?? null,
      waypoints: filled.slice(0, -1),
    }
  }, [
    modoCidades,
    cidadesDist,
    clientesDist,
    retornaOrigem,
    origem,
    origemLat,
    origemLng,
  ])

  useEffect(() => {
    if (!editavel) return
    const txt = origem.trim()
    if (skipGeoOrigem.current) {
      skipGeoOrigem.current = false
      return
    }
    if (txt.length < 5) return
    let cancelled = false
    const timer = window.setTimeout(() => {
      void (async () => {
        const res = await geocodificarConsulta(txt)
        if (cancelled || !res.ok) return
        skipRevOrigem.current = true
        setOrigemLat(res.coords.lat)
        setOrigemLng(res.coords.lng)
        setOrigemMapsStr(fmtMapsCoords(res.coords.lat, res.coords.lng))
      })()
    }, 700)
    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [origem, editavel])

  useEffect(() => {
    if (!editavel) return
    if (skipRevOrigem.current) {
      skipRevOrigem.current = false
      return
    }
    const parsed = parseMapsCoords(origemMapsStr)
    if (!parsed) return
    let cancelled = false
    const timer = window.setTimeout(() => {
      void (async () => {
        const res = await enderecoPorCoordenadas(parsed.lat, parsed.lng)
        if (cancelled) return
        setOrigemLat(parsed.lat)
        setOrigemLng(parsed.lng)
        if (!res.ok) return
        skipGeoOrigem.current = true
        setOrigem(labelEndereco(res.dados, res.display))
      })()
    }, 500)
    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [origemMapsStr, editavel])

  useEffect(() => {
    if (!editavel || !modoClientes) return
    const timers: number[] = []
    for (const c of clientesDist) {
      const txt = (c.endereco || '').trim()
      if (txt.length < 5) continue
      if (c.lat != null && c.lng != null) continue
      const id = c.id
      const t = window.setTimeout(() => {
        void (async () => {
          const res = await geocodificarConsulta(txt)
          if (!res.ok) return
          skipRevClientes.current[id] = true
          setClientesDist((prev) =>
            prev.map((x) =>
              x.id === id
                ? {
                    ...x,
                    lat: res.coords.lat,
                    lng: res.coords.lng,
                    mapsStr: fmtMapsCoords(res.coords.lat, res.coords.lng),
                  }
                : x,
            ),
          )
        })()
      }, 700)
      timers.push(t)
    }
    return () => {
      for (const t of timers) window.clearTimeout(t)
    }
  }, [clientesDist, editavel, modoClientes])

  useEffect(() => {
    if (!editavel || !modoClientes) return
    const timers: number[] = []
    for (const c of clientesDist) {
      if (skipRevClientes.current[c.id]) {
        skipRevClientes.current[c.id] = false
        continue
      }
      const parsed = parseMapsCoords(c.mapsStr)
      if (!parsed) continue
      const same =
        c.lat != null &&
        c.lng != null &&
        Math.abs(c.lat - parsed.lat) < 1e-5 &&
        Math.abs(c.lng - parsed.lng) < 1e-5
      if (same && (c.endereco || '').trim().length >= 5) continue
      const id = c.id
      const t = window.setTimeout(() => {
        void (async () => {
          setClientesDist((prev) =>
            prev.map((x) =>
              x.id === id ? { ...x, lat: parsed.lat, lng: parsed.lng } : x,
            ),
          )
          const res = await enderecoPorCoordenadas(parsed.lat, parsed.lng)
          if (!res.ok) return
          setClientesDist((prev) =>
            prev.map((x) => {
              if (x.id !== id) return x
              if ((x.endereco || '').trim().length >= 5) return x
              return { ...x, endereco: labelEndereco(res.dados, res.display) }
            }),
          )
        })()
      }, 500)
      timers.push(t)
    }
    return () => {
      for (const t of timers) window.clearTimeout(t)
    }
  }, [clientesDist, editavel, modoClientes])

  useEffect(() => {
    if (!editavel || !modoCidades) return
    const timers: number[] = []
    for (const c of cidadesDist) {
      const txt = (c.cidade || '').trim()
      if (txt.length < 3) continue
      if (c.lat != null && c.lng != null) continue
      const id = c.id
      const t = window.setTimeout(() => {
        void (async () => {
          const res = await geocodificarConsulta(`${txt}, Brasil`)
          if (!res.ok) return
          skipRevCidades.current[id] = true
          setCidadesDist((prev) =>
            prev.map((x) =>
              x.id === id
                ? {
                    ...x,
                    lat: res.coords.lat,
                    lng: res.coords.lng,
                    mapsStr: fmtMapsCoords(res.coords.lat, res.coords.lng),
                  }
                : x,
            ),
          )
        })()
      }, 700)
      timers.push(t)
    }
    return () => {
      for (const t of timers) window.clearTimeout(t)
    }
  }, [cidadesDist, editavel, modoCidades])

  useEffect(() => {
    if (!editavel || !modoCidades) return
    const timers: number[] = []
    for (const c of cidadesDist) {
      if (skipRevCidades.current[c.id]) {
        skipRevCidades.current[c.id] = false
        continue
      }
      const parsed = parseMapsCoords(c.mapsStr)
      if (!parsed) continue
      const same =
        c.lat != null &&
        c.lng != null &&
        Math.abs(c.lat - parsed.lat) < 1e-5 &&
        Math.abs(c.lng - parsed.lng) < 1e-5
      if (same && (c.cidade || '').trim().length >= 3) continue
      const id = c.id
      const t = window.setTimeout(() => {
        void (async () => {
          setCidadesDist((prev) =>
            prev.map((x) =>
              x.id === id ? { ...x, lat: parsed.lat, lng: parsed.lng } : x,
            ),
          )
          const res = await enderecoPorCoordenadas(parsed.lat, parsed.lng)
          if (!res.ok) return
          setCidadesDist((prev) =>
            prev.map((x) => {
              if (x.id !== id) return x
              if ((x.cidade || '').trim().length >= 3) return x
              const cidade = [res.dados.cidade, res.dados.uf]
                .filter(Boolean)
                .join(' - ')
              return { ...x, cidade: cidade || labelEndereco(res.dados, res.display) }
            }),
          )
        })()
      }, 500)
      timers.push(t)
    }
    return () => {
      for (const t of timers) window.clearTimeout(t)
    }
  }, [cidadesDist, editavel, modoCidades])

  function patchCliente(id: string, patch: Partial<ClienteDistForm>) {
    setClientesDist((prev) => prev.map((x) => (x.id === id ? { ...x, ...patch } : x)))
  }

  function patchCidade(id: string, patch: Partial<CidadeDistForm>) {
    setCidadesDist((prev) => prev.map((x) => (x.id === id ? { ...x, ...patch } : x)))
  }

  function onPickEndereco(id: string, sug: SugestaoEndereco) {
    skipRevClientes.current[id] = true
    patchCliente(id, {
      endereco: sug.label,
      lat: sug.lat,
      lng: sug.lng,
      mapsStr: fmtMapsCoords(sug.lat, sug.lng),
    })
  }

  function onPickOrigem(sug: SugestaoEndereco) {
    skipRevOrigem.current = true
    skipGeoOrigem.current = true
    setOrigem(sug.label)
    setOrigemLat(sug.lat)
    setOrigemLng(sug.lng)
    setOrigemMapsStr(fmtMapsCoords(sug.lat, sug.lng))
  }

  async function consultarCnpjCliente(id: string, digits: string) {
    if (ultimoCnpjCliente.current[id] === digits) return
    patchCliente(id, { cnpjBuscando: true, cnpjInfo: 'Consultando CNPJ na Receita…', cnpjOk: false })
    const res = await buscarDadosPorCnpj(digits)
    ultimoCnpjCliente.current[id] = digits
    if (!res.ok) {
      patchCliente(id, {
        cnpjBuscando: false,
        cnpjOk: false,
        cnpjInfo: res.erro,
      })
      return
    }
    const d = res.dados
    const nome = (d.nome_fantasia || d.razao_social || '').trim()
    const endereco = montarEnderecoCnpj(d)
    skipRevClientes.current[id] = true
    patchCliente(id, {
      cnpjBuscando: false,
      cnpjOk: true,
      cnpj: d.cnpj || formatCnpj(digits),
      nome,
      endereco,
      lat: null,
      lng: null,
      mapsStr: '',
      cnpjInfo: d.razao_social
        ? `CNPJ encontrado: ${d.razao_social}${
            d.nome_fantasia && d.nome_fantasia !== d.razao_social
              ? ` (${d.nome_fantasia})`
              : ''
          }.`
        : 'CNPJ encontrado. Dados preenchidos.',
    })
  }

  function onCnpjCliente(id: string, raw: string) {
    const next = formatCnpj(raw)
    const digits = cnpjDigits(next)
    if (digits !== ultimoCnpjCliente.current[id]) {
      ultimoCnpjCliente.current[id] = ''
    }
    patchCliente(id, { cnpj: next, cnpjInfo: '', cnpjOk: false })
    window.clearTimeout(cnpjTimers.current[id])
    if (digits.length !== 14 || !isValidCnpj(digits)) return
    cnpjTimers.current[id] = window.setTimeout(() => {
      void consultarCnpjCliente(id, digits)
    }, 400)
  }

  function falhaSalvar(msg: string) {
    setError(msg)
    window.requestAnimationFrame(() => {
      document.getElementById('carga-dist-erro')?.scrollIntoView({
        block: 'nearest',
        behavior: 'smooth',
      })
    })
  }

  function handleSalvar(irParaPublicar = false) {
    setError('')
    setInfo('')
    if (!editavel) {
      falhaSalvar('Esta carga já foi publicada e não pode ser editada aqui.')
      return
    }
    if (!numeroCarga.trim()) {
      falhaSalvar('Informe o número da carga.')
      return
    }
    if (!veiculo.trim()) {
      falhaSalvar('Selecione o perfil do veículo.')
      return
    }
    if (isVeiculoPesado(veiculo)) {
      falhaSalvar('Carga distribuição não usa perfil Pesados. Escolha Médios ou Leves.')
      return
    }
    const origemFinal = origem.trim()
    if (!origemFinal) {
      falhaSalvar('Informe o local de origem.')
      return
    }
    const pesoNum = parseMoneyInput(peso)
    const volumesNum = Number(volumes)
    const entregasNum = Number(numEntregas)
    const nfsNum = Number(qtdNfs)
    const valorNum = parseMoneyInput(valorMerc)
    if (Number.isNaN(pesoNum) || pesoNum <= 0) {
      falhaSalvar('Informe o peso da carga.')
      return
    }
    if (Number.isNaN(volumesNum) || volumesNum < 0) {
      falhaSalvar('Volumes inválidos.')
      return
    }
    if (Number.isNaN(entregasNum) || entregasNum < 1) {
      falhaSalvar('Quantidade de entregas inválida (mínimo 1).')
      return
    }
    if (Number.isNaN(nfsNum) || nfsNum < 1) {
      falhaSalvar('Quantidade de NFs inválida (mínimo 1).')
      return
    }
    if (Number.isNaN(valorNum) || valorNum < 0) {
      falhaSalvar('Valor da carga inválido.')
      return
    }

    if (!seqDistribuicao) {
      falhaSalvar('Selecione a sequência de clientes ou a sequência de cidades.')
      return
    }

    const clientesFinais = modoClientes
      ? formParaClientes(clientesDist)
      : formParaCidades(cidadesDist)
    if (clientesFinais.length === 0) {
      falhaSalvar(
        modoClientes
          ? 'Inclua ao menos um cliente com nome, CNPJ ou endereço.'
          : 'Inclua ao menos uma cidade na sequência.',
      )
      return
    }

    const last = clientesFinais[clientesFinais.length - 1]
    const destinoFinal = retornaOrigem
      ? origemFinal
      : (last.endereco || last.cidade || last.nome || origemFinal).trim()
    const destinoLat = retornaOrigem ? origemLat : (last.lat ?? null)
    const destinoLng = retornaOrigem ? origemLng : (last.lng ?? null)

    const pontosLimpos: PontoPassagemRota[] = clientesFinais.map((p) => ({
      id: p.id || newPontoPassagemId(),
      endereco: (p.endereco || p.cidade || p.nome || '').trim(),
      lat: p.lat ?? null,
      lng: p.lng ?? null,
    }))

    const primeiro = clientesFinais[0]
    const pedidoPrimeiro =
      clientesFinais.map((p) => p.pedido?.trim()).find(Boolean) || 'Distribuição'

    let tmin = tempMin
    let tmax = tempMax
    if (tmin != null && tmax != null && tmin > tmax) {
      const tmp = tmin
      tmin = tmax
      tmax = tmp
    }

    const patch: Partial<Carga> = {
      origem: origemFinal,
      destino: destinoFinal,
      origem_lat: origemLat,
      origem_lng: origemLng,
      destino_lat: destinoLat,
      destino_lng: destinoLng,
      pontos_passagem: pontosLimpos,
      retorna_origem: retornaOrigem,
      tipo_carga: tipoCarga.trim() || TIPOS_CARGA[0],
      veiculo: veiculo.trim(),
      destinatario: (primeiro.nome || primeiro.endereco || destinoFinal).trim(),
      destinatario_cnpj: formatCnpj(primeiro.cnpj || ''),
      peso: pesoNum,
      volumes: Math.round(volumesNum),
      num_entregas: Math.round(entregasNum),
      qtd_nfs: Math.round(nfsNum),
      valor_mercadorias: valorNum,
      tipo_oferta: 'distribuicao',
      seq_distribuicao: seqDistribuicao,
      clientes_distribuicao: clientesFinais,
      pedido: pedidoPrimeiro,
      data_carregamento: fromDateInput(dataCarreg),
      previsao_entrega: fromDateInput(previsao),
      observacao: observacao.trim() || undefined,
      numero: numeroCarga.trim(),
      antt: null,
      gerenciamento_risco: risco,
      marca_rastreador:
        risco === 'rastreador' || risco === 'ambos' ? marcaRastreador : undefined,
      modelo_rastreador:
        risco === 'rastreador' || risco === 'ambos' ? modeloRastreador : undefined,
      marca_localizador:
        risco === 'localizador' || risco === 'ambos' ? marcaLocalizador : undefined,
      modelo_localizador:
        risco === 'localizador' || risco === 'ambos' ? modeloLocalizador : undefined,
      temp_min: tmin,
      temp_max: tmax,
      exige_ajudante: exigeAjudante,
      created_at: carga.created_at,
    }

    try {
      if (isCargaEphemeral(carga)) {
        const criada = criarCarga(patch)
        setInfo('Carga salva em Cargas salvas.')
        onPersisted?.(criada, { irParaPublicar })
        onSaved?.()
        if (irParaPublicar) onGoPublish?.()
        return
      }
      const res = atualizarCarga(carga.id, patch)
      if (!res.ok) {
        falhaSalvar(res.error ?? 'Erro ao salvar')
        return
      }
      setInfo('Dados salvos.')
      onSaved?.()
      if (irParaPublicar) onGoPublish?.()
    } catch (e) {
      falhaSalvar(
        e instanceof Error ? e.message : 'Não foi possível salvar a carga.',
      )
    }
  }

  if (!editavel) {
    const pts = carga.clientes_distribuicao ?? []
    const seq = asSeqDistribuicao(carga.seq_distribuicao)
    return (
      <div className="space-y-0.5 text-[13px] leading-snug">
        <p className="mb-2 rounded-md bg-emerald-600 px-2.5 py-1.5 text-center text-[12px] font-extrabold uppercase tracking-wide text-white">
          {labelTipoOferta(carga.tipo_oferta)}
        </p>
        <Row label="Número" value={carga.numero} />
        <Row label="Veículo" value={carga.veiculo || '—'} />
        <Row label="Tipo de carga" value={carga.tipo_carga || '—'} />
        <Row label="Entregas" value={String(carga.num_entregas || 1)} />
        <Row label="Quantidade de Notas Fiscais" value={String(carga.qtd_nfs || 1)} />
        <Row label="Peso" value={formatMoneyInput(carga.peso)} />
        <Row label="Volumes" value={String(carga.volumes)} />
        <Row label="Valor da carga" value={formatCurrency(carga.valor_mercadorias)} />
        <Row
          label="Gerenc. de risco"
          value={
            carga.gerenciamento_risco === 'rastreador'
              ? 'Rastreador'
              : carga.gerenciamento_risco === 'localizador'
                ? 'Localizador'
                : carga.gerenciamento_risco === 'ambos'
                  ? 'Ambos'
                  : 'Não exige'
          }
        />
        {(carga.gerenciamento_risco === 'rastreador' ||
          carga.gerenciamento_risco === 'ambos') && (
          <Row
            label="Modelo rastreador"
            value={labelModeloRisco(
              carga.marca_rastreador,
              carga.modelo_rastreador,
              MODELOS_RASTREADOR,
            )}
          />
        )}
        {(carga.gerenciamento_risco === 'localizador' ||
          carga.gerenciamento_risco === 'ambos') && (
          <Row
            label="Modelo localizador"
            value={labelModeloRisco(
              carga.marca_localizador,
              carga.modelo_localizador,
              MODELOS_LOCALIZADOR,
            )}
          />
        )}
        <Row
          label="Temperatura"
          value={labelFaixaTemperatura(carga) || '—'}
        />
        <Row label="Exige ajudante" value={carga.exige_ajudante ? 'Sim' : 'Não'} />
        <Row label="Origem" value={carga.origem || '—'} />
        <Row
          label="Retorna para origem"
          value={flagSim(carga.retorna_origem) ? 'Sim' : 'Não'}
        />
        <Row
          label="Sequência"
          value={seq === 'cidades' ? 'Cidades' : 'Clientes'}
        />
        {pts.length > 0 && (
          <div className="rounded-md border border-emerald-200 bg-emerald-50/70 px-2.5 py-2 my-1">
            <p className="text-[12px] font-bold text-emerald-900">
              Sequência ({pts.length})
            </p>
            <ol className="mt-1 list-decimal space-y-1 pl-5 text-[12px] text-emerald-950">
              {pts.map((c) => (
                <li key={c.id}>
                  <strong>{c.nome || c.cidade || c.endereco || 'Ponto'}</strong>
                  {c.endereco && c.nome ? ` · ${c.endereco}` : ''}
                  {c.cnpj ? ` · ${c.cnpj}` : ''}
                  {c.pedido ? ` · Pedido ${c.pedido}` : ''}
                </li>
              ))}
            </ol>
          </div>
        )}
        {carga.observacao && <Row label="Obs." value={carga.observacao} />}
      </div>
    )
  }

  return (
    <div className="carga-dados-form space-y-2 text-sm font-medium text-black">
      <div className="border-b border-ink/15 pb-2">
        <p className="mb-1.5 rounded-md bg-emerald-600 px-2.5 py-1.5 text-center text-[12px] font-extrabold uppercase tracking-wide text-white">
          Carga distribuição
        </p>
        <p className="font-display text-base font-bold text-ink">
          Carga {numeroCarga || carga.numero}
        </p>
        <p className="text-[12px] font-semibold text-black">
          Número, veículo, entregas, NFs, peso, valor e volumes. Abaixo, origem e a
          sequência de clientes ou de cidades.
        </p>
      </div>

      <section className="grid gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
        <Field label="Número da carga *">
          <input
            className={inputClass}
            value={numeroCarga}
            onChange={(e) => setNumeroCarga(e.target.value)}
            placeholder="Ex.: 128688"
          />
        </Field>
        <Field label="Perfil do veículo *">
          <VeiculoSuggestInput
            value={veiculo}
            onChange={setVeiculo}
            grupos={GRUPOS_VEICULO_DISTRIBUICAO}
            placeholder="Truck, Fiorino…"
          />
        </Field>
        <Field label="Tipo de carga">
          <SuggestInput
            value={tipoCarga}
            onChange={setTipoCarga}
            suggestions={sugTipo}
            placeholder="Carga seca, Congelada, Resfriada…"
          />
        </Field>
        <Field label="Quantidade de entregas *">
          <SuggestInput
            value={numEntregas}
            onChange={setNumEntregas}
            suggestions={sugEntregas}
            placeholder="1"
            inputMode="numeric"
          />
        </Field>
        <Field label="Quantidade de Notas Fiscais *">
          <SuggestInput
            value={qtdNfs}
            onChange={setQtdNfs}
            suggestions={sugNfs}
            placeholder="1"
            inputMode="numeric"
          />
        </Field>
        <Field label="Peso da carga (kg) *">
          <SuggestInput
            value={peso}
            onChange={setPeso}
            suggestions={sugPeso}
            onBlur={() => {
              const n = parseMoneyInput(peso)
              if (!Number.isNaN(n)) setPeso(formatMoneyInput(n))
            }}
          />
        </Field>
        <Field label="Valor da carga (R$) *">
          <SuggestInput
            value={valorMerc}
            onChange={setValorMerc}
            suggestions={sugValorMerc}
            onBlur={() => {
              const n = parseMoneyInput(valorMerc)
              if (!Number.isNaN(n)) setValorMerc(formatMoneyInput(n))
            }}
          />
        </Field>
        <Field label="Volumes">
          <SuggestInput
            value={volumes}
            onChange={setVolumes}
            suggestions={sugVolumes}
            inputMode="numeric"
          />
        </Field>
      </section>

      <section className="space-y-1.5 border-t border-ink/15 pt-2">
        <h3 className="text-[13px] font-extrabold uppercase tracking-wide text-black">
          Gerenciamento de risco
        </h3>
        <p className="text-[11px] font-semibold text-black">
          Rastreador/localizador, temperatura e ajudante viram requisito: a oferta só
          aparece para quem atender na frota.
        </p>
        <Field label="Exige">
          <select
            className={inputClass}
            value={risco}
            onChange={(e) =>
              setRisco(e.target.value as NonNullable<Carga['gerenciamento_risco']>)
            }
          >
            <option value="nao">Não exige</option>
            <option value="rastreador">Rastreador</option>
            <option value="localizador">Localizador</option>
            <option value="ambos">Ambos</option>
          </select>
        </Field>
        <CargaExigenciasFields
          risco={risco}
          marcaRastreador={marcaRastreador}
          marcaLocalizador={marcaLocalizador}
          modeloRastreador={modeloRastreador}
          modeloLocalizador={modeloLocalizador}
          tempMin={tempMin}
          tempMax={tempMax}
          exigeAjudante={exigeAjudante}
          onChange={(patch) => {
            if ('marca_rastreador' in patch) {
              setMarcaRastreador(patch.marca_rastreador || MARCA_SEM_ESPECIFICA)
            }
            if ('marca_localizador' in patch) {
              setMarcaLocalizador(patch.marca_localizador || MARCA_SEM_ESPECIFICA)
            }
            if ('modelo_rastreador' in patch) {
              setModeloRastreador(patch.modelo_rastreador || MODELO_SEM_ESPECIFICO)
            }
            if ('modelo_localizador' in patch) {
              setModeloLocalizador(patch.modelo_localizador || MODELO_SEM_ESPECIFICO)
            }
            if ('temp_min' in patch) setTempMin(patch.temp_min)
            if ('temp_max' in patch) setTempMax(patch.temp_max)
            if ('exige_ajudante' in patch) {
              setExigeAjudante(Boolean(patch.exige_ajudante))
            }
          }}
        />
      </section>

      <section className="space-y-1.5 border-t border-ink/15 pt-2">
        <h3 className="text-[13px] font-extrabold uppercase tracking-wide text-black">
          Origem
        </h3>
        <div className="grid gap-1.5 sm:grid-cols-2">
          <Field label="Local de origem *">
            <AddressSuggestInput
              value={origem}
              onChange={setOrigem}
              onPick={onPickOrigem}
              localSuggestions={sugOrigem}
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
              onChange={(e) => setOrigemMapsStr(e.target.value)}
            />
            <p className="mt-0.5 text-[11px] text-ink-muted">
              Cole lat,lng ou lat,lng,zoom do Google Maps.
            </p>
          </Field>
          <Field label="Retorna para origem">
            <select
              className={inputClass}
              value={retornaOrigem ? 'sim' : 'nao'}
              onChange={(e) => setRetornaOrigem(e.target.value === 'sim')}
            >
              <option value="nao">Não</option>
              <option value="sim">Sim</option>
            </select>
          </Field>
        </div>
      </section>

      <section className="space-y-1.5 border-t border-ink/15 pt-2">
        <h3 className="text-[13px] font-extrabold uppercase tracking-wide text-black">
          Sequência
        </h3>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className={`rounded-md border px-3 py-1.5 text-xs font-bold ${
              modoClientes
                ? 'border-emerald-600 bg-emerald-50 text-emerald-900'
                : 'border-ink/20 bg-white text-ink'
            }`}
            onClick={() => setSeqDistribuicao('clientes')}
          >
            Sequência de clientes
          </button>
          <button
            type="button"
            className={`rounded-md border px-3 py-1.5 text-xs font-bold ${
              modoCidades
                ? 'border-emerald-600 bg-emerald-50 text-emerald-900'
                : 'border-ink/20 bg-white text-ink'
            }`}
            onClick={() => setSeqDistribuicao('cidades')}
          >
            Sequência de cidades
          </button>
        </div>
        <p className="text-[11px] font-semibold text-black">
          {seqDistribuicao
            ? 'Os campos da opção escolhida aparecem abaixo.'
            : 'Escolha sequência de clientes ou de cidades para preencher os pontos.'}
        </p>

        {modoClientes && (
        <div className="space-y-2 rounded-lg border border-emerald-200 bg-emerald-50/40 p-2.5">
          <p className="text-[12px] font-extrabold uppercase tracking-wide text-black">
            Clientes
          </p>
          {clientesDist.map((cli, idx) => (
            <div
              key={cli.id}
              className="rounded-lg border border-ink/15 bg-white p-2.5"
            >
              <div className="mb-1.5 flex items-center justify-between gap-2">
                <p className="text-[12px] font-extrabold uppercase tracking-wide text-black">
                  Cliente {idx + 1}
                </p>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    title="Subir na sequência"
                    disabled={idx === 0}
                    className="rounded-md border border-ink/15 bg-white p-1 text-ink disabled:opacity-30"
                    onClick={() =>
                      setClientesDist((prev) => reordenarPontos(prev, idx, -1))
                    }
                  >
                    <ChevronUp size={14} />
                  </button>
                  <button
                    type="button"
                    title="Descer na sequência"
                    disabled={idx === clientesDist.length - 1}
                    className="rounded-md border border-ink/15 bg-white p-1 text-ink disabled:opacity-30"
                    onClick={() =>
                      setClientesDist((prev) => reordenarPontos(prev, idx, 1))
                    }
                  >
                    <ChevronDown size={14} />
                  </button>
                  {clientesDist.length > 1 && (
                    <button
                      type="button"
                      className="ml-1 inline-flex items-center gap-1 text-[11px] font-semibold text-red-600 hover:underline"
                      onClick={() =>
                        setClientesDist((prev) => prev.filter((x) => x.id !== cli.id))
                      }
                    >
                      <Trash2 size={12} />
                      Remover
                    </button>
                  )}
                </div>
              </div>
              <div className="grid gap-1.5 sm:grid-cols-2">
                <Field label="CNPJ (preenche os dados)">
                  <CnpjInput
                    value={cli.cnpj}
                    onChange={(v) => onCnpjCliente(cli.id, v)}
                    disabled={cli.cnpjBuscando}
                    showHint={!cli.cnpjBuscando && !cli.cnpjInfo}
                  />
                  {(cli.cnpjBuscando || cli.cnpjInfo) && (
                    <p
                      className={`mt-1 text-[11px] font-medium ${
                        cli.cnpjBuscando
                          ? 'text-ink'
                          : cli.cnpjOk
                            ? 'text-emerald-800'
                            : 'text-amber-800'
                      }`}
                    >
                      {cli.cnpjBuscando
                        ? 'Consultando CNPJ na Receita…'
                        : cli.cnpjInfo}
                    </p>
                  )}
                </Field>
                <Field label="Nome / empresa">
                  <input
                    className={inputClass}
                    value={cli.nome}
                    onChange={(e) => patchCliente(cli.id, { nome: e.target.value })}
                    placeholder="Razão social ou fantasia"
                  />
                </Field>
                <Field label="Pedido deste cliente">
                  <input
                    className={inputClass}
                    value={cli.pedido}
                    onChange={(e) => patchCliente(cli.id, { pedido: e.target.value })}
                    placeholder="Número do pedido"
                  />
                </Field>
                <Field label="Destinatário (endereço do ponto)">
                  <AddressSuggestInput
                    value={cli.endereco}
                    onChange={(v) =>
                      patchCliente(cli.id, { endereco: v, lat: null, lng: null })
                    }
                    onPick={(sug) => onPickEndereco(cli.id, sug)}
                    minChars={2}
                    placeholder={PLACEHOLDER_ENDERECO_EXEMPLO}
                  />
                </Field>
                <Field label="Coordenadas (Maps)" className="sm:col-span-2">
                  <input
                    className={inputClass}
                    inputMode="text"
                    placeholder="-23.5613545,-46.6590692,17"
                    value={cli.mapsStr}
                    onChange={(e) => {
                      skipRevClientes.current[cli.id] = false
                      patchCliente(cli.id, { mapsStr: e.target.value })
                    }}
                  />
                  <p className="mt-0.5 text-[11px] text-ink-muted">
                    CNPJ, endereço com autocomplete ou coordenadas — o destinatário é o
                    endereço deste ponto.
                  </p>
                </Field>
              </div>
            </div>
          ))}
          <button
            type="button"
            className="inline-flex items-center gap-1.5 rounded-md border border-[#2f9e6a]/40 bg-white px-3 py-1.5 text-xs font-bold text-[#2f9e6a] hover:bg-emerald-50"
            onClick={() =>
              setClientesDist((prev) => [...prev, emptyClienteDistForm()])
            }
          >
            <Plus size={14} />
            Adicionar cliente
          </button>
        </div>
        )}

        {modoCidades && (
        <div className="space-y-2 rounded-lg border border-emerald-200 bg-emerald-50/40 p-2.5">
          <p className="text-[12px] font-extrabold uppercase tracking-wide text-black">
            Cidades
          </p>
          {cidadesDist.map((cid, idx) => (
            <div
              key={cid.id}
              className="grid gap-1.5 rounded-lg border border-ink/15 bg-white p-2.5 sm:grid-cols-2"
            >
              <div className="sm:col-span-2 mb-0.5 flex items-center justify-between gap-2">
                <p className="text-[12px] font-extrabold uppercase tracking-wide text-black">
                  Cidade {idx + 1}
                </p>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    disabled={idx === 0}
                    className="rounded-md border border-ink/15 bg-white p-1 text-ink disabled:opacity-30"
                    onClick={() =>
                      setCidadesDist((prev) => reordenarPontos(prev, idx, -1))
                    }
                  >
                    <ChevronUp size={14} />
                  </button>
                  <button
                    type="button"
                    disabled={idx === cidadesDist.length - 1}
                    className="rounded-md border border-ink/15 bg-white p-1 text-ink disabled:opacity-30"
                    onClick={() =>
                      setCidadesDist((prev) => reordenarPontos(prev, idx, 1))
                    }
                  >
                    <ChevronDown size={14} />
                  </button>
                  {cidadesDist.length > 1 && (
                    <button
                      type="button"
                      className="ml-1 inline-flex items-center gap-1 text-[11px] font-semibold text-red-600 hover:underline"
                      onClick={() =>
                        setCidadesDist((prev) => prev.filter((x) => x.id !== cid.id))
                      }
                    >
                      <Trash2 size={12} />
                      Remover
                    </button>
                  )}
                </div>
              </div>
              <Field label="Cidade">
                <SuggestInput
                  value={cid.cidade}
                  onChange={(v) =>
                    patchCidade(cid.id, { cidade: v, lat: null, lng: null })
                  }
                  suggestions={sugCidade}
                  placeholder="Cidade / UF"
                />
              </Field>
              <Field label="Coordenadas (Maps)">
                <input
                  className={inputClass}
                  inputMode="text"
                  placeholder="-23.5613545,-46.6590692,17"
                  value={cid.mapsStr}
                  onChange={(e) => {
                    skipRevCidades.current[cid.id] = false
                    patchCidade(cid.id, { mapsStr: e.target.value })
                  }}
                />
              </Field>
            </div>
          ))}
          <button
            type="button"
            className="inline-flex items-center gap-1.5 rounded-md border border-[#2f9e6a]/40 bg-white px-3 py-1.5 text-xs font-bold text-[#2f9e6a] hover:bg-emerald-50"
            onClick={() =>
              setCidadesDist((prev) => [...prev, emptyCidadeDistForm()])
            }
          >
            <Plus size={14} />
            Adicionar cidade
          </button>
        </div>
        )}
      </section>

      <section className="space-y-1.5 border-t border-ink/15 pt-2">
        <h3 className="text-[13px] font-extrabold uppercase tracking-wide text-black">
          Mapa da rota
        </h3>
        <RotaMapPreview
          origem={origem}
          destino={rotaMapa.destino}
          origemCoords={
            origemLat != null && origemLng != null
              ? { lat: origemLat, lng: origemLng }
              : null
          }
          destinoCoords={
            rotaMapa.destinoLat != null && rotaMapa.destinoLng != null
              ? { lat: rotaMapa.destinoLat, lng: rotaMapa.destinoLng }
              : null
          }
          waypoints={rotaMapa.waypoints}
          veiculo={veiculo}
          mostrarCustos={false}
          className="h-[220px] min-h-[220px] w-full"
        />
      </section>

      <section className="space-y-1.5 border-t border-ink/15 pt-2">
        <h3 className="text-[13px] font-extrabold uppercase tracking-wide text-black">
          Prazos e observações
        </h3>
        <div className="grid gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="Carregamento">
            <input
              type="date"
              className={inputClass}
              value={dataCarreg}
              onChange={(e) => setDataCarreg(e.target.value)}
            />
          </Field>
          <Field label="Previsão entrega">
            <input
              type="date"
              className={inputClass}
              value={previsao}
              onChange={(e) => setPrevisao(e.target.value)}
            />
          </Field>
          <Field label="Observações">
            <SuggestInput
              value={observacao}
              onChange={setObservacao}
              suggestions={sugObs}
              placeholder="Opcional"
            />
          </Field>
        </div>
      </section>

      {info && !error && (
        <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-900">
          {info}
        </p>
      )}

      <div className="sticky bottom-0 z-20 -mx-1 flex flex-col gap-1.5 border-t border-ink/15 bg-white/95 px-1 pt-2 pb-1 backdrop-blur">
        {error && (
          <p
            id="carga-dist-erro"
            className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-900"
          >
            {error}
          </p>
        )}
        <div className="flex flex-col gap-1.5 sm:flex-row">
          <Button
            variant="success"
            className="flex-1"
            onClick={() => handleSalvar(false)}
          >
            Salvar dados
          </Button>
          <Button
            variant="primary"
            className="flex-1"
            onClick={() => handleSalvar(true)}
          >
            Salvar e publicar
          </Button>
        </div>
      </div>
    </div>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-ink/10 py-0.5">
      <span className="shrink-0 text-[13px] font-semibold text-ink">{label}</span>
      <span className="text-right text-[13px] font-bold text-ink">{value}</span>
    </div>
  )
}
