import { useEffect, useMemo, useRef, useState } from 'react'
import { useData } from '../../context/DataContext'
import '../../styles/mapa-frota.css'

type Props = {
  transportadorId: string
  /** Compacto para a topbar (ao lado do sininho). */
  variant?: 'panel' | 'topbar'
}

const EXPLICACAO =
  'Clique em Disponível para ver as placas cadastradas e marcar cada uma como disponível ou indisponível no Mapa da Frota.'

/** Disponibilidade por placa no Mapa da Frota. */
export function DisponibilidadeMapaFlag({ transportadorId, variant = 'panel' }: Props) {
  const { transportadores, veiculos, setDisponivelMapa, setDisponivelMapaVeiculo } = useData()
  const t = transportadores.find((x) => x.id === transportadorId)
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)

  const placas = useMemo(
    () =>
      (veiculos ?? [])
        .filter((v) => v.transportador_id === transportadorId && v.situacao === 'ativo')
        .slice()
        .sort((a, b) => a.placa.localeCompare(b.placa)),
    [veiculos, transportadorId],
  )

  const nDisp = placas.filter((v) => v.disponivel_mapa !== false).length
  const todasDisp = placas.length > 0 && nDisp === placas.length
  const nenhumaDisp = placas.length === 0 || nDisp === 0

  useEffect(() => {
    if (!open) return
    function onDoc(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false)
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  if (!t) return null

  const lista = (
    <div className="disp-placas" role="dialog" aria-label="Disponibilidade por placa">
      <div className="disp-placas__head">
        <strong>Placas no mapa</strong>
        <span>
          {placas.length === 0
            ? 'Nenhuma placa cadastrada.'
            : `${nDisp} de ${placas.length} disponível(is)`}
        </span>
      </div>
      {placas.length > 0 && (
        <>
          <div className="disp-placas__bulk">
            <button
              type="button"
              className="disp-placas__bulk-btn"
              onClick={() => void setDisponivelMapa(transportadorId, true)}
            >
              Todas disponíveis
            </button>
            <button
              type="button"
              className="disp-placas__bulk-btn"
              onClick={() => void setDisponivelMapa(transportadorId, false)}
            >
              Todas indisponíveis
            </button>
          </div>
          <ul className="disp-placas__list">
            {placas.map((v) => {
              const on = v.disponivel_mapa !== false
              return (
                <li key={v.id} className="disp-placas__row">
                  <div className="disp-placas__meta">
                    <strong>{v.placa}</strong>
                    <span>{v.tipo || 'Veículo'}</span>
                  </div>
                  <div className="disp-placas__toggle" role="group" aria-label={`Status ${v.placa}`}>
                    <button
                      type="button"
                      className={`disp-placas__btn disp-placas__btn--ok${on ? ' is-on' : ''}`}
                      aria-pressed={on}
                      onClick={() => void setDisponivelMapaVeiculo(v.id, true)}
                    >
                      Disponível
                    </button>
                    <button
                      type="button"
                      className={`disp-placas__btn disp-placas__btn--off${!on ? ' is-on' : ''}`}
                      aria-pressed={!on}
                      onClick={() => void setDisponivelMapaVeiculo(v.id, false)}
                    >
                      Indisponível
                    </button>
                  </div>
                </li>
              )
            })}
          </ul>
        </>
      )}
    </div>
  )

  if (variant === 'topbar') {
    return (
      <div className="app-topbar-disp" ref={rootRef} role="group" aria-label="Disponibilidade no mapa">
        <div className="app-topbar-disp-toggle">
          <button
            type="button"
            className={`app-topbar-disp-btn app-topbar-disp-btn--ok${open || !nenhumaDisp ? ' is-on' : ''}`}
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            aria-haspopup="dialog"
            title="Escolher placas disponíveis"
          >
            Disponível{placas.length > 0 ? ` (${nDisp})` : ''}
          </button>
          <button
            type="button"
            className={`app-topbar-disp-btn app-topbar-disp-btn--off${nenhumaDisp && !open ? ' is-on' : ''}`}
            onClick={() => {
              void setDisponivelMapa(transportadorId, false)
              setOpen(false)
            }}
            aria-pressed={nenhumaDisp}
            title="Marcar todas as placas como indisponíveis"
          >
            Indisponível
          </button>
        </div>
        <span className="app-topbar-disp-help">
          <button
            type="button"
            className="app-topbar-disp-info"
            aria-label={EXPLICACAO}
            title={EXPLICACAO}
          >
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" aria-hidden>
              <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.75" />
              <path
                d="M12 10.5v6M12 7.75h.01"
                stroke="currentColor"
                strokeWidth="1.75"
                strokeLinecap="round"
              />
            </svg>
          </button>
          <span className="app-topbar-disp-tip" role="tooltip">
            {EXPLICACAO}
          </span>
        </span>
        {open && <div className="app-topbar-disp-panel">{lista}</div>}
      </div>
    )
  }

  return (
    <div className="disponivel-flag" ref={rootRef} role="group" aria-label="Disponibilidade no mapa">
      <div className="disponivel-flag__label">
        <strong>Disponibilidade no Mapa da Frota</strong>
        <span>
          Clique em <em>Disponível</em> para ver as placas e marcar cada uma. Só as disponíveis
          aparecem no filtro padrão do mapa.
        </span>
      </div>
      <div className="disponivel-flag__toggle">
        <button
          type="button"
          className={`disponivel-flag__btn disponivel-flag__btn--ok${open || todasDisp ? ' is-on' : ''}`}
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
        >
          Disponível{placas.length > 0 ? ` (${nDisp}/${placas.length})` : ''}
        </button>
        <button
          type="button"
          className={`disponivel-flag__btn disponivel-flag__btn--off${nenhumaDisp && !open ? ' is-on' : ''}`}
          onClick={() => {
            void setDisponivelMapa(transportadorId, false)
            setOpen(false)
          }}
        >
          Indisponível
        </button>
      </div>
      {open && <div className="disponivel-flag__panel">{lista}</div>}
    </div>
  )
}
