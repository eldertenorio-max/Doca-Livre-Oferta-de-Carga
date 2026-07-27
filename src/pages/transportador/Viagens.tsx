import { useEffect, useMemo, useState } from 'react'
import { useData } from '../../context/DataContext'
import { ViagensBoard } from '../../components/viagens/ViagensBoard'
import { DEMO_TRANSPORTADOR } from '../../lib/portalAuth'
import { isSuperSession } from '../../lib/superUsers'

const VIEW_AS_STORAGE_KEY = 'doca-livre-kanban-transportador-view-as'

function readStoredViewAs(): string {
  try {
    return sessionStorage.getItem(VIEW_AS_STORAGE_KEY) || ''
  } catch {
    return ''
  }
}

export function ViagensTransportadorPage() {
  const {
    user,
    transportadores,
    setActingTransportadorId,
    effectiveTransportadorId,
  } = useData()

  const isSuper = isSuperSession(user)
  const canPickTransportador = isSuper || !user?.transportador_id

  const transportadoresAtivos = useMemo(
    () =>
      [...transportadores]
        .filter((t) => t.situacao !== 'inativo')
        .sort((a, b) => a.nome_fantasia.localeCompare(b.nome_fantasia, 'pt-BR')),
    [transportadores],
  )

  const defaultViewAs =
    (canPickTransportador ? readStoredViewAs() : '') ||
    user?.transportador_id ||
    transportadoresAtivos.find((t) => t.id === DEMO_TRANSPORTADOR.transportador_id)?.id ||
    transportadoresAtivos[0]?.id ||
    ''

  const [viewAsId, setViewAsId] = useState(defaultViewAs)

  useEffect(() => {
    if (!viewAsId && defaultViewAs) setViewAsId(defaultViewAs)
  }, [defaultViewAs, viewAsId])

  useEffect(() => {
    if (canPickTransportador) {
      setActingTransportadorId(viewAsId || null)
      try {
        if (viewAsId) sessionStorage.setItem(VIEW_AS_STORAGE_KEY, viewAsId)
      } catch {
        /* ignore */
      }
    } else {
      setActingTransportadorId(user?.transportador_id ?? null)
    }
    return () => setActingTransportadorId(null)
  }, [canPickTransportador, viewAsId, user?.transportador_id, setActingTransportadorId])

  const tid =
    (canPickTransportador ? viewAsId : '') ||
    effectiveTransportadorId() ||
    user?.transportador_id ||
    ''

  return (
    <div className="flex h-full min-h-0 flex-col gap-3 overflow-hidden">
      <div className="shrink-0">
        <h1 className="cadastro-page-title m-0 text-lg font-extrabold text-ink">Viagens</h1>
        <p className="mt-1 text-xs text-ink-muted">
          Suas cargas alocadas: inicie a viagem, finalize a rota ou cancele no meio do percurso.
        </p>
      </div>

      {canPickTransportador && (
        <label className="flex min-w-0 w-full max-w-md flex-col gap-1 text-xs font-semibold text-ink">
          Viagens do transportador
          <select
            value={viewAsId}
            onChange={(e) => setViewAsId(e.target.value)}
            className="rounded-lg border border-brand/40 bg-white px-3 py-2 text-sm font-medium text-ink outline-none focus:border-brand focus:ring-2 focus:ring-brand/20"
          >
            {transportadoresAtivos.length === 0 && (
              <option value="">Nenhuma transportadora ativa</option>
            )}
            {transportadoresAtivos.map((t) => (
              <option key={t.id} value={t.id}>
                {t.nome_fantasia} · {t.classificacao}
              </option>
            ))}
          </select>
        </label>
      )}

      {!tid && (
        <p className="shrink-0 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-900">
          {canPickTransportador
            ? 'Selecione uma transportadora acima para ver as viagens dela.'
            : 'Esta conta não está vinculada a uma transportadora.'}
        </p>
      )}

      <div className="min-h-0 flex-1 overflow-hidden">
        <ViagensBoard mode="transportador" transportadorId={tid || null} />
      </div>
    </div>
  )
}
