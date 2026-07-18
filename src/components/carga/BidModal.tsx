import { useEffect, useState } from 'react'
import { useData } from '../../context/DataContext'
import {
  formatCurrency,
  formatDateTime,
  formatMoneyInput,
  formatNumber,
  parseMoneyInput,
  roundMoney,
} from '../../lib/businessRules'
import type { Carga } from '../../types'
import { Button, Field, Modal, inputClass } from '../ui/Modal'

interface BidModalProps {
  carga: Carga | null
  open: boolean
  onClose: () => void
}

export function BidModal({ carga, open, onClose }: BidModalProps) {
  const { enviarLance, registrarVisualizacao, user, lancesDaCarga } = useData()
  const [valor, setValor] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    if (open && carga) {
      registrarVisualizacao(carga.id)
      const meu = lancesDaCarga(carga.id).find(
        (l) => l.transportador_id === user?.transportador_id && l.status === 'ativo',
      )
      const ref = roundMoney(carga.frete_oferta ?? carga.frete_tabela)
      const sugestao =
        meu?.valor != null
          ? roundMoney(meu.valor)
          : carga.frete_maximo != null
            ? roundMoney(Math.min(ref, carga.frete_maximo))
            : ref
      setValor(formatMoneyInput(sugestao))
      setError('')
    }
  }, [open, carga, registrarVisualizacao, lancesDaCarga, user])

  if (!carga) return null

  const freteRef = roundMoney(carga.frete_oferta ?? carga.frete_tabela)
  const jaFechada = Boolean(carga.transportador_vencedor_id)
  const suspensa = carga.status === 'suspensas'
  const encerrada =
    Boolean(carga.expira_em && new Date(carga.expira_em).getTime() < Date.now()) &&
    !carga.transportador_vencedor_id
  const bloqueado = jaFechada || encerrada || suspensa

  function submitValor(num: number) {
    if (Number.isNaN(num)) {
      setError('Valor inválido')
      return
    }
    if (jaFechada) {
      setError('Esta carga já tem frete fechado.')
      return
    }
    if (suspensa) {
      setError('Negociação suspensa pelo embarcador.')
      return
    }
    if (encerrada) {
      setError('Prazo de negociação encerrado.')
      return
    }
    if (carga!.frete_minimo != null && num < carga!.frete_minimo) {
      setError(`Lance mínimo: ${formatCurrency(carga!.frete_minimo)}`)
      return
    }
    if (carga!.frete_maximo != null && num > carga!.frete_maximo) {
      setError(`Lance máximo: ${formatCurrency(carga!.frete_maximo)}`)
      return
    }
    const res = enviarLance(carga!.id, num)
    if (!res.ok) {
      setError(res.error ?? 'Erro ao enviar lance')
      return
    }
    onClose()
  }

  function handleSend() {
    submitValor(parseMoneyInput(valor))
  }

  function handleAccept() {
    const aceito = roundMoney(freteRef)
    setValor(formatMoneyInput(aceito))
    submitValor(aceito)
  }

  return (
    <Modal open={open} title="Registrar lance" onClose={onClose} wide>
      <div className="space-y-4">
        <div className="rounded-lg bg-emerald-50/80 p-4 text-sm">
          <div className="grid gap-2 sm:grid-cols-2">
            <Detail label="Carga" value={carga.numero} />
            <Detail label="Carregamento" value={formatDateTime(carga.data_carregamento)} />
            <Detail label="Pedido" value={carga.pedido} />
            <Detail label="Tipo" value={carga.tipo_carga} />
            <Detail label="Veículo" value={carga.veiculo} />
            <Detail label="Origem" value={carga.origem} />
            <Detail label="Destino" value={carga.destino} />
            <Detail label="Peso" value={formatNumber(carga.peso)} />
            <Detail label="Frete Tabela" value={formatCurrency(carga.frete_tabela)} />
            <Detail label="Frete Oferta" value={formatCurrency(freteRef)} />
            {carga.frete_minimo != null && (
              <Detail label="Lance mínimo" value={formatCurrency(roundMoney(carga.frete_minimo))} />
            )}
            {carga.frete_maximo != null && (
              <Detail label="Lance máximo" value={formatCurrency(roundMoney(carga.frete_maximo))} />
            )}
            <Detail
              label="Modo"
              value={carga.modo_publicacao === 'oferta' ? 'Oferta (1ª menor fecha)' : 'Leilão'}
            />
            <Detail label="Prioridade" value={carga.prioridade ?? '—'} />
          </div>
        </div>

        <Field label="Sua oferta (R$)">
          <input
            className={`${inputClass} text-lg font-bold tabular-nums`}
            value={valor}
            inputMode="decimal"
            onChange={(e) => setValor(e.target.value)}
            onBlur={() => {
              const n = parseMoneyInput(valor)
              if (!Number.isNaN(n)) setValor(formatMoneyInput(n))
            }}
            disabled={bloqueado}
            placeholder="0,00"
          />
        </Field>

        {carga.modo_publicacao === 'oferta' && (
          <p className="text-xs text-ink-muted">
            Modo Oferta: aceitar o frete oferta ou enviar lance até esse valor fecha o frete.
            Após enviar, o valor não pode ser alterado.
          </p>
        )}
        {carga.modo_publicacao === 'leilao' && (
          <p className="text-xs text-ink-muted">
            Modo Leilão: você pode atualizar o lance até o fim do prazo. Em empate de valor, vence
            o mais antigo (ou o embarcador decide manualmente). Use “Aceitar oferta” para propor
            exatamente o frete oferta ({formatCurrency(freteRef)}).
          </p>
        )}
        {suspensa && (
          <p className="text-xs text-amber-800">Negociação suspensa — aguarde a retomada.</p>
        )}

        {error && <p className="text-sm text-brand">{error}</p>}

        <div className="flex flex-wrap gap-2">
          <Button
            variant="primary"
            className="min-w-[140px] flex-1"
            onClick={handleAccept}
            disabled={bloqueado}
          >
            Aceitar oferta
          </Button>
          <Button
            variant="success"
            className="min-w-[140px] flex-1"
            onClick={handleSend}
            disabled={bloqueado}
          >
            Enviar lance
          </Button>
          <Button variant="danger" className="min-w-[100px] flex-1" onClick={onClose}>
            Fechar
          </Button>
        </div>
      </div>
    </Modal>
  )
}

