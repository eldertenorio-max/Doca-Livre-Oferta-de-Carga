import type { Carga, Motorista } from '../../types'
import {
  avaliacaoDoMotorista,
  listarAvaliacoesMotorista,
} from '../../lib/mapaFrota'
import '../../styles/mapa-frota.css'

type Props = {
  motorista: Motorista
  cargas: Carga[]
  onClose: () => void
}

export function MotoristaAvaliacoesModal({ motorista, cargas, onClose }: Props) {
  const resumo = avaliacaoDoMotorista(motorista)
  const itens = listarAvaliacoesMotorista(motorista, cargas)
  const totalExibido = itens.length
  const mediaExibida =
    totalExibido > 0
      ? Math.round(
          (itens.reduce((s, a) => s + a.nota, 0) / totalExibido) * 10,
        ) / 10
      : resumo.nota

  return (
    <div
      className="frota-modal"
      role="dialog"
      aria-modal="true"
      aria-label={`Avaliações de ${motorista.nome}`}
      onClick={onClose}
    >
      <div
        className="frota-modal__panel frota-modal__panel--avaliacoes"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          className="frota-modal__close"
          aria-label="Fechar"
          onClick={onClose}
        >
          ×
        </button>
        <h2 className="frota-modal__title">Avaliações</h2>
        <p className="frota-modal__sub">
          {motorista.nome}
          {mediaExibida > 0
            ? ` · ${mediaExibida.toFixed(1).replace('.', ',')} ★`
            : ''}
          {` · ${resumo.total || totalExibido} no total`}
          {totalExibido > 0 && totalExibido !== resumo.total
            ? ` · ${totalExibido} exibida${totalExibido === 1 ? '' : 's'}`
            : ''}
        </p>

        <div className="frota-avaliacoes-resumo" aria-label="Resumo">
          <div>
            <strong>{(resumo.total || totalExibido).toLocaleString('pt-BR')}</strong>
            <span>Entradas</span>
          </div>
          <div>
            <strong>
              {mediaExibida > 0 ? mediaExibida.toFixed(1).replace('.', ',') : '—'}
            </strong>
            <span>Média</span>
          </div>
          <div>
            <strong>{itens.filter((a) => a.texto && a.texto !== 'Sem comentário.').length}</strong>
            <span>Com comentário</span>
          </div>
        </div>

        <ul className="frota-avaliacoes-list">
          {itens.map((av) => (
            <li key={av.id} className="frota-avaliacoes-list__item">
              <div className="frota-avaliacoes-list__head">
                <strong>{av.autor}</strong>
                <span>{av.data}</span>
              </div>
              <div className="frota-avaliacoes-list__stars" aria-label={`${av.nota} de 5`}>
                {Array.from({ length: 5 }, (_, i) => (
                  <span key={i} className={i < Math.round(av.nota) ? 'is-on' : ''}>
                    ★
                  </span>
                ))}
                <em>{av.nota.toFixed(1).replace('.', ',')}</em>
              </div>
              <p>{av.texto}</p>
            </li>
          ))}
          {itens.length === 0 && (
            <li className="frota-avaliacoes-list__empty">Ainda sem avaliações.</li>
          )}
        </ul>
      </div>
    </div>
  )
}
