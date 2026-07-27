import { useEffect, useState } from 'react'
import { useData } from '../../context/DataContext'
import type { Carga } from '../../types'
import { Button, Modal, inputClass } from '../ui/Modal'

type Props = {
  carga: Carga | null
  open: boolean
  onClose: () => void
}

function StarRow({
  label,
  value,
  onChange,
}: {
  label: string
  value: number
  onChange: (n: number) => void
}) {
  return (
    <div>
      <p className="mb-1.5 text-xs font-semibold text-ink">{label}</p>
      <div className="flex items-center gap-1" role="radiogroup" aria-label={label}>
        {[1, 2, 3, 4, 5].map((n) => {
          const on = n <= value
          return (
            <button
              key={n}
              type="button"
              role="radio"
              aria-checked={value === n}
              aria-label={`${n} estrela${n > 1 ? 's' : ''}`}
              className={`text-2xl leading-none transition ${
                on ? 'text-amber-500' : 'text-ink/20 hover:text-amber-300'
              }`}
              onClick={() => onChange(n)}
            >
              ★
            </button>
          )
        })}
        <span className="ml-2 text-xs text-ink-muted">{value > 0 ? `${value}/5` : '—'}</span>
      </div>
    </div>
  )
}

export function AvaliacaoViagemModal({ carga, open, onClose }: Props) {
  const { avaliarViagem } = useData()
  const [notaMotorista, setNotaMotorista] = useState(0)
  const [notaVeiculo, setNotaVeiculo] = useState(0)
  const [comentario, setComentario] = useState('')
  const [erro, setErro] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!open || !carga) return
    setNotaMotorista(carga.avaliacao_motorista ?? 0)
    setNotaVeiculo(carga.avaliacao_veiculo ?? 0)
    setComentario(carga.avaliacao_comentario ?? '')
    setErro('')
  }, [open, carga?.id])

  if (!carga) return null

  const jaAvaliada = Boolean(carga.avaliado_em)

  async function salvar() {
    if (jaAvaliada) {
      onClose()
      return
    }
    setErro('')
    if (notaMotorista < 1 || notaMotorista > 5) {
      setErro('Dê de 1 a 5 estrelas para o motorista.')
      return
    }
    if (notaVeiculo < 1 || notaVeiculo > 5) {
      setErro('Dê de 1 a 5 estrelas para o veículo.')
      return
    }
    setBusy(true)
    const res = await avaliarViagem(carga.id, {
      notaMotorista,
      notaVeiculo,
      comentario: comentario.trim(),
    })
    setBusy(false)
    if (!res.ok) {
      setErro(res.error ?? 'Não foi possível salvar a avaliação.')
      return
    }
    onClose()
  }

  return (
    <Modal open={open} title={`Avaliação — carga ${carga.numero}`} onClose={onClose}>
      <div className="flex flex-col gap-4">
        <p className="text-sm text-ink-muted">
          Avalie o motorista e o veículo desta viagem. Suas notas entram na média do cadastro.
        </p>

        <div className="rounded-lg border border-ink/10 bg-sand-light/60 px-3 py-2 text-sm">
          <p>
            <span className="text-ink-muted">Motorista:</span>{' '}
            <strong>{carga.motorista || '—'}</strong>
          </p>
          <p>
            <span className="text-ink-muted">Veículo:</span>{' '}
            <strong>{carga.placa || '—'}</strong>
          </p>
        </div>

        <StarRow label="Motorista" value={notaMotorista} onChange={setNotaMotorista} />
        <StarRow label="Veículo (placa)" value={notaVeiculo} onChange={setNotaVeiculo} />

        <label className="flex flex-col gap-1 text-xs font-semibold text-ink">
          Comentário de satisfação
          <textarea
            className={`${inputClass} min-h-[88px] resize-y`}
            rows={3}
            maxLength={800}
            disabled={jaAvaliada}
            placeholder="Como foi a viagem? Pontualidade, cuidado com a carga…"
            value={comentario}
            onChange={(e) => setComentario(e.target.value)}
          />
        </label>

        {erro ? <p className="text-sm text-[#dc2626]">{erro}</p> : null}
        {jaAvaliada ? (
          <p className="text-xs text-ink-muted">
            Avaliação já registrada em{' '}
            {carga.avaliado_em
              ? new Date(carga.avaliado_em).toLocaleString('pt-BR')
              : '—'}
            .
          </p>
        ) : null}

        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            {jaAvaliada ? 'Fechar' : 'Agora não'}
          </Button>
          {!jaAvaliada ? (
            <Button type="button" disabled={busy} onClick={() => void salvar()}>
              {busy ? 'Salvando…' : 'Salvar avaliação'}
            </Button>
          ) : null}
        </div>
      </div>
    </Modal>
  )
}
