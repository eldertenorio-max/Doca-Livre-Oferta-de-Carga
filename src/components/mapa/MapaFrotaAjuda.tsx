import { useEffect, useRef, useState } from 'react'
import { Info } from 'lucide-react'

export function MapaFrotaAjuda({ texto }: { texto: string }) {
  const [aberto, setAberto] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!aberto) return
    function fechar(ev: MouseEvent) {
      if (!wrapRef.current?.contains(ev.target as Node)) setAberto(false)
    }
    document.addEventListener('mousedown', fechar)
    return () => document.removeEventListener('mousedown', fechar)
  }, [aberto])

  return (
    <div className="mapa-frota__help" ref={wrapRef}>
      <button
        type="button"
        className={`mapa-frota__info${aberto ? ' is-on' : ''}`}
        aria-label="Como usar o mapa"
        aria-expanded={aberto}
        title="Como usar o mapa"
        onClick={() => setAberto((v) => !v)}
      >
        <Info size={16} strokeWidth={2.4} />
      </button>
      {aberto ? (
        <div className="mapa-frota__help-pop" role="tooltip">
          {texto}
        </div>
      ) : null}
    </div>
  )
}