interface AllocateModalProps {
  carga: Carga | null
  open: boolean
  onClose: () => void
}

export function AllocateModal({ carga, open, onClose }: AllocateModalProps) {
  const { alocarComposicao, veiculos, motoristas, motoristasDoTransportador, user } = useData()
  const [veiculoId, setVeiculoId] = useState('')
  const [motoristaId, setMotoristaId] = useState('')
  const [placa, setPlaca] = useState('')
  const [motorista, setMotorista] = useState('')
  const [error, setError] = useState('')

  const tid = carga?.transportador_vencedor_id ?? user?.transportador_id ?? ''
  const veiculosOpts = (veiculos ?? []).filter(
    (v) => v.transportador_id === tid && v.situacao === 'ativo',
  )
  const motoristasOpts = tid
    ? motoristasDoTransportador(tid).filter((m) => m.situacao === 'ativo')
    : []

  useEffect(() => {
    if (open && carga) {
      setVeiculoId(carga.veiculo_id ?? '')
      setMotoristaId(carga.motorista_id ?? '')
      setPlaca(carga.placa ?? '')
      setMotorista(carga.motorista ?? '')
      setError('')
    }
  }, [open, carga])

  if (!carga) return null

  async function handleSave() {
    const res = await alocarComposicao(carga!.id, placa, motorista, {
      veiculoId: veiculoId || undefined,
      motoristaId: motoristaId || undefined,
    })
    if (!res.ok) {
      setError(res.error ?? 'Erro')
      return
    }
    onClose()
  }

  return (
    <Modal open={open} title="Alocar composição" onClose={onClose}>
      <div className="space-y-3">
        <p className="text-sm text-ink-muted">
          Carga {carga.numero} — Frete {formatCurrency(carga.frete_fechado ?? 0)}
        </p>
        <Field label="Veículo cadastrado">
          <select
            className={inputClass}
            value={veiculoId}
            onChange={(e) => {
              const id = e.target.value
              setVeiculoId(id)
              const v = veiculosOpts.find((x) => x.id === id)
              if (v) setPlaca(v.placa)
              const mLink = (motoristas ?? []).find(
                (m) => m.veiculo_id === id && m.situacao === 'ativo',
              )
              if (mLink) {
                setMotoristaId(mLink.id)
                setMotorista(mLink.nome)
              }
            }}
          >
            <option value="">Digitar placa manualmente…</option>
            {veiculosOpts.map((v) => (
              <option key={v.id} value={v.id}>
                {v.placa} — {v.tipo || v.modelo || 'veículo'}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Placa do veículo">
          <input
            className={inputClass}
            value={placa}
            onChange={(e) => {
              setPlaca(e.target.value.toUpperCase())
              setVeiculoId('')
            }}
            placeholder="ABC1D23"
          />
        </Field>
        <Field label="Motorista cadastrado">
          <select
            className={inputClass}
            value={motoristaId}
            onChange={(e) => {
              const id = e.target.value
              setMotoristaId(id)
              const m = motoristasOpts.find((x) => x.id === id)
              if (m) setMotorista(m.nome)
            }}
          >
            <option value="">Digitar nome manualmente…</option>
            {motoristasOpts.map((m) => (
              <option key={m.id} value={m.id}>
                {m.nome}
                {m.cnh ? ` · CNH ${m.cnh}` : ''}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Nome do motorista">
          <input
            className={inputClass}
            value={motorista}
            onChange={(e) => {
              setMotorista(e.target.value)
              setMotoristaId('')
            }}
            placeholder="Nome completo"
          />
        </Field>
        {error && <p className="text-sm text-brand">{error}</p>}
        <div className="flex gap-2">
          <Button variant="success" className="flex-1" onClick={handleSave}>
            Confirmar alocação
          </Button>
          <Button variant="ghost" className="flex-1" onClick={onClose}>
            Cancelar
          </Button>
        </div>
      </div>
    </Modal>
  )
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[10px] text-ink-muted uppercase">{label}</p>
      <p className="font-medium capitalize">{value}</p>
    </div>
  )
}
