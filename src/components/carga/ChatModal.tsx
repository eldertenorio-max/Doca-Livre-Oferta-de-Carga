import { useEffect, useRef, useState } from 'react'
import { useData } from '../../context/DataContext'
import {
  formatCurrency,
  formatDateTime,
  formatNumber,
} from '../../lib/businessRules'
import type { Carga } from '../../types'
import { Button, Modal, inputClass } from '../ui/Modal'

interface ChatModalProps {
  carga: Carga | null
  open: boolean
  onClose: () => void
}

function ChatInfoItem({ label, value }: { label: string; value: string }) {
  if (!value || value === '—') return null
  return (
    <div className="min-w-0">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-ink-muted">{label}</p>
      <p className="truncate text-xs font-semibold text-ink" title={value}>
        {value}
      </p>
    </div>
  )
}

function freteExibido(carga: Carga) {
  if (carga.frete_fechado != null && carga.frete_fechado > 0) {
    return formatCurrency(carga.frete_fechado)
  }
  if (carga.frete_oferta != null && carga.frete_oferta > 0) {
    return formatCurrency(carga.frete_oferta)
  }
  if (carga.frete_tabela > 0) return formatCurrency(carga.frete_tabela)
  return '—'
}

function dataCurta(iso?: string | null) {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleDateString('pt-BR')
}

export function ChatModal({ carga, open, onClose }: ChatModalProps) {
  const { user, mensagensDaCarga, enviarMensagemCarga, marcarChatLido } = useData()
  const [texto, setTexto] = useState('')
  const [error, setError] = useState('')
  const bottomRef = useRef<HTMLDivElement>(null)

  const mensagens = carga ? mensagensDaCarga(carga.id) : []

  useEffect(() => {
    if (open && carga) {
      setTexto('')
      setError('')
    }
  }, [open, carga?.id])

  // Abre o chat ou chega mensagem nova → marca como lido (tira badge e sininho)
  useEffect(() => {
    if (open && carga) {
      marcarChatLido(carga.id)
    }
  }, [open, carga?.id, mensagens.length, marcarChatLido, carga])

  useEffect(() => {
    if (open) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
  }, [open, mensagens.length])

  if (!carga) return null

  function enviar() {
    const result = enviarMensagemCarga(carga!.id, texto)
    if (!result.ok) {
      setError(result.error ?? 'Não foi possível enviar.')
      return
    }
    setTexto('')
    setError('')
  }

  const carroceria =
    carga.carrocerias && carga.carrocerias.length > 0
      ? carga.carrocerias.join(', ')
      : '—'

  return (
    <Modal open={open} title={`Chat — ${carga.numero}`} onClose={onClose}>
      <div className="flex flex-col gap-3">
        <div className="rounded-xl border border-ink/10 bg-sand-light/70 p-3">
          <p className="text-sm font-bold text-ink">
            {carga.origem || '—'} → {carga.destino || '—'}
          </p>
          <div className="mt-2.5 grid grid-cols-2 gap-x-3 gap-y-2 sm:grid-cols-3">
            <ChatInfoItem label="Pedido" value={carga.pedido || '—'} />
            <ChatInfoItem label="Tipo" value={carga.tipo_carga || '—'} />
            <ChatInfoItem label="Veículo" value={carga.veiculo || '—'} />
            <ChatInfoItem label="Carroceria" value={carroceria} />
            <ChatInfoItem
              label="Risco"
              value={
                carga.gerenciamento_risco === 'rastreador'
                  ? 'Rastreador'
                  : carga.gerenciamento_risco === 'localizador'
                    ? 'Localizador'
                    : carga.gerenciamento_risco === 'ambos'
                      ? 'Ambos'
                      : carga.gerenciamento_risco === 'nao'
                        ? 'Não exige'
                        : '—'
              }
            />
            <ChatInfoItem
              label="Peso"
              value={carga.peso > 0 ? `${formatNumber(carga.peso)} kg` : '—'}
            />
            <ChatInfoItem
              label="Volumes"
              value={carga.volumes > 0 ? formatNumber(carga.volumes) : '—'}
            />
            <ChatInfoItem label="Frete" value={freteExibido(carga)} />
            <ChatInfoItem label="Carregamento" value={dataCurta(carga.data_carregamento)} />
            <ChatInfoItem label="Entrega" value={dataCurta(carga.previsao_entrega)} />
            <ChatInfoItem label="Destinatário" value={carga.destinatario || '—'} />
            {carga.observacao?.trim() ? (
              <div className="col-span-2 min-w-0 sm:col-span-3">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-ink-muted">
                  Observação
                </p>
                <p className="text-xs text-ink">{carga.observacao.trim()}</p>
              </div>
            ) : null}
          </div>
        </div>

        <div className="flex max-h-80 min-h-[220px] flex-col gap-2 overflow-y-auto rounded-lg border border-ink/10 bg-sand-light/60 p-3">
          {mensagens.length === 0 ? (
            <p className="m-auto text-center text-sm text-ink-muted">
              Nenhuma mensagem ainda. Use o chat só para conversar — a negociação de frete é pelo card.
            </p>
          ) : (
            mensagens.map((m) => {
              const mine = user?.id === m.autor_id
              return (
                <div
                  key={m.id}
                  className={`flex flex-col ${mine ? 'items-end' : 'items-start'}`}
                >
                  <div
                    className={`max-w-[85%] rounded-xl px-3 py-2 text-sm ${
                      mine
                        ? 'bg-ink text-white'
                        : 'border border-ink/10 bg-panel text-ink'
                    }`}
                  >
                    <p className="mb-1 text-[11px] font-semibold opacity-80">
                      {m.autor_nome}
                      <span className="ml-1 font-normal opacity-70">
                        · {m.autor_role === 'transportador' ? 'Transportador' : 'Embarcador'}
                      </span>
                    </p>
                    <p className="whitespace-pre-wrap break-words">{m.texto}</p>
                  </div>
                  <span className="mt-0.5 px-1 text-[10px] text-ink-muted">
                    {formatDateTime(m.created_at)}
                  </span>
                </div>
              )
            })
          )}
          <div ref={bottomRef} />
        </div>

        {error && <p className="text-sm text-[#dc2626]">{error}</p>}

        <div className="flex gap-2">
          <textarea
            className={`${inputClass} min-h-[44px] flex-1 resize-none`}
            rows={2}
            placeholder="Escreva uma mensagem…"
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                e.stopPropagation()
                enviar()
              }
            }}
          />
          <Button
            type="button"
            className="self-end"
            onClick={(e) => {
              e.preventDefault()
              e.stopPropagation()
              enviar()
            }}
          >
            Enviar
          </Button>
        </div>
      </div>
    </Modal>
  )
}
