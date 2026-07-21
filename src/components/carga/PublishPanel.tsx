import { useEffect, useMemo, useState } from 'react'
import {
  Check,
  Clock,
  Handshake,
  Hourglass,
  Maximize2,
  Minimize2,
  PanelLeft,
  Trash2,
  X,
} from 'lucide-react'
import { useData } from '../../context/DataContext'
import {
  MOTIVOS_PRIORIDADE_ALTA,
  calcularFreteOferta,
  calcularPrioridadeEModo,
  formatCurrency,
  formatDateTime,
  formatMoneyInput,
  formatNumber,
  formatPrazoLabel,
  parseMoneyInput,
  tempoRestante,
} from '../../lib/businessRules'
import {
  excluirCargaMontada,
  guardarCargaMontada,
  loadCargasMontadas,
  loadPanelSize,
  panelSizeClass,
  patchFromCargaMontada,
  savePanelSize,
  type CargaMontada,
  type PanelSize,
} from '../../lib/cargasMontadas'
import { prazosAlocacaoPermitidos, prazosOfertaPermitidos } from '../../lib/configNegocio'
import { canEditModulo } from '../../lib/portalModules'
import type { Carga, ClassificacaoTransportador, Transportador } from '../../types'
import { Button, Field, Modal, inputClass } from '../ui/Modal'
import { CargaDadosForm } from './CargaDadosForm'

function classBadge(c?: ClassificacaoTransportador | null) {
  if (c === 'ouro') return 'bg-[#e8c547]/30 text-[#7a6200] border-[#e8c547]'
  if (c === 'prata') return 'bg-slate-200 text-slate-700 border-slate-300'
  if (c === 'bronze') return 'bg-[#e8b48a]/35 text-[#7a4010] border-[#d4925a]'
  return 'bg-sand-light text-ink-muted border-ink/10'
}

type PanelTab = 'dados' | 'salvas' | 'publicar'

interface Props {
  carga: Carga | null
  open: boolean
  onClose: () => void
  /** Aba inicial: Nova carga → dados; demais → publicar/negociação */
  initialTab?: PanelTab
  /** Troca a carga aberta no painel (rascunhos salvos) */
  onSelectCarga?: (carga: Carga) => void
}

function membrosDosGrupos(
  grupoIds: string[],
  grupos: { id: string; transportador_ids: string[]; descricao: string }[],
  transportadores: Transportador[],
): Transportador[] {
  const ids = new Set<string>()
  for (const g of grupos) {
    if (!grupoIds.includes(g.id)) continue
    for (const tid of g.transportador_ids) ids.add(tid)
  }
  return transportadores.filter((t) => ids.has(t.id) && t.situacao === 'ativo')
}

