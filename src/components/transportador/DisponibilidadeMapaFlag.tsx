import { useData } from '../../context/DataContext'
import '../../styles/mapa-frota.css'

type Props = {
  transportadorId: string
}

/** Flag disponível / indisponível para aparecer no Mapa da Frota. */
export function DisponibilidadeMapaFlag({ transportadorId }: Props) {
  const { transportadores, setDisponivelMapa } = useData()
  const t = transportadores.find((x) => x.id === transportadorId)
  if (!t) return null

  const disponivel = t.disponivel_mapa !== false

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
        >
          Disponível
        </button>
        <button
          type="button"
          className={`disponivel-flag__btn disponivel-flag__btn--off${!disponivel ? ' is-on' : ''}`}
          onClick={() => void setDisponivelMapa(transportadorId, false)}
          aria-pressed={!disponivel}
        >
          Indisponível
        </button>
      </div>
    </div>
  )
}
