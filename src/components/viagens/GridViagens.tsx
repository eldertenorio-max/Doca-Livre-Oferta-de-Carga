import { useMemo, useState } from 'react'
import {
  formatCurrency,
  formatDate,
  formatNumber,
} from '../../lib/businessRules'
import { COLUNAS_VIAGEM, colunaViagem, type ColunaViagem } from '../../lib/viagensColumns'
import { useData } from '../../context/DataContext'
import type { Carga } from '../../types'
import '../../styles/grid-cargas.css'

type Mode = 'minerva' | 'transportador'

type Props = {
  mode: Mode
  cargas: Carga[]
  transportadorId?: string | null
  onIniciar?: (c: Carga) => void
  onFinalizar?: (c: Carga) => void
  onCancelar?: (c: Carga) => void
  onAvaliar?: (c: Carga) => void
}

function fotoDaCarga(
  c: Carga,
  transportadores: ReturnType<typeof useData>['transportadores'],
  veiculos: ReturnType<typeof useData>['veiculos'],
  motoristas: ReturnType<typeof useData>['motoristas'],
  transportadorId?: string | null,
): { url: string | null; label: string } {
  const tid = c.transportador_vencedor_id || transportadorId || null
  const t = tid ? transportadores.find((x) => x.id === tid) : null
  const logo = t?.logo_url?.trim() || null
  if (logo) return { url: logo, label: t?.nome_fantasia || 'Logo' }

  if (c.motorista_id) {
    const m = motoristas.find((x) => x.id === c.motorista_id)
    if (m?.foto_url?.trim()) return { url: m.foto_url.trim(), label: m.nome }
  }
  if (c.veiculo_id) {
    const v = veiculos.find((x) => x.id === c.veiculo_id)
    const foto = v?.foto_url?.trim() || v?.fotos?.dianteira?.trim() || null
    if (foto) return { url: foto, label: v?.placa || 'Veículo' }
  }
  return { url: null, label: t?.nome_fantasia || c.motorista || c.placa || c.numero }
}

function iniciais(label: string) {
  const parts = label.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase()
}

