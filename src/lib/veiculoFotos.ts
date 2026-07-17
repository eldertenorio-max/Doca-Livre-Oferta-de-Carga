import type { FotoVeiculoSlot, FotosVeiculo } from '../types'

export type FotoVeiculoItem = {
  slot: FotoVeiculoSlot
  numero: number
  titulo: string
  descricao: string
}

export const FOTOS_VEICULO_ROTEIRO: FotoVeiculoItem[] = [
  {
    slot: 'dianteira',
    numero: 1,
    titulo: 'Foto 1 — Dianteira em ângulo',
    descricao: 'Cabine em ângulo (dianteira).',
  },
  {
    slot: 'lateral_esquerda',
    numero: 2,
    titulo: 'Foto 2 — Lateral esquerda',
    descricao: 'Lateral esquerda inteira.',
  },
  {
    slot: 'lateral_direita',
    numero: 3,
    titulo: 'Foto 3 — Lateral direita',
    descricao: 'Lateral direita inteira.',
  },
  {
    slot: 'traseira_aberta',
    numero: 4,
    titulo: 'Foto 4 — Traseira aberta',
    descricao: 'Portas do baú ou tampas da carroceria abertas.',
  },
  {
    slot: 'interior',
    numero: 5,
    titulo: 'Foto 5 — Parte de dentro',
    descricao: 'Assoalho do baú ou da carroceria vazio.',
  },
]

export function emptyFotosVeiculo(): FotosVeiculo {
  return {}
}

export function fotosCompletas(fotos?: FotosVeiculo | null): boolean {
  if (!fotos) return false
  return FOTOS_VEICULO_ROTEIRO.every((f) => Boolean(fotos[f.slot]?.trim()))
}

export function normalizeFotosVeiculo(
  fotos?: FotosVeiculo | null,
  fotoUrlLegacy?: string | null,
): FotosVeiculo {
  const base: FotosVeiculo = { ...(fotos ?? {}) }
  if (!base.dianteira && fotoUrlLegacy) base.dianteira = fotoUrlLegacy
  return base
}

export function isAcceptedImageFile(file: File): boolean {
  if (['image/jpeg', 'image/png', 'image/webp', 'image/jpg'].includes(file.type)) return true
  return /\.(jpe?g|png|webp)$/i.test(file.name)
}

export function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(new Error('Falha ao ler imagem'))
    reader.readAsDataURL(file)
  })
}
