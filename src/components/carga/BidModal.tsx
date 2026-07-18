import { useEffect, useMemo, useState } from 'react'
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
  const {
    enviarLance,
    registrarVisualizacao,
    lancesDaCarga,
    historicoPropostasDaCarga,
    transportadorById,
    effectiveTransportadorId,
  } = useData()
  const [valor, setValor] = useState('')
  const [error, setError] = useState('')

  const tid = effectiveTransportadorId()

  useEffect(() => {
    if (open && carga) {
      registrarVisualizacao(carga.id)
      const meu = lancesDaCarga(carga.id).find(
        (l) => l.transportador_id === tid && l.status === 'ativo',
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
  }, [open, carga, registrarVisualizacao, lancesDaCarga, tid])

  const ranking = useMemo(() => {
    if (!carga) return []
    return lancesDaCarga(carga.id).filter((l) =>
      ['ativo', 'vencedor'].includes(l.status),
    )
  }, [carga, lancesDaCarga])

  const minhaPosicao = useMemo(() => {
    if (!tid) return null
    const idx = ranking.findIndex((l) => l.transportador_id === tid)
    return idx >= 0 ? idx + 1 : null
  }, [ranking, tid])

  const histMeu = useMemo(() => {
    if (!carga || !tid) return []
    return historicoPropostasDaCarga(carga.id).filter((h) => h.transportador_id === tid)
  }, [carga, tid, historicoPropostasDaCarga])

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
    if (!tid) {
      setError('Selecione uma transportadora (Ver como) ou entre com conta de transportador.')
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
            {minhaPosicao != null && (
              <Detail label="Sua posição" value={`${minhaPosicao}º`} />
            )}
          </div>
        </div>

        {ranking.length > 0 && (
          <div className="rounded-lg border border-ink/10 p-3">
            <p className="mb-2 text-xs font-semibold text-ink-muted">Ranking de lances</p>
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-ink/10 text-left text-ink-muted">
                  <th className="py-1">#</th>
                  <th>Transportadora</th>
                  <th>Lance</th>
                  <th>Quando</th>
                </tr>
              </thead>
              <tbody>
                {ranking.map((l, idx) => {
                  const t = transportadorById(l.transportador_id)
                  const souEu = l.transportador_id === tid
                  return (
                    <tr
                      key={l.id}
                      className={`border-b border-ink/5 ${souEu ? 'bg-teal-50 font-semibold' : ''}`}
                    >
                      <td className="py-1.5 pr-2">{idx + 1}º</td>
                      <td className="py-1.5 pr-2">
                        {t?.nome_fantasia ?? '—'}
                        {souEu && (
                          <span className="ml-1 rounded bg-teal-600 px-1.5 py-0.5 text-[10px] font-bold text-white">
                            você
                          </span>
                        )}
                        {l.status === 'vencedor' && (
                          <span className="ml-1 text-[10px] font-bold text-emerald-700">
                            vencedor
                          </span>
                        )}
                      </td>
                      <td className="py-1.5 pr-2 tabular-nums">{formatCurrency(l.valor)}</td>
                      <td className="py-1.5 text-[10px] text-ink-muted">
                        {formatDateTime(l.updated_at ?? l.created_at)}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}

        {histMeu.length > 0 && (
          <div className="rounded-lg border border-ink/10 p-3 text-xs">
            <p className="mb-1 font-semibold text-ink-muted">Seu histórico de alterações</p>
            <ul className="max-h-24 space-y-1 overflow-y-auto text-ink-muted">
              {histMeu.slice(0, 8).map((h) => (
                <li key={h.id}>
                  {formatDateTime(h.created_at)}:{' '}
                  {h.valor_anterior != null ? `${formatCurrency(h.valor_anterior)} → ` : 'novo '}
                  {formatCurrency(h.valor_novo)}
                </li>
              ))}
            </ul>
          </div>
        )}

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
        {!tid && (
          <p className="text-xs text-amber-800">
            Conta sem transportadora. No Kanban Transportador, use “Ver como” (Super) ou entre com
            santos@transportes.com.
          </p>
        )}

        {error && <p className="text-sm text-brand">{error}</p>}

        <div className="flex flex-wrap gap-2">
          <Button
            variant="primary"
            className="min-w-[140px] flex-1"
            onClick={handleAccept}
            disabled={bloqueado || !tid}
          >
            Aceitar oferta
          </Button>
          <Button
            variant="success"
            className="min-w-[140px] flex-1"
            onClick={handleSend}
            disabled={bloqueado || !tid}
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
  const {
    alocarComposicao,
    veiculos,
    motoristas,
    motoristasDoTransportador,
    user,
    effectiveTransportadorId,
  } = useData()
  const [veiculoId, setVeiculoId] = useState('')
  const [motoristaId, setMotoristaId] = useState('')
  const [placa, setPlaca] = useState('')
  const [motorista, setMotorista] = useState('')
  const [error, setError] = useState('')

  const tid =
    carga?.transportador_vencedor_id ?? user?.transportador_id ?? effectiveTransportadorId() ?? ''
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
