import { createPortal } from 'react-dom'
import { Gift } from 'lucide-react'
import { LOGO_DOCA_LIVRE_SRC } from '../../lib/brandAssets'

type Props = {
  creditos: number
  onClose: () => void
}

export function RotaPresenteModal({ creditos, onClose }: Props) {
  const n = Math.max(1, Math.floor(Number(creditos) || 0))
  const label = `${n} crédito${n === 1 ? '' : 's'}`

  return createPortal(
    <div
      className="mapa-pub-presente"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="rota-presente-title"
      aria-describedby="rota-presente-desc"
    >
      <div className="mapa-pub-presente__shine" aria-hidden />
      <div className="mapa-pub-presente__card">
        <img className="mapa-pub-presente__logo" src={LOGO_DOCA_LIVRE_SRC} alt="" />
        <div className="mapa-pub-presente__icon" aria-hidden>
          <Gift size={40} strokeWidth={2.4} />
        </div>
        <p className="mapa-pub-presente__kicker">Presente da Doca Livre</p>
        <h3 id="rota-presente-title">Parabéns!</h3>
        <p id="rota-presente-desc">
          Você acabou de ganhar <strong>{label}</strong> do Doca Livre Oferta de Carga.
        </p>
        <p className="mapa-pub-presente__sub">
          Cada crédito vale 1 cálculo de rota — pedágio, km e combustível.
        </p>
        <button type="button" className="mapa-pub__btn mapa-pub-presente__btn" onClick={onClose}>
          Aproveitar agora
        </button>
      </div>
    </div>,
    document.body,
  )
}
