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

  const fretesBase = useMemo(() => {
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
    if (filtroPag !== 'todos') {
      list = list.filter((c) => getStatusPagamento(pagamentos, c.id) === filtroPag)
    }
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
  }, [cargas, de, ate, tid, filtroPag, pagamentos, q, transportadores, veiculos, motoristas])

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

    for (const c of fretesBase) {
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
  }, [fretesBase, transportadores, veiculos, motoristas, pagamentos])

  const totais = useMemo(() => {
    let valorTotal = 0
    let aPagar = 0
    let pago = 0
    for (const c of fretesBase) {
      const v = c.frete_fechado ?? 0
      valorTotal += v
      if (getStatusPagamento(pagamentos, c.id) === 'pago') pago += v
      else aPagar += v
    }
    return {
      viagens: fretesBase.length,
      transportadoras: porTransportadora.length,
      valorTotal,
      aPagar,
      pago,
    }
  }, [fretesBase, pagamentos, porTransportadora.length])

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
      for (const c of fretesBase) {
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
      <div className="cadastro-page">
        <h1 className="cadastro-page-title">Financeiro</h1>
        <p className="cadastro-empty">
          Apenas Super Usuários podem acessar o financeiro e o controle de pagamentos.
        </p>
      </div>
    )
  }

  return (
    <div className="cadastro-page animate-fade-up">
      <header className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="cadastro-page-title">Financeiro</h1>
          <p className="text-sm text-ink-muted">
            Fretes fechados por transportadora — base para pagamento (viagens, veículos, motoristas e
            valores).
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
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

      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <Kpi label="Viagens" value={String(totais.viagens)} />
        <Kpi label="Transportadoras" value={String(totais.transportadoras)} />
        <Kpi label="Valor total" value={formatCurrency(totais.valorTotal)} />
        <Kpi label="A pagar" value={formatCurrency(totais.aPagar)} accent="amber" />
        <Kpi label="Já pago" value={formatCurrency(totais.pago)} accent="green" />
      </div>

      <div className="mb-4 flex flex-wrap items-end gap-2">
        <div className="flex flex-wrap gap-1">
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
                  ? 'cadastro-btn cadastro-btn--primary text-xs'
                  : 'cadastro-btn cadastro-btn--ghost text-xs'
              }
              onClick={() => aplicarPeriodo(k)}
            >
              {label}
            </button>
          ))}
        </div>
        <label className="flex flex-col gap-1 text-xs text-ink-muted">
          De
          <input
            type="date"
            className="cadastro-input w-auto"
            value={de}
            onChange={(e) => {
              setPeriodo('tudo')
              setDe(e.target.value)
            }}
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-ink-muted">
          Até
          <input
            type="date"
            className="cadastro-input w-auto"
            value={ate}
            onChange={(e) => {
              setPeriodo('tudo')
              setAte(e.target.value)
            }}
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-ink-muted">
          Transportadora
          <select
            className="cadastro-input min-w-[200px]"
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
        <label className="flex flex-col gap-1 text-xs text-ink-muted">
          Pagamento
          <select
            className="cadastro-input w-auto"
            value={filtroPag}
            onChange={(e) => setFiltroPag(e.target.value as FiltroPagamento)}
          >
            <option value="todos">Todos</option>
            <option value="a_pagar">A pagar</option>
            <option value="pago">Pago</option>
          </select>
        </label>
        <input
          className="cadastro-input min-w-[200px] flex-1"
          placeholder="Buscar carga, placa, motorista, CNPJ..."
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </div>

      <section className="mb-6">
        <h2 className="mb-2 text-sm font-semibold text-ink">Por transportadora</h2>
        <div className="overflow-hidden rounded-xl border border-ink/10 bg-white">
          <table className="w-full text-left text-sm">
            <thead className="bg-sand-light/60 text-xs uppercase text-ink-muted">
              <tr>
                <th className="px-3 py-2">Transportadora</th>
                <th className="px-3 py-2">CNPJ</th>
                <th className="px-3 py-2 text-right">Viagens</th>
                <th className="px-3 py-2">Veículos</th>
                <th className="px-3 py-2">Motoristas</th>
                <th className="px-3 py-2 text-right">Total frete</th>
                <th className="px-3 py-2 text-right">A pagar</th>
                <th className="px-3 py-2 text-right">Pago</th>
                <th className="px-3 py-2">Ações</th>
              </tr>
            </thead>
            <tbody>
              {porTransportadora.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-3 py-8 text-center text-ink-muted">
                    Nenhum frete fechado no período. Feche e aloque cargas no Kanban para gerar a
                    base de pagamento.
                  </td>
                </tr>
              ) : (
                porTransportadora.map((r) => {
                  const ativo = selectedTid === r.tid
                  return (
                    <tr
                      key={r.tid}
                      className={`border-t border-ink/5 ${ativo ? 'bg-brand/5' : ''}`}
                    >
                      <td className="px-3 py-2">
                        <button
                          type="button"
                          className="text-left font-medium text-ink hover:text-brand"
                          onClick={() => setSelectedTid(ativo ? null : r.tid)}
                        >
                          {r.nome}
                        </button>
                        <span className="mt-0.5 block text-[11px] text-ink-muted">
                          {r.cidade}
                          {r.uf ? `/${r.uf}` : ''} · {r.telefone}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-xs whitespace-nowrap">{r.cnpj}</td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {r.viagens}
                        <span className="mt-0.5 block text-[10px] text-ink-muted">
                          {r.alocadas} aloc.
                        </span>
                      </td>
                      <td className="max-w-[140px] px-3 py-2 text-xs">
                        {r.placas.size === 0
                          ? '—'
                          : Array.from(r.placas).slice(0, 4).join(', ') +
                            (r.placas.size > 4 ? ` +${r.placas.size - 4}` : '')}
                      </td>
                      <td className="max-w-[140px] px-3 py-2 text-xs">
                        {r.motoristas.size === 0
                          ? '—'
                          : Array.from(r.motoristas).slice(0, 3).join(', ') +
                            (r.motoristas.size > 3 ? ` +${r.motoristas.size - 3}` : '')}
                      </td>
                      <td className="px-3 py-2 text-right font-medium tabular-nums">
                        {formatCurrency(r.valorTotal)}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums text-amber-800">
                        {formatCurrency(r.aPagar)}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums text-emerald-800">
                        {formatCurrency(r.pago)}
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex flex-col gap-1">
                          <button
                            type="button"
                            className="text-left text-xs font-medium text-brand hover:underline"
                            onClick={() => setSelectedTid(r.tid)}
                          >
                            Ver fretes
                          </button>
                          {r.aPagar > 0 && (
                            <button
                              type="button"
                              className="text-left text-xs text-emerald-800 hover:underline"
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

      <section>
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-ink">
            Detalhe dos fretes
            {selectedTid
              ? ` · ${porTransportadora.find((r) => r.tid === selectedTid)?.nome ?? ''}`
              : ''}
          </h2>
          {selectedTid && (
            <button
              type="button"
              className="text-xs text-ink-muted hover:text-ink"
              onClick={() => setSelectedTid(null)}
            >
              Limpar filtro da transportadora
            </button>
          )}
        </div>
        <div className="overflow-x-auto rounded-xl border border-ink/10 bg-white">
          <table className="w-full min-w-[960px] text-left text-sm">
            <thead className="bg-sand-light/60 text-xs uppercase text-ink-muted">
              <tr>
                <th className="px-3 py-2">Carga</th>
                <th className="px-3 py-2">Transportadora</th>
                <th className="px-3 py-2">Rota</th>
                <th className="px-3 py-2">Carregamento</th>
                <th className="px-3 py-2">Peso</th>
                <th className="px-3 py-2">Placa</th>
                <th className="px-3 py-2">Motorista</th>
                <th className="px-3 py-2 text-right">Frete</th>
                <th className="px-3 py-2">Pagamento</th>
                <th className="px-3 py-2">Ação</th>
              </tr>
            </thead>
            <tbody>
              {fretesDetalhe.length === 0 ? (
                <tr>
                  <td colSpan={10} className="px-3 py-8 text-center text-ink-muted">
                    Nenhum frete neste filtro.
                  </td>
                </tr>
              ) : (
                fretesDetalhe.map((c) => {
                  const t = transportadores.find((x) => x.id === c.transportador_vencedor_id)
                  const st = getStatusPagamento(pagamentos, c.id)
                  const reg = pagamentos[c.id]
                  return (
                    <tr key={c.id} className="border-t border-ink/5">
                      <td className="px-3 py-2">
                        <span className="font-medium">{c.numero}</span>
                        <span className="mt-0.5 block text-[10px] uppercase text-ink-muted">
                          {c.status}
                          {c.pedido ? ` · ped. ${c.pedido}` : ''}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-xs">
                        {t?.nome_fantasia ?? '—'}
                        <span className="mt-0.5 block text-[10px] text-ink-muted">
                          {t?.cnpj ?? ''}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-xs">
                        {c.origem}
                        <span className="text-ink-muted"> → </span>
                        {c.destino}
                      </td>
                      <td className="px-3 py-2 text-xs whitespace-nowrap">
                        {c.data_carregamento
                          ? new Date(c.data_carregamento).toLocaleDateString('pt-BR')
                          : '—'}
                      </td>
                      <td className="px-3 py-2 text-xs tabular-nums">
                        {c.peso != null ? formatNumber(c.peso) : '—'}
                      </td>
                      <td className="px-3 py-2 text-xs font-medium">{resolverPlaca(c)}</td>
                      <td className="px-3 py-2 text-xs">{resolverMotorista(c)}</td>
                      <td className="px-3 py-2 text-right font-semibold tabular-nums">
                        {formatCurrency(c.frete_fechado ?? 0)}
                      </td>
                      <td className="px-3 py-2">
                        <span
                          className={
                            st === 'pago'
                              ? 'rounded-md bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-800'
                              : 'rounded-md bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-900'
                          }
                        >
                          {st === 'pago' ? 'Pago' : 'A pagar'}
                        </span>
                        {reg?.pago_em && (
                          <span className="mt-0.5 block text-[10px] text-ink-muted">
                            {formatDateTime(reg.pago_em)}
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        {st === 'a_pagar' ? (
                          <button
                            type="button"
                            className="text-xs font-medium text-emerald-800 hover:underline"
                            onClick={() => marcar(c.id, 'pago')}
                          >
                            Marcar pago
                          </button>
                        ) : (
                          <button
                            type="button"
                            className="text-xs font-medium text-amber-800 hover:underline"
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
  accent,
}: {
  label: string
  value: string
  accent?: 'amber' | 'green'
}) {
  const tone =
    accent === 'amber'
      ? 'border-amber-200 bg-amber-50/80'
      : accent === 'green'
        ? 'border-emerald-200 bg-emerald-50/80'
        : 'border-ink/10 bg-white'
  return (
    <div className={`rounded-xl border px-3 py-3 ${tone}`}>
      <p className="text-[11px] font-medium uppercase tracking-wide text-ink-muted">{label}</p>
      <p className="mt-1 text-lg font-semibold tabular-nums text-ink">{value}</p>
    </div>
  )
}
