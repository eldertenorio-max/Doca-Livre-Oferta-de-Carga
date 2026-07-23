import { useEffect, useMemo, useState } from 'react'
import { TransportadorPainel } from '../../components/transportador/TransportadorPainel'
import { useData } from '../../context/DataContext'
import { DEMO_TRANSPORTADOR } from '../../lib/portalAuth'
import { isLocalSuperUser } from '../../lib/superUsers'

export function PainelTransportadorPage() {
  const {
    user,
    transportadores,
    setActingTransportadorId,
    effectiveTransportadorId,
  } = useData()

  const isSuper =
    Boolean(user?.is_superuser) ||
    user?.role === 'super' ||
    isLocalSuperUser(user?.usuario ?? '') ||
    isLocalSuperUser(user?.email ?? '')

  const canPick = isSuper || user?.role === 'minerva' || !user?.transportador_id

  const transportadoresAtivos = useMemo(
    () =>
      [...transportadores]
        .filter((t) => t.situacao !== 'inativo')
        .sort((a, b) => a.nome_fantasia.localeCompare(b.nome_fantasia, 'pt-BR')),
    [transportadores],
  )

  const defaultId =
    user?.transportador_id ||
    transportadoresAtivos.find((t) => t.id === DEMO_TRANSPORTADOR.transportador_id)?.id ||
    transportadoresAtivos[0]?.id ||
    ''

  const [viewAsId, setViewAsId] = useState(defaultId)

  useEffect(() => {
    if (!viewAsId && defaultId) setViewAsId(defaultId)
  }, [defaultId, viewAsId])

  useEffect(() => {
    if (canPick) setActingTransportadorId(viewAsId || null)
    else setActingTransportadorId(user?.transportador_id ?? null)
    return () => setActingTransportadorId(null)
  }, [canPick, viewAsId, user?.transportador_id, setActingTransportadorId])

  const tid =
    (canPick ? viewAsId : '') ||
    effectiveTransportadorId() ||
    user?.transportador_id ||
    ''

  return (
    <div className="w-full max-w-none space-y-4">
      {canPick && (
        <label className="flex max-w-md flex-col gap-1 text-xs font-semibold text-ink">
          Transportadora
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

      {!tid ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-900">
          {canPick
            ? 'Selecione uma transportadora para ver o painel.'
            : 'Conta sem transportadora vinculada.'}
        </p>
      ) : (
        <TransportadorPainel transportadorId={tid} />
      )}
    </div>
  )
}
