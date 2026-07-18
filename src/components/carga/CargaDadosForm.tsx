import { useEffect, useState } from 'react'
import { useData } from '../../context/DataContext'
import { formatCurrency, formatMoneyInput, parseMoneyInput } from '../../lib/businessRules'
import type { Carga } from '../../types'
import { Button, Field, inputClass } from '../ui/Modal'

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

export function CargaDadosForm({ carga, canEdit, onSaved, onGoPublish }: Props) {
  const { rotas, atualizarCarga } = useData()
  const rotasAtivas = rotas.filter((r) => r.situacao === 'ativo')
  const editavel = canEdit && carga.status === 'nova_carga'

  const [rotaId, setRotaId] = useState(carga.rota_id ?? '')
  const [pedido, setPedido] = useState(carga.pedido)
  const [tipoCarga, setTipoCarga] = useState(carga.tipo_carga)
  const [veiculo, setVeiculo] = useState(carga.veiculo)
  const [destinatario, setDestinatario] = useState(carga.destinatario)
  const [destinatarioCnpj, setDestinatarioCnpj] = useState(carga.destinatario_cnpj)
  const [peso, setPeso] = useState(formatMoneyInput(carga.peso || 0))
  const [volumes, setVolumes] = useState(String(carga.volumes || 0))
  const [valorMerc, setValorMerc] = useState(formatMoneyInput(carga.valor_mercadorias || 0))
  const [dataCarreg, setDataCarreg] = useState(toDateInput(carga.data_carregamento))
  const [previsao, setPrevisao] = useState(toDateInput(carga.previsao_entrega))
  const [observacao, setObservacao] = useState(carga.observacao ?? '')
  const [error, setError] = useState('')
  const [info, setInfo] = useState('')

  useEffect(() => {
    setRotaId(carga.rota_id ?? '')
    setPedido(carga.pedido)
    setTipoCarga(carga.tipo_carga)
    setVeiculo(carga.veiculo)
    setDestinatario(carga.destinatario)
    setDestinatarioCnpj(carga.destinatario_cnpj)
    setPeso(formatMoneyInput(carga.peso || 0))
    setVolumes(String(carga.volumes || 0))
    setValorMerc(formatMoneyInput(carga.valor_mercadorias || 0))
    setDataCarreg(toDateInput(carga.data_carregamento))
    setPrevisao(toDateInput(carga.previsao_entrega))
    setObservacao(carga.observacao ?? '')
    setError('')
    setInfo('')
  }, [carga.id, carga.updated_at])

  const rota = rotasAtivas.find((r) => r.id === rotaId) ?? rotas.find((r) => r.id === rotaId)

  function handleRotaChange(id: string) {
    setRotaId(id)
    const r = rotas.find((x) => x.id === id)
    if (!r) return
  }

  function handleSalvar(irParaPublicar = false) {
    setError('')
    setInfo('')
    if (!editavel) {
      setError('Esta carga já foi publicada e não pode ser editada aqui.')
      return
    }
    const r = rotas.find((x) => x.id === rotaId)
    if (!r) {
      setError('Selecione uma rota.')
      return
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
      rota_id: r.id,
      classificacao_rota: r.classificacao,
      origem: r.origem,
      destino: r.destino,
      frete_tabela: r.frete_tabela,
      pedido: pedido.trim(),
      tipo_carga: tipoCarga.trim() || 'COMERCIAL - SECO',
      veiculo: veiculo.trim() || 'CARRETA BAU',
      destinatario: destinatario.trim(),
      destinatario_cnpj: destinatarioCnpj.trim(),
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
    setInfo('Dados salvos.')
    onSaved?.()
    if (irParaPublicar) onGoPublish?.()
  }

  if (!editavel) {
    return (
      <div className="space-y-2 text-sm">
        <p className="rounded-lg bg-sand-light/50 px-3 py-2 text-xs text-ink-muted">
          Dados da carga (somente leitura após publicação).
        </p>
        <Row label="Número" value={carga.numero} />
        <Row label="Pedido" value={carga.pedido} />
        <Row label="Rota" value={rota?.descricao ?? `${carga.origem} → ${carga.destino}`} />
        <Row label="Origem" value={carga.origem} />
        <Row label="Destino" value={carga.destino} />
        <Row label="Tipo" value={carga.tipo_carga} />
        <Row label="Veículo" value={carga.veiculo} />
        <Row label="Destinatário" value={carga.destinatario} />
        <Row label="Peso" value={formatMoneyInput(carga.peso)} />
        <Row label="Volumes" value={String(carga.volumes)} />
        <Row label="Frete tabela" value={formatCurrency(carga.frete_tabela)} />
        <Row label="Mercadorias" value={formatCurrency(carga.valor_mercadorias)} />
        {carga.observacao && <Row label="Obs." value={carga.observacao} />}
      </div>
    )
  }

  return (
    <div className="space-y-3 text-sm">
      <p className="text-xs text-ink-muted">
        Preencha os dados da carga <strong>{carga.numero}</strong> e salve antes de publicar.
      </p>

      <Field label="Rota *">
        <select
          className={inputClass}
          value={rotaId}
          onChange={(e) => handleRotaChange(e.target.value)}
        >
          <option value="">Selecione…</option>
          {rotasAtivas.map((r) => (
            <option key={r.id} value={r.id}>
              {r.descricao} · {formatCurrency(r.frete_tabela)} · Rota {r.classificacao}
            </option>
          ))}
        </select>
      </Field>

      {rota && (
        <div className="grid grid-cols-2 gap-2 rounded-lg bg-sand-light/40 p-2 text-xs">
          <div>
            <p className="text-ink-muted">Origem</p>
            <p className="font-medium">{rota.origem}</p>
          </div>
          <div>
            <p className="text-ink-muted">Destino</p>
            <p className="font-medium">{rota.destino}</p>
          </div>
          <div>
            <p className="text-ink-muted">Frete tabela</p>
            <p className="font-semibold">{formatCurrency(rota.frete_tabela)}</p>
          </div>
          <div>
            <p className="text-ink-muted">Classificação</p>
            <p className="font-semibold">Rota {rota.classificacao}</p>
          </div>
        </div>
      )}

      <Field label="Pedido *">
        <input className={inputClass} value={pedido} onChange={(e) => setPedido(e.target.value)} />
      </Field>

      <div className="grid grid-cols-2 gap-2">
        <Field label="Tipo de carga">
          <input
            className={inputClass}
            value={tipoCarga}
            onChange={(e) => setTipoCarga(e.target.value)}
          />
        </Field>
        <Field label="Veículo">
          <input
            className={inputClass}
            value={veiculo}
            onChange={(e) => setVeiculo(e.target.value)}
          />
        </Field>
      </div>

      <Field label="Destinatário *">
        <input
          className={inputClass}
          value={destinatario}
          onChange={(e) => setDestinatario(e.target.value)}
        />
      </Field>
      <Field label="CNPJ destinatário">
        <input
          className={inputClass}
          value={destinatarioCnpj}
          onChange={(e) => setDestinatarioCnpj(e.target.value)}
        />
      </Field>

      <div className="grid grid-cols-2 gap-2">
        <Field label="Peso (kg) *">
          <input
            className={inputClass}
            value={peso}
            onChange={(e) => setPeso(e.target.value)}
            onBlur={() => {
              const n = parseMoneyInput(peso)
              if (!Number.isNaN(n)) setPeso(formatMoneyInput(n))
            }}
          />
        </Field>
        <Field label="Volumes">
          <input
            className={inputClass}
            value={volumes}
            onChange={(e) => setVolumes(e.target.value)}
            inputMode="numeric"
          />
        </Field>
      </div>

      <Field label="Valor mercadorias (R$)">
        <input
          className={inputClass}
          value={valorMerc}
          onChange={(e) => setValorMerc(e.target.value)}
          onBlur={() => {
            const n = parseMoneyInput(valorMerc)
            if (!Number.isNaN(n)) setValorMerc(formatMoneyInput(n))
          }}
        />
      </Field>

      <div className="grid grid-cols-2 gap-2">
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
      </div>

      <Field label="Observações">
        <textarea
          className={`${inputClass} min-h-16`}
          value={observacao}
          onChange={(e) => setObservacao(e.target.value)}
          placeholder="Opcional — também pedidas na publicação"
        />
      </Field>

      {error && <p className="text-xs text-brand">{error}</p>}
      {info && <p className="text-xs text-emerald-700">{info}</p>}

      <div className="flex flex-col gap-2">
        <Button variant="success" className="w-full" onClick={() => handleSalvar(false)}>
          Salvar dados
        </Button>
        <Button variant="primary" className="w-full" onClick={() => handleSalvar(true)}>
          Salvar e ir para Publicar
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
