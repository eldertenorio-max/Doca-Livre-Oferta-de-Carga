import type { Carga, Motorista } from '../../types'
import {
  avaliacaoDoMotorista,
  iniciaisNome,
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
  const foto = (motorista.foto_url || '').trim()
  const comComentario = itens.filter(
    (a) => a.texto && a.texto !== 'Sem comentário.',
  ).length
  const total = resumo.total || totalExibido

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

        <div className="frota-avaliacoes-perfil">
          {foto ? (
            <img className="frota-avaliacoes-perfil__foto" src={foto} alt="" />
          ) : (
            <span className="frota-avaliacoes-perfil__foto frota-avaliacoes-perfil__foto--empty" aria-hidden>
              {iniciaisNome(motorista.nome)}
            </span>
          )}
          <div className="frota-avaliacoes-perfil__info">
            <strong>{motorista.nome}</strong>
            <div
              className="frota-avaliacoes-list__stars"
              aria-label={
                mediaExibida > 0 ? `${mediaExibida} de 5` : 'Sem nota'
              }
            >
              {Array.from({ length: 5 }, (_, i) => (
                <span
                  key={i}
                  className={i < Math.round(mediaExibida) ? 'is-on' : ''}
                >
                  ★
                </span>
              ))}
              <em>
                {mediaExibida > 0
                  ? mediaExibida.toFixed(1).replace('.', ',')
                  : '—'}
              </em>
            </div>
            <p>
              {total.toLocaleString('pt-BR')} avaliação
              {total === 1 ? '' : 'ões'}
              {motorista.categoria_cnh ? ` · CNH ${motorista.categoria_cnh}` : ''}
              {motorista.telefone ? ` · ${motorista.telefone}` : ''}
            </p>
          </div>
        </div>

        <div className="frota-avaliacoes-resumo" aria-label="Resumo">
          <div>
            <strong>{total.toLocaleString('pt-BR')}</strong>
            <span>Entradas</span>
          </div>
          <div>
            <strong>
              {mediaExibida > 0 ? mediaExibida.toFixed(1).replace('.', ',') : '—'}
            </strong>
            <span>Média</span>
          </div>
          <div>
            <strong>{comComentario}</strong>
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
