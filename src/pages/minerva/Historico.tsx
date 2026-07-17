import { useMemo, useState } from 'react'
import { useData } from '../../context/DataContext'
import { formatDateTime } from '../../lib/businessRules'
import '../../styles/cadastro.css'

export function HistoricoPage() {
  const { historico, cargas, transportadores, integracoes } = useData()
  const [q, setQ] = useState('')
  const [tipo, setTipo] = useState('todos')

  const tipos = useMemo(
    () => Array.from(new Set(historico.map((h) => h.tipo))).sort(),
    [historico],
  )

  const rows = useMemo(() => {
    let list = [...historico].sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
    )
    if (tipo !== 'todos') list = list.filter((h) => h.tipo === tipo)
    const query = q.trim().toLowerCase()
    if (query) {
      list = list.filter(
        (h) =>
          h.titulo.toLowerCase().includes(query) ||
          (h.detalhe ?? '').toLowerCase().includes(query) ||
          (h.carga_id &&
            cargas.find((c) => c.id === h.carga_id)?.numero.toLowerCase().includes(query)),
      )
    }
    return list
  }, [historico, tipo, q, cargas])

  return (
    <div className="cadastro-page animate-fade-up">
      <header className="mb-4">
        <h1 className="cadastro-page-title">Histórico</h1>
        <p className="text-sm text-ink-muted">
          Auditoria de publicações, lances, fechamentos, alocações e integração com Controle de
          Fretes.
        </p>
      </header>

      <div className="mb-3 flex flex-wrap gap-2">
        <input
          className="cadastro-input min-w-[220px] flex-1"
          placeholder="Pesquisar..."
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <select
          className="cadastro-input w-auto"
          value={tipo}
          onChange={(e) => setTipo(e.target.value)}
        >
          <option value="todos">Todos os tipos</option>
          {tipos.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
      </div>

      <div className="overflow-hidden rounded-xl border border-ink/10 bg-white">
        <table className="w-full text-left text-sm">
          <thead className="bg-sand-light/60 text-xs uppercase text-ink-muted">
            <tr>
              <th className="px-3 py-2">Quando</th>
              <th className="px-3 py-2">Evento</th>
              <th className="px-3 py-2">Carga</th>
              <th className="px-3 py-2">Transportador</th>
              <th className="px-3 py-2">Detalhe</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-3 py-8 text-center text-ink-muted">
                  Nenhum evento registrado ainda.
                </td>
              </tr>
            ) : (
              rows.map((h) => (
                <tr key={h.id} className="border-t border-ink/5">
                  <td className="px-3 py-2 whitespace-nowrap text-xs">
                    {formatDateTime(h.created_at)}
                  </td>
                  <td className="px-3 py-2">
                    <span className="font-medium">{h.titulo}</span>
                    <span className="mt-0.5 block text-[10px] uppercase text-ink-muted">
                      {h.tipo}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-xs">
                    {h.carga_id
                      ? cargas.find((c) => c.id === h.carga_id)?.numero ?? h.carga_id
                      : '—'}
                  </td>
                  <td className="px-3 py-2 text-xs">
                    {h.transportador_id
                      ? transportadores.find((t) => t.id === h.transportador_id)?.nome_fantasia ??
                        '—'
                      : '—'}
                  </td>
                  <td className="px-3 py-2 text-xs text-ink-muted">{h.detalhe ?? '—'}</td>
                </tr>
              ))
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
