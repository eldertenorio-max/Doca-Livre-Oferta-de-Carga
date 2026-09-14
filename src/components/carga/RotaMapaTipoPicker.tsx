import { useEffect, useState } from 'react'
import { MAPA_VISTAS, type MapaVista } from '../../lib/mapaBases'

type Props = {
  valor: MapaVista
  onChange: (vista: MapaVista) => void
}

export function RotaMapaTipoPicker({ valor, onChange }: Props) {
  const [aberto, setAberto] = useState(false)

  useEffect(() => {
    if (!aberto) return
    const fechar = (e: MouseEvent) => {
      const el = e.target as HTMLElement | null
      if (el?.closest('.rota-map-tipos')) return
      setAberto(false)
    }
    window.addEventListener('mousedown', fechar)
    return () => window.removeEventListener('mousedown', fechar)
  }, [aberto])

  const atual = MAPA_VISTAS.find((x) => x.id === valor) ?? MAPA_VISTAS[0]

  return (
    <div
      className={`rota-map-tipos${aberto ? ' is-open' : ''}`}
      data-pdf-ignore
    >
      <button
        type="button"
        className="rota-map-tipos__atual"
        title={`Mapa: ${atual.label}. Trocar tipo de mapa`}
        aria-label={`Tipo de mapa: ${atual.label}. Abrir opções`}
        aria-expanded={aberto}
        onClick={() => setAberto((v) => !v)}
      >
        <span
          className={`rota-map-tipos__thumb rota-map-tipos__thumb--${atual.id} is-on`}
          style={{ backgroundColor: atual.fallback, backgroundImage: `url(${atual.preview})` }}
        />
        <small>{atual.label}</small>
      </button>
      <div className="rota-map-tipos__lista" role="listbox" aria-label="Tipo de mapa">
        {MAPA_VISTAS.map((opt) => {
          const on = opt.id === valor
          return (
            <button
              key={opt.id}
              type="button"
              role="option"
              aria-selected={on}
              className={`rota-map-tipos__opt${on ? ' is-on' : ''}`}
              title={opt.title}
              onClick={() => {
                onChange(opt.id)
                setAberto(false)
              }}
            >
              <span
                className={`rota-map-tipos__thumb rota-map-tipos__thumb--${opt.id}${on ? ' is-on' : ''}`}
                style={{ backgroundColor: opt.fallback, backgroundImage: `url(${opt.preview})` }}
              />
              <small>{opt.label}</small>
            </button>
          )
        })}
      </div>
    </div>
  )
}
