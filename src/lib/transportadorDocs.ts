import type { TipoDocumentoTransportador } from '../types'

export type DocCatalogItem = {
  tipo: TipoDocumentoTransportador
  label: string
  obrigatorio: boolean
  hint?: string
}

/** Checklist padrão de documentos para cadastro de transportador. */
export const DOCUMENTOS_TRANSPORTADOR: DocCatalogItem[] = [
  {
    tipo: 'cartao_cnpj',
    label: 'Cartão CNPJ',
    obrigatorio: true,
    hint: 'Comprovante de inscrição no CNPJ (PDF ou imagem)',
  },
  {
    tipo: 'contrato_social',
    label: 'Contrato social / CCMEI',
    obrigatorio: true,
  },
  {
    tipo: 'rntrc',
    label: 'RNTRC (ANTT)',
    obrigatorio: true,
  },
  {
    tipo: 'comprovante_endereco',
    label: 'Comprovante de endereço',
    obrigatorio: true,
  },
  {
    tipo: 'doc_responsavel',
    label: 'Documento do responsável (RG ou CNH)',
    obrigatorio: true,
  },
  {
    tipo: 'apolice_seguro',
    label: 'Apólice de seguro de carga',
    obrigatorio: false,
    hint: 'Opcional — anexe se tiver',
  },
]

export const TIPOS_DOC_OBRIGATORIOS = DOCUMENTOS_TRANSPORTADOR.filter((d) => d.obrigatorio).map(
  (d) => d.tipo,
)

export function labelDocumento(tipo: TipoDocumentoTransportador): string {
  return DOCUMENTOS_TRANSPORTADOR.find((d) => d.tipo === tipo)?.label ?? tipo
}

export function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(new Error('Falha ao ler arquivo'))
    reader.readAsDataURL(file)
  })
}

export function isAcceptedDocFile(file: File): boolean {
  const ok = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/jpg']
  if (ok.includes(file.type)) return true
  const name = file.name.toLowerCase()
  return /\.(pdf|jpe?g|png|webp)$/.test(name)
}

/**
 * Abre documento local no cadastro.
 * `window.open(data:...)` falha em PDFs grandes — usa Object URL do File/Blob.
 */
export async function openLocalDocumento(opts: {
  file?: File | null
  data_url?: string | null
}): Promise<void> {
  let objectUrl: string | null = null
  if (opts.file) {
    objectUrl = URL.createObjectURL(opts.file)
  } else if (opts.data_url) {
    const res = await fetch(opts.data_url)
    const blob = await res.blob()
    objectUrl = URL.createObjectURL(blob)
  } else {
    throw new Error('Arquivo indisponível para visualização.')
  }

  const a = document.createElement('a')
  a.href = objectUrl
  a.target = '_blank'
  a.rel = 'noopener noreferrer'
  document.body.appendChild(a)
  a.click()
  a.remove()

  window.setTimeout(() => {
    if (objectUrl) URL.revokeObjectURL(objectUrl)
  }, 120_000)
}
