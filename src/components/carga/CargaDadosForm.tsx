import { useEffect, useMemo, useRef, useState } from 'react'
import { isCargaEphemeral, useData } from '../../context/DataContext'
import { formatCurrency, formatMoneyInput, parseMoneyInput } from '../../lib/businessRules'
import { buscarCidades, filtrarSugestoes } from '../../lib/cidadesBrasil'
import { cnpjDigits, formatCnpj, isValidCnpj } from '../../lib/cnpj'
import { buscarDadosPorCnpj } from '../../lib/cnpjLookup'
import { TIPOS_CARGA } from '../../lib/tiposCarga'
import type { AnttInfoCarga, Carga, ClassificacaoRota, Rota } from '../../types'
import { Button, Field, inputClass } from '../ui/Modal'
import { CnpjInput } from '../ui/CnpjInput'
import { SuggestInput } from '../ui/SuggestInput'
import { AddressSuggestInput } from '../ui/AddressSuggestInput'
import { joinCarrocerias, parseCarrocerias } from '../../lib/tiposCarroceria'
import { CarroceriaSuggestInput } from '../ui/CarroceriaSuggestInput'
import { VeiculoSuggestInput } from '../ui/VeiculoSuggestInput'
import { AnttFretePanel } from './AnttFretePanel'
import { RotaMapPreview } from './RotaMapPreview'

type ComplementoCarga = NonNullable<Carga['complemento']>
type GerenciamentoRisco = NonNullable<Carga['gerenciamento_risco']>

const COMPLEMENTO_LABELS = ['Sim', 'Não', 'Ambos'] as const
const RISCO_LABELS = ['Rastreador', 'Localizador', 'Ambos', 'Não exige'] as const

function labelComplemento(v?: Carga['complemento']) {
  if (v === 'sim') return 'Sim'
  if (v === 'nao') return 'Não'
  if (v === 'ambos') return 'Ambos'
  return ''
}

function parseComplemento(txt: string): ComplementoCarga | undefined {
  const n = txt.trim().toLowerCase()
  if (n === 'sim') return 'sim'
  if (n === 'nao' || n === 'não') return 'nao'
  if (n === 'ambos') return 'ambos'
  return undefined
}

function labelGerenciamentoRisco(v?: Carga['gerenciamento_risco']) {
  if (v === 'rastreador') return 'Rastreador'
  if (v === 'localizador') return 'Localizador'
  if (v === 'ambos') return 'Ambos'
  if (v === 'nao') return 'Não exige'
  return ''
}

function parseGerenciamentoRisco(txt: string): GerenciamentoRisco | undefined {
  const n = txt.trim().toLowerCase()
  if (n === 'rastreador') return 'rastreador'
  if (n === 'localizador') return 'localizador'
  if (n === 'ambos') return 'ambos'
  if (n === 'nao' || n === 'não' || n === 'nao exige' || n === 'não exige') return 'nao'
  return undefined
}

