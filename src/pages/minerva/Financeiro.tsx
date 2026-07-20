import { useMemo, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { useData } from '../../context/DataContext'
import {
  formatCurrency,
  formatDateTime,
  formatNumber,
} from '../../lib/businessRules'
import { downloadCsv } from '../../lib/exportCsv'
import {
  getStatusPagamento,
  loadPagamentos,
  setStatusPagamento,
  type StatusPagamentoFrete,
} from '../../lib/financeiroPagamentos'
import { isLocalSuperUser } from '../../lib/superUsers'
import type { Carga } from '../../types'
import '../../styles/cadastro.css'

function startOfDay(iso: string) {
  const d = new Date(iso)
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

function endOfDay(iso: string) {
  const d = new Date(iso)
  d.setHours(23, 59, 59, 999)
  return d.getTime()
}

function toInputDate(d: Date) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function isFreteFechado(c: Carga) {
  return (
    Boolean(c.transportador_vencedor_id) &&
    c.frete_fechado != null &&
    !['canceladas', 'recusadas'].includes(c.status)
  )
}

function refDataFrete(c: Carga) {
  return c.updated_at ?? c.alocacao_expira_em ?? c.publicado_em ?? c.created_at
}

type PeriodoRapido = 'hoje' | '7d' | '30d' | 'tudo'
type FiltroPagamento = 'todos' | StatusPagamentoFrete

export function FinanceiroPage() {
  const { user, cargas, transportadores, veiculos, motoristas } = useData()
  const [pagamentos, setPagamentos] = useState(loadPagamentos)
  const [de, setDe] = useState('')
  const [ate, setAte] = useState('')
  const [periodo, setPeriodo] = useState<PeriodoRapido>('tudo')
  const [tid, setTid] = useState('todos')
  const [filtroPag, setFiltroPag] = useState<FiltroPagamento>('todos')
  const [q, setQ] = useState('')
  const [selectedTid, setSelectedTid] = useState<string | null>(null)

  const isSuper =
    Boolean(user?.is_superuser) ||
    user?.role === 'super' ||
    isLocalSuperUser(user?.usuario ?? '') ||
    isLocalSuperUser(user?.email ?? '')

  function aplicarPeriodo(p: PeriodoRapido) {
    setPeriodo(p)
    if (p === 'tudo') {
      setDe('')
      setAte('')
      return
    }
    const now = new Date()
    const ateStr = toInputDate(now)
    if (p === 'hoje') {
      setDe(ateStr)
      setAte(ateStr)
      return
    }
    const from = new Date(now)
    from.setDate(from.getDate() - (p === '7d' ? 6 : 29))
    setDe(toInputDate(from))
    setAte(ateStr)
  }

  /** Escopo dos cards/resumo: período + transportadora + busca (sem filtro de pagamento). */
  const fretesEscopo = useMemo(() => {
    let list = cargas.filter(isFreteFechado)
    if (de || ate) {
      const from = de ? startOfDay(de) : null
      const to = ate ? endOfDay(ate) : null
      list = list.filter((c) => {
        const t = new Date(refDataFrete(c)).getTime()
        if (from != null && t < from) return false
        if (to != null && t > to) return false
        return true
      })
    }
    if (tid !== 'todos') list = list.filter((c) => c.transportador_vencedor_id === tid)
    const query = q.trim().toLowerCase()
    if (query) {
      list = list.filter((c) => {
        const t = transportadores.find((x) => x.id === c.transportador_vencedor_id)
        const v = c.veiculo_id ? veiculos.find((x) => x.id === c.veiculo_id) : null
        const m = c.motorista_id ? motoristas.find((x) => x.id === c.motorista_id) : null
        return (
          c.numero.toLowerCase().includes(query) ||
          (c.pedido ?? '').toLowerCase().includes(query) ||
          c.origem.toLowerCase().includes(query) ||
          c.destino.toLowerCase().includes(query) ||
          (c.placa ?? '').toLowerCase().includes(query) ||
          (c.motorista ?? '').toLowerCase().includes(query) ||
          (t?.nome_fantasia ?? '').toLowerCase().includes(query) ||
          (t?.cnpj ?? '').includes(query) ||
          (v?.placa ?? '').toLowerCase().includes(query) ||
          (m?.nome ?? '').toLowerCase().includes(query)
        )
      })
    }
    return list.sort(
      (a, b) => new Date(refDataFrete(b)).getTime() - new Date(refDataFrete(a)).getTime(),
    )
  }, [cargas, de, ate, tid, q, transportadores, veiculos, motoristas])

  /** Detalhe da tabela: aplica filtro A pagar / Pago. */
  const fretesBase = useMemo(() => {
    if (filtroPag === 'todos') return fretesEscopo
    return fretesEscopo.filter((c) => getStatusPagamento(pagamentos, c.id) === filtroPag)
  }, [fretesEscopo, filtroPag, pagamentos])

  const porTransportadora = useMemo(() => {
    const map = new Map<
      string,
      {
        tid: string
        nome: string
        cnpj: string
        cidade: string
        uf: string
        telefone: string
        email: string
        viagens: number
        alocadas: number
        valorTotal: number
        aPagar: number
        pago: number
        placas: Set<string>
        motoristas: Set<string>
      }
    >()

    for (const c of fretesEscopo) {
      const id = c.transportador_vencedor_id!
      const t = transportadores.find((x) => x.id === id)
      let row = map.get(id)
      if (!row) {
        row = {
          tid: id,
          nome: t?.nome_fantasia || t?.razao_social || id,
          cnpj: t?.cnpj ?? '—',
          cidade: t?.cidade ?? '—',
          uf: t?.uf ?? '',
          telefone: t?.telefone || t?.contato_telefone || '—',
          email: t?.email ?? '—',
          viagens: 0,
          alocadas: 0,
          valorTotal: 0,
          aPagar: 0,
          pago: 0,
          placas: new Set(),
          motoristas: new Set(),
        }
        map.set(id, row)
      }
      const valor = c.frete_fechado ?? 0
      row.viagens += 1
      if (c.status === 'alocadas') row.alocadas += 1
      row.valorTotal += valor
      const st = getStatusPagamento(pagamentos, c.id)
      if (st === 'pago') row.pago += valor
      else row.aPagar += valor

      const placa =
        c.placa ||
        (c.veiculo_id ? veiculos.find((v) => v.id === c.veiculo_id)?.placa : null) ||
        ''
      if (placa) row.placas.add(placa)

      const motNome =
        c.motorista ||
        (c.motorista_id ? motoristas.find((m) => m.id === c.motorista_id)?.nome : null) ||
        ''
      if (motNome) row.motoristas.add(motNome)
    }

    return Array.from(map.values()).sort((a, b) => b.aPagar - a.aPagar || b.valorTotal - a.valorTotal)
  }, [fretesEscopo, transportadores, veiculos, motoristas, pagamentos])

  const totais = useMemo(() => {
    let valorTotal = 0
    let aPagar = 0
    let pago = 0
    for (const c of fretesEscopo) {
      const v = c.frete_fechado ?? 0
      valorTotal += v
      if (getStatusPagamento(pagamentos, c.id) === 'pago') pago += v
      else aPagar += v
    }
    return {
      viagens: fretesEscopo.length,
      transportadoras: porTransportadora.length,
      valorTotal,
      aPagar,
      pago,
    }
  }, [fretesEscopo, pagamentos, porTransportadora.length])

  const fretesDetalhe = useMemo(() => {
    if (!selectedTid) return fretesBase
    return fretesBase.filter((c) => c.transportador_vencedor_id === selectedTid)
  }, [fretesBase, selectedTid])

  function resolverPlaca(c: Carga) {
    if (c.placa) return c.placa
    if (c.veiculo_id) return veiculos.find((v) => v.id === c.veiculo_id)?.placa ?? '—'
    return '—'
  }

  function resolverMotorista(c: Carga) {
    if (c.motorista) return c.motorista
    if (c.motorista_id) return motoristas.find((m) => m.id === c.motorista_id)?.nome ?? '—'
    return '—'
  }

  function marcar(cargaId: string, status: StatusPagamentoFrete) {
    setPagamentos((prev) => setStatusPagamento(prev, cargaId, status))
  }

  function marcarTodosAPagarDaTransportadora(transportadorId: string, status: StatusPagamentoFrete) {
    setPagamentos((prev) => {
      let next = prev
      for (const c of fretesEscopo) {
        if (c.transportador_vencedor_id !== transportadorId) continue
        if (getStatusPagamento(next, c.id) === status) continue
        next = setStatusPagamento(next, c.id, status)
      }
      return { ...next }
    })
  }

  function exportarCsv() {
    downloadCsv(
      `financeiro-fretes-${toInputDate(new Date())}.csv`,
      [
        'Carga',
        'Pedido',
        'Transportadora',
        'CNPJ',
        'Origem',
        'Destino',
        'Carregamento',
        'Peso',
        'Placa',
        'Motorista',
        'Status carga',
        'Frete fechado',
        'Pagamento',
        'Pago em',
      ],
      fretesDetalhe.map((c) => {
        const t = transportadores.find((x) => x.id === c.transportador_vencedor_id)
        const st = getStatusPagamento(pagamentos, c.id)
        const reg = pagamentos[c.id]
        return [
          c.numero,
          c.pedido ?? '',
          t?.nome_fantasia ?? '',
          t?.cnpj ?? '',
          c.origem,
          c.destino,
          c.data_carregamento ?? '',
          c.peso ?? '',
          resolverPlaca(c),
          resolverMotorista(c),
          c.status,
          c.frete_fechado ?? 0,
          st === 'pago' ? 'Pago' : 'A pagar',
          reg?.pago_em ? formatDateTime(reg.pago_em) : '',
        ]
      }),
    )
  }

  function exportarResumoCsv() {
    downloadCsv(
      `financeiro-resumo-${toInputDate(new Date())}.csv`,
      [
        'Transportadora',
        'CNPJ',
        'Cidade',
        'UF',
        'Telefone',
        'E-mail',
        'Viagens',
        'Alocadas',
        'Valor total',
        'A pagar',
        'Pago',
        'Placas',
        'Motoristas',
      ],
      porTransportadora.map((r) => [
        r.nome,
        r.cnpj,
        r.cidade,
        r.uf,
        r.telefone,
        r.email,
        r.viagens,
        r.alocadas,
        r.valorTotal,
        r.aPagar,
        r.pago,
        Array.from(r.placas).join(' | '),
        Array.from(r.motoristas).join(' | '),
      ]),
    )
  }

  if (!user) return <Navigate to="/login" replace />
  if (!isSuper) {
    return (
      <div className="financeiro-page">
        <h1 className="cadastro-page-title">Financeiro</h1>
        <p className="cadastro-empty">
          Apenas Super Usuários podem acessar o financeiro e o controle de pagamentos.
        </p>
      </div>
    )
  }

  return (
    <div className="financeiro-page animate-fade-up">
      <header className="financeiro-header">
        <div>
          <h1 className="financeiro-title">Financeiro</h1>
          <p className="financeiro-subtitle">
            Fretes fechados por transportadora — base para pagamento (viagens, veículos, motoristas e
            valores).
          </p>
        </div>
        <div className="financeiro-header-actions">
          <button
            type="button"
            className="cadastro-btn cadastro-btn--ghost"
            onClick={exportarResumoCsv}
          >
            Exportar resumo
          </button>
          <button
            type="button"
            className="cadastro-btn cadastro-btn--primary"
            onClick={exportarCsv}
          >
            Exportar fretes
          </button>
        </div>
      </header>

      <div className="financeiro-kpis">
        <Kpi label="Viagens" value={String(totais.viagens)} hint="Fretes fechados" />
        <Kpi
          label="Transportadoras"
          value={String(totais.transportadoras)}
          hint="Com frete no filtro"
        />
        <Kpi
          label="Valor total"
          value={formatCurrency(totais.valorTotal)}
          hint="Soma dos fretes"
          accent="ink"
        />
        <Kpi
          label="A pagar"
          value={formatCurrency(totais.aPagar)}
          hint="Pendente de pagamento"
          accent="amber"
        />
        <Kpi
          label="Já pago"
          value={formatCurrency(totais.pago)}
          hint="Marcado como pago"
          accent="green"
        />
      </div>

      <section className="financeiro-filters" aria-label="Filtros">
        <div className="financeiro-filters__head">
          <h2 className="financeiro-filters__title">Filtros</h2>
          <p className="financeiro-filters__hint">Período, transportadora, status e busca</p>
        </div>
        <div className="financeiro-filters__body">
          <div className="financeiro-filters__period">
            <span className="financeiro-filters__label">Período rápido</span>
            <div className="financeiro-period-group">
              {(
                [
                  ['tudo', 'Tudo'],
                  ['hoje', 'Hoje'],
                  ['7d', '7 dias'],
                  ['30d', '30 dias'],
                ] as const
              ).map(([k, label]) => (
                <button
                  key={k}
                  type="button"
                  className={
                    periodo === k
                      ? 'financeiro-chip financeiro-chip--active'
                      : 'financeiro-chip'
                  }
                  onClick={() => aplicarPeriodo(k)}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div className="financeiro-filters__grid">
            <label className="financeiro-field">
              <span className="financeiro-filters__label">De</span>
              <input
                type="date"
                className="cadastro-input financeiro-input"
                value={de}
                onChange={(e) => {
                  setPeriodo('tudo')
                  setDe(e.target.value)
                }}
              />
            </label>
            <label className="financeiro-field">
              <span className="financeiro-filters__label">Até</span>
              <input
                type="date"
                className="cadastro-input financeiro-input"
                value={ate}
                onChange={(e) => {
                  setPeriodo('tudo')
                  setAte(e.target.value)
                }}
              />
            </label>
            <label className="financeiro-field financeiro-field--grow">
              <span className="financeiro-filters__label">Transportadora</span>
              <select
                className="cadastro-input financeiro-input"
                value={tid}
                onChange={(e) => {
                  setTid(e.target.value)
                  setSelectedTid(e.target.value === 'todos' ? null : e.target.value)
                }}
              >
                <option value="todos">Todas</option>
                {transportadores
                  .filter((t) => t.situacao !== 'inativo')
                  .map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.nome_fantasia}
                    </option>
                  ))}
              </select>
            </label>
            <label className="financeiro-field">
              <span className="financeiro-filters__label">Pagamento</span>
              <select
                className="cadastro-input financeiro-input"
                value={filtroPag}
                onChange={(e) => setFiltroPag(e.target.value as FiltroPagamento)}
              >
                <option value="todos">Todos</option>
                <option value="a_pagar">A pagar</option>
                <option value="pago">Pago</option>
              </select>
            </label>
            <label className="financeiro-field financeiro-field--search">
              <span className="financeiro-filters__label">Busca</span>
              <input
                className="cadastro-input financeiro-input"
                placeholder="Carga, placa, motorista, CNPJ..."
                value={q}
                onChange={(e) => setQ(e.target.value)}
              />
            </label>
          </div>
        </div>
      </section>

      <section className="financeiro-section">
        <h2 className="financeiro-section__title">Por transportadora</h2>
        <div className="financeiro-table-wrap">
          <table className="financeiro-table">
            <thead>
              <tr>
                <th>Transportadora</th>
                <th>CNPJ</th>
                <th className="text-right">Viagens</th>
                <th>Veículos</th>
                <th>Motoristas</th>
                <th className="text-right">Total frete</th>
                <th className="text-right">A pagar</th>
                <th className="text-right">Pago</th>
                <th>Ações</th>
              </tr>
            </thead>
            <tbody>
              {porTransportadora.length === 0 ? (
                <tr>
                  <td colSpan={9} className="financeiro-empty">
                    Nenhum frete fechado no período. Feche e aloque cargas no Kanban para gerar a
                    base de pagamento.
                  </td>
                </tr>
              ) : (
                porTransportadora.map((r) => {
                  const ativo = selectedTid === r.tid
                  return (
                    <tr key={r.tid} className={ativo ? 'financeiro-row--active' : undefined}>
                      <td>
                        <button
                          type="button"
                          className="financeiro-link"
                          onClick={() => setSelectedTid(ativo ? null : r.tid)}
                        >
                          {r.nome}
                        </button>
                        <span className="financeiro-meta">
                          {r.cidade}
                          {r.uf ? `/${r.uf}` : ''} · {r.telefone}
                        </span>
                      </td>
                      <td className="whitespace-nowrap">{r.cnpj}</td>
                      <td className="text-right tabular-nums">
                        {r.viagens}
                        <span className="financeiro-meta">{r.alocadas} aloc.</span>
                      </td>
                      <td className="financeiro-cell-clip">
                        {r.placas.size === 0
                          ? '—'
                          : Array.from(r.placas).slice(0, 4).join(', ') +
                            (r.placas.size > 4 ? ` +${r.placas.size - 4}` : '')}
                      </td>
                      <td className="financeiro-cell-clip">
                        {r.motoristas.size === 0
                          ? '—'
                          : Array.from(r.motoristas).slice(0, 3).join(', ') +
                            (r.motoristas.size > 3 ? ` +${r.motoristas.size - 3}` : '')}
                      </td>
                      <td className="text-right font-semibold tabular-nums">
                        {formatCurrency(r.valorTotal)}
                      </td>
                      <td className="text-right tabular-nums financeiro-money--amber">
                        {formatCurrency(r.aPagar)}
                      </td>
                      <td className="text-right tabular-nums financeiro-money--green">
                        {formatCurrency(r.pago)}
                      </td>
                      <td>
                        <div className="financeiro-actions-col">
                          <button
                            type="button"
                            className="financeiro-link"
                            onClick={() => setSelectedTid(r.tid)}
                          >
                            Ver fretes
                          </button>
                          {r.aPagar > 0 && (
                            <button
                              type="button"
                              className="financeiro-link financeiro-link--green"
                              onClick={() => marcarTodosAPagarDaTransportadora(r.tid, 'pago')}
                            >
                              Marcar tudo pago
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="financeiro-section">
        <div className="financeiro-section__head">
          <h2 className="financeiro-section__title">
            Detalhe dos fretes
            {selectedTid
              ? ` · ${porTransportadora.find((r) => r.tid === selectedTid)?.nome ?? ''}`
              : ''}
          </h2>
          {selectedTid && (
            <button
              type="button"
              className="financeiro-link-muted"
              onClick={() => setSelectedTid(null)}
            >
              Limpar filtro da transportadora
            </button>
          )}
        </div>
        <div className="financeiro-table-wrap financeiro-table-wrap--scroll">
          <table className="financeiro-table financeiro-table--wide">
            <thead>
              <tr>
                <th>Carga</th>
                <th>Transportadora</th>
                <th>Rota</th>
                <th>Carregamento</th>
                <th>Peso</th>
                <th>Placa</th>
                <th>Motorista</th>
                <th className="text-right">Frete</th>
                <th>Pagamento</th>
                <th>Ação</th>
              </tr>
            </thead>
            <tbody>
              {fretesDetalhe.length === 0 ? (
                <tr>
                  <td colSpan={10} className="financeiro-empty">
                    Nenhum frete neste filtro.
                  </td>
                </tr>
              ) : (
                fretesDetalhe.map((c) => {
                  const t = transportadores.find((x) => x.id === c.transportador_vencedor_id)
                  const st = getStatusPagamento(pagamentos, c.id)
                  const reg = pagamentos[c.id]
                  return (
                    <tr key={c.id}>
                      <td>
                        <span className="font-semibold">{c.numero}</span>
                        <span className="financeiro-meta">
                          {c.status}
                          {c.pedido ? ` · ped. ${c.pedido}` : ''}
                        </span>
                      </td>
                      <td>
                        {t?.nome_fantasia ?? '—'}
                        <span className="financeiro-meta">{t?.cnpj ?? ''}</span>
                      </td>
                      <td>
                        {c.origem}
                        <span className="text-ink-muted"> → </span>
                        {c.destino}
                      </td>
                      <td className="whitespace-nowrap">
                        {c.data_carregamento
                          ? new Date(c.data_carregamento).toLocaleDateString('pt-BR')
                          : '—'}
                      </td>
                      <td className="tabular-nums">
                        {c.peso != null ? formatNumber(c.peso) : '—'}
                      </td>
                      <td className="font-semibold">{resolverPlaca(c)}</td>
                      <td>{resolverMotorista(c)}</td>
                      <td className="text-right font-bold tabular-nums">
                        {formatCurrency(c.frete_fechado ?? 0)}
                      </td>
                      <td>
                        <span
                          className={
                            st === 'pago' ? 'financeiro-pill financeiro-pill--pago' : 'financeiro-pill'
                          }
                        >
                          {st === 'pago' ? 'Pago' : 'A pagar'}
                        </span>
                        {reg?.pago_em && (
                          <span className="financeiro-meta">{formatDateTime(reg.pago_em)}</span>
                        )}
                      </td>
                      <td>
                        {st === 'a_pagar' ? (
                          <button
                            type="button"
                            className="financeiro-link financeiro-link--green"
                            onClick={() => marcar(c.id, 'pago')}
                          >
                            Marcar pago
                          </button>
                        ) : (
                          <button
                            type="button"
                            className="financeiro-link financeiro-link--amber"
                            onClick={() => marcar(c.id, 'a_pagar')}
                          >
                            Desfazer
                          </button>
                        )}
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}

function Kpi({
  label,
  value,
  hint,
  accent,
}: {
  label: string
  value: string
  hint?: string
  accent?: 'amber' | 'green' | 'ink'
}) {
  return (
    <div className={`financeiro-kpi financeiro-kpi--${accent ?? 'default'}`}>
      <p className="financeiro-kpi__label">{label}</p>
      <p className="financeiro-kpi__value">{value}</p>
      {hint && <p className="financeiro-kpi__hint">{hint}</p>}
    </div>
  )
}
