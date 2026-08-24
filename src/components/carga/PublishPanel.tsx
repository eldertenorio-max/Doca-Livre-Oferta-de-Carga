import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Check,
  ChevronDown,
  ChevronUp,
  Clock,
  Handshake,
  Hourglass,
  Maximize2,
  Minimize2,
  PanelLeft,
  Search,
  Trash2,
  X,
} from 'lucide-react'
import { normalizarTexto } from '../../lib/cidadesBrasil'
import { isCargaEphemeral, useData } from '../../context/DataContext'
import {
  MOTIVOS_PRIORIDADE_ALTA,
  calcularFreteOferta,
  calcularPrioridadeEModo,
  formatCurrency,
  formatDateTime,
  formatMoneyInput,
  formatNumber,
  formatPrazoLabel,
  moneyFromDigits,
  parseMoneyInput,
  tempoRestante,
} from '../../lib/businessRules'
import {
  loadPanelSize,
  panelSizeClass,
  savePanelSize,
  type PanelSize,
} from '../../lib/cargasMontadas'
import { isRascunhoNaoPublicado } from '../../lib/kanbanColumns'
import { asTipoOferta, labelTipoOferta } from '../../lib/cargaDefaults'
import {
  MARCA_SEM_ESPECIFICA,
  MODELO_SEM_ESPECIFICO,
  labelModeloRisco,
  MODELOS_RASTREADOR,
  MODELOS_LOCALIZADOR,
  MODELOS_RASTREADOR_DISTRIBUICAO,
  MODELOS_LOCALIZADOR_DISTRIBUICAO,
  transportadorAtendeCarga,
} from '../../lib/cargaExigencias'
import { CargaExigenciasFields } from './CargaExigenciasFields'
import { limparPontosPassagemRota } from '../../lib/rotasSync'
import { prazosAlocacaoPermitidos, prazosOfertaPermitidos } from '../../lib/configNegocio'
import { canEditModulo } from '../../lib/portalModules'
import { showActionFlash } from '../../lib/actionFlash'
import type {
  Carga,
  ClassificacaoTransportador,
  ModoPublicacao,
  Prioridade,
  Rota,
  Transportador,
} from '../../types'
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
  /** Prefill de Negociação Direta (vindo da cotação de transportadoras). */
  prefillPublicacao?: {
    modo?: ModoPublicacao
    transportadorIds?: string[]
  } | null
  /** Troca a carga aberta no painel (rascunhos salvos) */
  onSelectCarga?: (carga: Carga) => void
  /** Rascunho efêmero virou carga salva (primeiro Salvar) */
  onCargaPersistida?: (carga: Carga, opts?: { irParaPublicar?: boolean }) => void
  /** Notifica o layout (Kanban) para expandir até o menu lateral */
  onPanelSizeChange?: (size: PanelSize) => void
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

