import { useMemo, useState } from 'react'
import {
  formatCurrency,
  formatDate,
  formatNumber,
  tempoRestante,
} from '../../lib/businessRules'
import {
  colunaMinerva,
  colunaTransportador,
  meuLanceAtivoNaRodada,
  temLanceAtivoNaRodada,
  type ColunaMinerva,
  type ColunaTransportador,
} from '../../lib/kanbanColumns'
import { statusViagemEfetivo } from '../../lib/viagensColumns'
import { useData } from '../../context/DataContext'
import type { Carga, Lance } from '../../types'
import '../../styles/grid-cargas.css'

type Mode = 'minerva' | 'transportador'

type MetricDef = {
  key: string
  label: string
  color: string
}

const METRICS_MINERVA: MetricDef[] = [
  { key: 'todas', label: 'Total', color: '#3b82f6' },
  { key: 'nova_carga', label: 'Nova Carga', color: '#385463' },
  { key: 'negociando', label: 'Negociando', color: '#3b82f6' },
  { key: 'confirmadas', label: 'Confirmadas', color: '#ea580c' },
  { key: 'suspensas', label: 'Suspensas', color: '#8b5cf6' },
  { key: 'recusadas', label: 'Recusadas', color: '#e84752' },
  { key: 'canceladas', label: 'Canceladas', color: '#64748b' },
  { key: 'alocadas', label: 'Alocadas', color: '#2f9e6a' },
]

const METRICS_TRANSPORTADOR: MetricDef[] = [
  { key: 'todas', label: 'Total', color: '#3b82f6' },
  { key: 'nova_carga', label: 'Nova Carga', color: '#0d9488' },
  { key: 'propostas', label: 'Propostas', color: '#3b82f6' },
  { key: 'confirmadas', label: 'Confirmadas', color: '#f59e0b' },
  { key: 'alocadas', label: 'Alocadas', color: '#2f9e6a' },
]

const LABEL_COLUNA: Record<string, string> = {
  nova_carga: 'Nova Carga',
  negociando: 'Negociando',
  propostas: 'Propostas',
  confirmadas: 'Confirmadas',
  suspensas: 'Suspensas',
  recusadas: 'Recusadas',
  canceladas: 'Canceladas',
  alocadas: 'Alocadas',
}

const COR_COLUNA: Record<string, string> = {
  nova_carga: '#385463',
  negociando: '#3b82f6',
  propostas: '#3b82f6',
  confirmadas: '#ea580c',
  suspensas: '#8b5cf6',
  recusadas: '#e84752',
  canceladas: '#64748b',
  alocadas: '#2f9e6a',
}

type Props = {
  mode: Mode
  cargas: Carga[]
  lances: Lance[]
  transportadorId?: string | null
  selectedId?: string | null
  onSelect: (carga: Carga) => void
  onAction?: (carga: Carga, coluna: string) => void
}

function colunaDaCarga(
  c: Carga,
  mode: Mode,
  lances: Lance[],
  transportadorId?: string | null,
): ColunaMinerva | ColunaTransportador | null {
  if (mode === 'minerva') {
    return colunaMinerva(c, temLanceAtivoNaRodada(c, lances))
  }
  if (!transportadorId) return null
  return colunaTransportador(
    c,
    transportadorId,
    meuLanceAtivoNaRodada(c, lances, transportadorId),
  )
}

