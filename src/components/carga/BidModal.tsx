import { useEffect, useMemo, useRef, useState } from 'react'
import { useData } from '../../context/DataContext'
import {
  formatCurrency,
  formatDateTime,
  formatMoneyInput,
  formatNumber,
  moneyFromDigits,
  parseMoneyInput,
  roundMoney,
} from '../../lib/businessRules'
import { sameTransportadorId } from '../../lib/transportadorIds'
import { showActionFlash } from '../../lib/actionFlash'
import { limparPontosPassagemRota } from '../../lib/rotasSync'
import type { Carga } from '../../types'
import { Button, Field, Modal, inputClass } from '../ui/Modal'
import { AnttFretePanel } from './AnttFretePanel'
import { RotaMapPreview } from './RotaMapPreview'

interface BidModalProps {
  carga: Carga | null
  open: boolean
  onClose: () => void
  /** Abre calculadora de rota com origem/destino da carga */
  onCalcularRota?: () => void
  /** Só detalhes — sem campo/botões de lance (olhinho). Lance só pelo martelo. */
  somenteLeitura?: boolean
}

export function BidModal({
  carga,
  open,
  onClose,
  onCalcularRota,
  somenteLeitura = false,
}: BidModalProps) {
  const {
    cargas,
    enviarLance,
    registrarVisualizacao,
    lancesDaCarga,
    historicoPropostasDaCarga,
    effectiveTransportadorId,
    rotas,
  } = useData()
  const [valor, setValor] = useState('')
  const [error, setError] = useState('')
  const initKeyRef = useRef<string | null>(null)
  const editingRef = useRef(false)
  const lancesRef = useRef(lancesDaCarga)
  lancesRef.current = lancesDaCarga

  const tid = effectiveTransportadorId()

  // Sempre a carga ao vivo do estado (evita snapshot stale do Kanban / timer)
  const live = useMemo(() => {
    if (!carga) return null
    return cargas.find((c) => c.id === carga.id) ?? carga
  }, [cargas, carga])

  const pontosPassagem = useMemo(() => {
    if (!live) return []
    const daCarga = limparPontosPassagemRota(live.pontos_passagem)
    if (daCarga.length > 0) return daCarga
    if (!live.rota_id) return []
    const r = rotas.find((x) => x.id === live.rota_id)
    return limparPontosPassagemRota(r?.pontos_passagem)
  }, [live, rotas])

  // Só preenche ao abrir (ou trocar de carga/transportadora) — nunca enquanto digita
  useEffect(() => {
    if (!open || !carga) {
      initKeyRef.current = null
      editingRef.current = false
      return
    }
    const key = `${carga.id}:${tid ?? ''}`
    if (initKeyRef.current === key) return
    if (editingRef.current) return
    initKeyRef.current = key

    registrarVisualizacao(carga.id)
    const meu = lancesRef.current(carga.id).find(
      (l) => sameTransportadorId(l.transportador_id, tid) && l.status === 'ativo',
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
    // eslint-disable-next-line react-hooks/exhaustive-deps -- só reinit ao abrir / trocar id
  }, [open, carga?.id, tid, registrarVisualizacao])

  /** Só o próprio lance — nunca lances de outros transportadores */
  const meuLance = useMemo(() => {
    if (!live || !tid) return null
    return (
      lancesDaCarga(live.id).find(
        (l) =>
          sameTransportadorId(l.transportador_id, tid) &&
          ['ativo', 'vencedor'].includes(l.status),
      ) ?? null
    )
  }, [live, tid, lancesDaCarga])

  const histMeu = useMemo(() => {
    if (!live || !tid) return []
    return historicoPropostasDaCarga(live.id).filter((h) =>
      sameTransportadorId(h.transportador_id, tid),
    )
  }, [live, tid, historicoPropostasDaCarga])

  if (!live) return null

  const freteRef = roundMoney(live.frete_oferta ?? live.frete_tabela)
  const jaFechada = Boolean(live.transportador_vencedor_id)
  const suspensa = live.status === 'suspensas' || Boolean(live.pausado_em)
  // Só bloqueia digitação se frete já fechado ou suspensa — prazo é validado no envio
  const bloqueado = jaFechada || suspensa

  const temContraProposta =
    Boolean(meuLance) &&
    live.frete_oferta != null &&
    Math.abs(roundMoney(live.frete_oferta) - roundMoney(meuLance!.valor)) > 0.009

  function submitValor(num: number, opts?: { aceitarOferta?: boolean }) {
    if (Number.isNaN(num) || num <= 0) {
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
    // Máximo efetivo: frete_maximo vs contra-proposta (frete_oferta atual)
    const maxEfetivo =
      live!.frete_maximo != null || live!.frete_oferta != null
        ? Math.max(
            live!.frete_maximo ?? Number.NEGATIVE_INFINITY,
            live!.frete_oferta != null ? roundMoney(live!.frete_oferta) : Number.NEGATIVE_INFINITY,
          )
        : null
    if (live!.frete_minimo != null && num < live!.frete_minimo - 0.009) {
      setError(`Lance mínimo: ${formatCurrency(live!.frete_minimo)}`)
      return
    }
    if (
      maxEfetivo != null &&
      Number.isFinite(maxEfetivo) &&
      num > maxEfetivo + 0.009
    ) {
      setError(`Lance máximo: ${formatCurrency(maxEfetivo)}`)
      return
    }
    const res = enviarLance(live!.id, num, opts)
    if (!res.ok) {
      setError(res.error ?? 'Erro ao enviar lance')
      showActionFlash({
        titulo: 'Não foi possível concluir',
        mensagem: res.error ?? 'Erro ao enviar lance',
        tone: 'erro',
      })
      return
    }

    if (opts?.aceitarOferta) {
      showActionFlash({
        titulo: 'Oferta aceita',
        mensagem: `Frete fechado em ${formatCurrency(num)}. Aguardando alocação.`,
      })
    } else if (temContraProposta) {
      showActionFlash({
        titulo: 'Resposta da contra-proposta enviada',
        mensagem: `Seu novo lance de ${formatCurrency(num)} foi enviado ao embarcador.`,
      })
    } else {
      showActionFlash({
        titulo: 'Lance enviado',
        mensagem: `Oferta de ${formatCurrency(num)} registrada na carga ${live!.numero}.`,
      })
    }
    onClose()
  }

  function handleSend() {
    submitValor(parseMoneyInput(valor))
  }

  function handleAccept() {
    const aceito = roundMoney(freteRef)
    if (temContraProposta) {
      const ok = window.confirm(
        `Deseja realmente aceitar a contra-proposta de ${formatCurrency(aceito)}?\n\n` +
          `Seu lance atual: ${formatCurrency(roundMoney(meuLance!.valor))}.\n` +
          `Ao confirmar, o frete será fechado neste valor.`,
      )
      if (!ok) return
    }
    setValor(formatMoneyInput(aceito))
    submitValor(aceito, { aceitarOferta: true })
  }

  return (
    <Modal
      open={open}
      title={somenteLeitura ? 'Detalhes da carga' : 'Registrar lance'}
      onClose={onClose}
      wide
    >
      <div className="space-y-3">
        {!somenteLeitura && (
          <>
            {meuLance &&
              live.frete_oferta != null &&
              Math.abs(roundMoney(live.frete_oferta) - roundMoney(meuLance.valor)) > 0.009 && (
                <div className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2.5 text-sm text-amber-950">
                  <p className="font-bold">Contra-proposta do embarcador</p>
                  <p className="mt-0.5 text-xs">
                    Valor sugerido: <strong>{formatCurrency(roundMoney(live.frete_oferta))}</strong>
                    {' · '}seu lance atual: {formatCurrency(roundMoney(meuLance.valor))}. Use
                    “Aceitar oferta” ou responda com um novo lance (botão Responder
                    contra-proposta).
                  </p>
                </div>
              )}

            <Field label="Sua oferta (R$)">
              <input
                className={`${inputClass} text-lg font-bold tabular-nums`}
                value={valor}
                inputMode="numeric"
                autoComplete="off"
                onChange={(e) => {
                  editingRef.current = true
                  setError('')
                  setValor(moneyFromDigits(e.target.value).display)
                }}
                onFocus={() => {
                  editingRef.current = true
                }}
                onBlur={() => {
                  editingRef.current = false
                  const n = parseMoneyInput(valor)
                  if (!Number.isNaN(n) && n > 0) setValor(formatMoneyInput(n))
                }}
                disabled={bloqueado}
                placeholder="0,00"
              />
            </Field>

            {(live.modo_publicacao === 'oferta' ||
              live.modo_publicacao === 'negociacao_direta') && (
              <p className="text-xs font-medium text-ink">
                {live.modo_publicacao === 'negociacao_direta' ? 'Negociação direta' : 'Modo Oferta'}
                : “Enviar lance” vai para Propostas e aguarda o embarcador. “Aceitar oferta” fecha o
                frete no valor da oferta ({formatCurrency(freteRef)}). Após enviar, o valor não pode
                ser alterado.
              </p>
            )}
            {live.modo_publicacao === 'leilao' && (
              <p className="text-xs font-medium text-ink">
                Modo Leilão: você pode atualizar o lance até o fim do prazo. Em empate de valor,
                vence o mais antigo (ou o embarcador decide manualmente). “Aceitar oferta” fecha o
                frete no valor da oferta/contra-proposta ({formatCurrency(freteRef)}).
              </p>
            )}
            {suspensa && (
              <p className="text-xs text-amber-800">Negociação suspensa — aguarde a retomada.</p>
            )}
            {!tid && (
              <p className="text-xs text-amber-800">
                Conta sem transportadora. No Kanban Transportador, use “Ver como” (Super) ou entre
                com santos@transportes.com.
              </p>
            )}

            {error && (
              <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">
                {error}
              </p>
            )}

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
                {temContraProposta ? 'Responder contra-proposta' : 'Enviar lance'}
              </Button>
              <Button variant="danger" className="min-w-[100px] flex-1" onClick={onClose}>
                Fechar
              </Button>
            </div>
          </>
        )}

        <div className="rounded-lg bg-emerald-50/80 px-3 py-2.5 text-sm">
          <div className="grid grid-cols-[repeat(auto-fit,minmax(130px,1fr))] gap-x-4 gap-y-2">
            <Detail label="Carga" value={live.numero} />
            <Detail label="Pedido" value={live.pedido} />
            <Detail label="Carregamento" value={formatDateTime(live.data_carregamento)} />
            <Detail label="Tipo" value={live.tipo_carga} />
            <Detail label="Veículo" value={live.veiculo} />
            <Detail label="Origem" value={live.origem} />
            <Detail label="Destino" value={live.destino} />
            {pontosPassagem.length > 0 ? (
              <div className="col-span-full rounded-md border border-sky-200 bg-sky-50/70 px-2.5 py-2">
                <p className="text-[11px] font-bold text-sky-900">
                  Pontos de passagem ({pontosPassagem.length})
                </p>
                <ol className="mt-1 list-decimal space-y-0.5 pl-4 text-[11px] text-sky-950">
                  {pontosPassagem.map((p, idx) => (
                    <li key={p.id || idx}>
                      {(p.endereco || '').trim() ||
                        (p.lat != null && p.lng != null
                          ? `${p.lat}, ${p.lng}`
                          : `Ponto ${idx + 1}`)}
                    </li>
                  ))}
                </ol>
              </div>
            ) : null}
            <Detail
              label="Gerenciamento de risco"
              value={
                live.gerenciamento_risco === 'rastreador'
                  ? 'Rastreador'
                  : live.gerenciamento_risco === 'localizador'
                    ? 'Localizador'
                    : live.gerenciamento_risco === 'ambos'
                      ? 'Ambos'
                      : live.gerenciamento_risco === 'nao'
                        ? 'Não exige'
                        : '—'
              }
            />
            <Detail label="Peso" value={formatNumber(live.peso)} />
            <Detail label="Frete Tabela" value={formatCurrency(live.frete_tabela)} />
            <Detail label="Frete Oferta" value={formatCurrency(freteRef)} />
            {live.frete_minimo != null && (
              <Detail label="Lance mínimo" value={formatCurrency(roundMoney(live.frete_minimo))} />
            )}
            {live.frete_maximo != null && (
              <Detail label="Lance máximo" value={formatCurrency(roundMoney(live.frete_maximo))} />
            )}
            <Detail
              label="Modo"
              value={
                live.modo_publicacao === 'negociacao_direta'
                  ? 'Negociação direta'
                  : live.modo_publicacao === 'oferta'
                    ? 'Oferta'
                    : 'Leilão'
              }
            />
            <Detail label="Prioridade" value={live.prioridade ?? '—'} />
            {meuLance && (
              <Detail
                label="Seu lance"
                value={`${formatCurrency(meuLance.valor)}${
                  meuLance.status === 'vencedor' ? ' (vencedor)' : ''
                }`}
              />
            )}
          </div>
        </div>

        {somenteLeitura &&
          meuLance &&
          live.frete_oferta != null &&
          Math.abs(roundMoney(live.frete_oferta) - roundMoney(meuLance.valor)) > 0.009 && (
            <div className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2.5 text-sm text-amber-950">
              <p className="font-bold">Contra-proposta do embarcador</p>
              <p className="mt-0.5 text-xs">
                Valor sugerido: <strong>{formatCurrency(roundMoney(live.frete_oferta))}</strong>
                {' · '}seu lance atual: {formatCurrency(roundMoney(meuLance.valor))}. Para
                responder, use o martelo no card.
              </p>
            </div>
          )}

        <AnttFretePanel
          origem={live.origem}
          destino={live.destino}
          veiculo={live.veiculo}
          value={live.antt ?? null}
          modoConsulta
          waypoints={pontosPassagem}
          origemCoords={
            live.origem_lat != null && live.origem_lng != null
              ? { lat: Number(live.origem_lat), lng: Number(live.origem_lng) }
              : null
          }
          destinoCoords={
            live.destino_lat != null && live.destino_lng != null
              ? { lat: Number(live.destino_lat), lng: Number(live.destino_lng) }
              : null
          }
        />

        <div className="space-y-1.5 rounded-lg border border-ink/15 bg-white p-2.5">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <p className="text-[12px] font-bold uppercase tracking-wide text-ink">
              Mapa da rota
            </p>
            <p className="text-[11px] font-semibold text-ink">
              {live.origem} → {live.destino}
              {pontosPassagem.length > 0
                ? ` · ${pontosPassagem.length} ponto${pontosPassagem.length === 1 ? '' : 's'}`
                : ''}
            </p>
          </div>
          {open && (
            <RotaMapPreview
              key={`bid-map-${live.id}-${pontosPassagem.map((p) => p.id).join('-')}`}
              origem={live.origem}
              destino={live.destino}
              origemCoords={
                live.origem_lat != null && live.origem_lng != null
                  ? { lat: Number(live.origem_lat), lng: Number(live.origem_lng) }
                  : null
              }
              destinoCoords={
                live.destino_lat != null && live.destino_lng != null
                  ? { lat: Number(live.destino_lat), lng: Number(live.destino_lng) }
                  : null
              }
              waypoints={pontosPassagem}
              veiculo={live.veiculo}
              className="h-[220px] min-h-[220px] w-full"
            />
          )}
        </div>

        {onCalcularRota && (
          <Button
            type="button"
            variant="ghost"
            className="w-full !border !border-ink/20 !bg-white !text-xs"
            onClick={onCalcularRota}
          >
            Ajustar eixos, consumo e diesel (calculadora avançada)
          </Button>
        )}

        {histMeu.length > 0 && (
          <div className="rounded-lg border border-ink/10 p-3 text-xs">
            <p className="mb-1 font-semibold text-ink">Seu histórico de alterações</p>
            <ul className="max-h-24 space-y-1 overflow-y-auto text-ink">
              {histMeu.slice(0, 8).map((h) => (
                <li key={h.id}>
                  {formatDateTime(h.created_at)}:{' '}
                  {h.tipo === 'resposta_contra' ? (
                    <span className="font-bold text-amber-900">Resposta da contra-proposta · </span>
                  ) : h.tipo === 'contra_embarcador' ? (
                    <span className="font-bold text-amber-900">Contra-proposta · </span>
                  ) : null}
                  {h.valor_anterior != null ? `${formatCurrency(h.valor_anterior)} → ` : 'novo '}
                  {formatCurrency(h.valor_novo)}
                </li>
              ))}
            </ul>
          </div>
        )}

        {somenteLeitura && (
          <div className="flex flex-wrap gap-2">
            <Button variant="danger" className="min-w-[100px] flex-1" onClick={onClose}>
              Fechar
            </Button>
          </div>
        )}
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
    (v) => sameTransportadorId(v.transportador_id, tid) && v.situacao === 'ativo',
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
    setError('')
    if (!placa.trim()) {
      setError('Informe a placa do veículo.')
      return
    }
    if (!motorista.trim()) {
      setError('Informe o nome do motorista.')
      return
    }
    const res = await alocarComposicao(carga!.id, placa, motorista, {
      veiculoId: veiculoId || undefined,
      motoristaId: motoristaId || undefined,
    })
    if (!res.ok) {
      setError(res.error ?? 'Erro ao alocar')
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
    <div className="min-w-0">
      <p className="text-[10px] font-bold uppercase tracking-wide text-black">{label}</p>
      <p
        className="line-clamp-2 text-[13px] font-bold capitalize leading-tight text-black"
        title={value}
      >
        {value}
      </p>
    </div>
  )
}
