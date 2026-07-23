import { Fragment, useMemo, useState } from 'react'
import { useData } from '../../context/DataContext'
import { formatCurrency, formatDateTime } from '../../lib/businessRules'
import type { TipoHistorico } from '../../types'
import '../../styles/cadastro.css'

const TIPO_LABEL: Record<TipoHistorico, string> = {
  carga_criada: 'Carga criada',
  carga_excluida: 'Carga excluída',
  carga_publicada: 'Carga publicada',
  carga_cancelada: 'Carga cancelada',
  carga_suspensa: 'Negociação suspensa',
  carga_retomada: 'Negociação retomada',
  carga_republicada: 'Carga republicada',
  negociacao_reaberta: 'Negociação reaberta',
  lance_enviado: 'Lance enviado',
  lance_aceito: 'Lance aceito',
  lance_rejeitado: 'Lance rejeitado',
  contra_proposta: 'Contra-proposta',
  aguardar_ofertas: 'Aguardar ofertas',
  negociacao_finalizada: 'Negociação finalizada',
  frete_recusado: 'Frete recusado',
  carga_alocada: 'Carga alocada',
  grupos_notificados: 'Grupos notificados',
  integracao_fretes: 'Integração fretes',
  pontuacao: 'Pontuação',
  alocacao_expirada: 'Alocação expirada',
  transportador_excluido: 'Transportador excluído',
}

function labelTipo(tipo: string) {
  return TIPO_LABEL[tipo as TipoHistorico] ?? tipo.replace(/_/g, ' ')
}

function inicioDoDiaIso(d: string) {
  if (!d) return null
  const t = new Date(`${d}T00:00:00`)
  return Number.isFinite(t.getTime()) ? t.getTime() : null
}

function fimDoDiaIso(d: string) {
  if (!d) return null
  const t = new Date(`${d}T23:59:59.999`)
  return Number.isFinite(t.getTime()) ? t.getTime() : null
}