export function GridCargas({
  mode,
  cargas,
  lances,
  transportadorId,
  selectedId,
  onSelect,
  onAction,
}: Props) {
  const { transportadores, veiculos, motoristas, tick } = useData()
  void tick
  const [filtro, setFiltro] = useState('todas')
  const metrics = mode === 'minerva' ? METRICS_MINERVA : METRICS_TRANSPORTADOR

  const rows = useMemo(() => {
    return cargas
      .map((c) => {
        const col = colunaDaCarga(c, mode, lances, transportadorId)
        if (!col) return null
        return { carga: c, coluna: col }
      })
      .filter(Boolean) as { carga: Carga; coluna: string }[]
  }, [cargas, mode, lances, transportadorId])

  const counts = useMemo(() => {
    const map: Record<string, number> = { todas: rows.length }
    for (const m of metrics) {
      if (m.key === 'todas') continue
      map[m.key] = rows.filter((r) => r.coluna === m.key).length
    }
    return map
  }, [rows, metrics])

  const filtradas = useMemo(() => {
    if (filtro === 'todas') return rows
    return rows.filter((r) => r.coluna === filtro)
  }, [rows, filtro])

  function transportadorDaCarga(c: Carga) {
    const tid = c.transportador_vencedor_id || transportadorId || null
    if (!tid) return null
    return transportadores.find((t) => t.id === tid) ?? null
  }

  function fotoDaCarga(c: Carga): { url: string | null; label: string } {
    const t = transportadorDaCarga(c)
    const logo = t?.logo_url?.trim() || null
    if (logo) {
      return { url: logo, label: t?.nome_fantasia || t?.razao_social || 'Logo' }
    }
    if (c.motorista_id) {
      const m = motoristas.find((x) => x.id === c.motorista_id)
      const foto = m?.foto_url?.trim() || null
      if (foto) return { url: foto, label: m?.nome || 'Motorista' }
    }
    if (c.veiculo_id) {
      const v = veiculos.find((x) => x.id === c.veiculo_id)
      const foto =
        v?.foto_url?.trim() ||
        v?.fotos?.dianteira?.trim() ||
        null
      if (foto) return { url: foto, label: v?.placa || 'Veículo' }
    }
    const nome = t?.nome_fantasia || c.motorista || c.placa || c.numero
    return { url: null, label: nome }
  }

  function iniciaisFoto(label: string) {
    const parts = label.trim().split(/\s+/).filter(Boolean)
    if (parts.length === 0) return '?'
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
    return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase()
  }

  function nomeTransportador(id: string | null | undefined) {
    if (!id) return '—'
    return (
      transportadores.find((t) => t.id === id)?.nome_fantasia ||
      transportadores.find((t) => t.id === id)?.razao_social ||
      id
    )
  }

  function freteDaCarga(c: Carga) {
    if (c.frete_fechado != null) return formatCurrency(c.frete_fechado)
    if (c.frete_oferta != null) return formatCurrency(c.frete_oferta)
    if (c.frete_tabela > 0) return formatCurrency(c.frete_tabela)
    return '—'
  }

  function labelAcao(coluna: string) {
    if (mode === 'transportador') {
      if (coluna === 'nova_carga' || coluna === 'propostas') return 'Fazer lance'
      if (coluna === 'confirmadas') return 'Alocar'
      if (coluna === 'alocadas') return 'Ver'
      return 'Abrir'
    }
    if (coluna === 'alocadas') return 'Ver viagem'
    return 'Abrir'
  }

  return (
    <div className="grid-cargas">
      <div className="grid-cargas__head">
        <h2 className="grid-cargas__title">Grid de cargas</h2>
        <span className="text-xs text-ink-muted">
          {filtradas.length} registro{filtradas.length === 1 ? '' : 's'}
          {filtro !== 'todas' ? ` · filtro: ${LABEL_COLUNA[filtro] || filtro}` : ''}
        </span>
      </div>

      <div className="grid-cargas__metrics" role="toolbar" aria-label="Filtros por status">
        {metrics.map((m) => (
          <button
            key={m.key}
            type="button"
            className={`grid-cargas__metric${filtro === m.key ? ' is-active' : ''}`}
            style={{ ['--metric-color' as string]: m.color }}
            onClick={() => setFiltro(m.key)}
          >
            <span className="grid-cargas__metric-label">{m.label}</span>
            <span className="grid-cargas__metric-value">{counts[m.key] ?? 0}</span>
          </button>
        ))}
      </div>

      <div className="grid-cargas__table-wrap">
        <table className="grid-cargas__table">
          <thead>
            <tr>
              <th>Foto</th>
              <th>Data</th>
              <th>Carga</th>
              <th>Pedido</th>
              <th>Origem</th>
              <th>Destino</th>
              {mode === 'minerva' && <th>Transportador</th>}
              <th>Motorista</th>
              <th>Placa</th>
              <th>Veículo</th>
              <th>Peso</th>
              <th>Frete</th>
              <th>Janela</th>
              <th>Status</th>
              <th>Ações</th>
            </tr>
          </thead>
          <tbody>
            {filtradas.length === 0 ? (
              <tr>
                <td colSpan={mode === 'minerva' ? 15 : 14}>
                  <div className="grid-cargas__empty">Nenhuma carga neste filtro.</div>
                </td>
              </tr>
            ) : (
              filtradas.map(({ carga: c, coluna }) => {
                const janela = tempoRestante(c.expira_em ?? c.alocacao_expira_em)
                const urgente =
                  Boolean(c.expira_em) &&
                  new Date(c.expira_em!).getTime() - Date.now() < 5 * 60_000
                const cor = COR_COLUNA[coluna] || '#64748b'
                const viagem =
                  c.status === 'alocadas' ? statusViagemEfetivo(c) : null
                const foto = fotoDaCarga(c)

                return (
                  <tr
                    key={c.id}
                    className={selectedId === c.id ? 'is-selected' : undefined}
                    onClick={() => onSelect(c)}
                  >
                    <td>
                      <span className="grid-cargas__avatar" title={foto.label}>
                        {foto.url ? (
                          <img src={foto.url} alt="" />
                        ) : (
                          <span aria-hidden>{iniciaisFoto(foto.label)}</span>
                        )}
                      </span>
                    </td>
                    <td>{c.data_carregamento ? formatDate(c.data_carregamento) : '—'}</td>
                    <td>
                      <strong className="tabular-nums">{c.numero}</strong>
                    </td>
                    <td>{c.pedido || '—'}</td>
                    <td title={c.origem}>{c.origem || '—'}</td>
                    <td title={c.destino}>{c.destino || '—'}</td>
                    {mode === 'minerva' && (
                      <td>{nomeTransportador(c.transportador_vencedor_id)}</td>
                    )}
                    <td>{c.motorista || <span className="grid-cargas__muted">—</span>}</td>
                    <td>
                      {c.placa ? (
                        <span className="grid-cargas__pill grid-cargas__pill--placa">
                          {c.placa}
                        </span>
                      ) : (
                        <span className="grid-cargas__muted">—</span>
                      )}
                    </td>
                    <td>{c.veiculo || '—'}</td>
                    <td>
                      {c.peso > 0 ? `${formatNumber(c.peso, 0)} kg` : '—'}
                    </td>
                    <td>
                      <strong>{freteDaCarga(c)}</strong>
                    </td>
                    <td>
                      {janela && janela !== '—' ? (
                        <span
                          className={`grid-cargas__pill grid-cargas__pill--timer${
                            urgente ? ' is-urgent' : ''
                          }`}
                        >
                          {janela}
                        </span>
                      ) : (
                        <span className="grid-cargas__muted">—</span>
                      )}
                    </td>
                    <td>
                      <span
                        className="grid-cargas__pill grid-cargas__pill--status"
                        style={{ ['--status-color' as string]: cor }}
                      >
                        {LABEL_COLUNA[coluna] || coluna}
                        {viagem && viagem !== 'aguardando_inicio'
                          ? ` · ${viagem.replace(/_/g, ' ')}`
                          : ''}
                      </span>
                    </td>
                    <td>
                      <div
                        className="grid-cargas__actions"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <button
                          type="button"
                          className="grid-cargas__btn"
                          onClick={() => (onAction ? onAction(c, coluna) : onSelect(c))}
                        >
                          {labelAcao(coluna)}
                        </button>
                        <button
                          type="button"
                          className="grid-cargas__btn grid-cargas__btn--ghost"
                          onClick={() => onSelect(c)}
                        >
                          Detalhes
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export function VistaToggle({
  value,
  onChange,
}: {
  value: 'quadro' | 'grid'
  onChange: (v: 'quadro' | 'grid') => void
}) {
  return (
    <div className="vista-toggle" role="group" aria-label="Modo de visualização">
      <button
        type="button"
        className={value === 'quadro' ? 'is-active' : undefined}
        onClick={() => onChange('quadro')}
      >
        Quadro
      </button>
      <button
        type="button"
        className={value === 'grid' ? 'is-active' : undefined}
        onClick={() => onChange('grid')}
      >
        Grid
      </button>
    </div>
  )
}
