import { useEffect, useState } from 'react'
import { useData } from '../../context/DataContext'
import { formatCurrency, formatDateTime, formatNumber } from '../../lib/businessRules'
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
      const ref = carga.frete_oferta ?? carga.frete_tabela
      setValor(String(meu?.valor ?? Math.round(ref * 0.97)))
      setError('')
    }
  }, [open, carga, registrarVisualizacao, lancesDaCarga, user])

  if (!carga) return null

  const freteRef = carga.frete_oferta ?? carga.frete_tabela

  function handleSend() {
    const num = Number(String(valor).replace(',', '.'))
    if (Number.isNaN(num)) {
      setError('Valor inválido')
      return
    }
    const res = enviarLance(carga!.id, num)
    if (!res.ok) {
      setError(res.error ?? 'Erro ao enviar lance')
      return
    }
    onClose()
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
            <Detail
              label="Modo"
              value={carga.modo_publicacao === 'oferta' ? 'Oferta (1ª menor fecha)' : 'Leilão'}
            />
            <Detail label="Prioridade" value={carga.prioridade ?? '—'} />
          </div>
        </div>

        <Field label="Sua oferta (R$)">
          <input
            className={`${inputClass} text-lg font-bold`}
            value={valor}
            onChange={(e) => setValor(e.target.value)}
          />
        </Field>

        {carga.modo_publicacao === 'oferta' && (
          <p className="text-xs text-ink-muted">
            Modo Oferta: o primeiro lance abaixo de {formatCurrency(freteRef)} fecha o frete
            automaticamente.
          </p>
        )}

        {error && <p className="text-sm text-brand">{error}</p>}

        <div className="flex gap-2">
          <Button variant="success" className="flex-1" onClick={handleSend}>
            Enviar
          </Button>
          <Button variant="danger" className="flex-1" onClick={onClose}>
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
  const { alocarComposicao } = useData()
  const [placa, setPlaca] = useState('')
  const [motorista, setMotorista] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    if (open) {
      setPlaca(carga?.placa ?? '')
      setMotorista(carga?.motorista ?? '')
      setError('')
    }
  }, [open, carga])

  if (!carga) return null

  function handleSave() {
    const res = alocarComposicao(carga!.id, placa, motorista)
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
        <Field label="Placa do veículo">
          <input
            className={inputClass}
            value={placa}
            onChange={(e) => setPlaca(e.target.value.toUpperCase())}
            placeholder="ABC1D23"
          />
        </Field>
        <Field label="Motorista">
          <input
            className={inputClass}
            value={motorista}
            onChange={(e) => setMotorista(e.target.value)}
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
