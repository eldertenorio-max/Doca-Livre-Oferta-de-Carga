import { useMemo, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { PontuacaoDashboard } from '../../components/portal/PontuacaoDashboard'
import { useData } from '../../context/DataContext'
import { formatDateTime } from '../../lib/businessRules'
import {
  PONTUACAO_INICIAL,
  REGRAS_PONTUACAO,
  classificacaoPorPontuacao,
  labelPontos,
  labelTipoPontuacao,
  linhasHistoricoPontuacao,
  pontosDaRegra,
  pontuacaoDoHistorico,
  statsAnunciosPontuacao,
} from '../../lib/pontuacaoAderencia'
import { isSuperSession } from '../../lib/superUsers'
import { sameTransportadorId } from '../../lib/transportadorIds'
import type { Transportador } from '../../types'
import '../../styles/cadastro.css'

const STATUS_LABEL: Record<string, string> = {
  nova_carga: 'Nova',
  negociando: 'Negociando',
  propostas: 'Propostas',
  recusadas: 'Recusadas',
  alocadas: 'Alocadas',
  canceladas: 'Canceladas',
  suspensas: 'Suspensas',
}

function nomeTransportador(t: Transportador | undefined) {
  if (!t) return '—'
  return t.nome_fantasia || t.razao_social || t.id
}

function corPontos(n: number) {
  if (n > 0) return 'text-emerald-700'
  if (n < 0) return 'text-red-700'
  return 'text-ink-muted'
}

type Aba = 'dashboard' | 'anuncios' | 'transportadores'

export function PontuacaoTransportadoresPage() {
  const { user, cargas, lances, transportadores, grupos, interacoes } = useData()
  const isSuper = isSuperSession(user)
  const [aba, setAba] = useState<Aba>('dashboard')
  const [q, setQ] = useState('')
  const [tidSel, setTidSel] = useState<string | null>(null)

  const anuncios = useMemo(() => statsAnunciosPontuacao(cargas, lances), [cargas, lances])
  const historico = useMemo(
    () => linhasHistoricoPontuacao({ cargas, lances, grupos, interacoes }),
    [cargas, lances, grupos, interacoes],
  )

  const ranking = useMemo(
    () =>
      [...transportadores]
        .filter((t) => t.situacao !== 'inativo')
        .map((t) => {
          const linhas = historico.filter((h) => sameTransportadorId(h.transportador_id, t.id))
          const pontos = pontuacaoDoHistorico(linhas)
          return {
            ...t,
            pontuacao: pontos,
            classificacao: classificacaoPorPontuacao(pontos),
          }
        })
        .sort(
          (a, b) =>
            b.pontuacao - a.pontuacao || nomeTransportador(a).localeCompare(nomeTransportador(b), 'pt-BR'),
        ),
    [transportadores, historico],
  )

  const anunciosFiltrados = useMemo(() => {
    const s = q.trim().toLowerCase()
    if (!s) return anuncios
    return anuncios.filter(
      (a) =>
        a.numero.toLowerCase().includes(s) ||
        a.origem.toLowerCase().includes(s) ||
        a.destino.toLowerCase().includes(s),
    )
  }, [anuncios, q])

  const rankingFiltrado = useMemo(() => {
    const s = q.trim().toLowerCase()
    if (!s) return ranking
    return ranking.filter((t) => {
      const nome = nomeTransportador(t).toLowerCase()
      return nome.includes(s) || (t.cnpj ?? '').includes(s)
    })
  }, [ranking, q])

  const histSel = useMemo(() => {
    if (!tidSel) return []
    return historico.filter((h) => sameTransportadorId(h.transportador_id, tidSel))
  }, [historico, tidSel])

  const totaisAnuncios = useMemo(
    () => ({
      visualizacoes: anuncios.reduce((s, a) => s + a.visualizacoes, 0),
      visualizaram: anuncios.reduce((s, a) => s + a.visualizaram, 0),
      lances: anuncios.reduce((s, a) => s + a.lances, 0),
      aceitaram: anuncios.reduce((s, a) => s + a.aceitaram, 0),
      recusaram: anuncios.reduce((s, a) => s + a.recusaram, 0),
    }),
    [anuncios],
  )

  if (!user) return <Navigate to="/login" replace />
  if (!isSuper) {
    return (
      <div className="cadastro-page">
        <h1 className="cadastro-page-title">Pontuação do transportador</h1>
        <p className="cadastro-empty">
          Apenas Super Usuários podem acessar a pontuação dos transportadores.
        </p>
      </div>
    )
  }

  const transportadorSel = tidSel
    ? ranking.find((t) => sameTransportadorId(t.id, tidSel))
    : undefined
  const somaEventosSel = histSel.reduce((s, h) => s + pontosDaRegra(h.tipo, h.pontos), 0)

  return (
    <div className="cadastro-page animate-fade-up space-y-4">
      <header>
        <h1 className="cadastro-page-title">Pontuação do transportador</h1>
        <p className="text-sm text-ink-muted">
          Ranking = {PONTUACAO_INICIAL} pts iniciais + os eventos dos cartões acima. Só Super Usuário.
        </p>
      </header>

      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
        {REGRAS_PONTUACAO.map((r) => (
          <div key={r.id} className="rounded-xl border border-ink/10 bg-white p-3">
            <p className="text-[11px] font-extrabold uppercase tracking-wide text-ink">{r.titulo}</p>
            <p className="mt-0.5 text-[12px] text-ink-muted">{r.detalhe}</p>
            <p className={`mt-1 text-lg font-extrabold ${corPontos(r.pontos)}`}>{labelPontos(r.pontos)}</p>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap gap-1 rounded-lg border border-ink/10 bg-white p-1">
        {(
          [
            { id: 'dashboard', label: 'Dashboard' },
            { id: 'anuncios', label: 'Anúncios' },
            { id: 'transportadores', label: 'Transportadores' },
          ] as const
        ).map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => {
              setAba(t.id)
              setQ('')
            }}
            className={`min-w-0 flex-1 rounded-md px-3 py-2 text-[12px] font-extrabold uppercase tracking-wide ${
              aba === t.id ? 'bg-ink text-white' : 'text-ink hover:bg-sand-light'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {aba !== 'dashboard' ? (
        <div className="flex flex-wrap items-center gap-2">
          <input
            className="min-w-[220px] flex-1 rounded-lg border border-ink/15 bg-white px-3 py-2 text-sm"
            placeholder={
              aba === 'anuncios' ? 'Buscar carga, origem ou destino' : 'Buscar transportadora ou CNPJ'
            }
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
      ) : null}

      {aba === 'dashboard' ? (
        <PontuacaoDashboard
          anuncios={anuncios}
          ranking={ranking}
          historico={historico}
          totais={totaisAnuncios}
          onOpenTransportador={(id) => {
            setTidSel(id)
            setAba('transportadores')
          }}
        />
      ) : aba === 'anuncios' ? (
        <>
          <div className="grid grid-cols-2 gap-2 lg:grid-cols-5">
            <Kpi label="Visualizações" value={totaisAnuncios.visualizacoes} hint="Aberturas do anúncio" />
            <Kpi label="Visualizaram" value={totaisAnuncios.visualizaram} hint="Transportadoras únicas" />
            <Kpi label="Deram lance" value={totaisAnuncios.lances} hint="Por anúncio, somado" />
            <Kpi label="Aceitaram / fecharam" value={totaisAnuncios.aceitaram} hint="Fretes fechados" />
            <Kpi label="Recusaram" value={totaisAnuncios.recusaram} hint="Quem recusou a oferta" />
          </div>
          <div className="cadastro-table-wrap">
            <table className="cadastro-table">
              <thead className="bg-sand-light/80 text-[10px] font-extrabold uppercase tracking-wide text-ink">
                <tr>
                  <th className="px-3 py-2">Carga</th>
                  <th className="px-3 py-2">Rota</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2 text-right">Visualizações</th>
                  <th className="px-3 py-2 text-right">Visualizaram</th>
                  <th className="px-3 py-2 text-right">Deram lance</th>
                  <th className="px-3 py-2 text-right">Aceitaram</th>
                  <th className="px-3 py-2">Quem recusou</th>
                </tr>
              </thead>
              <tbody>
                {anunciosFiltrados.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-3 py-6 text-center text-ink-muted">
                      Nenhum anúncio publicado.
                    </td>
                  </tr>
                ) : (
                  anunciosFiltrados.map((a) => (
                    <tr key={a.cargaId} className="border-t border-ink/10">
                      <td className="px-3 py-2 font-bold">{a.numero}</td>
                      <td className="px-3 py-2 text-ink-muted">
                        {a.origem} → {a.destino}
                      </td>
                      <td className="px-3 py-2">{STATUS_LABEL[a.status] ?? a.status}</td>
                      <td className="px-3 py-2 text-right font-bold">{a.visualizacoes}</td>
                      <td className="px-3 py-2 text-right font-bold">{a.visualizaram}</td>
                      <td className="px-3 py-2 text-right font-bold">{a.lances}</td>
                      <td className="px-3 py-2 text-right font-bold">{a.aceitaram}</td>
                      <td className="px-3 py-2 text-right font-bold">
                        {a.recusaram === 0 ? (
                          0
                        ) : (
                          <>
                            {a.recusaram}
                            {' · '}
                            {a.recusaramIds
                              .map((id) =>
                                nomeTransportador(
                                  transportadores.find((t) => sameTransportadorId(t.id, id)),
                                ),
                              )
                              .join(', ')}
                          </>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </>
      ) : (
        <div className="grid min-h-[calc(100vh-16rem)] gap-3 lg:grid-cols-[minmax(320px,28%)_1fr]">
          <aside className="rounded-xl border border-ink/10 bg-white p-3">
            <p className="mb-2 text-[11px] font-extrabold uppercase tracking-wide text-ink">
              Ranking ({rankingFiltrado.length})
            </p>
            {rankingFiltrado.length === 0 ? (
              <p className="text-[12px] text-ink-muted">Nenhuma transportadora.</p>
            ) : (
              <ul className="max-h-[70vh] space-y-1 overflow-y-auto">
                {rankingFiltrado.map((t, idx) => (
                  <li key={t.id}>
                    <button
                      type="button"
                      onClick={() => setTidSel(t.id)}
                      className={`w-full rounded-md border px-2 py-1.5 text-left text-[12px] ${
                        tidSel && sameTransportadorId(t.id, tidSel)
                          ? 'border-brand bg-brand/15 font-bold'
                          : 'border-ink/10 hover:bg-sand-light/60'
                      }`}
                    >
                      <span className="flex items-center justify-between gap-2">
                        <span className="truncate">
                          {idx + 1}. {nomeTransportador(t)}
                        </span>
                        <span className="shrink-0 font-extrabold">{t.pontuacao} pts</span>
                      </span>
                      <span className="block truncate text-[10px] uppercase text-ink-muted">
                        {t.classificacao}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </aside>
          <section className="rounded-xl border border-ink/10 bg-white p-3">
            {!transportadorSel ? (
              <p className="py-8 text-center text-sm text-ink-muted">
                Selecione um transportador para ver o histórico de pontuação.
              </p>
            ) : (
              <>
                <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
                  <div>
                    <h2 className="font-display text-lg font-bold text-ink">
                      {nomeTransportador(transportadorSel)}
                    </h2>
                    <p className="text-[12px] text-ink-muted">
                      {transportadorSel.classificacao} · saldo inicial {PONTUACAO_INICIAL} pts
                      {histSel.length > 0
                        ? ` · eventos ${labelPontos(somaEventosSel)} · total ${transportadorSel.pontuacao} pts`
                        : ` · ${transportadorSel.pontuacao} pts`}
                    </p>
                  </div>
                </div>
                <div className="cadastro-table-wrap">
                  <table className="cadastro-table">
                    <thead className="bg-sand-light/80 text-[10px] font-extrabold uppercase tracking-wide text-ink">
                      <tr>
                        <th className="px-3 py-2">Quando</th>
                        <th className="px-3 py-2">Carga</th>
                        <th className="px-3 py-2">Situação</th>
                        <th className="px-3 py-2 text-right">Pontos</th>
                      </tr>
                    </thead>
                    <tbody>
                      {histSel.length === 0 ? (
                        <tr>
                          <td colSpan={4} className="px-3 py-6 text-center text-ink-muted">
                            Sem histórico ainda. Pontos entram quando a oferta encerra.
                          </td>
                        </tr>
                      ) : (
                        histSel.map((h) => {
                          const carga = cargas.find((c) => c.id === h.carga_id)
                          const pts = pontosDaRegra(h.tipo, h.pontos)
                          return (
                            <tr key={h.id} className="border-t border-ink/10">
                              <td className="px-3 py-2 whitespace-nowrap text-ink-muted">
                                {formatDateTime(h.created_at)}
                              </td>
                              <td className="px-3 py-2 font-bold">{carga?.numero ?? h.carga_id}</td>
                              <td className="px-3 py-2">{labelTipoPontuacao(h.tipo)}</td>
                              <td className={`px-3 py-2 text-right font-extrabold ${corPontos(pts)}`}>
                                {labelPontos(pts)}
                              </td>
                            </tr>
                          )
                        })
                      )}
                    </tbody>
                    {histSel.length > 0 ? (
                      <tfoot>
                        <tr className="border-t-2 border-ink/20 bg-sand-light/50">
                          <td className="px-3 py-2 text-ink-muted" colSpan={2}>
                            Saldo inicial {PONTUACAO_INICIAL} pts
                          </td>
                          <td className="px-3 py-2 font-bold">Total</td>
                          <td className="px-3 py-2 text-right font-extrabold">
                            {transportadorSel.pontuacao} pts
                          </td>
                        </tr>
                      </tfoot>
                    ) : null}
                  </table>
                </div>
              </>
            )}
          </section>
        </div>
      )}
    </div>
  )
}

function Kpi({ label, value, hint }: { label: string; value: number; hint: string }) {
  return (
    <div className="rounded-xl border border-ink/10 bg-white px-3 py-2">
      <p className="text-[10px] font-extrabold uppercase tracking-wide text-ink-muted">{label}</p>
      <p className="font-display text-xl font-bold text-ink">{value}</p>
      <p className="text-[11px] text-ink-muted">{hint}</p>
    </div>
  )
}
