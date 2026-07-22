import { useEffect, useMemo, useState } from 'react'
import { useData } from '../../context/DataContext'
import { formatCurrency, formatMoneyInput, parseMoneyInput } from '../../lib/businessRules'
import { buscarCidades, filtrarSugestoes } from '../../lib/cidadesBrasil'
import { formatCnpj } from '../../lib/cnpj'
import type { Carga, ClassificacaoRota, Rota } from '../../types'
import { Button, Field, inputClass } from '../ui/Modal'
import { CnpjInput } from '../ui/CnpjInput'
import { SuggestInput } from '../ui/SuggestInput'

type Props = {
  carga: Carga
  canEdit: boolean
  onSaved?: () => void
  onGoPublish?: () => void
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

const SUGESTOES_TIPO_CARGA = [
  'COMERCIAL - SECO',
  'COMERCIAL - CONG',
  'COMERCIAL - CONG - CTRN',
  'COMERCIAL - REFRIGERADO',
  'COMERCIAL - FRIGORIFICADO',
  'INDUSTRIAL - SECO',
  'GRANEL',
  'PERIGOSA',
  'PALLETIZADA',
]

const SUGESTOES_VEICULO = [
  'CARRETA BAU',
  'CARRETA (CONTAINER 40)',
  'CARRETA (CONTAINER 20)',
  'CARRETA SIDER',
  'CARRETA GRADE BAIXA',
  'BITREM',
  'RODOTREM',
  'TRUCK',
  'TOCO',
  'VUC',
  '3/4',
]

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

export function CargaDadosForm({ carga, canEdit, onSaved, onGoPublish }: Props) {
  const { rotas, cargas, atualizarCarga, salvarRota } = useData()
  const editavel = canEdit && carga.status === 'nova_carga'

  const [origem, setOrigem] = useState(carga.origem)
  const [destino, setDestino] = useState(carga.destino)
  const [freteTabela, setFreteTabela] = useState(formatMoneyInput(carga.frete_tabela || 0))
  const [classificacao, setClassificacao] = useState<ClassificacaoRota>(
    carga.classificacao_rota ?? 'B',
  )
  const [salvarFavorita, setSalvarFavorita] = useState(false)
  const [pedido, setPedido] = useState(carga.pedido)
  const [tipoCarga, setTipoCarga] = useState(carga.tipo_carga)
  const [veiculo, setVeiculo] = useState(carga.veiculo)
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
    () => (q: string) => filtrarSugestoes(q, [SUGESTOES_TIPO_CARGA, historico.tipo], 12),
    [historico.tipo],
  )

  const sugVeiculo = useMemo(
    () => (q: string) => filtrarSugestoes(q, [SUGESTOES_VEICULO, historico.veiculo], 12),
    [historico.veiculo],
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
    setFreteTabela(formatMoneyInput(carga.frete_tabela || 0))
    setClassificacao(carga.classificacao_rota ?? 'B')
    setSalvarFavorita(false)
    setPedido(carga.pedido)
    setTipoCarga(carga.tipo_carga)
    setVeiculo(carga.veiculo)
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
  }, [carga.id, carga.updated_at])

  const rotaSelecionada = rotas.find((r) => r.id === carga.rota_id)

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
    if (Number.isNaN(freteFinal) || freteFinal <= 0) {
      setError('Informe o valor do frete tabela.')
      return
    }

    let rotaIdFinal: string | null = carga.rota_id
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
        km: 0,
        situacao: 'ativo',
      }
      salvarRota(novaRota)
      rotaIdFinal = novaRota.id
      setInfo('Rota salva nas favoritas (aba Cargas salvas).')
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

    const res = atualizarCarga(carga.id, {
      rota_id: rotaIdFinal,
      classificacao_rota: classifFinal,
      origem: origemFinal,
      destino: destinoFinal,
      frete_tabela: freteFinal,
      pedido: pedido.trim(),
      tipo_carga: tipoCarga.trim() || 'COMERCIAL - SECO',
      veiculo: veiculo.trim() || 'CARRETA BAU',
      destinatario: destinatario.trim(),
      destinatario_cnpj: formatCnpj(destinatarioCnpj),
      peso: pesoNum,
      volumes: Math.round(volumesNum),
      valor_mercadorias: valorNum,
      data_carregamento: fromDateInput(dataCarreg),
      previsao_entrega: fromDateInput(previsao),
      observacao: observacao.trim() || undefined,
    })
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
      <div className="space-y-2 text-sm">
        <Row label="Número" value={carga.numero} />
        <Row label="Pedido" value={carga.pedido || '—'} />
        <Row label="Origem" value={carga.origem || '—'} />
        <Row label="Destino" value={carga.destino || '—'} />
        <Row label="Tipo" value={carga.tipo_carga || '—'} />
        <Row label="Veículo" value={carga.veiculo || '—'} />
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
            Preencha, salve e vá para Publicar. Digite para ver sugestões.
          </p>
        </div>
        {rotaSelecionada && (
          <span className="rounded-full bg-brand/10 px-2.5 py-1 text-[10px] font-bold text-brand">
            Favorita: {rotaSelecionada.descricao}
          </span>
        )}
      </div>

      {/* Rota */}
      <section className="space-y-2.5">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-[11px] font-bold uppercase tracking-wide text-ink-muted">
            Rota
          </h3>
          <span className="text-[10px] text-ink-muted">Favoritas → aba Cargas salvas</span>
        </div>
        <div className="grid gap-2.5 sm:grid-cols-2">
          <Field label="Origem *">
            <SuggestInput
              value={origem}
              onChange={setOrigem}
              suggestions={sugOrigem}
              minChars={2}
              placeholder="Cidade - UF (ex.: Sao)"
            />
          </Field>
          <Field label="Destino *">
            <SuggestInput
              value={destino}
              onChange={setDestino}
              suggestions={sugDestino}
              minChars={2}
              placeholder="Cidade - UF ou Distribuição"
            />
          </Field>
          <Field label="Frete tabela (R$) *">
            <SuggestInput
              value={freteTabela}
              onChange={setFreteTabela}
              suggestions={sugFrete}
              placeholder="0,00"
              onBlur={() => {
                const n = parseMoneyInput(freteTabela)
                if (!Number.isNaN(n)) setFreteTabela(formatMoneyInput(n))
              }}
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
        </div>
        <label className="inline-flex items-center gap-2 text-xs text-ink">
          <input
            type="checkbox"
            checked={salvarFavorita}
            onChange={(e) => setSalvarFavorita(e.target.checked)}
          />
          <span>
            Salvar esta rota como <strong>favorita</strong>
          </span>
        </label>
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
              placeholder="Escolha ou digite…"
            />
          </Field>
          <Field label="Veículo">
            <SuggestInput
              value={veiculo}
              onChange={setVeiculo}
              suggestions={sugVeiculo}
              placeholder="Escolha ou digite…"
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
              onChange={setDestinatarioCnpj}
              suggestions={historico.cnpj}
            />
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
    <div className="flex justify-between gap-3 border-b border-ink/5 pb-1">
      <span className="shrink-0 text-xs text-ink-muted">{label}</span>
      <span className="text-right text-xs font-medium">{value}</span>
    </div>
  )
}
