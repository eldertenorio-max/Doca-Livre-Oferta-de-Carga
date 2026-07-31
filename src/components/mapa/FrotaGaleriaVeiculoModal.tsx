import { useEffect, useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight, Images, Minus, Plus, X, ZoomIn } from 'lucide-react'
import type { PontoFrota } from '../../lib/mapaFrota'
import {
  listarFotosVeiculoDisponiveis,
  slotMostraMedidasCarroceria,
} from '../../lib/veiculoFotos'

type Props = {
  ponto: PontoFrota
  onClose: () => void
}

function fmtM(n: number | undefined): string | null {
  if (n == null || !Number.isFinite(n) || n <= 0) return null
  return n.toLocaleString('pt-BR', { maximumFractionDigits: 2 })
}

export function FrotaGaleriaVeiculoModal({ ponto, onClose }: Props) {
  const fotos = useMemo(
    () => listarFotosVeiculoDisponiveis(ponto.veiculoFotos),
    [ponto.veiculoFotos],
  )
  const [idx, setIdx] = useState(0)
  const [zoom, setZoom] = useState(1)

  useEffect(() => {
    setIdx(0)
    setZoom(1)
  }, [ponto.id])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      if (e.key === 'ArrowLeft') {
        setIdx((i) => (fotos.length ? (i - 1 + fotos.length) % fotos.length : 0))
        setZoom(1)
      }
      if (e.key === 'ArrowRight') {
        setIdx((i) => (fotos.length ? (i + 1) % fotos.length : 0))
        setZoom(1)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [fotos.length, onClose])

  const atual = fotos[idx] ?? null
  const mostraMedidas = atual ? slotMostraMedidasCarroceria(atual.slot) : false
  const c = fmtM(ponto.comprimento_m)
  const l = fmtM(ponto.largura_m)
  const a = fmtM(ponto.altura_m)
  const cub =
    ponto.cubagem_m3 != null && Number.isFinite(ponto.cubagem_m3) && ponto.cubagem_m3 > 0
      ? ponto.cubagem_m3.toLocaleString('pt-BR', { maximumFractionDigits: 2 })
      : c && l && a
        ? (
            Number(String(ponto.comprimento_m)) *
            Number(String(ponto.largura_m)) *
            Number(String(ponto.altura_m))
          ).toLocaleString('pt-BR', { maximumFractionDigits: 2 })
        : null
  const temMedidas = Boolean(c || l || a || cub)

  return (
    <div
      className="frota-galeria"
      role="dialog"
      aria-modal="true"
      aria-label={`Fotos do veículo ${ponto.placa}`}
      onClick={onClose}
    >
      <div className="frota-galeria__panel" onClick={(e) => e.stopPropagation()}>
        <header className="frota-galeria__head">
          <div>
            <p className="frota-galeria__titulo">
              <Images size={16} aria-hidden />
              Fotos do veículo
            </p>
            <p className="frota-galeria__sub">
              {ponto.placa}
              {ponto.tipoCarroceria ? ` · ${ponto.tipoCarroceria}` : ''}
              {ponto.tipoVeiculo ? ` · ${ponto.tipoVeiculo}` : ''}
            </p>
          </div>
          <button type="button" className="frota-galeria__close" aria-label="Fechar" onClick={onClose}>
            <X size={18} />
          </button>
        </header>

        {fotos.length === 0 ? (
          <p className="frota-galeria__vazio">Nenhuma foto cadastrada neste veículo.</p>
        ) : (
          <>
            <div className="frota-galeria__stage">
              <button
                type="button"
                className="frota-galeria__nav frota-galeria__nav--prev"
                aria-label="Foto anterior"
                disabled={fotos.length < 2}
                onClick={() => {
                  setIdx((i) => (i - 1 + fotos.length) % fotos.length)
                  setZoom(1)
                }}
              >
                <ChevronLeft size={22} />
              </button>

              <div className="frota-galeria__viewport">
                <img
                  src={atual!.url}
                  alt={atual!.titulo}
                  className="frota-galeria__img"
                  style={{ transform: `scale(${zoom})` }}
                  onClick={() => setZoom((z) => (z >= 2.5 ? 1 : Math.min(2.5, z + 0.5)))}
                  draggable={false}
                />
                {mostraMedidas && temMedidas ? (
                  <div className="frota-galeria__medidas">
                    <strong>Medidas da carroceria</strong>
                    <ul>
                      {c ? <li>Comprimento: {c} m</li> : null}
                      {l ? <li>Largura: {l} m</li> : null}
                      {a ? <li>Altura: {a} m</li> : null}
                      {cub ? <li>Cubagem: {cub} m³</li> : null}
                    </ul>
                  </div>
                ) : null}
              </div>

              <button
                type="button"
                className="frota-galeria__nav frota-galeria__nav--next"
                aria-label="Próxima foto"
                disabled={fotos.length < 2}
                onClick={() => {
                  setIdx((i) => (i + 1) % fotos.length)
                  setZoom(1)
                }}
              >
                <ChevronRight size={22} />
              </button>
            </div>

            <div className="frota-galeria__toolbar">
              <p className="frota-galeria__caption">
                {atual!.numero}/{fotos.length} · {atual!.titulo}
              </p>
              <div className="frota-galeria__zoom">
                <ZoomIn size={14} aria-hidden />
                <button
                  type="button"
                  aria-label="Diminuir zoom"
                  onClick={() => setZoom((z) => Math.max(1, Math.round((z - 0.25) * 100) / 100))}
                >
                  <Minus size={14} />
                </button>
                <span>{Math.round(zoom * 100)}%</span>
                <button
                  type="button"
                  aria-label="Aumentar zoom"
                  onClick={() => setZoom((z) => Math.min(3, Math.round((z + 0.25) * 100) / 100))}
                >
                  <Plus size={14} />
                </button>
              </div>
            </div>

            <div className="frota-galeria__thumbs" role="tablist" aria-label="Miniaturas">
              {fotos.map((f, i) => (
                <button
                  key={f.slot}
                  type="button"
                  role="tab"
                  aria-selected={i === idx}
                  className={`frota-galeria__thumb${i === idx ? ' is-on' : ''}`}
                  title={f.titulo}
                  onClick={() => {
                    setIdx(i)
                    setZoom(1)
                  }}
                >
                  <img src={f.url} alt="" />
                </button>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