export function PublishPanel({
  carga,
  open,
  onClose,
  initialTab,
  prefillPublicacao,
  onSelectCarga,
  onCargaPersistida,
  onPanelSizeChange,
}: Props) {
  const {
    cargas,
    rotas,
    grupos,
    transportadores,
    salvarRota,
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
    veiculos,
  } = useData()
  void tick

  const canEdit =
    canEditModulo(user?.permissoes_modulos, 'kanban') ||
    Boolean(user?.is_superuser) ||
    user?.role === 'super' ||
    Boolean(user?.is_superuser)
  const classificacao = carga?.classificacao_rota ?? 'B'
  const margens = config.margens[classificacao]
  const prazosOferta = prazosOfertaPermitidos(config)
  const prazosAlocacao = prazosAlocacaoPermitidos()

  const [tab, setTab] = useState<PanelTab>(initialTab ?? 'dados')
  const [panelSize, setPanelSize] = useState<PanelSize>(() => loadPanelSize())

  useEffect(() => {
    onPanelSizeChange?.(panelSize)
  }, [panelSize, onPanelSizeChange])
  const [buscaRascunhos, setBuscaRascunhos] = useState('')
  const [buscaFavoritas, setBuscaFavoritas] = useState('')
  const [margem, setMargem] = useState(margens[1])
  const [grupoIds, setGrupoIds] = useState<string[]>([])
  const [gruposSelectAberto, setGruposSelectAberto] = useState(false)
  const [buscaGrupos, setBuscaGrupos] = useState('')
  const gruposSelectRef = useRef<HTMLDivElement>(null)
  const [transportadorDiretoIds, setTransportadorDiretoIds] = useState<string[]>([])
  const [diretosSelectAberto, setDiretosSelectAberto] = useState(false)
  const [buscaDiretos, setBuscaDiretos] = useState('')
  const diretosSelectRef = useRef<HTMLDivElement>(null)
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
  /** null = segue sugestão do prazo; valor = escolha manual Leilão/Oferta */
  const [modoOverride, setModoOverride] = useState<ModoPublicacao | null>(null)
  const [prioridadeManual, setPrioridadeManual] = useState<Prioridade | null>(null)
  const [riscoPub, setRiscoPub] = useState<NonNullable<Carga['gerenciamento_risco']>>('nao')
  const [marcaRastreadorPub, setMarcaRastreadorPub] = useState(MARCA_SEM_ESPECIFICA)
  const [marcaLocalizadorPub, setMarcaLocalizadorPub] = useState(MARCA_SEM_ESPECIFICA)
  const [modeloRastreadorPub, setModeloRastreadorPub] = useState(MODELO_SEM_ESPECIFICO)
  const [modeloLocalizadorPub, setModeloLocalizadorPub] = useState(MODELO_SEM_ESPECIFICO)
  const [tempMinPub, setTempMinPub] = useState<number | undefined>()
  const [tempMaxPub, setTempMaxPub] = useState<number | undefined>()
  const [exigeAjudantePub, setExigeAjudantePub] = useState(false)

  const usarRegra = config.usar_regra_prioridade_modo !== false

  // Reset do formulário só ao trocar de carga (sync de grupos não pode resetar a aba)
  const cargaIdAnterior = useRef(carga?.id)
  useEffect(() => {
    if (!carga) return
    const prevId = cargaIdAnterior.current
    const nextId = carga.id
    cargaIdAnterior.current = nextId
    const persistindoRascunho =
      Boolean(prevId?.startsWith('draft-')) && Boolean(nextId) && !nextId.startsWith('draft-')

    const m = config.margens[carga.classificacao_rota ?? 'B']
    setMargem(m[1] ?? m[0])
    const ativos = grupos.filter((g) => g.situacao === 'ativo').map((g) => g.id)
    setGrupoIds(carga.grupo_ids.length ? carga.grupo_ids : ativos)
    const prefillDireta =
      carga.status === 'nova_carga' &&
      prefillPublicacao?.modo === 'negociacao_direta'
    const prefillIds = prefillDireta
      ? [...new Set((prefillPublicacao?.transportadorIds ?? []).filter(Boolean))]
      : []

    setTransportadorDiretoIds(
      prefillIds.length > 0
        ? prefillIds
        : Array.isArray(carga.transportador_direto_ids)
          ? [...carga.transportador_direto_ids]
          : [],
    )
    setEscalonar(false)
    setPrazoLeilao(carga.prazo_leilao_minutos ?? config.prazo_oferta_padrao_minutos)
    setPrazoAlocacao(carga.prazo_alocacao_minutos ?? config.prazo_alocacao_padrao_minutos)
    setModoOverride(
      prefillDireta || carga.modo_publicacao === 'negociacao_direta'
        ? 'negociacao_direta'
        : usarRegra
          ? null
          : (config.modo_padrao ?? 'leilao'),
    )
    setPrioridadeManual(usarRegra ? null : (config.prioridade_padrao ?? 'media'))
    setError('')
    setInfo(
      prefillDireta && prefillIds.length > 0
        ? `Negociação direta pronta com ${prefillIds.length} transportadora(s). Complete os dados e publique.`
        : '',
    )
    setMotivo(carga.justificativa_motivo ?? '')
    setObs(carga.justificativa_obs ?? '')
    setObservacao(carga.observacao ?? '')
    setRiscoPub(carga.gerenciamento_risco ?? 'nao')
    setMarcaRastreadorPub(carga.marca_rastreador || MARCA_SEM_ESPECIFICA)
    setMarcaLocalizadorPub(carga.marca_localizador || MARCA_SEM_ESPECIFICA)
    setModeloRastreadorPub(carga.modelo_rastreador || MODELO_SEM_ESPECIFICO)
    setModeloLocalizadorPub(carga.modelo_localizador || MODELO_SEM_ESPECIFICO)
    setTempMinPub(carga.temp_min)
    setTempMaxPub(carga.temp_max)
    setExigeAjudantePub(Boolean(carga.exige_ajudante))
    // Rascunho gravado (draft-* → c-*): não voltar para Dados — senão "Salvar e publicar" parece não funcionar.
    if (persistindoRascunho) {
      if (initialTab === 'publicar') setTab('publicar')
      return
    }
    // Publicada: só Negociação (dados ficam no painel dividido). Rascunho: respeita initialTab.
    const defaultTab: PanelTab =
      carga.status !== 'nova_carga'
        ? 'publicar'
        : (initialTab ?? 'dados')
    setTab(defaultTab)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- só ao abrir outra carga / prefill
  }, [carga?.id, initialTab, usarRegra, prefillPublicacao])

  // Carga publicada: mantém sempre na aba Negociação
  useEffect(() => {
    if (!carga || carga.status === 'nova_carga') return
    if (tab !== 'publicar') setTab('publicar')
  }, [carga?.id, carga?.status, tab])

  // Observações salvas na aba Dados entram na aba Publicar sem resetar o resto
  useEffect(() => {
    if (!carga) return
    setObservacao(carga.observacao ?? '')
  }, [carga?.id, carga?.observacao])

  useEffect(() => {
    if (!carga) setInfo('')
  }, [carga?.id])

  useEffect(() => {
    if (tab !== 'salvas') {
      setBuscaRascunhos('')
      setBuscaFavoritas('')
    }
  }, [tab])

  const rascunhosNaoPublicados = useMemo(() => {
    return [...cargas]
      .filter(isRascunhoNaoPublicado)
      .filter((c) => !isCargaEphemeral(c))
      // Só lista o que já foi preenchido/salvo (evita lixo de “Nova carga” antiga)
      .filter(
        (c) =>
          Boolean(c.pedido?.trim()) ||
          Boolean(c.origem?.trim()) ||
          Boolean(c.destino?.trim()) ||
          c.frete_tabela > 0,
      )
      .sort((a, b) => {
        const ta = new Date(a.updated_at || a.created_at || 0).getTime()
        const tb = new Date(b.updated_at || b.created_at || 0).getTime()
        return tb - ta
      })
  }, [cargas])

  const rotasFavoritas = useMemo(
    () => rotas.filter((r) => r.situacao === 'ativo'),
    [rotas],
  )

  const qRascunhos = normalizarTexto(buscaRascunhos)
  const qFavoritas = normalizarTexto(buscaFavoritas)

  const rascunhosFiltrados = useMemo(() => {
    if (!qRascunhos) return rascunhosNaoPublicados
    return rascunhosNaoPublicados.filter((c) => {
      const blob = normalizarTexto(
        [
          c.numero,
          c.pedido,
          c.origem,
          c.destino,
          c.destinatario,
          c.destinatario_cnpj,
          c.destinatario_whatsapp,
          c.destinatario_email,
          c.tipo_carga,
          c.veiculo,
          c.observacao,
          String(c.frete_tabela ?? ''),
          c.classificacao_rota ?? '',
        ].join(' '),
      )
      return blob.includes(qRascunhos)
    })
  }, [rascunhosNaoPublicados, qRascunhos])

  const favoritasFiltradas = useMemo(() => {
    if (!qFavoritas) return rotasFavoritas
    return rotasFavoritas.filter((r) => {
      const blob = normalizarTexto(
        [
          r.descricao,
          r.origem,
          r.destino,
          String(r.frete_tabela ?? ''),
          r.classificacao,
        ].join(' '),
      )
      return blob.includes(qFavoritas)
    })
  }, [rotasFavoritas, qFavoritas])

  const { ganho, freteOferta } = useMemo(
    () => calcularFreteOferta(carga?.frete_tabela ?? 0, margem),
    [carga, margem],
  )

  const sugerido = useMemo(
    () => calcularPrioridadeEModo(prazoLeilao, config.limite_urgencia_minutos),
    [prazoLeilao, config.limite_urgencia_minutos],
  )
  const prioridade: Prioridade = usarRegra
    ? sugerido.prioridade
    : (prioridadeManual ?? config.prioridade_padrao ?? sugerido.prioridade)
  const modo: ModoPublicacao = usarRegra
    ? (modoOverride ?? sugerido.modo)
    : (modoOverride ?? config.modo_padrao ?? sugerido.modo)
  const exigeJustificativa = usarRegra
    ? sugerido.exigeJustificativa
    : prioridade === 'alta'

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
    const rascunhoExigencias: Carga | null = carga
      ? {
          ...carga,
          gerenciamento_risco: riscoPub,
          marca_rastreador: marcaRastreadorPub,
          marca_localizador: marcaLocalizadorPub,
          modelo_rastreador: modeloRastreadorPub,
          modelo_localizador: modeloLocalizadorPub,
          temp_min: tempMinPub,
          temp_max: tempMaxPub,
          exige_ajudante: exigeAjudantePub,
        }
      : null
    const filtra = (lista: Transportador[]) =>
      rascunhoExigencias
        ? lista.filter((t) => transportadorAtendeCarga(rascunhoExigencias, veiculos, t.id))
        : lista
    return { agora: filtra(agora), depois: filtra(depois), totalSemFiltro: agora.length + depois.length }
  }, [
    grupoIds,
    escalonar,
    grupos,
    transportadores,
    carga,
    veiculos,
    riscoPub,
    marcaRastreadorPub,
    marcaLocalizadorPub,
    modeloRastreadorPub,
    modeloLocalizadorPub,
    tempMinPub,
    tempMaxPub,
    exigeAjudantePub,
  ])

  const gruposAtivos = useMemo(
    () => grupos.filter((g) => g.situacao === 'ativo'),
    [grupos],
  )

  const gruposFiltrados = useMemo(() => {
    const q = buscaGrupos.trim().toLowerCase()
    if (!q) return gruposAtivos
    return gruposAtivos.filter((g) => g.descricao.toLowerCase().includes(q))
  }, [gruposAtivos, buscaGrupos])

  const rotuloGrupos = useMemo(() => {
    if (grupoIds.length === 0) return 'Selecione os grupos…'
    const nomes = grupoIds
      .map((id) => gruposAtivos.find((g) => g.id === id)?.descricao)
      .filter(Boolean) as string[]
    if (nomes.length <= 2) return nomes.join(', ')
    return `${nomes.slice(0, 2).join(', ')} +${nomes.length - 2}`
  }, [grupoIds, gruposAtivos])

  const transportadoresAtivos = useMemo(
    () =>
      transportadores
        .filter((t) => t.situacao === 'ativo')
        .slice()
        .sort((a, b) =>
          (a.nome_fantasia || a.razao_social).localeCompare(
            b.nome_fantasia || b.razao_social,
            'pt-BR',
          ),
        ),
    [transportadores],
  )

  const transportadoresDiretosFiltrados = useMemo(() => {
    const q = buscaDiretos.trim().toLowerCase()
    if (!q) return transportadoresAtivos
    return transportadoresAtivos.filter((t) => {
      const nome = `${t.nome_fantasia} ${t.razao_social} ${t.cidade ?? ''} ${t.uf ?? ''}`.toLowerCase()
      return nome.includes(q) || (t.cnpj ?? '').includes(q)
    })
  }, [transportadoresAtivos, buscaDiretos])

  const rotuloDiretos = useMemo(() => {
    if (transportadorDiretoIds.length === 0) return 'Selecione as transportadoras…'
    const nomes = transportadorDiretoIds
      .map((id) => {
        const t = transportadoresAtivos.find((x) => x.id === id)
        return t?.nome_fantasia || t?.razao_social
      })
      .filter(Boolean) as string[]
    if (nomes.length <= 2) return nomes.join(', ')
    return `${nomes.slice(0, 2).join(', ')} +${nomes.length - 2}`
  }, [transportadorDiretoIds, transportadoresAtivos])

  useEffect(() => {
    if (!gruposSelectAberto) return
    const onDoc = (e: MouseEvent) => {
      if (!gruposSelectRef.current?.contains(e.target as Node)) {
        setGruposSelectAberto(false)
        setBuscaGrupos('')
      }
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [gruposSelectAberto])

  useEffect(() => {
    if (!diretosSelectAberto) return
    const onDoc = (e: MouseEvent) => {
      if (!diretosSelectRef.current?.contains(e.target as Node)) {
        setDiretosSelectAberto(false)
        setBuscaDiretos('')
      }
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [diretosSelectAberto])

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

  function handleUsarFavorita(r: Rota) {
    if (!carga || !isNova) return
    if (isCargaEphemeral(carga)) {
      // Só preenche o formulário — grava no board ao clicar Salvar
      onCargaPersistida?.({
        ...carga,
        rota_id: r.id,
        origem: r.origem,
        destino: r.destino,
        origem_lat: r.origem_lat ?? null,
        origem_lng: r.origem_lng ?? null,
        destino_lat: r.destino_lat ?? null,
        destino_lng: r.destino_lng ?? null,
        frete_tabela: r.frete_tabela,
        classificacao_rota: r.classificacao,
        updated_at: new Date().toISOString(),
      })
      setError('')
      setInfo(`Rota “${r.descricao}” aplicada. Preencha o restante e clique em Salvar.`)
      setTab('dados')
      return
    }
    const res = atualizarCarga(carga.id, {
      rota_id: r.id,
      origem: r.origem,
      destino: r.destino,
      origem_lat: r.origem_lat ?? null,
      origem_lng: r.origem_lng ?? null,
      destino_lat: r.destino_lat ?? null,
      destino_lng: r.destino_lng ?? null,
      frete_tabela: r.frete_tabela,
      classificacao_rota: r.classificacao,
    })
    if (!res.ok) {
      setError(res.error ?? 'Não foi possível aplicar a rota favorita')
      return
    }
    setError('')
    setInfo(`Rota favorita “${r.descricao}” aplicada. Revise os dados e publique.`)
    setTab('dados')
  }

  function handleRemoverFavorita(r: Rota) {
    if (!canEdit) return
    if (!window.confirm(`Remover a favorita “${r.descricao}” da lista?`)) return
    salvarRota({ ...r, situacao: 'inativo' })
    setInfo(`Favorita “${r.descricao}” removida.`)
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

  function toggleDireto(id: string) {
    setTransportadorDiretoIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    )
  }

  function doPublicar(justificativa?: { motivo: string; obs?: string }) {
    setError('')
    if (!canEdit) {
      setError('Seu perfil não permite publicar.')
      return false
    }
    const isDireta = modo === 'negociacao_direta'
    const patchExigencias: Partial<Carga> = {
      gerenciamento_risco: riscoPub,
      marca_rastreador:
        riscoPub === 'rastreador' || riscoPub === 'ambos' ? marcaRastreadorPub : undefined,
      modelo_rastreador:
        riscoPub === 'rastreador' || riscoPub === 'ambos' ? modeloRastreadorPub : undefined,
      marca_localizador:
        riscoPub === 'localizador' || riscoPub === 'ambos' ? marcaLocalizadorPub : undefined,
      modelo_localizador:
        riscoPub === 'localizador' || riscoPub === 'ambos' ? modeloLocalizadorPub : undefined,
      temp_min: tempMinPub,
      temp_max: tempMaxPub,
      exige_ajudante: exigeAjudantePub,
    }
    const salvo = atualizarCarga(carga!.id, patchExigencias)
    if (!salvo.ok) {
      setError(salvo.error ?? 'Não foi possível gravar as exigências.')
      return false
    }
    const res = publicarCarga({
      cargaId: carga!.id,
      margemPercentual: margem,
      grupoIds: isDireta ? [] : grupoIds,
      prazoLeilaoMinutos: prazoLeilao,
      prazoAlocacaoMinutos: prazoAlocacao,
      modoPublicacao: modo,
      prioridade,
      justificativaMotivo: justificativa?.motivo || motivo || undefined,
      justificativaObs: (justificativa?.obs ?? obs) || undefined,
      observacao: observacao.trim() || undefined,
      escalonarGrupos: isDireta ? false : escalonar,
      transportadorDiretoIds: isDireta ? transportadorDiretoIds : [],
    })
    if (!res.ok) {
      setError(res.error ?? 'Erro ao publicar')
      return false
    }
    if (res.pushAviso) setInfo(res.pushAviso)
    return true
  }

  function handlePublicar() {
    setError('')
    setInfo('')
    if (isCargaEphemeral(carga)) {
      setError('Salve a carga na aba Dados antes de publicar.')
      setTab('dados')
      return
    }
    if (modo === 'negociacao_direta') {
      if (transportadorDiretoIds.length === 0) {
        setError('Selecione ao menos uma transportadora para negociação direta.')
        return
      }
    } else if (grupoIds.length === 0) {
      setError('Selecione quem vai negociar: ao menos um grupo.')
      return
    }
    if (exigeJustificativa && !motivo) {
      setShowJustificativa(true)
      return
    }
    if (doPublicar()) {
      setInfo(
        'Carga publicada. Push enviado aos celulares dos transportadores com alertas ativados (PWA + “Ativar alertas”).',
      )
    }
  }

  function confirmJustificativa() {
    if (!motivo) {
      setError('Selecione o motivo')
      return
    }
    setShowJustificativa(false)
    if (doPublicar({ motivo, obs })) {
      setInfo(
        'Carga publicada. Push enviado aos celulares dos transportadores com alertas ativados (PWA + “Ativar alertas”).',
      )
    }
  }

  function handleAceitar(lanceId: string) {
    if (!canEdit) {
      setError('Seu perfil não permite aceitar propostas.')
      showActionFlash({
        titulo: 'Sem permissão',
        mensagem: 'Seu perfil não permite aceitar propostas.',
        tone: 'erro',
      })
      return
    }
    setError('')
    setInfo('')
    const lance = lances.find((l) => l.id === lanceId)
    const tNome =
      transportadorById(lance?.transportador_id ?? '')?.nome_fantasia ?? 'transportadora'
    const valorLbl = lance ? formatCurrency(lance.valor) : ''
    const okConfirm = window.confirm(
      `Aceitar a proposta de ${tNome}${valorLbl ? ` (${valorLbl})` : ''} e fechar o frete?`,
    )
    if (!okConfirm) return

    const res = aceitarLance(lanceId)
    if (!res.ok) {
      setError(res.error ?? 'Falha ao aceitar')
      showActionFlash({
        titulo: 'Não foi possível aceitar',
        mensagem: res.error ?? 'Falha ao aceitar a proposta.',
        tone: 'erro',
      })
    } else {
      setInfo('Frete fechado. Aguardando alocação do transportador.')
      showActionFlash({
        titulo: 'Proposta aceita',
        mensagem: `Frete fechado com ${tNome}${valorLbl ? ` · ${valorLbl}` : ''}. Aguardando alocação.`,
      })
    }
  }

  function handleRejeitar(lanceId: string) {
    if (!canEdit) {
      setError('Seu perfil não permite rejeitar propostas.')
      showActionFlash({
        titulo: 'Sem permissão',
        mensagem: 'Seu perfil não permite rejeitar propostas.',
        tone: 'erro',
      })
      return
    }
    setError('')
    setInfo('')
    const lance = lances.find((l) => l.id === lanceId)
    const tNome =
      transportadorById(lance?.transportador_id ?? '')?.nome_fantasia ?? 'transportadora'
    const valorLbl = lance ? formatCurrency(lance.valor) : ''
    const okConfirm = window.confirm(
      `Rejeitar a proposta de ${tNome}${valorLbl ? ` (${valorLbl})` : ''}?`,
    )
    if (!okConfirm) return

    const res = rejeitarLance(lanceId)
    if (!res.ok) {
      setError(res.error ?? 'Falha ao rejeitar')
      showActionFlash({
        titulo: 'Não foi possível rejeitar',
        mensagem: res.error ?? 'Falha ao rejeitar a proposta.',
        tone: 'erro',
      })
    } else {
      setInfo('Proposta rejeitada.')
      showActionFlash({
        titulo: 'Proposta rejeitada',
        mensagem: `A proposta de ${tNome}${valorLbl ? ` (${valorLbl})` : ''} foi rejeitada.`,
      })
    }
  }

  function handleEncerrar() {
    if (!canEdit) {
      setError('Seu perfil não permite encerrar a negociação.')
      return
    }
    setError('')
    setInfo('')
    const res = encerrarComMelhorLance(carga!.id)
    if (!res.ok) {
      setError(res.error ?? 'Falha ao encerrar')
      showActionFlash({
        titulo: 'Não foi possível aceitar',
        mensagem: res.error ?? 'Falha ao encerrar',
        tone: 'erro',
      })
    } else {
      setInfo('Melhor lance aceito. Frete fechado.')
      showActionFlash({
        titulo: 'Oferta aceita',
        mensagem: 'Melhor lance aceito. Frete fechado.',
      })
    }
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
    if (!canEdit || !carga) return
    const motivo = window.prompt('Motivo do cancelamento (opcional):')
    if (motivo === null) return // usuário fechou o prompt
    setError('')
    setInfo('')
    const res = cancelarPublicacao(carga.id, motivo.trim() || undefined)
    if (!res.ok) setError(res.error ?? 'Falha ao cancelar')
    else setInfo('Publicação cancelada. A carga foi para a coluna Canceladas.')
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
      showActionFlash({
        titulo: 'Sem permissão',
        mensagem: 'Seu perfil não permite enviar contra-proposta.',
        tone: 'erro',
      })
      return
    }
    setContraLanceId(lanceId)
    setContraValor(formatMoneyInput(valorAtual))
    setError('')
    setInfo('')
    const tNome =
      transportadorById(lances.find((l) => l.id === lanceId)?.transportador_id ?? '')
        ?.nome_fantasia ?? 'transportadora'
    showActionFlash({
      titulo: 'Contra-proposta',
      mensagem: `Informe o valor para ${tNome} e confirme o envio.`,
      ms: 2500,
    })
  }

  function handleContraProposta() {
    if (!canEdit) {
      setError('Seu perfil não permite enviar contra-proposta.')
      showActionFlash({
        titulo: 'Sem permissão',
        mensagem: 'Seu perfil não permite enviar contra-proposta.',
        tone: 'erro',
      })
      return
    }
    if (!contraLanceId) {
      setError('Selecione uma proposta para contra-propor.')
      showActionFlash({
        titulo: 'Selecione uma proposta',
        mensagem: 'Escolha a proposta e clique em Contra novamente.',
        tone: 'erro',
      })
      return
    }
    const num = parseMoneyInput(contraValor)
    if (!Number.isFinite(num) || num <= 0) {
      setError('Informe um valor válido para a contra-proposta.')
      showActionFlash({
        titulo: 'Valor inválido',
        mensagem: 'Informe um valor válido para a contra-proposta.',
        tone: 'erro',
      })
      return
    }
    const tNome =
      transportadorById(
        lances.find((l) => l.id === contraLanceId)?.transportador_id ?? '',
      )?.nome_fantasia ?? 'transportador'
    const okConfirm = window.confirm(
      `Enviar contra-proposta de ${formatCurrency(num)} para ${tNome}?`,
    )
    if (!okConfirm) return

    setError('')
    const res = enviarContraProposta(contraLanceId, num)
    if (!res.ok) {
      setError(res.error ?? 'Falha na contra-proposta')
      showActionFlash({
        titulo: 'Contra-proposta não enviada',
        mensagem: res.error ?? 'Falha na contra-proposta',
        tone: 'erro',
      })
      return
    }
    setContraLanceId(null)
    setContraValor('')
    setInfo(
      `Contra-proposta de ${formatCurrency(num)} enviada para ${tNome}. O transportador vê no card (frete oferta) e nas notificações.`,
    )
    showActionFlash({
      titulo: 'Contra-proposta enviada',
      mensagem: `${formatCurrency(num)} para ${tNome}. O transportador responde no card.`,
    })
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
  const melhorLance = lancesAtivos[0] ?? null
  const idsComProposta = new Set(lancesAtivos.map((l) => l.transportador_id))

  const classColor =
    classificacao === 'A' ? 'bg-emerald-500' : classificacao === 'B' ? 'bg-amber-500' : 'bg-brand'
  const distOferta = asTipoOferta(carga.tipo_oferta) === 'distribuicao'
  const catRastreador = distOferta ? MODELOS_RASTREADOR_DISTRIBUICAO : MODELOS_RASTREADOR
  const catLocalizador = distOferta ? MODELOS_LOCALIZADOR_DISTRIBUICAO : MODELOS_LOCALIZADOR

  return (
    <>
      <aside
        className={`animate-slide-in relative z-20 flex h-full flex-col overflow-hidden border border-ink/10 bg-white transition-[width] duration-200 ${
          panelSize === 'largo'
            ? 'min-w-0 shrink rounded-none border-y-0 border-r-0 shadow-none'
            : 'shrink-0 rounded-xl shadow-lg'
        } ${panelSizeClass(panelSize)}`}
      >
        <div className="border-b border-ink/10 bg-ink px-4 py-3 text-white">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="font-display text-lg font-bold tracking-wide text-[#e8c547]">
                Carga {carga.numero}
              </p>
              <p className="mt-1 text-sm text-sand/90">{formatDateTime(carga.data_carregamento)}</p>
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
                  ·{' '}
                  {carga.modo_publicacao === 'negociacao_direta'
                    ? 'Negociação direta'
                    : carga.modo_publicacao === 'oferta'
                      ? 'Oferta'
                      : 'Leilão'}
                </>
              )}
              {carga.expira_em && !carga.transportador_vencedor_id && (
                <> · Janela {tempoRestante(carga.expira_em)}</>
              )}
            </p>
          )}
        </div>
        <p
          className={`px-4 py-1.5 text-center text-[12px] font-extrabold uppercase tracking-wide ${
            asTipoOferta(carga.tipo_oferta) === 'distribuicao'
              ? 'bg-emerald-600 text-white'
              : 'bg-[#e8c547] text-ink'
          }`}
        >
          {labelTipoOferta(asTipoOferta(carga.tipo_oferta))}
        </p>

        {isNova ? (
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
              {rascunhosNaoPublicados.length + rotasFavoritas.length > 0 && (
                <span className="ml-1 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-ink/10 px-1 text-[10px] font-bold normal-case text-ink">
                  {rascunhosNaoPublicados.length + rotasFavoritas.length}
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
              Parâmetros e publicação
            </button>
          </div>
        ) : (
          <div className="border-b border-ink/10 bg-sand-light/30 px-4 py-2.5">
            <p className="text-[11px] font-bold uppercase tracking-wide text-ink sm:text-xs">
              Negociação
            </p>
          </div>
        )}

        <div
          className={`flex-1 text-sm ${
            !isNova && tab === 'publicar'
              ? 'flex min-h-0 flex-col overflow-hidden p-0'
              : isNova && tab === 'dados'
                ? 'overflow-y-auto p-2.5'
                : 'space-y-3 overflow-y-auto p-4'
          }`}
        >
          {isNova && tab === 'dados' && (
            <CargaDadosForm
              carga={carga}
              canEdit={canEdit}
              onGoPublish={() => setTab('publicar')}
              onPersisted={onCargaPersistida}
            />
          )}

          {isNova && tab === 'salvas' && (
            <>
              <div className="rounded-lg border border-ink/10 bg-white p-3">
                <div className="mb-1 flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-xs font-bold uppercase tracking-wide text-ink">
                      Não publicadas ({rascunhosFiltrados.length}
                      {qRascunhos && rascunhosFiltrados.length !== rascunhosNaoPublicados.length
                        ? ` de ${rascunhosNaoPublicados.length}`
                        : ''}
                      )
                    </p>
                    <p className="mt-0.5 text-[11px] text-ink-muted">
                      Só aparecem cargas já salvas. Nova carga só grava ao clicar em Salvar.
                    </p>
                  </div>
                  <SectionSearch
                    value={buscaRascunhos}
                    onChange={setBuscaRascunhos}
                    placeholder="Pesquisar rascunho…"
                  />
                </div>
                {rascunhosFiltrados.length === 0 ? (
                  <p className="mt-2 text-[11px] text-ink-muted">
                    {qRascunhos
                      ? 'Nenhum rascunho corresponde à pesquisa.'
                      : 'Nenhum rascunho pendente.'}
                  </p>
                ) : (
                  <ul className="mt-2 max-h-52 space-y-1.5 overflow-y-auto">
                    {rascunhosFiltrados.map((c) => {
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
                            <span className="flex flex-wrap items-center gap-1.5">
                              <span className="font-semibold text-ink">Carga {c.numero}</span>
                              <span
                                className={`rounded px-1.5 py-0.5 text-[9px] font-extrabold uppercase tracking-wide ${
                                  asTipoOferta(c.tipo_oferta) === 'distribuicao'
                                    ? 'bg-emerald-600 text-white'
                                    : 'bg-slate-800 text-white'
                                }`}
                              >
                                {labelTipoOferta(asTipoOferta(c.tipo_oferta))}
                              </span>
                              {atual && (
                                <span className="rounded bg-brand/15 px-1.5 py-0.5 text-[10px] font-bold text-ink">
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
                              onClick={(e) => {
                                e.preventDefault()
                                e.stopPropagation()
                                handleExcluirRascunho(c.id, c.numero)
                              }}
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

              <div className="rounded-lg border border-ink/10 bg-white p-3">
                <div className="mb-1 flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-xs font-bold uppercase tracking-wide text-ink">
                      Rotas cadastradas ({favoritasFiltradas.length}
                      {qFavoritas && favoritasFiltradas.length !== rotasFavoritas.length
                        ? ` de ${rotasFavoritas.length}`
                        : ''}
                      )
                    </p>
                    <p className="mt-0.5 text-[11px] text-ink-muted">
                      Rotas salvas para reutilizar. Clique para aplicar na carga aberta.
                    </p>
                  </div>
                  <SectionSearch
                    value={buscaFavoritas}
                    onChange={setBuscaFavoritas}
                    placeholder="Pesquisar favorita…"
                  />
                </div>
                {favoritasFiltradas.length === 0 ? (
                  <p className="mt-2 text-[11px] text-ink-muted">
                    {qFavoritas
                      ? 'Nenhuma favorita corresponde à pesquisa.'
                      : 'Nenhuma favorita. Em Dados da carga, marque “Salvar como rota favorita” ao salvar.'}
                  </p>
                ) : (
                  <ul className="mt-2 max-h-48 space-y-1.5 overflow-y-auto">
                    {favoritasFiltradas.map((r) => {
                      const aplicada = isNova && carga.rota_id === r.id
                      return (
                        <li
                          key={r.id}
                          className={`flex items-stretch gap-1 rounded-md border ${
                            aplicada
                              ? 'border-brand bg-brand/5'
                              : 'border-ink/10 bg-sand-light/40'
                          }`}
                        >
                          <button
                            type="button"
                            className="min-w-0 flex-1 px-2.5 py-2 text-left text-xs transition hover:bg-white/60 disabled:opacity-50"
                            onClick={() => handleUsarFavorita(r)}
                            disabled={!canEdit || !isNova}
                            title="Usar esta favorita na carga aberta"
                          >
                            <span className="flex items-center gap-1.5">
                              <span className="font-semibold text-ink">{r.descricao}</span>
                              {aplicada && (
                                <span className="rounded bg-brand/15 px-1.5 py-0.5 text-[10px] font-bold text-brand">
                                  Em uso
                                </span>
                              )}
                            </span>
                            <span className="mt-0.5 block truncate text-[10px] text-ink-muted">
                              {r.origem} → {r.destino}
                            </span>
                            <span className="block text-[10px] text-ink-muted">
                              Frete {formatCurrency(r.frete_tabela)} · Rota {r.classificacao}
                            </span>
                          </button>
                          {canEdit && (
                            <button
                              type="button"
                              className="shrink-0 self-center rounded p-2 text-ink-muted hover:bg-red-50 hover:text-red-700"
                              title="Remover favorita"
                              onClick={() => handleRemoverFavorita(r)}
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
            </>
          )}

          {tab === 'publicar' && isNova && (
            <>
          <p className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-950">
            Esta carga ainda é <strong>rascunho</strong>. Só aparece para o transportador depois que
            você clicar em <strong>Publicar</strong> (com ao menos um grupo selecionado).
          </p>

          <div className="grid grid-cols-2 gap-x-4 gap-y-1 sm:grid-cols-3">
            <div className="col-span-full">
              <p
                className={`rounded-md px-2.5 py-1.5 text-center text-[12px] font-extrabold uppercase tracking-wide ${
                  asTipoOferta(carga.tipo_oferta) === 'distribuicao'
                    ? 'bg-emerald-600 text-white'
                    : 'bg-slate-800 text-white'
                }`}
              >
                {labelTipoOferta(asTipoOferta(carga.tipo_oferta))}
              </p>
            </div>
            <Detail label="Pedido" value={carga.pedido || '—'} />
            <Detail label="Tipo de Carga" value={carga.tipo_carga} />
            <Detail label="Veículo" value={carga.veiculo} />
            <Detail
              label="Carroceria"
              value={
                Array.isArray(carga.carrocerias) && carga.carrocerias.length
                  ? carga.carrocerias.join(', ')
                  : '—'
              }
            />
            <Detail label="Remetente" value={`${carga.remetente} — ${carga.remetente_cnpj}`} />
            <Detail label="Origem" value={carga.origem || '—'} />
            <Detail label="Destino" value={carga.destino || '—'} />
            {(() => {
              const pts = limparPontosPassagemRota(carga.pontos_passagem)
              const viaRota =
                pts.length > 0
                  ? pts
                  : carga.rota_id
                    ? limparPontosPassagemRota(
                        rotas.find((r) => r.id === carga.rota_id)?.pontos_passagem,
                      )
                    : []
              if (viaRota.length === 0) return null
              return (
                <div className="col-span-full rounded-md border border-sky-200 bg-sky-50/70 px-2.5 py-2">
                  <p className="text-[11px] font-bold text-sky-900">
                    Pontos de passagem ({viaRota.length})
                  </p>
                  <ol className="mt-1 list-decimal space-y-0.5 pl-4 text-[11px] text-sky-950">
                    {viaRota.map((p, idx) => (
                      <li key={p.id || idx}>
                        {(p.endereco || '').trim() ||
                          (p.lat != null && p.lng != null
                            ? `${p.lat}, ${p.lng}`
                            : `Ponto ${idx + 1}`)}
                      </li>
                    ))}
                  </ol>
                </div>
              )
            })()}
            <Detail
              label="Complemento"
              value={
                carga.complemento === 'sim'
                  ? 'Sim'
                  : carga.complemento === 'nao'
                    ? 'Não'
                    : carga.complemento === 'ambos'
                      ? 'Ambos'
                      : '—'
              }
            />
            <Detail
              label="Gerenc. de risco"
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
            {(carga.gerenciamento_risco === 'rastreador' ||
              carga.gerenciamento_risco === 'ambos') && (
              <Detail
                label="Modelo rastreador"
                value={labelModeloRisco(
                  carga.marca_rastreador,
                  carga.modelo_rastreador,
                  catRastreador,
                )}
              />
            )}
            {(carga.gerenciamento_risco === 'localizador' ||
              carga.gerenciamento_risco === 'ambos') && (
              <Detail
                label="Modelo localizador"
                value={labelModeloRisco(
                  carga.marca_localizador,
                  carga.modelo_localizador,
                  catLocalizador,
                )}
              />
            )}
            <Detail
              label="Temperatura"
              value={
                carga.temp_min != null || carga.temp_max != null
                  ? `${carga.temp_min ?? '—'} a ${carga.temp_max ?? '—'} °C`
                  : '—'
              }
            />
            <Detail label="Exige ajudante" value={carga.exige_ajudante ? 'Sim' : 'Não'} />
            <Detail label="Destinatário" value={carga.destinatario || '—'} />
            <Detail
              label="WhatsApp destinatário"
              value={carga.destinatario_whatsapp?.trim() || '—'}
            />
            <Detail
              label="E-mail destinatário"
              value={carga.destinatario_email?.trim() || '—'}
            />
            <Detail label="Peso" value={formatNumber(carga.peso)} />
            <Detail label="Volumes" value={String(carga.volumes)} />
            <Detail label="Nº de entregas" value={String(carga.num_entregas || 1)} />
            <Detail label="Valor Frete (Tabela)" value={formatCurrency(carga.frete_tabela)} />
            <Detail label="Valor Mercadorias" value={formatCurrency(carga.valor_mercadorias)} />
          </div>

          {carga.antt?.rota && (
            <div className="mt-2 space-y-1.5 rounded-lg border border-ink/15 bg-sand-light/40 p-2.5 text-xs">
              <div>
                <p className="text-[12px] font-bold uppercase tracking-wide text-ink">
                  Frete ANTT + rota (gratuito)
                </p>
                <p className="text-[11px] font-medium leading-snug text-ink">
                  Valores gravados na publicação. Rota OSRM · pisos Res. 6.084/2026 · pedágio
                  pelas{' '}
                  <a
                    href="https://dados.antt.gov.br/dataset/praca-de-pedagio"
                    target="_blank"
                    rel="noreferrer"
                    className="font-bold text-ink underline"
                  >
                    praças dos Dados Abertos ANTT
                  </a>
                  {' '}
                  · Vale-Pedágio Res. 6.024/2023 · RNTRC do transportador.
                </p>
                {carga.antt.fonte ? (
                  <p className="mt-1 text-[10px] font-semibold text-ink-muted">
                    Fonte dos dados: {carga.antt.fonte}
                  </p>
                ) : null}
              </div>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1 rounded-lg border border-ink/10 bg-white px-3 py-2 sm:grid-cols-3">
                <Detail
                  label="Tabela"
                  value={`Tabela ${carga.antt.tabela}${
                    carga.antt.categoria_label ? ` · ${carga.antt.categoria_label}` : ''
                  }`}
                />
                <Detail label="Duração" value={carga.antt.rota.duracao_label} />
                <Detail label="Distância" value={`${carga.antt.rota.distancia_km} km`} />
                <Detail label="Pedágio" value={formatCurrency(carga.antt.rota.pedagio)} />
                <Detail
                  label="Pedágio por eixo"
                  value={formatCurrency(carga.antt.rota.pedagio_por_eixo)}
                />
                <Detail
                  label="Vale-Pedágio"
                  value={formatCurrency(
                    carga.antt.rota.vale_pedagio ?? carga.antt.rota.pedagio,
                  )}
                />
                <Detail label="Combustível" value={formatCurrency(carga.antt.rota.combustivel)} />
                <Detail label="Custo Total" value={formatCurrency(carga.antt.rota.custo_total)} />
                {carga.antt.piso_selecionado != null && (
                  <Detail
                    label="Piso ANTT"
                    value={formatCurrency(carga.antt.piso_selecionado)}
                  />
                )}
                {carga.antt.rota.free_flow && (
                  <Detail label="Free Flow / OCR" value="Sim (praças na rota)" />
                )}
                {carga.antt.rota.provedor === 'antt_aberto' && (
                  <Detail label="Fonte pedágio" value="Dados Abertos ANTT" />
                )}
              </div>
            </div>
          )}

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
                  <div className="flex items-stretch overflow-hidden rounded-md border border-ink/30 bg-white focus-within:border-brand focus-within:ring-2 focus-within:ring-brand/20">
                    <input
                      type="number"
                      inputMode="decimal"
                      disabled={!canEdit}
                      value={margem}
                      onChange={(e) => {
                        const n = Number(e.target.value)
                        if (Number.isFinite(n)) setMargem(n)
                      }}
                      className="w-full min-w-0 border-0 bg-transparent px-2 py-1.5 text-sm font-bold text-black outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                    />
                    <div className="flex flex-col border-l border-ink/20">
                      <button
                        type="button"
                        disabled={!canEdit}
                        title="Aumentar 1%"
                        onClick={() => setMargem((v) => Math.min(90, Math.round(v) + 1))}
                        className="flex flex-1 items-center justify-center px-1.5 text-ink-muted transition hover:bg-sand-light hover:text-ink disabled:opacity-40"
                      >
                        <ChevronUp size={12} />
                      </button>
                      <button
                        type="button"
                        disabled={!canEdit}
                        title="Diminuir 1%"
                        onClick={() => setMargem((v) => Math.max(-90, Math.round(v) - 1))}
                        className="flex flex-1 items-center justify-center border-t border-ink/20 px-1.5 text-ink-muted transition hover:bg-sand-light hover:text-ink disabled:opacity-40"
                      >
                        <ChevronDown size={12} />
                      </button>
                    </div>
                  </div>
                </Field>
              </div>

              <p className="text-center font-display text-lg font-bold text-ink">
                Frete Oferta {formatCurrency(freteOferta)}
              </p>
              {freteOferta < carga.frete_tabela && (
                <p className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-center text-xs font-semibold text-amber-900">
                  Valor abaixo da tabela mínima ({formatCurrency(carga.frete_tabela)}).
                  A oferta está {formatCurrency(carga.frete_tabela - freteOferta)} abaixo do frete
                  tabela.
                </p>
              )}

              {modo === 'negociacao_direta' ? (
                <>
                  <Field label="Transportadoras (negociação direta)">
                    {transportadoresAtivos.length === 0 ? (
                      <p className="text-xs text-brand">
                        Nenhuma transportadora ativa cadastrada.
                      </p>
                    ) : (
                      <div ref={diretosSelectRef} className="relative">
                        <button
                          type="button"
                          className={`${inputClass} flex w-full items-center justify-between gap-2 text-left`}
                          onClick={() => setDiretosSelectAberto((v) => !v)}
                          aria-expanded={diretosSelectAberto}
                          aria-haspopup="listbox"
                        >
                          <span
                            className={
                              transportadorDiretoIds.length === 0
                                ? 'truncate text-ink-muted'
                                : 'truncate text-ink'
                            }
                          >
                            {rotuloDiretos}
                          </span>
                          <ChevronDown
                            size={16}
                            className={`shrink-0 text-ink-muted transition ${
                              diretosSelectAberto ? 'rotate-180' : ''
                            }`}
                          />
                        </button>
                        {diretosSelectAberto ? (
                          <div className="absolute left-0 right-0 top-[calc(100%+4px)] z-40 overflow-hidden rounded-lg border border-ink/15 bg-white shadow-lg">
                            <input
                              className="w-full border-0 border-b border-ink/10 px-3 py-2 text-sm outline-none"
                              value={buscaDiretos}
                              onChange={(e) => setBuscaDiretos(e.target.value)}
                              placeholder="Buscar por nome, cidade ou CNPJ…"
                              autoFocus
                            />
                            <ul
                              className="max-h-56 overflow-y-auto py-1"
                              role="listbox"
                              aria-multiselectable="true"
                            >
                              {transportadoresDiretosFiltrados.length === 0 ? (
                                <li className="px-3 py-2 text-xs text-ink-muted">
                                  Nenhuma transportadora encontrada.
                                </li>
                              ) : (
                                transportadoresDiretosFiltrados.map((t) => {
                                  const on = transportadorDiretoIds.includes(t.id)
                                  const local = [t.origem_cidade || t.cidade, t.origem_uf || t.uf]
                                    .filter(Boolean)
                                    .join('/')
                                  return (
                                    <li key={t.id} role="option" aria-selected={on}>
                                      <button
                                        type="button"
                                        className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-ink/5 ${
                                          on ? 'bg-ink/5 font-semibold' : ''
                                        }`}
                                        onClick={() => toggleDireto(t.id)}
                                      >
                                        <span
                                          className={`inline-flex h-4 w-4 shrink-0 items-center justify-center rounded border text-[10px] ${
                                            on
                                              ? 'border-ink bg-ink text-white'
                                              : 'border-ink/30 bg-white text-transparent'
                                          }`}
                                          aria-hidden
                                        >
                                          ✓
                                        </span>
                                        <span className="min-w-0 flex-1 truncate">
                                          {t.nome_fantasia || t.razao_social}
                                          {local ? (
                                            <span className="ml-1 font-normal text-ink-muted">
                                              ({local})
                                            </span>
                                          ) : null}
                                        </span>
                                      </button>
                                    </li>
                                  )
                                })
                              )}
                            </ul>
                          </div>
                        ) : null}
                      </div>
                    )}
                  </Field>
                  <div className="rounded-lg border border-ink/10 bg-white p-2 text-xs">
                    <p className="mb-1 font-semibold text-ink">
                      Recebem a proposta ({transportadorDiretoIds.length})
                    </p>
                    {transportadorDiretoIds.length === 0 ? (
                      <p className="text-ink-muted">Nenhuma — selecione as transportadoras.</p>
                    ) : (
                      <ul className="list-inside list-disc text-ink-muted">
                        {transportadorDiretoIds.map((id) => {
                          const t = transportadoresAtivos.find((x) => x.id === id)
                          return (
                            <li key={id}>
                              {t?.nome_fantasia || t?.razao_social || id}
                              {t?.classificacao ? (
                                <span className="uppercase"> ({t.classificacao})</span>
                              ) : null}
                            </li>
                          )
                        })}
                      </ul>
                    )}
                  </div>
                </>
              ) : (
                <>
                  <Field label="Quem vai negociar? (grupos)">
                    {gruposAtivos.length === 0 ? (
                      <p className="text-xs text-brand">Cadastre grupos em Menu → Grupos.</p>
                    ) : (
                      <div ref={gruposSelectRef} className="relative">
                        <button
                          type="button"
                          className={`${inputClass} flex w-full items-center justify-between gap-2 text-left`}
                          onClick={() => setGruposSelectAberto((v) => !v)}
                          aria-expanded={gruposSelectAberto}
                          aria-haspopup="listbox"
                        >
                          <span
                            className={
                              grupoIds.length === 0
                                ? 'truncate text-ink-muted'
                                : 'truncate text-ink'
                            }
                          >
                            {rotuloGrupos}
                          </span>
                          <ChevronDown
                            size={16}
                            className={`shrink-0 text-ink-muted transition ${
                              gruposSelectAberto ? 'rotate-180' : ''
                            }`}
                          />
                        </button>
                        {gruposSelectAberto ? (
                          <div className="absolute left-0 right-0 top-[calc(100%+4px)] z-40 overflow-hidden rounded-lg border border-ink/15 bg-white shadow-lg">
                            <input
                              className="w-full border-0 border-b border-ink/10 px-3 py-2 text-sm outline-none"
                              value={buscaGrupos}
                              onChange={(e) => setBuscaGrupos(e.target.value)}
                              placeholder="Digite para filtrar…"
                              autoFocus
                            />
                            <ul
                              className="max-h-56 overflow-y-auto py-1"
                              role="listbox"
                              aria-multiselectable="true"
                            >
                              {gruposFiltrados.length === 0 ? (
                                <li className="px-3 py-2 text-xs text-ink-muted">
                                  Nenhum grupo encontrado.
                                </li>
                              ) : (
                                gruposFiltrados.map((g) => {
                                  const on = grupoIds.includes(g.id)
                                  const qtd = g.transportador_ids.length
                                  return (
                                    <li key={g.id} role="option" aria-selected={on}>
                                      <button
                                        type="button"
                                        className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-ink/5 ${
                                          on ? 'bg-ink/5 font-semibold' : ''
                                        }`}
                                        onClick={() => toggleGrupo(g.id)}
                                      >
                                        <span
                                          className={`inline-flex h-4 w-4 shrink-0 items-center justify-center rounded border text-[10px] ${
                                            on
                                              ? 'border-ink bg-ink text-white'
                                              : 'border-ink/30 bg-white text-transparent'
                                          }`}
                                          aria-hidden
                                        >
                                          ✓
                                        </span>
                                        <span className="min-w-0 flex-1 truncate">
                                          {g.descricao}
                                          <span className="ml-1 font-normal text-ink-muted">
                                            ({qtd})
                                          </span>
                                        </span>
                                      </button>
                                    </li>
                                  )
                                })
                              )}
                            </ul>
                          </div>
                        ) : null}
                      </div>
                    )}
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
                      Recebem agora ({previewTransportadores.agora.length}
                      {previewTransportadores.totalSemFiltro >
                      previewTransportadores.agora.length + previewTransportadores.depois.length
                        ? ` · filtrados por exigências`
                        : ''}
                      )
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
                </>
              )}

              <div className="rounded-lg border border-ink/10 bg-white p-3 space-y-2">
                <p className="text-xs font-bold uppercase tracking-wide text-ink">
                  Exigências da oferta
                </p>
                <p className="text-[11px] text-ink-muted">
                  Só vê a carga quem tiver veículo com o rastreador/localizador
                  (modelo) e as demais exigências.
                </p>
                <Field label="Gerenciamento de risco">
                  <select
                    className={inputClass}
                    disabled={!canEdit}
                    value={riscoPub}
                    onChange={(e) =>
                      setRiscoPub(e.target.value as NonNullable<Carga['gerenciamento_risco']>)
                    }
                  >
                    <option value="nao">Não exige</option>
                    <option value="rastreador">Rastreador</option>
                    <option value="localizador">Localizador</option>
                    <option value="ambos">Ambos</option>
                  </select>
                </Field>
                <CargaExigenciasFields
                  risco={riscoPub}
                  catalogoRastreador={catRastreador}
                  catalogoLocalizador={catLocalizador}
                  marcaRastreador={marcaRastreadorPub}
                  marcaLocalizador={marcaLocalizadorPub}
                  modeloRastreador={modeloRastreadorPub}
                  modeloLocalizador={modeloLocalizadorPub}
                  tempMin={tempMinPub}
                  tempMax={tempMaxPub}
                  exigeAjudante={exigeAjudantePub}
                  disabled={!canEdit}
                  onChange={(patch) => {
                    if ('marca_rastreador' in patch) {
                      setMarcaRastreadorPub(patch.marca_rastreador || MARCA_SEM_ESPECIFICA)
                    }
                    if ('marca_localizador' in patch) {
                      setMarcaLocalizadorPub(patch.marca_localizador || MARCA_SEM_ESPECIFICA)
                    }
                    if ('modelo_rastreador' in patch) {
                      setModeloRastreadorPub(patch.modelo_rastreador || MODELO_SEM_ESPECIFICO)
                    }
                    if ('modelo_localizador' in patch) {
                      setModeloLocalizadorPub(patch.modelo_localizador || MODELO_SEM_ESPECIFICO)
                    }
                    if ('temp_min' in patch) setTempMinPub(patch.temp_min)
                    if ('temp_max' in patch) setTempMaxPub(patch.temp_max)
                    if ('exige_ajudante' in patch) {
                      setExigeAjudantePub(Boolean(patch.exige_ajudante))
                    }
                  }}
                />
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

              <Field label="Observações">
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
                  <p className="mb-1 text-xs text-ink-muted">
                    Prioridade{usarRegra ? ' (regra)' : ''}
                  </p>
                  {usarRegra ? (
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
                  ) : (
                    <select
                      className={inputClass}
                      disabled={!canEdit}
                      value={prioridade}
                      onChange={(e) =>
                        setPrioridadeManual(e.target.value as Prioridade)
                      }
                    >
                      <option value="alta">Alta</option>
                      <option value="media">Média</option>
                      <option value="baixa">Baixa</option>
                    </select>
                  )}
                </div>
                <div>
                  <p className="mb-1 text-xs text-ink-muted">
                    Modo{usarRegra ? '' : ' (manual)'}
                  </p>
                  <div className="inline-flex rounded-lg border border-ink/15 bg-white p-0.5">
                    <button
                      type="button"
                      disabled={!canEdit}
                      onClick={() => setModoOverride('leilao')}
                      className={`rounded-md px-3 py-1.5 text-xs font-bold transition ${
                        modo === 'leilao'
                          ? 'bg-ink text-white'
                          : 'text-ink-muted hover:bg-sand-light hover:text-ink'
                      }`}
                    >
                      Leilão
                    </button>
                    <button
                      type="button"
                      disabled={!canEdit}
                      onClick={() => setModoOverride('oferta')}
                      title="Proposta única; o embarcador aceita ou o transportador pode Aceitar oferta"
                      className={`rounded-md px-3 py-1.5 text-xs font-bold transition ${
                        modo === 'oferta'
                          ? 'bg-brand text-white'
                          : 'text-ink-muted hover:bg-sand-light hover:text-ink'
                      }`}
                    >
                      Oferta
                    </button>
                    <button
                      type="button"
                      disabled={!canEdit}
                      onClick={() => setModoOverride('negociacao_direta')}
                      title="Envia a proposta só para transportadoras escolhidas"
                      className={`rounded-md px-3 py-1.5 text-xs font-bold transition ${
                        modo === 'negociacao_direta'
                          ? 'bg-blue-700 text-white'
                          : 'text-ink-muted hover:bg-sand-light hover:text-ink'
                      }`}
                    >
                      Negociação Direta
                    </button>
                  </div>
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
            <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
              <section className="min-h-0 flex-1 overflow-y-auto border-b border-ink/10 p-4 lg:border-r lg:border-b-0">
                <p className="mb-3 text-[11px] font-bold uppercase tracking-wide text-ink-muted">
                  Dados da carga
                </p>
                <CargaDadosForm carga={carga} canEdit={canEdit} />
              </section>
              <section className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
                <p className="text-[11px] font-bold uppercase tracking-wide text-ink-muted">
                  Dados da negociação
                </p>
              {error && (
                <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-800">
                  {error}
                </p>
              )}
              {info && (
                <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-900">
                  {info}
                </p>
              )}
              {carga.status === 'canceladas' && (
                <p className="rounded-lg border border-slate-300 bg-slate-100 px-3 py-2 text-xs font-semibold text-slate-800">
                  Publicação cancelada
                  {carga.motivo_cancelamento ? ` — ${carga.motivo_cancelamento}` : ''}.
                  Use “Preparar republicação” para abrir de novo.
                </p>
              )}
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
                    carga.modo_publicacao === 'negociacao_direta'
                      ? `Negociação direta — ${(carga.transportador_direto_ids ?? []).length} transportadora(s)`
                      : carga.modo_publicacao === 'oferta'
                        ? 'Oferta — proposta única (embarcador aceita)'
                        : 'Leilão — melhor ao fim / aceite manual'
                  }
                />
                {carga.modo_publicacao === 'negociacao_direta' ? (
                  <div className="mt-2 rounded-md border border-blue-200 bg-blue-50/80 px-2 py-1.5">
                    <p className="mb-1 text-[11px] font-bold uppercase tracking-wide text-blue-900">
                      Enviado para
                    </p>
                    {(carga.transportador_direto_ids ?? []).length === 0 ? (
                      <p className="text-[11px] text-ink-muted">Nenhuma transportadora.</p>
                    ) : (
                      <ul className="list-inside list-disc text-[11px] text-ink">
                        {(carga.transportador_direto_ids ?? []).map((id) => (
                          <li key={id}>
                            {transportadorById(id)?.nome_fantasia ||
                              transportadorById(id)?.razao_social ||
                              id}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                ) : null}
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
                      const isMelhor = Boolean(melhorLance && l.id === melhorLance.id)
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

                          {(() => {
                            const histLance = histPropostas.filter((h) => h.lance_id === l.id)
                            // histPropostas vem do mais recente para o mais antigo
                            const ultimaContra =
                              histLance.find((h) => h.tipo === 'contra_embarcador') ??
                              histLance.find(
                                (h) =>
                                  h.valor_anterior != null &&
                                  h.tipo !== 'resposta_contra' &&
                                  Math.abs(h.valor_novo - (carga.frete_oferta ?? -1)) < 0.02,
                              )
                            const ultimaResposta = histLance.find(
                              (h) => h.tipo === 'resposta_contra',
                            )
                            const respondeuAposContra =
                              ultimaResposta &&
                              (!ultimaContra ||
                                new Date(ultimaResposta.created_at).getTime() >=
                                  new Date(ultimaContra.created_at).getTime())

                            if (respondeuAposContra && ultimaResposta) {
                              const de =
                                ultimaResposta.valor_anterior != null
                                  ? `${formatCurrency(ultimaResposta.valor_anterior)} → `
                                  : ''
                              return (
                                <p className="mb-2 rounded-lg border border-sky-200 bg-sky-50 px-2 py-1.5 text-[11px] font-semibold text-sky-950">
                                  Resposta da contra-proposta: {de}
                                  {formatCurrency(ultimaResposta.valor_novo)}
                                </p>
                              )
                            }

                            if (!ultimaContra) return null
                            return (
                              <p className="mb-2 rounded-lg border border-amber-200 bg-amber-50 px-2 py-1.5 text-[11px] font-semibold text-amber-950">
                                Contra-proposta enviada: {formatCurrency(ultimaContra.valor_novo)}
                                <span className="mt-0.5 block font-medium text-amber-800/90">
                                  Aguardando resposta do transportador
                                </span>
                              </p>
                            )
                          })()}

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
                        {h.tipo === 'resposta_contra' ? (
                          <span className="font-semibold text-amber-900">
                            Resposta da contra-proposta ·{' '}
                          </span>
                        ) : h.tipo === 'contra_embarcador' ? (
                          <span className="font-semibold text-amber-900">Contra-proposta · </span>
                        ) : null}
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
              </section>
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
            Informe o valor sugerido. O transportador recebe no card (frete oferta) e nas
            notificações — não pelo chat.
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
              inputMode="numeric"
              autoFocus
              onChange={(e) => setContraValor(moneyFromDigits(e.target.value).display)}
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
            {usarRegra
              ? `Prazo ≤ ${config.limite_urgencia_minutos} min define prioridade alta. Informe o motivo.`
              : 'Prioridade alta exige justificativa. Informe o motivo.'}
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

function SectionSearch({
  value,
  onChange,
  placeholder,
}: {
  value: string
  onChange: (v: string) => void
  placeholder: string
}) {
  return (
    <div className="relative w-full max-w-[220px] shrink-0 sm:w-52">
      <Search
        size={14}
        className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-ink-muted"
      />
      <input
        className={`${inputClass} py-1.5 pl-8 pr-8 text-xs`}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoComplete="off"
      />
      {value && (
        <button
          type="button"
          className="absolute top-1/2 right-1.5 -translate-y-1/2 rounded p-0.5 text-ink-muted hover:bg-sand-light hover:text-ink"
          title="Limpar"
          onClick={() => onChange('')}
        >
          <X size={12} />
        </button>
      )}
    </div>
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
