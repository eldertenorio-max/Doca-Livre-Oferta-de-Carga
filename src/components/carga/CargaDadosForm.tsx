import { useEffect, useState } from 'react'
import { useData } from '../../context/DataContext'
import { formatCurrency, formatMoneyInput, parseMoneyInput } from '../../lib/businessRules'
import type { Carga, ClassificacaoRota, Rota } from '../../types'
import { Button, Field, inputClass } from '../ui/Modal'

type Props = {
  carga: Carga
  canEdit: boolean
  onSaved?: () => void
  onGoPublish?: () => void
}

type ModoRota = 'manual' | 'favorita'

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

export function CargaDadosForm({ carga, canEdit, onSaved, onGoPublish }: Props) {
  const { rotas, atualizarCarga, salvarRota } = useData()
  const rotasAtivas = rotas.filter((r) => r.situacao === 'ativo')
  const editavel = canEdit && carga.status === 'nova_carga'

  const [modoRota, setModoRota] = useState<ModoRota>(
    carga.rota_id ? 'favorita' : 'manual',
  )
  const [rotaId, setRotaId] = useState(carga.rota_id ?? '')
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
    setModoRota(carga.rota_id ? 'favorita' : 'manual')
    setRotaId(carga.rota_id ?? '')
    setOrigem(carga.origem)
    setDestino(carga.destino)
    setFreteTabela(formatMoneyInput(carga.frete_tabela || 0))
    setClassificacao(carga.classificacao_rota ?? 'B')
    setSalvarFavorita(false)
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

  const rotaSelecionada =
    rotasAtivas.find((r) => r.id === rotaId) ?? rotas.find((r) => r.id === rotaId)

  function aplicarFavorita(id: string) {
    setRotaId(id)
    const r = rotas.find((x) => x.id === id)
    if (!r) return
    setOrigem(r.origem)
    setDestino(r.destino)
    setFreteTabela(formatMoneyInput(r.frete_tabela))
    setClassificacao(r.classificacao)
  }

  function handleSalvar(irParaPublicar = false) {
    setError('')
    setInfo('')
    if (!editavel) {
      setError('Esta carga já foi publicada e não pode ser editada aqui.')
      return
    }

    let origemFinal = origem.trim()
    let destinoFinal = destino.trim()
    let freteFinal = parseMoneyInput(freteTabela)
    let classifFinal: ClassificacaoRota = classificacao
    let rotaIdFinal: string | null = null

    if (modoRota === 'favorita') {
      const r = rotas.find((x) => x.id === rotaId)
      if (!r) {
        setError('Selecione uma rota favorita ou use “Criar do zero”.')
        return
      }
      origemFinal = r.origem
      destinoFinal = r.destino
      freteFinal = r.frete_tabela
      classifFinal = r.classificacao
      rotaIdFinal = r.id
    } else {
      if (!origemFinal || !destinoFinal) {
        setError('Informe origem e destino da rota.')
        return
      }
      if (Number.isNaN(freteFinal) || freteFinal <= 0) {
        setError('Informe o valor do frete tabela.')
        return
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
        setRotaId(novaRota.id)
        setInfo('Rota salva como favorita.')
      }
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
    setInfo(
      salvarFavorita && modoRota === 'manual'
        ? 'Dados salvos e rota adicionada às favoritas.'
        : 'Dados salvos.',
    )
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
        <Row
          label="Rota"
          value={rotaSelecionada?.descricao ?? `${carga.origem} → ${carga.destino}`}
        />
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

      <div className="rounded-lg border border-ink/10 bg-sand-light/30 p-3 space-y-3">
        <p className="text-xs font-semibold text-ink">Rota / trecho</p>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => {
              setModoRota('manual')
              setRotaId('')
              setSalvarFavorita(false)
            }}
            className={`rounded-lg px-3 py-1.5 text-xs font-bold transition ${
              modoRota === 'manual'
                ? 'bg-ink text-white'
                : 'bg-white text-ink-muted ring-1 ring-ink/10 hover:text-ink'
            }`}
          >
            Criar do zero
          </button>
          <button
            type="button"
            onClick={() => setModoRota('favorita')}
            className={`rounded-lg px-3 py-1.5 text-xs font-bold transition ${
              modoRota === 'favorita'
                ? 'bg-ink text-white'
                : 'bg-white text-ink-muted ring-1 ring-ink/10 hover:text-ink'
            }`}
          >
            Usar favorita
          </button>
        </div>

        {modoRota === 'favorita' ? (
          <Field label="Rota favorita *">
            <select
              className={inputClass}
              value={rotaId}
              onChange={(e) => aplicarFavorita(e.target.value)}
            >
              <option value="">Selecione…</option>
              {rotasAtivas.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.descricao} · {formatCurrency(r.frete_tabela)} · Rota {r.classificacao}
                </option>
              ))}
            </select>
            {rotasAtivas.length === 0 && (
              <p className="mt-1 text-[11px] text-amber-800">
                Nenhuma favorita ainda. Use “Criar do zero” e marque para salvar.
              </p>
            )}
          </Field>
        ) : (
          <>
            <Field label="Origem *">
              <input
                className={inputClass}
                value={origem}
                onChange={(e) => setOrigem(e.target.value)}
                placeholder="Ex.: José Bonifácio - SP"
              />
            </Field>
            <Field label="Destino *">
              <input
                className={inputClass}
                value={destino}
                onChange={(e) => setDestino(e.target.value)}
                placeholder="Ex.: Guarujá - SP ou distribuição"
                list="destinos-sugeridos"
              />
              <datalist id="destinos-sugeridos">
                <option value="distribuição" />
              </datalist>
              <p className="mt-1 text-[11px] text-ink-muted">
                Se não for um destino único, use <strong>distribuição</strong>.
              </p>
            </Field>
            <div className="grid grid-cols-2 gap-2">
              <Field label="Frete tabela (R$) *">
                <input
                  className={inputClass}
                  value={freteTabela}
                  onChange={(e) => setFreteTabela(e.target.value)}
                  onBlur={() => {
                    const n = parseMoneyInput(freteTabela)
                    if (!Number.isNaN(n)) setFreteTabela(formatMoneyInput(n))
                  }}
                  placeholder="0,00"
                />
              </Field>
              <Field label="Classificação">
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
            <label className="flex items-start gap-2 rounded-lg border border-ink/10 bg-white p-2.5 text-xs text-ink">
              <input
                type="checkbox"
                className="mt-0.5"
                checked={salvarFavorita}
                onChange={(e) => setSalvarFavorita(e.target.checked)}
              />
              <span>
                <strong>Salvar como rota favorita</strong>
                <span className="mt-0.5 block text-ink-muted">
                  Aparece na lista “Usar favorita” nas próximas cargas (também em Menu → Rotas).
                </span>
              </span>
            </label>
          </>
        )}

        {(modoRota === 'favorita' ? rotaSelecionada : origem || destino) && (
          <div className="grid grid-cols-2 gap-2 rounded-lg bg-white/80 p-2 text-xs ring-1 ring-ink/5">
            <div>
              <p className="text-ink-muted">Origem</p>
              <p className="font-medium">
                {modoRota === 'favorita' ? rotaSelecionada?.origem : origem || '—'}
              </p>
            </div>
            <div>
              <p className="text-ink-muted">Destino</p>
              <p className="font-medium">
                {modoRota === 'favorita' ? rotaSelecionada?.destino : destino || '—'}
              </p>
            </div>
            <div>
              <p className="text-ink-muted">Frete tabela</p>
              <p className="font-semibold">
                {modoRota === 'favorita'
                  ? formatCurrency(rotaSelecionada?.frete_tabela ?? 0)
                  : formatCurrency(parseMoneyInput(freteTabela) || 0)}
              </p>
            </div>
            <div>
              <p className="text-ink-muted">Classificação</p>
              <p className="font-semibold">
                Rota {modoRota === 'favorita' ? rotaSelecionada?.classificacao : classificacao}
              </p>
            </div>
          </div>
        )}
      </div>

      <Field label="Pedido *">
        <input className={inputClass} value={pedido} onChange={(e) => setPedido(e.target.value)} />
      </Field>

      <div className="grid grid-cols-2 gap-2">
        <Field label="Tipo de carga">
          <input
            className={inputClass}
            value={tipoCarga}
            onChange={(e) => setTipoCarga(e.target.value)}
            list="sugestoes-tipo-carga"
            placeholder="Escolha ou digite…"
            autoComplete="off"
          />
          <datalist id="sugestoes-tipo-carga">
            {SUGESTOES_TIPO_CARGA.map((s) => (
              <option key={s} value={s} />
            ))}
          </datalist>
        </Field>
        <Field label="Veículo">
          <input
            className={inputClass}
            value={veiculo}
            onChange={(e) => setVeiculo(e.target.value)}
            list="sugestoes-veiculo"
            placeholder="Escolha ou digite…"
            autoComplete="off"
          />
          <datalist id="sugestoes-veiculo">
            {SUGESTOES_VEICULO.map((s) => (
              <option key={s} value={s} />
            ))}
          </datalist>
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