export function PublishPanel({ carga, open, onClose, initialTab, onSelectCarga }: Props) {
  const {
    cargas,
    grupos,
    transportadores,
    publicarCarga,
    lancesDaCarga,
    transportadorById,
    aceitarLance,
    rejeitarLance,
    enviarContraProposta,
    aguardarMelhoresOfertas,
    encerrarComMelhorLance,
    finalizarNegociacao,
    cancelarPublicacao,
    suspenderCarga,
    retomarCarga,
    republicarCarga,
    reabrirNegociacao,
    recusarCargaMinerva,
    notificarTodosGrupos,
    historicoPropostasDaCarga,
    config,
    user,
    tick,
    atualizarCarga,
    excluirCargaRascunho,
  } = useData()
  void tick

  const canEdit =
    canEditModulo(user?.permissoes_modulos, 'kanban') ||
    Boolean(user?.is_superuser) ||
    user?.role === 'super' ||
    user?.role === 'minerva'
  const classificacao = carga?.classificacao_rota ?? 'B'
  const margens = config.margens[classificacao]
  const prazosOferta = prazosOfertaPermitidos(config)
  const prazosAlocacao = prazosAlocacaoPermitidos()

  const [tab, setTab] = useState<PanelTab>(initialTab ?? 'dados')
  const [panelSize, setPanelSize] = useState<PanelSize>(() => loadPanelSize())
  const [montadas, setMontadas] = useState<CargaMontada[]>(() => loadCargasMontadas())
  const [nomeMontada, setNomeMontada] = useState('')
  const [margem, setMargem] = useState(margens[1])
  const [grupoIds, setGrupoIds] = useState<string[]>([])
  const [escalonar, setEscalonar] = useState(false)
  const [prazoLeilao, setPrazoLeilao] = useState(config.prazo_oferta_padrao_minutos)
  const [prazoAlocacao, setPrazoAlocacao] = useState(config.prazo_alocacao_padrao_minutos)
  const [showJustificativa, setShowJustificativa] = useState(false)
  const [motivo, setMotivo] = useState('')
  const [obs, setObs] = useState('')
  const [observacao, setObservacao] = useState('')
  const [error, setError] = useState('')
  const [info, setInfo] = useState('')
  const [contraLanceId, setContraLanceId] = useState<string | null>(null)
  const [contraValor, setContraValor] = useState('')

  // Reset do formulário só ao trocar de carga (sync de grupos não pode resetar a aba)
  useEffect(() => {
    if (!carga) return
    const m = config.margens[carga.classificacao_rota ?? 'B']
    setMargem(m[1] ?? m[0])
    const ativos = grupos.filter((g) => g.situacao === 'ativo').map((g) => g.id)
    setGrupoIds(carga.grupo_ids.length ? carga.grupo_ids : ativos)
    setEscalonar(false)
    setPrazoLeilao(carga.prazo_leilao_minutos ?? config.prazo_oferta_padrao_minutos)
    setPrazoAlocacao(carga.prazo_alocacao_minutos ?? config.prazo_alocacao_padrao_minutos)
    setError('')
    setMotivo(carga.justificativa_motivo ?? '')
    setObs(carga.justificativa_obs ?? '')
    setObservacao(carga.observacao ?? '')
    const defaultTab =
      initialTab ?? (carga.status === 'nova_carga' ? 'dados' : 'publicar')
    setTab(defaultTab)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- só ao abrir outra carga
  }, [carga?.id, initialTab])

  // Observações salvas na aba Dados entram na aba Publicar sem resetar o resto
  useEffect(() => {
    if (!carga) return
    setObservacao(carga.observacao ?? '')
  }, [carga?.id, carga?.observacao])

  useEffect(() => {
    if (!carga) setInfo('')
  }, [carga?.id])

  useEffect(() => {
    if (tab === 'salvas') setMontadas(loadCargasMontadas())
  }, [tab])

  const rascunhosNaoPublicados = useMemo(() => {
    return [...cargas]
      .filter((c) => c.status === 'nova_carga' && !c.publicado_em)
      .sort((a, b) => {
        const ta = new Date(a.updated_at || a.created_at || 0).getTime()
        const tb = new Date(b.updated_at || b.created_at || 0).getTime()
        return tb - ta
      })
  }, [cargas])

  const { ganho, freteOferta } = useMemo(
    () => calcularFreteOferta(carga?.frete_tabela ?? 0, margem),
    [carga, margem],
  )

  const { prioridade, modo, exigeJustificativa } = useMemo(
    () => calcularPrioridadeEModo(prazoLeilao, config.limite_urgencia_minutos),
    [prazoLeilao, config.limite_urgencia_minutos],
  )

  const previewTransportadores = useMemo(() => {
    const notificadosAgora =
      escalonar && grupoIds.length > 1 ? [grupoIds[0]] : grupoIds
    const agora = membrosDosGrupos(notificadosAgora, grupos, transportadores)
    const depois =
      escalonar && grupoIds.length > 1
        ? membrosDosGrupos(grupoIds.slice(1), grupos, transportadores).filter(
            (t) => !agora.some((a) => a.id === t.id),
          )
        : []
    return { agora, depois }
  }, [grupoIds, escalonar, grupos, transportadores])

  const lances = carga ? lancesDaCarga(carga.id) : []
  const isNova = carga?.status === 'nova_carga'
  const emNegociacao =
    Boolean(carga) &&
    ['negociando', 'propostas'].includes(carga!.status) &&
    !carga!.transportador_vencedor_id

  function cyclePanelSize(dir: 1 | -1) {
    const order: PanelSize[] = ['normal', 'medio', 'largo']
    const idx = order.indexOf(panelSize)
    const next = order[Math.max(0, Math.min(order.length - 1, idx + dir))]
    setPanelSize(next)
    savePanelSize(next)
  }

  function handleGuardarMontada() {
    if (!carga) return
    if (!carga.origem?.trim() || !carga.destino?.trim()) {
      setError('Preencha origem e destino antes de guardar a carga montada.')
      return
    }
    const item = guardarCargaMontada(carga, nomeMontada || undefined)
    setMontadas(loadCargasMontadas())
    setNomeMontada('')
    setError('')
    setInfo(`Carga montada salva: “${item.nome}”.`)
  }

  function handleUsarMontada(m: CargaMontada) {
    if (!carga || !isNova) return
    const res = atualizarCarga(carga.id, patchFromCargaMontada(m))
    if (!res.ok) {
      setError(res.error ?? 'Não foi possível aplicar a carga montada')
      return
    }
    if (m.dados.observacao) setObservacao(m.dados.observacao)
    setError('')
    setInfo(`Dados de “${m.nome}” aplicados. Revise e publique.`)
    setTab('dados')
  }

  function handleExcluirMontada(id: string) {
    excluirCargaMontada(id)
    setMontadas(loadCargasMontadas())
  }

  function handleExcluirRascunho(cargaId: string, numero: string) {
    if (!canEdit) return
    const ok = window.confirm(
      `Excluir o rascunho da carga ${numero}?\nEsta ação não pode ser desfeita.`,
    )
    if (!ok) return
    const res = excluirCargaRascunho(cargaId)
    if (!res.ok) {
      setError(res.error ?? 'Não foi possível excluir')
      return
    }
    setError('')
    if (cargaId === carga?.id) onClose()
  }

  const negociadoresAtivos = useMemo(() => {
    if (!carga || isNova) return []
    const ids = carga.grupos_notificados.length ? carga.grupos_notificados : carga.grupo_ids
    return membrosDosGrupos(ids, grupos, transportadores)
  }, [carga, isNova, grupos, transportadores])

  const negociadoresPendentes = useMemo(() => {
    if (!carga || isNova) return []
    const falta = carga.grupo_ids.filter((id) => !carga.grupos_notificados.includes(id))
    return membrosDosGrupos(falta, grupos, transportadores).filter(
      (t) => !negociadoresAtivos.some((a) => a.id === t.id),
    )
  }, [carga, isNova, grupos, transportadores, negociadoresAtivos])

  if (!open || !carga) return null

  function toggleGrupo(id: string) {
    setGrupoIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))
  }

  function doPublicar(justificativa?: { motivo: string; obs?: string }) {
    setError('')
    if (!canEdit) {
      setError('Seu perfil não permite publicar.')
      return false
    }
    const res = publicarCarga({
      cargaId: carga!.id,
      margemPercentual: margem,
      grupoIds,
      prazoLeilaoMinutos: prazoLeilao,
      prazoAlocacaoMinutos: prazoAlocacao,
      justificativaMotivo: justificativa?.motivo || motivo || undefined,
      justificativaObs: (justificativa?.obs ?? obs) || undefined,
      observacao: observacao.trim() || undefined,
      escalonarGrupos: escalonar,
    })
    if (!res.ok) {
      setError(res.error ?? 'Erro ao publicar')
      return false
    }
    return true
  }

  function handlePublicar() {
    setError('')
    setInfo('')
    if (grupoIds.length === 0) {
      setError('Selecione quem vai negociar: ao menos um grupo.')
      return
    }
    if (!observacao.trim()) {
      setError('Observações são obrigatórias na publicação.')
      return
    }
    if (exigeJustificativa && !motivo) {
      setShowJustificativa(true)
      return
    }
    if (doPublicar()) {
      setInfo('Carga publicada. Os transportadores selecionados já podem negociar.')
    }
  }

  function confirmJustificativa() {
    if (!motivo) {
      setError('Selecione o motivo')
      return
    }
    setShowJustificativa(false)
    if (doPublicar({ motivo, obs })) {
      setInfo('Carga publicada. Os transportadores selecionados já podem negociar.')
    }
  }

  function handleAceitar(lanceId: string) {
    if (!canEdit) {
      setError('Seu perfil não permite aceitar propostas.')
      return
    }
    setError('')
    setInfo('')
    const res = aceitarLance(lanceId)
    if (!res.ok) setError(res.error ?? 'Falha ao aceitar')
    else setInfo('Frete fechado. Aguardando alocação do transportador.')
  }

  function handleRejeitar(lanceId: string) {
    if (!canEdit) {
      setError('Seu perfil não permite rejeitar propostas.')
      return
    }
    setError('')
    setInfo('')
    const res = rejeitarLance(lanceId)
    if (!res.ok) setError(res.error ?? 'Falha ao rejeitar')
    else setInfo('Proposta rejeitada.')
  }

  function handleEncerrar() {
    if (!canEdit) {
      setError('Seu perfil não permite encerrar a negociação.')
      return
    }
    setError('')
    setInfo('')
    const res = encerrarComMelhorLance(carga!.id)
    if (!res.ok) setError(res.error ?? 'Falha ao encerrar')
    else setInfo('Melhor lance aceito. Frete fechado.')
  }

  function handleFinalizar() {
    if (!canEdit) {
      setError('Seu perfil não permite finalizar a negociação.')
      return
    }
    setError('')
    setInfo('')
    const res = finalizarNegociacao(carga!.id)
    if (!res.ok) setError(res.error ?? 'Falha ao finalizar')
    else setInfo('Negociação finalizada.')
  }

  function handleCancelar() {
    if (!canEdit) return
    const motivo = window.prompt('Motivo do cancelamento (opcional):') ?? undefined
    const res = cancelarPublicacao(carga!.id, motivo || undefined)
    if (!res.ok) setError(res.error ?? 'Falha ao cancelar')
    else setInfo('Publicação cancelada.')
  }

  function handleSuspender() {
    if (!canEdit) return
    const res = suspenderCarga(carga!.id)
    if (!res.ok) setError(res.error ?? 'Falha ao suspender')
    else setInfo('Negociação suspensa. O timer está pausado.')
  }

  function handleRetomar() {
    if (!canEdit) return
    const res = retomarCarga(carga!.id)
    if (!res.ok) setError(res.error ?? 'Falha ao retomar')
    else setInfo('Negociação retomada.')
  }

  function handleRepublicar() {
    if (!canEdit) return
    setError('')
    setInfo('')
    const res = republicarCarga(carga!.id)
    if (!res.ok) setError(res.error ?? 'Falha ao republicar')
    else
      setInfo(
        'Propostas anteriores canceladas. Carga em Nova Carga — ajuste e publique de novo.',
      )
  }

  function handleReabrir() {
    if (!canEdit) return
    setError('')
    setInfo('')
    const res = reabrirNegociacao(carga!.id)
    if (!res.ok) setError(res.error ?? 'Falha ao reabrir')
    else
      setInfo(
        'Nova rodada aberta: propostas anteriores canceladas. Transportadores veem em Nova Carga.',
      )
  }

  function openContraProposta(lanceId: string, valorAtual: number) {
    if (!canEdit) {
      setError('Seu perfil não permite enviar contra-proposta.')
      return
    }
    setContraLanceId(lanceId)
    setContraValor(formatMoneyInput(valorAtual))
    setError('')
    setInfo('')
  }

  function handleContraProposta() {
    if (!canEdit) {
      setError('Seu perfil não permite enviar contra-proposta.')
      return
    }
    if (!contraLanceId) {
      setError('Selecione uma proposta para contra-propor.')
      return
    }
    const num = parseMoneyInput(contraValor)
    if (!Number.isFinite(num) || num <= 0) {
      setError('Informe um valor válido para a contra-proposta.')
      return
    }
    setError('')
    const res = enviarContraProposta(contraLanceId, num)
    if (!res.ok) {
      setError(res.error ?? 'Falha na contra-proposta')
      return
    }
    setInfo(
      `Contra-proposta de ${formatCurrency(num)} enviada. O transportador vê no chat e nas notificações.`,
    )
    setContraLanceId(null)
    setContraValor('')
  }

  function handleAguardarMelhores() {
    if (!canEdit) {
      setError('Seu perfil não permite estender a janela.')
      return
    }
    setError('')
    setInfo('')
    const res = aguardarMelhoresOfertas(carga!.id, 10)
    if (!res.ok) setError(res.error ?? 'Não foi possível estender a janela')
    else setInfo('Janela estendida em 10 min. Aguardando ofertas melhores.')
  }

  const histPropostas = carga ? historicoPropostasDaCarga(carga.id) : []
  const lancesAtivos = lances.filter((l) => l.status === 'ativo')
  const melhorLance = lancesAtivos[0]
  const idsComProposta = new Set(lancesAtivos.map((l) => l.transportador_id))

  const classColor =
    classificacao === 'A' ? 'bg-emerald-500' : classificacao === 'B' ? 'bg-amber-500' : 'bg-brand'

  return (
    <>
      <aside
        className={`animate-slide-in relative z-20 flex h-full shrink-0 flex-col overflow-hidden rounded-xl border border-ink/10 bg-white shadow-lg transition-[width] duration-200 ${panelSizeClass(panelSize)}`}
      >
        <div className="border-b border-ink/10 bg-ink px-4 py-3 text-white">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="font-display text-lg font-bold tracking-wide text-[#e8c547]">
                Carga {carga.numero}
              </p>
              <p className="text-sm text-sand/90">{formatDateTime(carga.data_carregamento)}</p>
            </div>
            <div className="flex shrink-0 items-center gap-1">
              <button
                type="button"
                title="Diminuir painel"
                disabled={panelSize === 'normal'}
                onClick={() => cyclePanelSize(-1)}
                className="rounded-md p-1.5 text-sand/80 transition hover:bg-white/10 hover:text-white disabled:opacity-30"
              >
                <Minimize2 size={16} />
              </button>
              <button
                type="button"
                title="Tamanho médio (meio da tela)"
                onClick={() => {
                  setPanelSize('medio')
                  savePanelSize('medio')
                }}
                className={`rounded-md p-1.5 transition hover:bg-white/10 hover:text-white ${
                  panelSize === 'medio' ? 'bg-white/15 text-white' : 'text-sand/80'
                }`}
              >
                <PanelLeft size={16} />
              </button>
              <button
                type="button"
                title="Aumentar painel"
                disabled={panelSize === 'largo'}
                onClick={() => cyclePanelSize(1)}
                className="rounded-md p-1.5 text-sand/80 transition hover:bg-white/10 hover:text-white disabled:opacity-30"
              >
                <Maximize2 size={16} />
              </button>
              <button
                type="button"
                title="Fechar"
                onClick={onClose}
                className="rounded-md p-1.5 text-sand/80 transition hover:bg-white/10 hover:text-white"
              >
                <X size={16} />
              </button>
            </div>
          </div>
          {!isNova && (
            <p className="mt-1 text-xs text-sand/80">
              Status:{' '}
              <strong className="uppercase">{carga.status.replace('_', ' ')}</strong>
              {carga.modo_publicacao && (
                <>
                  {' '}
                  · {carga.modo_publicacao === 'oferta' ? 'Oferta' : 'Leilão'}
                </>
              )}
              {carga.expira_em && !carga.transportador_vencedor_id && (
                <> · Janela {tempoRestante(carga.expira_em)}</>
              )}
            </p>
          )}
        </div>

        <div className="flex border-b border-ink/10 bg-sand-light/30">
          <button
            type="button"
            onClick={() => setTab('dados')}
            className={`min-w-0 flex-1 px-2 py-2.5 text-[11px] font-bold uppercase tracking-wide transition sm:text-xs ${
              tab === 'dados'
                ? 'border-b-2 border-brand bg-white text-ink'
                : 'text-ink-muted hover:text-ink'
            }`}
          >
            Dados da carga
          </button>
          <button
            type="button"
            onClick={() => setTab('salvas')}
            className={`min-w-0 flex-1 px-2 py-2.5 text-[11px] font-bold uppercase tracking-wide transition sm:text-xs ${
              tab === 'salvas'
                ? 'border-b-2 border-brand bg-white text-ink'
                : 'text-ink-muted hover:text-ink'
            }`}
          >
            Cargas salvas
            {rascunhosNaoPublicados.length + montadas.length > 0 && (
              <span className="ml-1 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-ink/10 px-1 text-[10px] font-bold normal-case text-ink">
                {rascunhosNaoPublicados.length + montadas.length}
              </span>
            )}
          </button>
          <button
            type="button"
            onClick={() => setTab('publicar')}
            className={`min-w-0 flex-1 px-2 py-2.5 text-[11px] font-bold uppercase tracking-wide transition sm:text-xs ${
              tab === 'publicar'
                ? 'border-b-2 border-brand bg-white text-ink'
                : 'text-ink-muted hover:text-ink'
            }`}
          >
            {isNova ? 'Publicar' : 'Negociação'}
          </button>
        </div>

        <div className="flex-1 space-y-3 overflow-y-auto p-4 text-sm">
          {tab === 'dados' && (
            <CargaDadosForm
              carga={carga}
              canEdit={canEdit}
              onGoPublish={() => setTab('publicar')}
            />
          )}

          {tab === 'salvas' && (
            <>
              <p className="rounded-lg border border-ink/10 bg-sand-light/50 px-3 py-2 text-xs text-ink-muted">
                Aqui ficam os <strong className="text-ink">rascunhos ainda não publicados</strong> e
                os modelos guardados para reutilizar.
              </p>

              <div className="rounded-lg border border-ink/10 bg-white p-3">
                <p className="mb-1 text-xs font-bold uppercase tracking-wide text-ink">
                  Não publicadas ({rascunhosNaoPublicados.length})
                </p>
                <p className="mb-2 text-[11px] text-ink-muted">
                  Cargas salvas no Kanban que ainda não foram publicadas para negociação.
                </p>
                {rascunhosNaoPublicados.length === 0 ? (
                  <p className="text-[11px] text-ink-muted">Nenhum rascunho pendente.</p>
                ) : (
                  <ul className="max-h-52 space-y-1.5 overflow-y-auto">
                    {rascunhosNaoPublicados.map((c) => {
                      const atual = c.id === carga.id
                      return (
                        <li
                          key={c.id}
                          className={`flex items-stretch gap-1 rounded-md border ${
                            atual
                              ? 'border-brand bg-brand/5'
                              : 'border-ink/10 bg-sand-light/40'
                          }`}
                        >
                          <button
                            type="button"
                            disabled={!onSelectCarga && !atual}
                            onClick={() => {
                              if (atual) {
                                setTab('dados')
                                return
                              }
                              onSelectCarga?.(c)
                              setTab('dados')
                            }}
                            className="min-w-0 flex-1 px-2.5 py-2 text-left text-xs transition hover:bg-white/60"
                          >
                            <span className="flex items-center gap-1.5">
                              <span className="font-semibold text-ink">Carga {c.numero}</span>
                              {atual && (
                                <span className="rounded bg-brand/15 px-1.5 py-0.5 text-[10px] font-bold text-brand">
                                  Aberta
                                </span>
                              )}
                            </span>
                            <span className="mt-0.5 block truncate text-[10px] text-ink-muted">
                              {(c.origem || '—').trim()} → {(c.destino || '—').trim()}
                              {c.pedido ? ` · Pedido ${c.pedido}` : ''}
                            </span>
                            <span className="block text-[10px] text-ink-muted">
                              Frete tabela {formatCurrency(c.frete_tabela)}
                              {c.updated_at || c.created_at
                                ? ` · ${formatDateTime(c.updated_at || c.created_at)}`
                                : ''}
                            </span>
                          </button>
                          {canEdit && (
                            <button
                              type="button"
                              className="shrink-0 self-center rounded p-2 text-ink-muted hover:bg-red-50 hover:text-red-700"
                              title="Excluir rascunho"
                              onClick={() => handleExcluirRascunho(c.id, c.numero)}
                            >
                              <Trash2 size={14} />
                            </button>
                          )}
                        </li>
                      )
                    })}
                  </ul>
                )}
              </div>

              <div className="rounded-lg border border-ink/10 bg-sand-light/50 p-3">
                <p className="mb-1 text-xs font-bold uppercase tracking-wide text-ink">
                  Modelos guardados ({montadas.length})
                </p>
                <p className="mb-2 text-[11px] text-ink-muted">
                  Guarde a carga atual (preenchida) para reutilizar em outro rascunho.
                </p>
                <div className="mb-2 flex gap-2">
                  <input
                    className={`${inputClass} flex-1`}
                    placeholder="Nome (opcional)"
                    value={nomeMontada}
                    onChange={(e) => setNomeMontada(e.target.value)}
                    disabled={!canEdit || !isNova}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    className="shrink-0 border border-ink/15"
                    onClick={handleGuardarMontada}
                    disabled={!canEdit || !isNova}
                  >
                    Guardar atual
                  </Button>
                </div>
                {montadas.length === 0 ? (
                  <p className="text-[11px] text-ink-muted">Nenhum modelo guardado ainda.</p>
                ) : (
                  <ul className="max-h-40 space-y-1.5 overflow-y-auto">
                    {montadas.map((m) => (
                      <li
                        key={m.id}
                        className="flex items-center gap-2 rounded-md border border-ink/10 bg-white px-2 py-1.5"
                      >
                        <button
                          type="button"
                          className="min-w-0 flex-1 text-left text-xs hover:text-brand disabled:opacity-50"
                          onClick={() => handleUsarMontada(m)}
                          disabled={!canEdit || !isNova}
                          title="Aplicar nesta carga"
                        >
                          <span className="block truncate font-semibold">{m.nome}</span>
                          <span className="block truncate text-[10px] text-ink-muted">
                            {m.dados.origem} → {m.dados.destino} ·{' '}
                            {formatCurrency(m.dados.frete_tabela)}
                          </span>
                        </button>
                        <button
                          type="button"
                          className="rounded p-1 text-ink-muted hover:bg-red-50 hover:text-red-700"
                          title="Excluir"
                          onClick={() => handleExcluirMontada(m.id)}
                          disabled={!canEdit}
                        >
                          <Trash2 size={14} />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </>
          )}

          {tab === 'publicar' && isNova && (
            <>
          <p className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-950">
            Esta carga ainda é <strong>rascunho</strong>. Só aparece para o transportador depois que
            você clicar em <strong>Publicar</strong> (com ao menos um grupo selecionado).
          </p>

          <Detail label="Pedido" value={carga.pedido || '—'} />
          <Detail label="Tipo de Carga" value={carga.tipo_carga} />
          <Detail label="Veículo" value={carga.veiculo} />
          <Detail label="Remetente" value={`${carga.remetente} — ${carga.remetente_cnpj}`} />
          <Detail label="Origem" value={carga.origem || '—'} />
          <Detail label="Destino" value={carga.destino || '—'} />
          <Detail label="Destinatário" value={carga.destinatario || '—'} />
          <Detail label="Peso" value={formatNumber(carga.peso)} />
          <Detail label="Volumes" value={String(carga.volumes)} />
          <Detail label="Valor Frete (Tabela)" value={formatCurrency(carga.frete_tabela)} />
          <Detail label="Valor Mercadorias" value={formatCurrency(carga.valor_mercadorias)} />

            <div className="mt-2 space-y-3 rounded-lg border border-ink/10 bg-sand-light/40 p-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-ink-muted">Publicar para negociação</span>
                <span className={`rounded px-2 py-0.5 text-xs font-bold text-white ${classColor}`}>
                  Rota {classificacao}
                </span>
              </div>

              <div className="grid grid-cols-3 gap-2 text-xs">
                <div>
                  <p className="text-ink-muted">Frete Tabela</p>
                  <p className="font-semibold">{formatCurrency(carga.frete_tabela)}</p>
                </div>
                <div>
                  <p className="text-ink-muted">Oportunidade</p>
                  <p className="font-semibold text-emerald-700">{formatCurrency(ganho)}</p>
                </div>
                <Field label="%">
                  <select
                    className={inputClass}
                    value={margem}
                    onChange={(e) => setMargem(Number(e.target.value))}
                  >
                    {margens.map((m) => (
                      <option key={m} value={m}>
                        {m}%
                      </option>
                    ))}
                  </select>
                </Field>
              </div>

              <p className="text-center font-display text-lg font-bold text-ink">
                Frete Oferta {formatCurrency(freteOferta)}
              </p>

              <Field label="Quem vai negociar? (grupos)">
                <div className="flex flex-col gap-1 rounded-lg border border-ink/15 bg-white p-2">
                  {grupos.filter((g) => g.situacao === 'ativo').length === 0 ? (
                    <p className="text-xs text-brand">Cadastre grupos em Menu → Grupos.</p>
                  ) : (
                    grupos
                      .filter((g) => g.situacao === 'ativo')
                      .map((g) => {
                        const qtd = g.transportador_ids.length
                        return (
                          <label key={g.id} className="flex items-start gap-2 text-xs">
                            <input
                              type="checkbox"
                              className="mt-0.5"
                              checked={grupoIds.includes(g.id)}
                              onChange={() => toggleGrupo(g.id)}
                            />
                            <span>
                              <strong>{g.descricao}</strong>
                              <span className="block text-ink-muted">
                                {qtd} transportador{qtd === 1 ? '' : 'es'}
                              </span>
                            </span>
                          </label>
                        )
                      })
                  )}
                </div>
              </Field>

              <label className="flex items-start gap-2 text-xs text-ink-muted">
                <input
                  type="checkbox"
                  className="mt-0.5"
                  checked={escalonar}
                  onChange={(e) => setEscalonar(e.target.checked)}
                  disabled={grupoIds.length < 2}
                />
                <span>
                  Escalonar: notificar só o 1º grupo agora; os demais entram na metade do prazo.
                </span>
              </label>

              <div className="rounded-lg border border-ink/10 bg-white p-2 text-xs">
                <p className="mb-1 font-semibold text-ink">
                  Recebem agora ({previewTransportadores.agora.length})
                </p>
                {previewTransportadores.agora.length === 0 ? (
                  <p className="text-ink-muted">Nenhum — selecione um grupo.</p>
                ) : (
                  <ul className="list-inside list-disc text-ink-muted">
                    {previewTransportadores.agora.map((t) => (
                      <li key={t.id}>
                        {t.nome_fantasia}{' '}
                        <span className="uppercase">({t.classificacao})</span>
                      </li>
                    ))}
                  </ul>
                )}
                {previewTransportadores.depois.length > 0 && (
                  <>
                    <p className="mb-1 mt-2 font-semibold text-ink">
                      Entram depois ({previewTransportadores.depois.length})
                    </p>
                    <ul className="list-inside list-disc text-ink-muted">
                      {previewTransportadores.depois.map((t) => (
                        <li key={t.id}>{t.nome_fantasia}</li>
                      ))}
                    </ul>
                  </>
                )}
              </div>

              <div className="grid grid-cols-2 gap-2">
                <Field label="Prazo da negociação">
                  <select
                    className={inputClass}
                    value={prazoLeilao}
                    onChange={(e) => setPrazoLeilao(Number(e.target.value))}
                  >
                    {prazosOferta.map((m) => (
                      <option key={m} value={m}>
                        {formatPrazoLabel(m)}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Prazo para alocar">
                  <select
                    className={inputClass}
                    value={prazoAlocacao}
                    onChange={(e) => setPrazoAlocacao(Number(e.target.value))}
                  >
                    {prazosAlocacao.map((m) => (
                      <option key={m} value={m}>
                        {formatPrazoLabel(m)}
                      </option>
                    ))}
                  </select>
                </Field>
              </div>

              <Field label="Observações *">
                <textarea
                  className={`${inputClass} min-h-16`}
                  value={observacao}
                  onChange={(e) => setObservacao(e.target.value)}
                  placeholder="Informações da carga / restrições"
                  disabled={!canEdit}
                />
              </Field>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <p className="mb-1 text-xs text-ink-muted">Prioridade</p>
                  <span
                    className={`inline-block rounded-lg px-3 py-2 text-xs font-bold capitalize text-white ${
                      prioridade === 'alta'
                        ? 'bg-brand'
                        : prioridade === 'media'
                          ? 'bg-amber-500'
                          : 'bg-emerald-600'
                    }`}
                  >
                    {prioridade}
                  </span>
                </div>
                <div>
                  <p className="mb-1 text-xs text-ink-muted">Modo</p>
                  <span
                    className={`inline-block rounded-lg px-3 py-2 text-xs font-bold capitalize text-white ${
                      modo === 'oferta' ? 'bg-brand' : 'bg-ink'
                    }`}
                  >
                    {modo === 'oferta' ? 'Oferta (1ª fecha)' : 'Leilão'}
                  </span>
                </div>
              </div>

              {error && <p className="text-xs text-brand">{error}</p>}
              {info && <p className="text-xs text-emerald-700">{info}</p>}

              <div className="flex flex-wrap gap-2">
                {canEdit && (
                  <Button
                    variant="success"
                    className="min-w-[8rem] flex-1"
                    onClick={handlePublicar}
                    disabled={!carga.pedido || !carga.origem || carga.peso <= 0}
                  >
                    Publicar
                  </Button>
                )}
                {canEdit && (
                  <Button
                    variant="danger"
                    className="shrink-0"
                    onClick={() => handleExcluirRascunho(carga.id, carga.numero)}
                  >
                    <Trash2 size={14} /> Excluir
                  </Button>
                )}
                <Button variant="ghost" className="min-w-[5rem] border border-ink/15" onClick={onClose}>
                  Fechar
                </Button>
              </div>
              {(!carga.pedido || !carga.origem || carga.peso <= 0) && (
                <p className="text-[11px] text-amber-800">
                  Complete e salve os dados na aba “Dados da carga” antes de publicar.
                </p>
              )}
            </div>
            </>
          )}

          {tab === 'publicar' && !isNova && (
            <div className="space-y-3">
              <div className="rounded-lg border border-blue-200 bg-blue-50/80 p-3 text-xs">
                <p className="mb-1 font-semibold text-ink">Negociação</p>
                <Detail
                  label="Frete oferta"
                  value={formatCurrency(carga.frete_oferta ?? carga.frete_tabela)}
                />
                {carga.frete_minimo != null && (
                  <Detail label="Lance mínimo" value={formatCurrency(carga.frete_minimo)} />
                )}
                {carga.frete_maximo != null && (
                  <Detail label="Lance máximo" value={formatCurrency(carga.frete_maximo)} />
                )}
                {carga.frete_fechado != null && (
                  <Detail label="Frete fechado" value={formatCurrency(carga.frete_fechado)} />
                )}
                {carga.motivo_cancelamento && (
                  <Detail label="Motivo cancelamento" value={carga.motivo_cancelamento} />
                )}
                <Detail
                  label="Modo"
                  value={
                    carga.modo_publicacao === 'oferta'
                      ? 'Oferta — 1º lance menor fecha'
                      : 'Leilão — melhor ao fim / aceite manual'
                  }
                />
                <Detail label="Prioridade" value={carga.prioridade ?? '—'} />
                {!carga.transportador_vencedor_id && carga.expira_em && (
                  <Detail label="Tempo restante" value={tempoRestante(carga.expira_em)} />
                )}
                {carga.transportador_vencedor_id && (
                  <Detail
                    label="Vencedor"
                    value={
                      transportadorById(carga.transportador_vencedor_id)?.nome_fantasia ?? '—'
                    }
                  />
                )}
              </div>

              <div className="rounded-lg border border-ink/10 bg-white p-3 text-xs">
                <p className="mb-1 font-semibold text-ink">Quem vai negociar?</p>
                <p className="mb-2 text-[11px] text-ink-muted">
                  Grupos:{' '}
                  {carga.grupo_ids.length === 0
                    ? '—'
                    : carga.grupo_ids
                        .map((id) => grupos.find((g) => g.id === id)?.descricao ?? id)
                        .join(', ')}
                </p>
                <p className="mb-2 font-semibold text-ink">
                  Negociando agora ({negociadoresAtivos.length})
                </p>
                {negociadoresAtivos.length === 0 ? (
                  <p className="text-ink-muted">
                    Nenhum transportador notificado. Publique com grupos ou use “Notificar todos”.
                  </p>
                ) : (
                  <ul className="mb-2 space-y-1.5">
                    {negociadoresAtivos.map((t) => {
                      const propôs = idsComProposta.has(t.id)
                      const lanceT = lancesAtivos.find((l) => l.transportador_id === t.id)
                      return (
                        <li
                          key={t.id}
                          className={`flex items-center justify-between gap-2 rounded-lg border px-2.5 py-2 ${
                            propôs
                              ? 'border-emerald-400 bg-emerald-50 shadow-sm'
                              : 'border-ink/8 bg-sand-light/40'
                          }`}
                        >
                          <div className="min-w-0">
                            <p className="truncate font-semibold text-ink">{t.nome_fantasia}</p>
                            <span
                              className={`mt-0.5 inline-block rounded border px-1.5 py-0.5 text-[10px] font-bold uppercase ${classBadge(t.classificacao)}`}
                            >
                              {t.classificacao}
                            </span>
                          </div>
                          {propôs && lanceT ? (
                            <div className="shrink-0 text-right">
                              <p className="text-[10px] font-bold uppercase tracking-wide text-emerald-700">
                                Propôs
                              </p>
                              <p className="font-display text-sm font-bold text-ink">
                                {formatCurrency(lanceT.valor)}
                              </p>
                            </div>
                          ) : (
                            <span className="shrink-0 text-[10px] text-ink-muted">Sem lance</span>
                          )}
                        </li>
                      )
                    })}
                  </ul>
                )}
                {negociadoresPendentes.length > 0 && (
                  <>
                    <p className="mb-1 font-semibold text-ink">
                      Entram na metade do prazo ({negociadoresPendentes.length})
                    </p>
                    <ul className="mb-2 list-inside list-disc text-ink-muted">
                      {negociadoresPendentes.map((t) => (
                        <li key={t.id}>{t.nome_fantasia}</li>
                      ))}
                    </ul>
                    <Button
                      variant="ghost"
                      className="w-full text-xs"
                      onClick={() => {
                        notificarTodosGrupos(carga.id)
                        setInfo('Demais grupos notificados agora.')
                      }}
                    >
                      Notificar todos agora
                    </Button>
                  </>
                )}
              </div>

              <div className="grid grid-cols-3 gap-2 rounded-lg bg-sand-light/50 p-3 text-center text-xs">
                <div>
                  <p className="text-ink-muted">Visualizações</p>
                  <p className="font-display text-xl font-bold">{carga.visualizacoes}</p>
                </div>
                <div>
                  <p className="text-ink-muted">Recusas</p>
                  <p className="font-display text-xl font-bold">{carga.recusas}</p>
                </div>
                <div>
                  <p className="text-ink-muted">Propostas</p>
                  <p className="font-display text-xl font-bold text-emerald-700">
                    {lancesAtivos.length}
                  </p>
                </div>
              </div>

              {(error || info) && (
                <div
                  className={`sticky top-0 z-10 rounded-lg border px-3 py-2 text-xs font-semibold ${
                    error
                      ? 'border-red-300 bg-red-50 text-red-800'
                      : 'border-emerald-300 bg-emerald-50 text-emerald-800'
                  }`}
                >
                  {error || info}
                </div>
              )}

              {/* Ações globais de negociação */}
              {canEdit && emNegociacao && (
                <div className="space-y-2 rounded-xl border border-ink/10 bg-ink p-3 text-white">
                  <p className="text-[11px] font-bold uppercase tracking-wide text-[#e8c547]">
                    Decisões da negociação
                  </p>
                  <div className="grid grid-cols-1 gap-2">
                    {melhorLance && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.preventDefault()
                          e.stopPropagation()
                          handleEncerrar()
                        }}
                        className="flex w-full cursor-pointer items-center gap-2 rounded-lg bg-emerald-500 px-3 py-2.5 text-left text-sm font-bold text-white transition hover:bg-emerald-600"
                      >
                        <Check size={18} strokeWidth={2.5} className="pointer-events-none shrink-0" />
                        <span className="pointer-events-none flex-1">
                          Aceitar melhor oferta
                          <span className="mt-0.5 block text-[11px] font-medium text-white/90">
                            {transportadorById(melhorLance.transportador_id)?.nome_fantasia} ·{' '}
                            {formatCurrency(melhorLance.valor)}
                          </span>
                        </span>
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.preventDefault()
                        e.stopPropagation()
                        handleAguardarMelhores()
                      }}
                      className="flex w-full cursor-pointer items-center gap-2 rounded-lg bg-[#e8c547] px-3 py-2.5 text-left text-sm font-bold text-ink transition hover:bg-[#f0d44a]"
                    >
                      <Hourglass size={18} strokeWidth={2.4} className="pointer-events-none shrink-0" />
                      <span className="pointer-events-none flex-1">
                        Esperar ofertas melhores
                        <span className="mt-0.5 block text-[11px] font-medium text-ink/70">
                          Estende a janela em 10 minutos
                        </span>
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.preventDefault()
                        e.stopPropagation()
                        handleFinalizar()
                      }}
                      className="flex w-full cursor-pointer items-center gap-2 rounded-lg border border-white/25 bg-white/10 px-3 py-2 text-left text-xs font-semibold text-white transition hover:bg-white/15"
                    >
                      <Clock size={16} className="pointer-events-none shrink-0" />
                      <span className="pointer-events-none">
                        Finalizar negociação
                        {lancesAtivos.length === 0 ? ' (sem vencedor)' : ' (aceita a melhor)'}
                      </span>
                    </button>
                  </div>
                </div>
              )}

              <div>
                <p className="mb-2 text-xs font-semibold text-ink">
                  Propostas recebidas ({lances.length})
                </p>
                {carga.observacao && (
                  <p className="mb-2 rounded bg-sand-light/60 p-2 text-[11px] text-ink-muted">
                    <strong>Obs:</strong> {carga.observacao}
                  </p>
                )}
                {lances.length === 0 ? (
                  <p className="rounded-lg border border-dashed border-ink/15 bg-sand-light/40 px-3 py-4 text-center text-xs text-ink-muted">
                    Nenhum lance ainda. Os transportadores listados acima veem esta carga no Kanban
                    deles.
                  </p>
                ) : (
                  <ul className="space-y-2.5">
                    {lances.map((l, idx) => {
                      const t = transportadorById(l.transportador_id)
                      const isMelhor = l.status === 'ativo' && idx === 0
                      const isVencedor = l.status === 'vencedor'
                      return (
                        <li
                          key={l.id}
                          className={`rounded-xl border p-3 shadow-sm transition ${
                            isVencedor
                              ? 'border-emerald-500 bg-emerald-50 ring-2 ring-emerald-400/40'
                              : isMelhor
                                ? 'border-[#e8c547] bg-[#fffbeb] ring-2 ring-[#e8c547]/50'
                                : l.status === 'ativo'
                                  ? 'border-ink/12 bg-white'
                                  : 'border-ink/8 bg-sand-light/50 opacity-80'
                          }`}
                        >
                          <div className="mb-2 flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <div className="flex flex-wrap items-center gap-1.5">
                                <span
                                  className={`inline-flex h-6 min-w-6 items-center justify-center rounded-md text-[11px] font-bold ${
                                    isMelhor || isVencedor
                                      ? 'bg-ink text-[#e8c547]'
                                      : 'bg-ink/10 text-ink'
                                  }`}
                                >
                                  {idx + 1}º
                                </span>
                                {(isMelhor || isVencedor) && (
                                  <span className="rounded-full bg-emerald-600 px-2 py-0.5 text-[10px] font-bold uppercase text-white">
                                    {isVencedor ? 'Vencedor' : 'Melhor oferta'}
                                  </span>
                                )}
                                {l.status === 'perdido' && (
                                  <span className="text-[10px] font-semibold text-ink-muted">
                                    Perdeu
                                  </span>
                                )}
                                {l.status === 'recusado' && (
                                  <span className="text-[10px] font-semibold text-red-600">
                                    Rejeitado
                                  </span>
                                )}
                              </div>
                              <p className="mt-1.5 truncate font-display text-[15px] font-bold text-ink">
                                {t?.nome_fantasia ?? 'Transportadora'}
                              </p>
                              <div className="mt-1 flex flex-wrap items-center gap-1.5">
                                <span
                                  className={`rounded border px-1.5 py-0.5 text-[10px] font-bold uppercase ${classBadge(t?.classificacao)}`}
                                >
                                  {t?.classificacao ?? '—'}
                                </span>
                                <span className="text-[10px] text-ink-muted">
                                  {formatDateTime(l.updated_at ?? l.created_at)}
                                </span>
                              </div>
                            </div>
                            <div className="shrink-0 text-right">
                              <p className="text-[10px] font-semibold uppercase text-ink-muted">
                                Lance
                              </p>
                              <p className="font-display text-lg font-bold tabular-nums text-ink">
                                {formatCurrency(l.valor)}
                              </p>
                            </div>
                          </div>

                          {canEdit && l.status === 'ativo' && !carga.transportador_vencedor_id && (
                            <div className="relative z-10 grid grid-cols-3 gap-1.5">
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.preventDefault()
                                  e.stopPropagation()
                                  handleAceitar(l.id)
                                }}
                                className="inline-flex cursor-pointer items-center justify-center gap-1 rounded-lg bg-emerald-600 px-2 py-2 text-[11px] font-bold text-white hover:bg-emerald-700"
                              >
                                <Check size={14} strokeWidth={2.5} className="pointer-events-none" />
                                Aceitar
                              </button>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.preventDefault()
                                  e.stopPropagation()
                                  openContraProposta(l.id, l.valor)
                                }}
                                className="inline-flex cursor-pointer items-center justify-center gap-1 rounded-lg bg-[#e8c547] px-2 py-2 text-[11px] font-bold text-ink hover:bg-[#f0d44a]"
                              >
                                <Handshake size={14} strokeWidth={2.4} className="pointer-events-none" />
                                Contra
                              </button>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.preventDefault()
                                  e.stopPropagation()
                                  handleRejeitar(l.id)
                                }}
                                className="inline-flex cursor-pointer items-center justify-center gap-1 rounded-lg border border-red-200 bg-red-50 px-2 py-2 text-[11px] font-bold text-red-700 hover:bg-red-100"
                              >
                                <X size={14} strokeWidth={2.5} className="pointer-events-none" />
                                Rejeitar
                              </button>
                            </div>
                          )}
                        </li>
                      )
                    })}
                  </ul>
                )}
              </div>

              {histPropostas.length > 0 && (
                <div className="rounded-lg border border-ink/10 p-3 text-xs">
                  <p className="mb-1 font-semibold text-ink-muted">Histórico de alterações de lance</p>
                  <ul className="max-h-28 space-y-1 overflow-y-auto text-ink-muted">
                    {histPropostas.slice(0, 12).map((h) => (
                      <li key={h.id}>
                        {formatDateTime(h.created_at)}:{' '}
                        {h.valor_anterior != null
                          ? `${formatCurrency(h.valor_anterior)} → `
                          : 'novo '}
                        {formatCurrency(h.valor_novo)}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {canEdit && (
                <div className="flex flex-col gap-2">
                  {['negociando', 'propostas'].includes(carga.status) &&
                    !carga.transportador_vencedor_id && (
                      <>
                        <Button variant="ghost" className="w-full" onClick={handleSuspender}>
                          Suspender negociação
                        </Button>
                        <Button variant="danger" className="w-full" onClick={handleCancelar}>
                          Cancelar publicação
                        </Button>
                      </>
                    )}
                  {carga.status === 'suspensas' && (
                    <>
                      <Button variant="success" className="w-full" onClick={handleRetomar}>
                        Retomar negociação
                      </Button>
                      <Button variant="danger" className="w-full" onClick={handleCancelar}>
                        Cancelar publicação
                      </Button>
                    </>
                  )}
                  {(['canceladas', 'recusadas', 'alocadas'].includes(carga.status) ||
                    (['negociando', 'propostas', 'suspensas'].includes(carga.status) &&
                      !carga.transportador_vencedor_id)) && (
                    <Button variant="success" className="w-full" onClick={handleRepublicar}>
                      Preparar republicação (zera propostas)
                    </Button>
                  )}
                  {(Boolean(carga.transportador_vencedor_id) ||
                    carga.status === 'alocadas') && (
                    <Button variant="ghost" className="w-full" onClick={handleReabrir}>
                      Reabrir em nova rodada
                    </Button>
                  )}
                </div>
              )}

              {carga.transportador_vencedor_id && carga.status !== 'alocadas' && canEdit && (
                <Button
                  variant="danger"
                  className="w-full"
                  onClick={() => {
                    recusarCargaMinerva(carga.id)
                    onClose()
                  }}
                >
                  Recusar frete fechado
                </Button>
              )}

              <Button variant="ghost" className="w-full" onClick={onClose}>
                Fechar
              </Button>
            </div>
          )}
        </div>
      </aside>

      <Modal
        open={Boolean(contraLanceId)}
        title="Contra-proposta"
        onClose={() => setContraLanceId(null)}
      >
        <div className="space-y-3">
          <p className="text-sm text-ink-muted">
            Informe o valor sugerido ao transportador. Ele recebe no chat e nas notificações.
          </p>
          {contraLanceId && (
            <p className="rounded-lg bg-sand-light/70 px-3 py-2 text-xs text-ink">
              Oferta atual:{' '}
              <strong>
                {formatCurrency(
                  lances.find((l) => l.id === contraLanceId)?.valor ?? 0,
                )}
              </strong>
              {' · '}
              {transportadorById(
                lances.find((l) => l.id === contraLanceId)?.transportador_id ?? '',
              )?.nome_fantasia ?? '—'}
            </p>
          )}
          <Field label="Valor da contra-proposta (R$)">
            <input
              className={`${inputClass} text-lg font-bold tabular-nums`}
              value={contraValor}
              inputMode="decimal"
              autoFocus
              onChange={(e) => setContraValor(e.target.value)}
              onBlur={() => {
                const n = parseMoneyInput(contraValor)
                if (Number.isNaN(n)) return
                const formatted = formatMoneyInput(n)
                if (formatted !== contraValor) setContraValor(formatted)
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  handleContraProposta()
                }
              }}
              placeholder="0,00"
            />
          </Field>
          {error && (
            <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-800">
              {error}
            </p>
          )}
          <div className="flex gap-2">
            <Button
              variant="ghost"
              className="flex-1"
              onMouseDown={(e) => {
                e.preventDefault()
                setContraLanceId(null)
                setError('')
              }}
            >
              Cancelar
            </Button>
            <Button
              className="flex-1"
              onMouseDown={(e) => {
                // evita perder o clique quando o input perde o foco (blur)
                e.preventDefault()
                handleContraProposta()
              }}
            >
              Enviar contra-proposta
            </Button>
          </div>
        </div>
      </Modal>

      <Modal
        open={showJustificativa}
        title="Justificativa Prioridade Alta"
        onClose={() => setShowJustificativa(false)}
      >
        <div className="space-y-3">
          <p className="text-sm text-ink-muted">
            Prazo ≤ {config.limite_urgencia_minutos} min define prioridade alta e modo Oferta.
            Informe o motivo.
          </p>
          <Field label="Motivo">
            <select className={inputClass} value={motivo} onChange={(e) => setMotivo(e.target.value)}>
              <option value="">Selecione...</option>
              {MOTIVOS_PRIORIDADE_ALTA.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Observação">
            <textarea
              className={`${inputClass} min-h-24`}
              value={obs}
              onChange={(e) => setObs(e.target.value)}
            />
          </Field>
          {error && <p className="text-xs text-brand">{error}</p>}
          <div className="flex gap-2">
            <Button variant="success" className="flex-1" onClick={confirmJustificativa}>
              Publicar
            </Button>
            <Button variant="danger" className="flex-1" onClick={() => setShowJustificativa(false)}>
              Fechar
            </Button>
          </div>
        </div>
      </Modal>
    </>
  )
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3 border-b border-ink/5 pb-1">
      <span className="shrink-0 text-xs text-ink-muted">{label}</span>
      <span className="text-right text-xs font-medium">{value}</span>
    </div>
  )
}
