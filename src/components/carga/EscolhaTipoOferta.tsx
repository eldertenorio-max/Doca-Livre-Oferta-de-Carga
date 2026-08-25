import { useState, type ReactNode } from 'react'
import { Info, MapPinned, Store, X } from 'lucide-react'
import type { TipoOfertaCarga } from '../../types'

type Props = {
  onEscolher: (tipo: TipoOfertaCarga) => void
  onCancelar: () => void
}

function CardTipo({
  titulo,
  dica,
  accent,
  icon,
  onEscolher,
}: {
  titulo: string
  dica: string
  accent: string
  icon: ReactNode
  onEscolher: () => void
}) {
  const [aberto, setAberto] = useState(false)
  return (
    <div
      className={`relative flex min-h-[200px] flex-col rounded-2xl border-2 bg-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-md sm:min-h-[240px] ${accent}`}
    >
      <button
        type="button"
        onClick={onEscolher}
        className="flex flex-1 flex-col items-center justify-center gap-3 px-6 py-8 text-center"
      >
        {icon}
        <span className="font-display text-xl font-extrabold uppercase tracking-wide text-ink sm:text-2xl">
          {titulo}
        </span>
      </button>
      <button
        type="button"
        className={`absolute right-3 top-3 inline-flex h-8 w-8 items-center justify-center rounded-full ${
          aberto ? 'bg-ink text-white' : 'bg-[#e8ecf1] text-ink hover:bg-ink hover:text-white'
        }`}
        aria-label={`Explicação: ${titulo}`}
        aria-expanded={aberto}
        title="Explicação"
        onClick={() => setAberto((v) => !v)}
      >
        <Info size={16} />
      </button>
      {aberto ? (
        <p className="border-t border-ink/10 px-6 py-3 text-center text-sm font-medium text-ink-muted">
          {dica}
        </p>
      ) : null}
    </div>
  )
}

export function EscolhaTipoOferta({ onEscolher, onCancelar }: Props) {
  return (
    <div className="absolute inset-0 z-30 flex items-center justify-center bg-[#eef1f4]/95 p-4 sm:p-8">
      <div className="relative w-full max-w-4xl">
        <button
          type="button"
          onClick={onCancelar}
          className="absolute -top-1 right-0 rounded-md p-2 text-ink-muted hover:bg-ink/5 hover:text-ink"
          title="Cancelar"
          aria-label="Cancelar"
        >
          <X size={20} />
        </button>
        <p className="font-display text-center text-2xl font-bold tracking-tight text-ink sm:text-3xl">
          Nova carga
        </p>
        <p className="mt-1 text-center text-sm font-medium text-ink-muted">
          Escolha o tipo de oferta para abrir os dados da carga
        </p>
        <div className="mt-8 grid gap-4 sm:grid-cols-2 sm:gap-6">
          <CardTipo
            titulo="Carga longo percurso"
            dica="Carga ponto a ponto. Mesma tela de dados que você já usa."
            accent="border-ink/15 hover:border-[#385463]"
            icon={
              <span className="flex h-16 w-16 items-center justify-center rounded-2xl bg-[#385463] text-white">
                <MapPinned size={32} strokeWidth={2.2} />
              </span>
            }
            onEscolher={() => onEscolher('longo_percurso')}
          />
          <CardTipo
            titulo="Carga distribuição"
            dica="Mesmos dados da carga, com notas fiscais e valor por cliente."
            accent="border-[#2f9e6a]/30 hover:border-[#2f9e6a]"
            icon={
              <span className="flex h-16 w-16 items-center justify-center rounded-2xl bg-[#2f9e6a] text-white">
                <Store size={32} strokeWidth={2.2} />
              </span>
            }
            onEscolher={() => onEscolher('distribuicao')}
          />
        </div>
      </div>
    </div>
  )
}