export function GridViagens({
  mode,
  cargas,
  transportadorId,
  onIniciar,
  onFinalizar,
  onCancelar,
  onAvaliar,
}: Props) {
  const { transportadores, veiculos, motoristas } = useData()
  const [filtro, setFiltro] = useState<string>('todas')

  const metrics = useMemo(
    () => [
      { key: 'todas', label: 'Total', color: '#3b82f6' },
      ...COLUNAS_VIAGEM.map((c) => ({
        key: c.key,
        label: c.title,
        color: c.color,
      })),
    ],
    [],
  )

  const rows = useMemo(() => {
    return cargas
      .map((c) => {
        const col = colunaViagem(c)
        if (!col) return null
        return { carga: c, coluna: col as ColunaViagem }
      })
      .filter(Boolean) as { carga: Carga; coluna: ColunaViagem }[]
  }, [cargas])

  const counts = useMemo(() => {
    const map: Record<string, number> = { todas: rows.length }
    for (const m of COLUNAS_VIAGEM) {
      map[m.key] = rows.filter((r) => r.coluna === m.key).length
    }
    return map
  }, [rows])

  const filtradas = useMemo(() => {
    if (filtro === 'todas') return rows
    return rows.filter((r) => r.coluna === filtro)
  }, [rows, filtro])

  function frete(c: Carga) {
    if (c.frete_fechado != null) return formatCurrency(c.frete_fechado)
    if (c.frete_oferta != null) return formatCurrency(c.frete_oferta)
    if (c.frete_tabela > 0) return formatCurrency(c.frete_tabela)
    return '—'
  }

  function nomeTransportador(id: string | null | undefined) {
    if (!id) return '—'
    return (
      transportadores.find((t) => t.id === id)?.nome_fantasia ||
      transportadores.find((t) => t.id === id)?.razao_social ||
      id
    )
  }

  function corColuna(key: string) {
    return COLUNAS_VIAGEM.find((c) => c.key === key)?.color || '#64748b'
  }

  function tituloColuna(key: string) {
    return COLUNAS_VIAGEM.find((c) => c.key === key)?.title || key
  }

  return (
    <div className="grid-cargas">
      <div className="grid-cargas__head">
        <h2 className="grid-cargas__title">Grid de Viagens</h2>
        <span className="text-xs text-ink-muted">
          {filtradas.length} registro{filtradas.length === 1 ? '' : 's'}
          {filtro !== 'todas' ? ` · filtro: ${tituloColuna(filtro)}` : ''}
        </span>
      </div>

      <div className="grid-cargas__metrics" role="toolbar" aria-label="Filtros por status da viagem">
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
              <th>Origem</th>
              <th>Destino</th>
              {mode === 'minerva' && <th>Transportador</th>}
              <th>Motorista</th>
              <th>Placa</th>
              <th>Peso</th>
              <th>Frete</th>
              <th>Status</th>
              <th>Ações</th>
            </tr>
          </thead>
          <tbody>
            {filtradas.length === 0 ? (
              <tr>
                <td colSpan={mode === 'minerva' ? 12 : 11}>
                  <div className="grid-cargas__empty">Nenhuma viagem neste filtro.</div>
                </td>
              </tr>
            ) : (
              filtradas.map(({ carga: c, coluna }) => {
                const foto = fotoDaCarga(
                  c,
                  transportadores,
                  veiculos,
                  motoristas,
                  transportadorId,
                )
                const cor = corColuna(coluna)

                return (
                  <tr key={c.id}>
                    <td>
                      <span className="grid-cargas__avatar" title={foto.label}>
                        {foto.url ? (
                          <img src={foto.url} alt="" />
                        ) : (
                          <span aria-hidden>{iniciais(foto.label)}</span>
                        )}
                      </span>
                    </td>
                    <td>{c.data_carregamento ? formatDate(c.data_carregamento) : '—'}</td>
                    <td>
                      <strong className="tabular-nums">{c.numero}</strong>
                    </td>
                    <td title={c.origem}>{c.origem || '—'}</td>
                    <td title={c.destino}>{c.destino || '—'}</td>
                    {mode === 'minerva' && (
                      <td>{nomeTransportador(c.transportador_vencedor_id)}</td>
                    )}
                    <td>{c.motorista || '—'}</td>
                    <td>
                      {c.placa ? (
                        <span className="grid-cargas__pill grid-cargas__pill--placa">
                          {c.placa}
                        </span>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td>{c.peso > 0 ? `${formatNumber(c.peso, 0)} kg` : '—'}</td>
                    <td>
                      <strong>{frete(c)}</strong>
                    </td>
                    <td>
                      <span
                        className="grid-cargas__pill grid-cargas__pill--status"
                        style={{ ['--status-color' as string]: cor }}
                      >
                        {tituloColuna(coluna)}
                      </span>
                      {c.avaliado_em ? (
                        <span className="ml-1 text-[10px] text-amber-600">
                          ★ {c.avaliacao_motorista ?? '—'}/{c.avaliacao_veiculo ?? '—'}
                        </span>
                      ) : null}
                    </td>
                    <td>
                      <div className="grid-cargas__actions">
                        {coluna === 'aguardando_inicio' && mode === 'transportador' && onIniciar ? (
                          <button
                            type="button"
                            className="grid-cargas__btn"
                            onClick={() => onIniciar(c)}
                          >
                            Iniciar
                          </button>
                        ) : null}
                        {coluna === 'rota_iniciada' && mode === 'transportador' && onFinalizar ? (
                          <button
                            type="button"
                            className="grid-cargas__btn"
                            onClick={() => onFinalizar(c)}
                          >
                            Finalizar
                          </button>
                        ) : null}
                        {(coluna === 'aguardando_inicio' || coluna === 'rota_iniciada') &&
                        onCancelar ? (
                          <button
                            type="button"
                            className="grid-cargas__btn grid-cargas__btn--ghost"
                            onClick={() => onCancelar(c)}
                          >
                            Cancelar
                          </button>
                        ) : null}
                        {coluna === 'rota_finalizada' && mode === 'minerva' && onAvaliar ? (
                          <button
                            type="button"
                            className="grid-cargas__btn"
                            onClick={() => onAvaliar(c)}
                          >
                            {c.avaliado_em ? 'Ver avaliação' : 'Avaliar ★'}
                          </button>
                        ) : null}
                        {!onIniciar &&
                        !onFinalizar &&
                        !(coluna === 'rota_finalizada' && onAvaliar) &&
                        !(
                          (coluna === 'aguardando_inicio' || coluna === 'rota_iniciada') &&
                          onCancelar
                        ) ? (
                          <span className="grid-cargas__muted">—</span>
                        ) : null}
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
