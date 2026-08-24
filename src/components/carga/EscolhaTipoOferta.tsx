import { MapPinned, Store, X } from 'lucide-react'
import type { TipoOfertaCarga } from '../../types'

type Props = {
  onEscolher: (tipo: TipoOfertaCarga) => void
  onCancelar: () => void
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
          <button
            type="button"
            onClick={() => onEscolher('longo_percurso')}
            className="group flex min-h-[220px] flex-col items-center justify-center gap-3 rounded-2xl border-2 border-ink/15 bg-white px-6 py-8 text-center shadow-sm transition hover:-translate-y-0.5 hover:border-[#385463] hover:shadow-md sm:min-h-[280px]"
          >
            <span className="flex h-16 w-16 items-center justify-center rounded-2xl bg-[#385463] text-white">
              <MapPinned size={32} strokeWidth={2.2} />
            </span>
            <span className="font-display text-xl font-extrabold uppercase tracking-wide text-ink sm:text-2xl">
              Oferta longo percurso
            </span>
            <span className="max-w-[16rem] text-sm font-medium text-ink-muted">
              Carga ponto a ponto. Mesma tela de dados que você já usa.
            </span>
          </button>
          <button
            type="button"
            onClick={() => onEscolher('distribuicao')}
            className="group flex min-h-[220px] flex-col items-center justify-center gap-3 rounded-2xl border-2 border-[#2f9e6a]/30 bg-white px-6 py-8 text-center shadow-sm transition hover:-translate-y-0.5 hover:border-[#2f9e6a] hover:shadow-md sm:min-h-[280px]"
          >
            <span className="flex h-16 w-16 items-center justify-center rounded-2xl bg-[#2f9e6a] text-white">
              <Store size={32} strokeWidth={2.2} />
            </span>
            <span className="font-display text-xl font-extrabold uppercase tracking-wide text-ink sm:text-2xl">
              Oferta distribuição
            </span>
            <span className="max-w-[16rem] text-sm font-medium text-ink-muted">
              Mesmos dados da carga, com notas fiscais e valor por cliente.
            </span>
          </button>
        </div>
      </div>
    </div>
  )
}
