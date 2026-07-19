import { useEffect, useRef, useState } from 'react'
import { useData } from '../../context/DataContext'
import { formatDateTime } from '../../lib/businessRules'
import type { Carga } from '../../types'
import { Button, Modal, inputClass } from '../ui/Modal'

interface ChatModalProps {
  carga: Carga | null
  open: boolean
  onClose: () => void
}

export function ChatModal({ carga, open, onClose }: ChatModalProps) {
  const { user, mensagensDaCarga, enviarMensagemCarga } = useData()
  const [texto, setTexto] = useState('')
  const [error, setError] = useState('')
  const bottomRef = useRef<HTMLDivElement>(null)

  const mensagens = carga ? mensagensDaCarga(carga.id) : []

  useEffect(() => {
    if (open) {
      setTexto('')
      setError('')
    }
  }, [open, carga?.id])

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

  return (
    <Modal open={open} title={`Chat — ${carga.numero}`} onClose={onClose}>
      <div className="flex flex-col gap-3">
        <p className="text-xs text-ink-muted">
          {carga.origem} → {carga.destino}
        </p>

        <div className="flex max-h-80 min-h-[220px] flex-col gap-2 overflow-y-auto rounded-lg border border-ink/10 bg-sand-light/60 p-3">
          {mensagens.length === 0 ? (
            <p className="m-auto text-center text-sm text-ink-muted">
              Nenhuma mensagem ainda. Inicie a conversa sobre esta carga.
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
                enviar()
              }
            }}
          />
          <Button type="button" onClick={enviar} className="self-end">
            Enviar
          </Button>
        </div>
      </div>
    </Modal>
  )
}
