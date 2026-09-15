import { useState } from 'react'
import { SuporteIcon } from '../ui/SuporteIcon'
import { WhatsAppIcon } from '../ui/WhatsAppIcon'
import { hrefWhatsappSuporte } from '../../lib/whatsappSuporte'
import { AjudaSuporteModal } from './AjudaSuporteModal'
import '../../styles/earth-globe.css'

type Props = {
  origem?: string
  destino?: string
  pagina?: string
  className?: string
}

export function AjudaWhatsFabs({ origem, destino, pagina, className }: Props) {
  const [ajuda, setAjuda] = useState(false)
  return (
    <>
      <div className={`rota-map-ajuda${className ? ` ${className}` : ''}`} data-pdf-ignore>
        <button
          type="button"
          className="rota-map-ajuda__help"
          title="Ajuda e suporte"
          aria-label="Ajuda e suporte"
          onClick={(e) => {
            e.preventDefault()
            e.stopPropagation()
            setAjuda(true)
          }}
        >
          <SuporteIcon size={52} />
        </button>
        <a
          className="rota-map-whats"
          href={hrefWhatsappSuporte({
            origem: (origem || '').trim() || undefined,
            destino: (destino || '').trim() || undefined,
            pagina,
          })}
          target="_blank"
          rel="noopener noreferrer"
          title="Fale conosco no WhatsApp"
          aria-label="Fale conosco no WhatsApp"
        >
          <WhatsAppIcon size={30} />
        </a>
      </div>
      <AjudaSuporteModal
        open={ajuda}
        onClose={() => setAjuda(false)}
        origem={origem}
        destino={destino}
        pagina={pagina}
      />
    </>
  )
}