export function HistoricoPage() {
  const { historico, cargas, transportadores, integracoes, lances } = useData()
  const [q, setQ] = useState('')
  const [tipo, setTipo] = useState('todos')
  const [transportadorId, setTransportadorId] = useState('todos')
  const [cargaFiltro, setCargaFiltro] = useState('todas')
  const [atorFiltro, setAtorFiltro] = useState('todos')
  const [de, setDe] = useState('')
  const [ate, setAte] = useState('')
  const [expandId, setExpandId] = useState<string | null>(null)

  const tipos = useMemo(
    () => Array.from(new Set(historico.map((h) => h.tipo))).sort(),
    [historico],
  )

  const atores = useMemo(() => {
    const set = new Set<string>()
    for (const h of historico) {
      const nome = (h.ator_nome || '').trim()
      if (nome) set.add(nome)
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'pt-BR'))
  }, [historico])

  const cargasComEvento = useMemo(() => {
    const ids = new Set(historico.map((h) => h.carga_id).filter(Boolean) as string[])
    return cargas
      .filter((c) => ids.has(c.id))
      .sort((a, b) => a.numero.localeCompare(b.numero))
  }, [historico, cargas])

  const transportadoresComEvento = useMemo(() => {
    const ids = new Set(historico.map((h) => h.transportador_id).filter(Boolean) as string[])
    return transportadores
      .filter((t) => ids.has(t.id))
      .sort((a, b) => a.nome_fantasia.localeCompare(b.nome_fantasia, 'pt-BR'))
  }, [historico, transportadores])

  const rows = useMemo(() => {
    let list = [...historico].sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
    )
    if (tipo !== 'todos') list = list.filter((h) => h.tipo === tipo)
    if (transportadorId !== 'todos') {
      list = list.filter((h) => h.transportador_id === transportadorId)
    }
    if (cargaFiltro !== 'todas') list = list.filter((h) => h.carga_id === cargaFiltro)
    if (atorFiltro !== 'todos') {
      list = list.filter((h) => (h.ator_nome || '').trim() === atorFiltro)
    }

    const deMs = inicioDoDiaIso(de)
    const ateMs = fimDoDiaIso(ate)
    if (deMs != null) list = list.filter((h) => new Date(h.created_at).getTime() >= deMs)
    if (ateMs != null) list = list.filter((h) => new Date(h.created_at).getTime() <= ateMs)

    const query = q.trim().toLowerCase()
    if (query) {
      list = list.filter((h) => {
        const carga = h.carga_id ? cargas.find((c) => c.id === h.carga_id) : undefined
        const transp = h.transportador_id
          ? transportadores.find((t) => t.id === h.transportador_id)
          : undefined
        const blob = [
          h.titulo,
          h.detalhe,
          h.tipo,
          labelTipo(h.tipo),
          h.ator_nome,
          carga?.numero,
          carga?.origem,
          carga?.destino,
          carga?.pedido,
          transp?.nome_fantasia,
          transp?.razao_social,
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase()
        return blob.includes(query)
      })
    }
    return list
  }, [
    historico,
    tipo,
    transportadorId,
    cargaFiltro,
    atorFiltro,
    de,
    ate,
    q,
    cargas,
    transportadores,
  ])

  const stats = useMemo(() => {
    const hoje = new Date()
    hoje.setHours(0, 0, 0, 0)
    const hojeMs = hoje.getTime()
    const doDia = historico.filter((h) => new Date(h.created_at).getTime() >= hojeMs).length
    const alocacoes = historico.filter((h) => h.tipo === 'carga_alocada').length
    const lancesAceitos = historico.filter((h) => h.tipo === 'lance_aceito').length
    const publicacoes = historico.filter((h) => h.tipo === 'carga_publicada').length
    return {
      total: historico.length,
      filtrados: rows.length,
      doDia,
      alocacoes,
      lancesAceitos,
      publicacoes,
      lancesAtivos: lances.filter((l) => l.status === 'ativo').length,
    }
  }, [historico, rows.length, lances])

  const filtrosAtivos =
    tipo !== 'todos' ||
    transportadorId !== 'todos' ||
    cargaFiltro !== 'todas' ||
    atorFiltro !== 'todos' ||
    Boolean(de) ||
    Boolean(ate) ||
    Boolean(q.trim())

  function limparFiltros() {
    setQ('')
    setTipo('todos')
    setTransportadorId('todos')
    setCargaFiltro('todas')
    setAtorFiltro('todos')
    setDe('')
    setAte('')
  }

  function exportarCsv() {
    const header = [
      'Quando',
      'Tipo',
      'Evento',
      'Carga',
      'Origem',
      'Destino',
      'Transportador',
      'Usuário',
      'Detalhe',
    ]
    const lines = rows.map((h) => {
      const carga = h.carga_id ? cargas.find((c) => c.id === h.carga_id) : undefined
      const transp = h.transportador_id
        ? transportadores.find((t) => t.id === h.transportador_id)
        : undefined
      const cells = [
        formatDateTime(h.created_at),
        labelTipo(h.tipo),
        h.titulo,
        carga?.numero ?? '',
        carga?.origem ?? '',
        carga?.destino ?? '',
        transp?.nome_fantasia ?? '',
        h.ator_nome ?? '',
        h.detalhe ?? '',
      ]
      return cells.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(';')
    })
    const csv = [header.join(';'), ...lines].join('\n')
    const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `historico-oferta-carga-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="cadastro-page animate-fade-up">
      <header className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="cadastro-page-title">Histórico</h1>
          <p className="text-sm text-ink-muted">
            Auditoria de publicações, lances, fechamentos, alocações e integração com Controle de
            Fretes.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className="cadastro-btn cadastro-btn--ghost"
            onClick={limparFiltros}
            disabled={!filtrosAtivos}
          >
            Limpar filtros
          </button>
          <button
            type="button"
            className="cadastro-btn cadastro-btn--primary"
            onClick={exportarCsv}
            disabled={rows.length === 0}
          >
            Exportar CSV
          </button>
        </div>
      </header>

      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {[
          { label: 'Eventos (filtro)', value: String(stats.filtrados) },
          { label: 'Total geral', value: String(stats.total) },
          { label: 'Hoje', value: String(stats.doDia) },
          { label: 'Publicações', value: String(stats.publicacoes) },
          { label: 'Fretes alocados', value: String(stats.alocacoes) },
        ].map((s) => (
          <div
            key={s.label}
            className="rounded-xl border border-ink/10 bg-white px-3 py-3 shadow-sm"
          >
            <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-muted">
              {s.label}
            </p>
            <p className="mt-1 font-display text-2xl font-bold tabular-nums text-ink">{s.value}</p>
          </div>
        ))}
      </div>

      <div className="mb-3 grid gap-2 md:grid-cols-2 xl:grid-cols-4">
        <input
          className="cadastro-input min-w-0"
          placeholder="Pesquisar título, carga, rota, usuário…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <select
          className="cadastro-input"
          value={tipo}
          onChange={(e) => setTipo(e.target.value)}
        >
          <option value="todos">Todos os tipos</option>
          {tipos.map((t) => (
            <option key={t} value={t}>
              {labelTipo(t)}
            </option>
          ))}
        </select>
        <select
          className="cadastro-input"
          value={cargaFiltro}
          onChange={(e) => setCargaFiltro(e.target.value)}
        >
          <option value="todas">Todas as cargas</option>
          {cargasComEvento.map((c) => (
            <option key={c.id} value={c.id}>
              {c.numero} · {c.origem || '—'} → {c.destino || '—'}
            </option>
          ))}
        </select>
        <select
          className="cadastro-input"
          value={transportadorId}
          onChange={(e) => setTransportadorId(e.target.value)}
        >
          <option value="todos">Todos os transportadores</option>
          {transportadoresComEvento.map((t) => (
            <option key={t.id} value={t.id}>
              {t.nome_fantasia}
            </option>
          ))}
        </select>
        <select
          className="cadastro-input"
          value={atorFiltro}
          onChange={(e) => setAtorFiltro(e.target.value)}
        >
          <option value="todos">Todos os usuários</option>
          {atores.map((nome) => (
            <option key={nome} value={nome}>
              {nome}
            </option>
          ))}
        </select>
        <label className="flex items-center gap-2 text-xs text-ink-muted">
          <span className="shrink-0 font-semibold">De</span>
          <input
            type="date"
            className="cadastro-input flex-1"
            value={de}
            onChange={(e) => setDe(e.target.value)}
          />
        </label>
        <label className="flex items-center gap-2 text-xs text-ink-muted">
          <span className="shrink-0 font-semibold">Até</span>
          <input
            type="date"
            className="cadastro-input flex-1"
            value={ate}
            onChange={(e) => setAte(e.target.value)}
          />
        </label>
        <p className="flex items-center text-xs text-ink-muted">
          {stats.filtrados} de {stats.total} evento(s)
          {stats.lancesAceitos > 0 ? ` · ${stats.lancesAceitos} lance(s) aceito(s)` : ''}
        </p>
      </div>

      <div className="overflow-auto rounded-xl border border-ink/10 bg-white">
        <table className="w-full min-w-[980px] text-left text-sm">
          <thead className="bg-sand-light/60 text-xs uppercase text-ink-muted">
            <tr>
              <th className="px-3 py-2">Quando</th>
              <th className="px-3 py-2">Evento</th>
              <th className="px-3 py-2">Carga / Rota</th>
              <th className="px-3 py-2">Transportador</th>
              <th className="px-3 py-2">Usuário</th>
              <th className="px-3 py-2">Detalhe</th>
              <th className="px-3 py-2"> </th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-3 py-8 text-center text-ink-muted">
                  Nenhum evento com esses filtros.
                </td>
              </tr>
            ) : (
              rows.map((h) => {
                const carga = h.carga_id ? cargas.find((c) => c.id === h.carga_id) : undefined
                const transp = h.transportador_id
                  ? transportadores.find((t) => t.id === h.transportador_id)
                  : undefined
                const aberto = expandId === h.id
                const temExtra = Boolean(h.before || h.after || h.user_agent)
                return (
                  <Fragment key={h.id}>
                    <tr className="border-t border-ink/5 align-top hover:bg-sand-light/30">
                      <td className="px-3 py-2 whitespace-nowrap text-xs">
                        {formatDateTime(h.created_at)}
                      </td>
                      <td className="px-3 py-2">
                        <span className="font-medium text-ink">{h.titulo}</span>
                        <span className="mt-0.5 block text-[10px] font-semibold uppercase tracking-wide text-ink-muted">
                          {labelTipo(h.tipo)}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-xs">
                        {carga ? (
                          <>
                            <span className="font-semibold tabular-nums">{carga.numero}</span>
                            <span className="mt-0.5 block text-ink-muted">
                              {carga.origem || '—'} → {carga.destino || '—'}
                            </span>
                            <span className="mt-0.5 block text-[10px] text-ink-muted">
                              {carga.modo_publicacao === 'oferta'
                                ? 'Oferta'
                                : carga.modo_publicacao === 'leilao'
                                  ? 'Leilão'
                                  : '—'}
                              {carga.frete_fechado != null
                                ? ` · Fechado ${formatCurrency(carga.frete_fechado)}`
                                : carga.frete_oferta != null
                                  ? ` · Oferta ${formatCurrency(carga.frete_oferta)}`
                                  : ''}
                            </span>
                          </>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td className="px-3 py-2 text-xs">
                        {transp ? (
                          <>
                            <span className="font-medium">{transp.nome_fantasia}</span>
                            <span className="mt-0.5 block text-[10px] uppercase text-ink-muted">
                              {transp.classificacao}
                            </span>
                          </>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td className="px-3 py-2 text-xs">{h.ator_nome || '—'}</td>
                      <td className="max-w-[220px] px-3 py-2 text-xs text-ink-muted">
                        {h.detalhe || '—'}
                      </td>
                      <td className="px-3 py-2 text-xs">
                        {temExtra ? (
                          <button
                            type="button"
                            className="cadastro-link"
                            onClick={() => setExpandId(aberto ? null : h.id)}
                          >
                            {aberto ? 'Ocultar' : 'Mais'}
                          </button>
                        ) : (
                          '—'
                        )}
                      </td>
                    </tr>
                    {aberto && (
                      <tr className="border-t border-ink/5 bg-sand-light/40">
                        <td colSpan={7} className="px-3 py-3 text-xs text-ink-muted">
                          <div className="grid gap-3 md:grid-cols-2">
                            {h.before && (
                              <div>
                                <p className="mb-1 font-semibold text-ink">Antes</p>
                                <pre className="overflow-auto rounded-md bg-white p-2 text-[11px]">
                                  {JSON.stringify(h.before, null, 2)}
                                </pre>
                              </div>
                            )}
                            {h.after && (
                              <div>
                                <p className="mb-1 font-semibold text-ink">Depois</p>
                                <pre className="overflow-auto rounded-md bg-white p-2 text-[11px]">
                                  {JSON.stringify(h.after, null, 2)}
                                </pre>
                              </div>
                            )}
                            {h.user_agent && (
                              <p className="md:col-span-2">
                                <span className="font-semibold text-ink">Navegador:</span>{' '}
                                {h.user_agent}
                              </p>
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                )
              })
            )}
          </tbody>
        </table>
      </div>

      <section className="mt-6">
        <h2 className="mb-2 font-display text-lg font-semibold">Fila Controle de Fretes</h2>
        <div className="overflow-hidden rounded-xl border border-ink/10 bg-white">
          <table className="w-full text-left text-sm">
            <thead className="bg-sand-light/60 text-xs uppercase text-ink-muted">
              <tr>
                <th className="px-3 py-2">Quando</th>
                <th className="px-3 py-2">Carga</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Resposta</th>
              </tr>
            </thead>
            <tbody>
              {integracoes.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-3 py-6 text-center text-ink-muted">
                    Nenhuma integração ainda. Alocar uma carga gera o envio automático.
                  </td>
                </tr>
              ) : (
                [...integracoes]
                  .sort(
                    (a, b) =>
                      new Date(b.tentativa_em).getTime() - new Date(a.tentativa_em).getTime(),
                  )
                  .map((i) => (
                    <tr key={i.id} className="border-t border-ink/5">
                      <td className="px-3 py-2 text-xs">{formatDateTime(i.tentativa_em)}</td>
                      <td className="px-3 py-2 text-xs">
                        {cargas.find((c) => c.id === i.carga_id)?.numero ?? i.carga_id}
                      </td>
                      <td className="px-3 py-2">
                        <span
                          className={`rounded px-2 py-0.5 text-[10px] font-bold uppercase ${
                            i.status === 'enviado'
                              ? 'bg-emerald-100 text-emerald-800'
                              : i.status === 'erro'
                                ? 'bg-red-100 text-red-700'
                                : 'bg-amber-100 text-amber-800'
                          }`}
                        >
                          {i.status}
                        </span>
                      </td>
                      <td className="max-w-xs truncate px-3 py-2 text-xs text-ink-muted">
                        {i.resposta ?? '—'}
                      </td>
                    </tr>
                  ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}