type Props = {
  carga: Carga
  canEdit: boolean
  onSaved?: () => void
  onGoPublish?: () => void
  /** Chamado quando o rascunho efêmero é gravado pela 1ª vez (ou atualizado na UI). */
  onPersisted?: (carga: Carga) => void
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

function descricaoRota(origem: string, destino: string) {
  const o = origem.trim().toUpperCase()
  const d = destino.trim().toUpperCase()
  return `${o} - ${d}`
}

const SUGESTOES_OBS = [
  'seco',
  'refrigerado',
  'fragil',
  'urgente',
  'agendar entrega',
  'requer acompanhamento',
  'carga paletizada',
]

const DESTINOS_ESPECIAIS = ['Distribuição']

export function CargaDadosForm({ carga, canEdit, onSaved, onGoPublish, onPersisted }: Props) {
  const { rotas, cargas, atualizarCarga, criarCarga, salvarRota } = useData()
  const editavel = canEdit && carga.status === 'nova_carga'

  const [origem, setOrigem] = useState(carga.origem)
  const [destino, setDestino] = useState(carga.destino)
  const [complementoTxt, setComplementoTxt] = useState(() => labelComplemento(carga.complemento))
  const [riscoTxt, setRiscoTxt] = useState(() =>
    labelGerenciamentoRisco(carga.gerenciamento_risco),
  )
  const [freteTabela, setFreteTabela] = useState(formatMoneyInput(carga.frete_tabela || 0))
  const [anttInfo, setAnttInfo] = useState<AnttInfoCarga | null>(carga.antt ?? null)
  const [classificacao, setClassificacao] = useState<ClassificacaoRota>(
    carga.classificacao_rota ?? 'B',
  )
  const [salvarFavorita, setSalvarFavorita] = useState(false)
  const [rotaId, setRotaId] = useState(carga.rota_id ?? '')
  const [pedido, setPedido] = useState(carga.pedido)
  const [tipoCarga, setTipoCarga] = useState(carga.tipo_carga)
  const [veiculo, setVeiculo] = useState(carga.veiculo)
  const [carroceriaTxt, setCarroceriaTxt] = useState(() =>
    joinCarrocerias(parseCarrocerias(carga.carrocerias)),
  )
  const [destinatario, setDestinatario] = useState(carga.destinatario)
  const [destinatarioCnpj, setDestinatarioCnpj] = useState(
    formatCnpj(carga.destinatario_cnpj || ''),
  )
  const [peso, setPeso] = useState(formatMoneyInput(carga.peso || 0))
  const [volumes, setVolumes] = useState(String(carga.volumes || 0))
  const [valorMerc, setValorMerc] = useState(formatMoneyInput(carga.valor_mercadorias || 0))
  const [dataCarreg, setDataCarreg] = useState(toDateInput(carga.data_carregamento))
  const [previsao, setPrevisao] = useState(toDateInput(carga.previsao_entrega))
  const [observacao, setObservacao] = useState(carga.observacao ?? '')
  const [error, setError] = useState('')
  const [info, setInfo] = useState('')
  const [cnpjBuscando, setCnpjBuscando] = useState(false)
  const [cnpjInfo, setCnpjInfo] = useState('')
  const [cnpjInfoOk, setCnpjInfoOk] = useState(false)
  const ultimoCnpjBuscado = useRef('')

  const historico = useMemo(() => {
    const outras = cargas.filter((c) => c.id !== carga.id)
    return {
      origem: outras.map((c) => c.origem),
      destino: outras.map((c) => c.destino),
      pedido: outras.map((c) => c.pedido),
      tipo: outras.map((c) => c.tipo_carga),
      veiculo: outras.map((c) => c.veiculo),
      destinatario: outras.map((c) => c.destinatario),
      cnpj: outras.map((c) => c.destinatario_cnpj),
      peso: outras.map((c) => (c.peso > 0 ? formatMoneyInput(c.peso) : '')),
      volumes: outras.map((c) => (c.volumes > 0 ? String(c.volumes) : '')),
      valorMerc: outras.map((c) =>
        c.valor_mercadorias > 0 ? formatMoneyInput(c.valor_mercadorias) : '',
      ),
      frete: outras.map((c) =>
        c.frete_tabela > 0 ? formatMoneyInput(c.frete_tabela) : '',
      ),
      obs: outras.map((c) => c.observacao),
      rotasOrigem: rotas.map((r) => r.origem),
      rotasDestino: rotas.map((r) => r.destino),
    }
  }, [cargas, carga.id, rotas])

  const sugOrigem = useMemo(
    () => (q: string) =>
      filtrarSugestoes(q, [buscarCidades(q, 14), historico.origem, historico.rotasOrigem], 14),
    [historico.origem, historico.rotasOrigem],
  )

  const sugDestino = useMemo(
    () => (q: string) =>
      filtrarSugestoes(
        q,
        [DESTINOS_ESPECIAIS, buscarCidades(q, 14), historico.destino, historico.rotasDestino],
        14,
      ),
    [historico.destino, historico.rotasDestino],
  )

  const sugTipo = useMemo(
    () => (q: string) => {
      const catalog = [...TIPOS_CARGA]
      const qt = q.trim()
      if (!qt) return catalog
      // Já selecionou um tipo do catálogo → ao focar mostra a lista inteira
      const exact = catalog.some((t) => t.toLowerCase() === qt.toLowerCase())
      if (exact) return catalog
      const matched = filtrarSugestoes(qt, [catalog], 20)
      if (matched.length === 0) return catalog
      return filtrarSugestoes(qt, [catalog, historico.tipo], 20)
    },
    [historico.tipo],
  )

  const sugRisco = useMemo(
    () => (q: string) => {
      const catalog = [...RISCO_LABELS]
      const qt = q.trim().toLowerCase()
      if (!qt) return catalog
      if (catalog.some((t) => t.toLowerCase() === qt)) return catalog
      return filtrarSugestoes(qt, [catalog], 8)
    },
    [],
  )

  const sugComplemento = useMemo(
    () => (q: string) => {
      const catalog = [...COMPLEMENTO_LABELS]
      const qt = q.trim().toLowerCase()
      if (!qt) return catalog
      // Já escolheu Sim/Não/Ambos → ao focar mostra as 3 opções
      if (catalog.some((t) => t.toLowerCase() === qt)) return catalog
      const matched = catalog.filter((t) => t.toLowerCase().includes(qt))
      return matched.length > 0 ? matched : catalog
    },
    [],
  )

  const sugDestinatario = useMemo(
    () => (q: string) => filtrarSugestoes(q, [historico.destinatario], 12),
    [historico.destinatario],
  )

  const sugPedido = useMemo(
    () => (q: string) => filtrarSugestoes(q, [historico.pedido], 12),
    [historico.pedido],
  )

  const sugPeso = useMemo(
    () => (q: string) => filtrarSugestoes(q, [historico.peso], 8),
    [historico.peso],
  )

  const sugVolumes = useMemo(
    () => (q: string) => filtrarSugestoes(q, [historico.volumes], 8),
    [historico.volumes],
  )

  const sugValorMerc = useMemo(
    () => (q: string) => filtrarSugestoes(q, [historico.valorMerc], 8),
    [historico.valorMerc],
  )

  const sugFrete = useMemo(
    () => (q: string) => filtrarSugestoes(q, [historico.frete], 8),
    [historico.frete],
  )

  const sugObs = useMemo(
    () => (q: string) => filtrarSugestoes(q, [SUGESTOES_OBS, historico.obs], 12),
    [historico.obs],
  )

  useEffect(() => {
    setOrigem(carga.origem)
    setDestino(carga.destino)
    setComplementoTxt(labelComplemento(carga.complemento))
    setRiscoTxt(labelGerenciamentoRisco(carga.gerenciamento_risco))
    setFreteTabela(formatMoneyInput(carga.frete_tabela || 0))
    setAnttInfo(carga.antt ?? null)
    setClassificacao(carga.classificacao_rota ?? 'B')
    setSalvarFavorita(false)
    setRotaId(carga.rota_id ?? '')
    setPedido(carga.pedido)
    setTipoCarga(carga.tipo_carga)
    setVeiculo(carga.veiculo)
    setCarroceriaTxt(joinCarrocerias(parseCarrocerias(carga.carrocerias)))
    setDestinatario(carga.destinatario)
    setDestinatarioCnpj(formatCnpj(carga.destinatario_cnpj || ''))
    setPeso(formatMoneyInput(carga.peso || 0))
    setVolumes(String(carga.volumes || 0))
    setValorMerc(formatMoneyInput(carga.valor_mercadorias || 0))
    setDataCarreg(toDateInput(carga.data_carregamento))
    setPrevisao(toDateInput(carga.previsao_entrega))
    setObservacao(carga.observacao ?? '')
    setError('')
    setInfo('')
    setCnpjBuscando(false)
    setCnpjInfo('')
    setCnpjInfoOk(false)
    ultimoCnpjBuscado.current = ''
  }, [carga.id, carga.updated_at])

  // Consulta Receita Federal ao completar o CNPJ do destinatário
  useEffect(() => {
    if (!editavel) return
    const digits = cnpjDigits(destinatarioCnpj)
    if (digits.length !== 14 || !isValidCnpj(digits)) {
      setCnpjBuscando(false)
      return
    }
    if (ultimoCnpjBuscado.current === digits) return

    let cancelled = false
    const timer = window.setTimeout(() => {
      void (async () => {
        setCnpjBuscando(true)
        setCnpjInfoOk(false)
        setCnpjInfo('Consultando CNPJ na Receita…')
        const res = await buscarDadosPorCnpj(digits)
        if (cancelled) return
        setCnpjBuscando(false)
        ultimoCnpjBuscado.current = digits
        if (!res.ok) {
          setCnpjInfoOk(false)
          setCnpjInfo(res.erro)
          return
        }
        const d = res.dados
        const nome = (d.nome_fantasia || d.razao_social || '').trim()
        if (nome) setDestinatario(nome)
        setDestinatarioCnpj(d.cnpj || formatCnpj(digits))

        // Preenche destino da rota com o endereço do CNPJ se ainda estiver vazio
        setDestino((cur) => {
          if (cur.trim()) return cur
          const rua = [d.endereco, d.numero].filter(Boolean).join(', ')
          const cidadeUf = [d.cidade, d.uf].filter(Boolean).join(' - ')
          const linha = [rua, d.bairro, cidadeUf].filter(Boolean).join(', ')
          return linha || cidadeUf || cur
        })

        setCnpjInfoOk(true)
        setCnpjInfo(
          d.razao_social
            ? `CNPJ encontrado: ${d.razao_social}${d.nome_fantasia && d.nome_fantasia !== d.razao_social ? ` (${d.nome_fantasia})` : ''}.`
            : 'CNPJ encontrado. Dados preenchidos.',
        )
      })()
    }, 400)

    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [destinatarioCnpj, editavel])

  const rotasAtivas = useMemo(
    () =>
      [...rotas]
        .filter((r) => r.situacao === 'ativo')
        .sort((a, b) => a.descricao.localeCompare(b.descricao, 'pt-BR')),
    [rotas],
  )
  const rotaSelecionada =
    rotasAtivas.find((r) => r.id === rotaId) || rotas.find((r) => r.id === carga.rota_id)

  function aplicarRotaCadastrada(id: string) {
    setRotaId(id)
    if (!id) {
      setInfo('Rota desvinculada. Você pode preencher origem e destino manualmente.')
      return
    }
    const r = rotas.find((x) => x.id === id)
    if (!r) return
    setOrigem(r.origem)
    setDestino(r.destino)
    setFreteTabela(formatMoneyInput(r.frete_tabela || 0))
    setClassificacao(r.classificacao ?? 'B')
    setSalvarFavorita(false)
    setInfo(`Rota “${r.descricao}” aplicada (${r.origem} → ${r.destino}).`)
  }

  function handleSalvar(irParaPublicar = false) {
    setError('')
    setInfo('')
    if (!editavel) {
      setError('Esta carga já foi publicada e não pode ser editada aqui.')
      return
    }

    const origemFinal = origem.trim()
    const destinoFinal = destino.trim()
    const freteFinal = parseMoneyInput(freteTabela)
    const classifFinal: ClassificacaoRota = classificacao

    if (!origemFinal || !destinoFinal) {
      setError('Informe origem e destino da rota.')
      return
    }
    if (!veiculo.trim()) {
      setError('Selecione o tipo de veículo.')
      return
    }
    const complementoFinal = parseComplemento(complementoTxt)
    if (!complementoFinal) {
      setError('Selecione o complemento (Sim, Não ou Ambos).')
      return
    }
    const riscoFinal = parseGerenciamentoRisco(riscoTxt)
    if (!riscoFinal) {
      setError('Selecione o gerenciamento de risco (rastreador ou localizador).')
      return
    }
    if (Number.isNaN(freteFinal) || freteFinal <= 0) {
      setError('Informe o valor do frete tabela.')
      return
    }

    let rotaIdFinal: string | null = rotaId || carga.rota_id
    if (rotaIdFinal) {
      const r = rotas.find((x) => x.id === rotaIdFinal)
      if (!r || r.origem !== origemFinal || r.destino !== destinoFinal) {
        rotaIdFinal = null
      }
    }

    if (salvarFavorita) {
      const novaRota: Rota = {
        id: `r-${Math.random().toString(36).slice(2, 8)}`,
        descricao: descricaoRota(origemFinal, destinoFinal),
        origem: origemFinal,
        destino: destinoFinal,
        classificacao: classifFinal,
        frete_tabela: freteFinal,
        km: anttInfo?.rota.distancia_km ?? 0,
        situacao: 'ativo',
      }
      salvarRota(novaRota)
      rotaIdFinal = novaRota.id
      setRotaId(novaRota.id)
      setInfo('Rota salva na aba Rotas (disponível para próximas cargas).')
    }

    if (!pedido.trim()) {
      setError('Informe o pedido.')
      return
    }
    if (!destinatario.trim()) {
      setError('Informe o destinatário.')
      return
    }
    const pesoNum = parseMoneyInput(peso)
    const volumesNum = Number(volumes)
    const valorNum = parseMoneyInput(valorMerc)
    if (Number.isNaN(pesoNum) || pesoNum <= 0) {
      setError('Peso inválido.')
      return
    }
    if (Number.isNaN(volumesNum) || volumesNum < 0) {
      setError('Volumes inválidos.')
      return
    }
    if (Number.isNaN(valorNum) || valorNum < 0) {
      setError('Valor das mercadorias inválido.')
      return
    }

    const patch: Partial<Carga> = {
      rota_id: rotaIdFinal,
      classificacao_rota: classifFinal,
      origem: origemFinal,
      destino: destinoFinal,
      complemento: complementoFinal,
      gerenciamento_risco: riscoFinal,
      frete_tabela: freteFinal,
      antt: anttInfo,
      pedido: pedido.trim(),
      tipo_carga: tipoCarga.trim() || TIPOS_CARGA[0],
      veiculo: veiculo.trim(),
      carrocerias: parseCarrocerias(carroceriaTxt),
      destinatario: destinatario.trim(),
      destinatario_cnpj: formatCnpj(destinatarioCnpj),
      peso: pesoNum,
      volumes: Math.round(volumesNum),
      valor_mercadorias: valorNum,
      data_carregamento: fromDateInput(dataCarreg),
      previsao_entrega: fromDateInput(previsao),
      observacao: observacao.trim() || undefined,
      numero: carga.numero,
      created_at: carga.created_at,
    }

    if (isCargaEphemeral(carga)) {
      const criada = criarCarga(patch)
      if (!salvarFavorita) setInfo('Carga salva em Cargas salvas.')
      onPersisted?.(criada)
      onSaved?.()
      if (irParaPublicar) onGoPublish?.()
      return
    }

    const res = atualizarCarga(carga.id, patch)
    if (!res.ok) {
      setError(res.error ?? 'Erro ao salvar')
      return
    }
    if (!salvarFavorita) setInfo('Dados salvos.')
    onSaved?.()
    if (irParaPublicar) onGoPublish?.()
  }

  if (!editavel) {
    return (
      <div className="space-y-0.5 text-[13px] leading-snug">
        <Row label="Número" value={carga.numero} />
        <Row label="Pedido" value={carga.pedido || '—'} />
        <Row label="Origem" value={carga.origem || '—'} />
        <Row label="Destino" value={carga.destino || '—'} />
        <Row label="Complemento" value={labelComplemento(carga.complemento) || '—'} />
        <Row
          label="Gerenciamento de risco"
          value={labelGerenciamentoRisco(carga.gerenciamento_risco) || '—'}
        />
        <Row label="Tipo" value={carga.tipo_carga || '—'} />
        <Row label="Veículo" value={carga.veiculo || '—'} />
        <Row
          label="Carroceria"
          value={
            parseCarrocerias(carga.carrocerias).length
              ? parseCarrocerias(carga.carrocerias).join(', ')
              : '—'
          }
        />
        <Row label="Remetente" value={carga.remetente || '—'} />
        <Row label="CNPJ remetente" value={formatCnpj(carga.remetente_cnpj || '') || '—'} />
        <Row label="Destinatário" value={carga.destinatario || '—'} />
        <Row label="CNPJ destinatário" value={formatCnpj(carga.destinatario_cnpj || '') || '—'} />
        <Row label="Peso" value={formatMoneyInput(carga.peso)} />
        <Row label="Volumes" value={String(carga.volumes)} />
        <Row label="Frete tabela" value={formatCurrency(carga.frete_tabela)} />
        <Row label="Mercadorias" value={formatCurrency(carga.valor_mercadorias)} />
        <Row
          label="Carregamento"
          value={
            carga.data_carregamento
              ? new Date(carga.data_carregamento).toLocaleString('pt-BR')
              : '—'
          }
        />
        <Row
          label="Previsão entrega"
          value={
            carga.previsao_entrega
              ? new Date(carga.previsao_entrega).toLocaleString('pt-BR')
              : '—'
          }
        />
        {carga.observacao && <Row label="Obs." value={carga.observacao} />}
      </div>
    )
  }

  return (
    <div className="space-y-4 text-sm">
      <div className="flex flex-wrap items-end justify-between gap-2 border-b border-ink/10 pb-3">
        <div>
          <p className="font-display text-base font-semibold text-ink">
            Carga {carga.numero}
          </p>
          <p className="text-[11px] text-ink-muted">
            Selecione uma rota da aba Rotas ou preencha origem/destino manualmente.
          </p>
        </div>
        {rotaSelecionada && (
          <span className="rounded-full bg-brand/10 px-2.5 py-1 text-[10px] font-bold text-brand">
            Rota: {rotaSelecionada.descricao}
          </span>
        )}
      </div>

      {/* Rota */}
      <section className="space-y-2.5">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-[11px] font-bold uppercase tracking-wide text-ink-muted">
            Rota
          </h3>
          <span className="text-[10px] text-ink-muted">
            {rotasAtivas.length} cadastrada{rotasAtivas.length === 1 ? '' : 's'}
          </span>
        </div>

        <Field label="Usar rota cadastrada">
          <select
            className={inputClass}
            value={rotaId}
            disabled={!editavel}
            onChange={(e) => aplicarRotaCadastrada(e.target.value)}
          >
            <option value="">Digitar origem e destino manualmente…</option>
            {rotasAtivas.map((r) => (
              <option key={r.id} value={r.id}>
                {r.descricao} — {r.origem} → {r.destino}
                {r.frete_tabela > 0 ? ` · R$ ${formatMoneyInput(r.frete_tabela)}` : ''}
              </option>
            ))}
          </select>
          {rotasAtivas.length === 0 && (
            <p className="mt-1 text-[11px] text-ink-muted">
              Nenhuma rota ativa. Cadastre em <strong>Rotas</strong> no menu lateral.
            </p>
          )}
        </Field>

        <div className="grid gap-2.5 lg:grid-cols-[minmax(0,1fr)_minmax(220px,1fr)] lg:items-stretch">
          <div className="grid min-w-0 gap-2.5 sm:grid-cols-2">
            <Field label="Origem *" className="sm:col-span-2">
              <AddressSuggestInput
                value={origem}
                onChange={(v) => {
                  setOrigem(v)
                  if (rotaId) setRotaId('')
                }}
                localSuggestions={sugOrigem}
                minChars={2}
                placeholder="Digite o endereço como no Google Maps"
              />
            </Field>
            <Field label="Destino *" className="sm:col-span-2">
              <AddressSuggestInput
                value={destino}
                onChange={(v) => {
                  setDestino(v)
                  if (rotaId) setRotaId('')
                }}
                localSuggestions={sugDestino}
                minChars={2}
                placeholder="Digite o endereço como no Google Maps"
              />
            </Field>
            <Field label="Complemento *">
              <SuggestInput
                value={complementoTxt}
                onChange={setComplementoTxt}
                suggestions={sugComplemento}
                placeholder="Sim, Não ou Ambos"
              />
            </Field>
            <Field label="Gerenciamento de risco *">
              <SuggestInput
                value={riscoTxt}
                onChange={setRiscoTxt}
                suggestions={sugRisco}
                placeholder="Rastreador, Localizador, Ambos ou Não exige"
              />
            </Field>
            <Field label="Classificação da rota">
              <select
                className={inputClass}
                value={classificacao}
                onChange={(e) => setClassificacao(e.target.value as ClassificacaoRota)}
              >
                <option value="A">Rota A</option>
                <option value="B">Rota B</option>
                <option value="C">Rota C</option>
              </select>
            </Field>
            <Field label="Veículo *" className="sm:col-span-2">
              <VeiculoSuggestInput
                value={veiculo}
                onChange={setVeiculo}
                placeholder="Carreta, Truck, Fiorino…"
              />
            </Field>
            <label className="inline-flex items-center gap-2 text-xs text-ink sm:col-span-2">
              <input
                type="checkbox"
                checked={salvarFavorita}
                onChange={(e) => setSalvarFavorita(e.target.checked)}
              />
              <span>
                Salvar esta rota na aba <strong>Rotas</strong> para reutilizar
              </span>
            </label>
          </div>
          <RotaMapPreview
            origem={origem}
            destino={destino}
            className="h-[220px] min-h-[220px] w-full lg:h-full lg:min-h-[260px]"
          />
        </div>

        <AnttFretePanel
          origem={origem}
          destino={destino}
          veiculo={veiculo}
          value={anttInfo}
          onChange={(info, frete) => {
            setAnttInfo(info)
            if (frete != null && frete > 0) {
              setFreteTabela(formatMoneyInput(frete))
            }
          }}
        />

        <Field label="Frete tabela (R$) *">
          <SuggestInput
            value={freteTabela}
            onChange={setFreteTabela}
            suggestions={sugFrete}
            placeholder="0,00 — use Calcular ANTT ou digite"
            onBlur={() => {
              const n = parseMoneyInput(freteTabela)
              if (!Number.isNaN(n)) setFreteTabela(formatMoneyInput(n))
            }}
          />
        </Field>
      </section>

      {/* Pedido e carga */}
      <section className="space-y-2.5 border-t border-ink/10 pt-3">
        <h3 className="text-[11px] font-bold uppercase tracking-wide text-ink-muted">
          Pedido e carga
        </h3>
        <div className="grid gap-2.5 sm:grid-cols-2">
          <Field label="Pedido *">
            <SuggestInput
              value={pedido}
              onChange={setPedido}
              suggestions={sugPedido}
              placeholder="Número do pedido"
            />
          </Field>
          <Field label="Tipo de carga">
            <SuggestInput
              value={tipoCarga}
              onChange={setTipoCarga}
              suggestions={sugTipo}
              placeholder="Carga seca, refrigerada, congelada…"
            />
          </Field>
          <Field label="Carroceria">
            <CarroceriaSuggestInput
              value={carroceriaTxt}
              onChange={setCarroceriaTxt}
              placeholder="Baú, Sider, Graneleiro…"
            />
          </Field>
          <Field label="Valor mercadorias (R$)">
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
          <Field label="Peso (kg) *">
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
          <Field label="Volumes">
            <SuggestInput
              value={volumes}
              onChange={setVolumes}
              suggestions={sugVolumes}
              inputMode="numeric"
            />
          </Field>
        </div>
      </section>

      {/* Destinatário */}
      <section className="space-y-2.5 border-t border-ink/10 pt-3">
        <h3 className="text-[11px] font-bold uppercase tracking-wide text-ink-muted">
          Destinatário
        </h3>
        <div className="grid gap-2.5 sm:grid-cols-2">
          <Field label="Nome / empresa *">
            <SuggestInput
              value={destinatario}
              onChange={setDestinatario}
              suggestions={sugDestinatario}
              placeholder="Destinatário"
            />
          </Field>
          <Field label="CNPJ">
            <CnpjInput
              value={destinatarioCnpj}
              onChange={(v) => {
                const next = formatCnpj(v)
                if (cnpjDigits(next) !== ultimoCnpjBuscado.current) {
                  ultimoCnpjBuscado.current = ''
                  setCnpjInfo('')
                  setCnpjInfoOk(false)
                }
                setDestinatarioCnpj(next)
              }}
              suggestions={historico.cnpj}
              disabled={cnpjBuscando || !editavel}
              showHint={!cnpjBuscando && !cnpjInfo}
            />
            {(cnpjBuscando || cnpjInfo) && (
              <p
                className={`mt-1.5 text-[11px] ${
                  cnpjBuscando
                    ? 'text-ink-muted'
                    : cnpjInfoOk
                      ? 'text-emerald-700'
                      : 'text-amber-700'
                }`}
              >
                {cnpjBuscando ? 'Consultando CNPJ na Receita…' : cnpjInfo}
              </p>
            )}
          </Field>
        </div>
      </section>

      {/* Datas e obs */}
      <section className="space-y-2.5 border-t border-ink/10 pt-3">
        <h3 className="text-[11px] font-bold uppercase tracking-wide text-ink-muted">
          Prazos e observações
        </h3>
        <div className="grid gap-2.5 sm:grid-cols-2">
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
          <div className="sm:col-span-2">
            <Field label="Observações">
              <SuggestInput
                value={observacao}
                onChange={setObservacao}
                suggestions={sugObs}
                placeholder="Opcional — também pedidas na publicação"
              />
            </Field>
          </div>
        </div>
      </section>

      {error && (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">
          {error}
        </p>
      )}
      {info && (
        <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
          {info}
        </p>
      )}

      <div className="sticky bottom-0 -mx-1 flex flex-col gap-2 border-t border-ink/10 bg-white/95 px-1 pt-3 backdrop-blur sm:flex-row">
        <Button variant="success" className="flex-1" onClick={() => handleSalvar(false)}>
          Salvar dados
        </Button>
        <Button variant="primary" className="flex-1" onClick={() => handleSalvar(true)}>
          Salvar e publicar
        </Button>
      </div>
    </div>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-ink/5 py-0.5">
      <span className="shrink-0 text-[13px] text-ink-muted">{label}</span>
      <span className="text-right text-[13px] font-semibold text-ink">{value}</span>
    </div>
  )
}
