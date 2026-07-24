import { useData } from '../../context/DataContext'
import '../../styles/mapa-frota.css'

type Props = {
  transportadorId: string
  /** Compacto para a topbar (ao lado do sininho). */
  variant?: 'panel' | 'topbar'
}

const EXPLICACAO =
  'Disponível: sua frota fica visível no Mapa da Frota como pronta para carregar. Indisponível: fica invisível / marcada como indisponível no mapa.'

/** Flag disponível / indisponível para aparecer no Mapa da Frota. */
export function DisponibilidadeMapaFlag({ transportadorId, variant = 'panel' }: Props) {
  const { transportadores, setDisponivelMapa } = useData()
  const t = transportadores.find((x) => x.id === transportadorId)
  if (!t) return null

  const disponivel = t.disponivel_mapa !== false

  if (variant === 'topbar') {
    return (
      <div className="app-topbar-disp" role="group" aria-label="Disponibilidade no mapa">
        <div className="app-topbar-disp-toggle">
          <button
            type="button"
            className={`app-topbar-disp-btn app-topbar-disp-btn--ok${disponivel ? ' is-on' : ''}`}
            onClick={() => void setDisponivelMapa(transportadorId, true)}
            aria-pressed={disponivel}
            title="Visível no mapa"
          >
            Disponível
          </button>
          <button
            type="button"
            className={`app-topbar-disp-btn app-topbar-disp-btn--off${!disponivel ? ' is-on' : ''}`}
            onClick={() => void setDisponivelMapa(transportadorId, false)}
            aria-pressed={!disponivel}
            title="Invisível no mapa"
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
      </div>
    )
  }

  return (
    <div className="disponivel-flag" role="group" aria-label="Disponibilidade no mapa">
      <div className="disponivel-flag__label">
        <strong>Disponibilidade no Mapa da Frota</strong>
        <span>
          Se estiver <em>disponível</em> (verde), seus motoristas com origem e veículo aparecem no
          mapa como prontos para carregar. Em vermelho, ficam indisponíveis.
        </span>
      </div>
      <div className="disponivel-flag__toggle">
        <button
          type="button"
          className={`disponivel-flag__btn disponivel-flag__btn--ok${disponivel ? ' is-on' : ''}`}
          onClick={() => void setDisponivelMapa(transportadorId, true)}
          aria-pressed={disponivel}
          title="Visível no mapa"
        >
          Disponível
        </button>
        <button
          type="button"
          className={`disponivel-flag__btn disponivel-flag__btn--off${!disponivel ? ' is-on' : ''}`}
          onClick={() => void setDisponivelMapa(transportadorId, false)}
          aria-pressed={!disponivel}
          title="Invisível no mapa"
        >
          Indisponível
        </button>
      </div>
    </div>
  )
}
