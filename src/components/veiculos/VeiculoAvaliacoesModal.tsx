import { createPortal } from 'react-dom'
import type { Carga, Veiculo } from '../../types'
import {
  avaliacaoDoVeiculo,
  listarAvaliacoesVeiculo,
} from '../../lib/mapaFrota'
import { normalizeFotosVeiculo } from '../../lib/veiculoFotos'
import '../../styles/mapa-frota.css'

type Props = {
  veiculo: Veiculo
  cargas: Carga[]
  empresa?: string
  onClose: () => void
}

export function VeiculoAvaliacoesModal({ veiculo, cargas, empresa, onClose }: Props) {
  const resumo = avaliacaoDoVeiculo(veiculo)
  const itens = listarAvaliacoesVeiculo(veiculo, cargas ?? [])
  const totalExibido = itens.length
  const mediaExibida =
    totalExibido > 0
      ? Math.round((itens.reduce((s, a) => s + a.nota, 0) / totalExibido) * 10) / 10
      : resumo.nota
  const total = resumo.total || totalExibido
  const comComentario = itens.filter(
    (a) => a.texto && a.texto !== 'Sem comentário.',
  ).length
  const fotos = normalizeFotosVeiculo(veiculo.fotos, veiculo.foto_url)
  const foto = (fotos.dianteira || veiculo.foto_url || '').trim()
  const modelo = [veiculo.marca, veiculo.modelo].filter(Boolean).join(' ')

  if (typeof document === 'undefined') return null

  return createPortal(
    <div
      className="frota-modal"
      role="dialog"
      aria-modal="true"
      aria-label={`Avaliações do veículo ${veiculo.placa}`}
      onClick={onClose}
    >
      <div
        className="frota-modal__panel frota-modal__panel--avaliacoes"
        onClick={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          className="frota-modal__close"
          aria-label="Fechar"
          onClick={onClose}
        >
          ×
        </button>
        <h2 className="frota-modal__title">Avaliações do veículo</h2>

        <div className="frota-avaliacoes-perfil">
          {foto ? (
            <img className="frota-avaliacoes-perfil__foto" src={foto} alt="" />
          ) : (
            <span
              className="frota-avaliacoes-perfil__foto frota-avaliacoes-perfil__foto--empty"
              aria-hidden
            >
              {(veiculo.placa || '??').slice(0, 2).toUpperCase()}
            </span>
          )}
          <div className="frota-avaliacoes-perfil__info">
            <strong>{veiculo.placa}</strong>
            <div
              className="frota-avaliacoes-list__stars"
              aria-label={mediaExibida > 0 ? `${mediaExibida} de 5` : 'Sem nota'}
            >
              {Array.from({ length: 5 }, (_, i) => (
                <span key={i} className={i < Math.round(mediaExibida) ? 'is-on' : ''}>
                  ★
                </span>
              ))}
              <em>
                {mediaExibida > 0 ? mediaExibida.toFixed(1).replace('.', ',') : '—'}
              </em>
            </div>
            <p>
              {total.toLocaleString('pt-BR')} avaliação
              {total === 1 ? '' : 'ões'}
              {veiculo.tipo ? ` · ${veiculo.tipo}` : ''}
              {modelo ? ` · ${modelo}` : ''}
              {empresa ? ` · ${empresa}` : ''}
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
            <li className="frota-avaliacoes-list__empty">
              Ainda sem avaliações deste veículo. As notas aparecem após o embarcador
              avaliar a viagem finalizada.
            </li>
          )}
        </ul>
      </div>
    </div>,
    document.body,
  )
}
