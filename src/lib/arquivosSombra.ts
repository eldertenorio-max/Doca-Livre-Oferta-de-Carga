/** Espelho dos arquivos. A linha do banco continua com a URL antiga. */

export const CONTA_BLOB_OFERTA = 'stofertacargaprod'

export const BALDES_ESPELHO = ['documentos-transportadores', 'veiculos-fotos'] as const

export type BaldeEspelho = (typeof BALDES_ESPELHO)[number]

const MARCA_URL = '/storage/v1/object/public/'

export function baldeEspelhado(bucket: string): bucket is BaldeEspelho {
  return (BALDES_ESPELHO as readonly string[]).includes(bucket)
}

export function nomeArquivoSeguro(nome: string): string {
  return nome.replace(/[^\w.\-]+/g, '_')
}

export function caminhoFotoVeiculo(veiculoId: string, slot: string, ext: string): string {
  return `${veiculoId}/${slot}.${ext}`
}

export function caminhoFacial(transportadorId: string, stamp: number): string {
  return `${transportadorId}/facial/${stamp}.jpg`
}

export function caminhoDocumento(
  transportadorId: string,
  tipo: string,
  stamp: number,
  nomeArquivo: string,
): string {
  return `${transportadorId}/${tipo}-${stamp}-${nomeArquivoSeguro(nomeArquivo)}`
}

/** Documentos primeiro. Se o portal anônimo for bloqueado, a logo cai em veiculos-fotos. */
export function caminhosLogo(
  transportadorId: string,
  ext: string,
): Array<{ bucket: BaldeEspelho; path: string }> {
  return [
    { bucket: 'documentos-transportadores', path: `${transportadorId}/logo.${ext}` },
    { bucket: 'veiculos-fotos', path: `logos/${transportadorId}/logo.${ext}` },
  ]
}

export function caminhoGaleria(transportadorId: string, chave: string, ext: string): string {
  return `perfis/${transportadorId || 'avulso'}/galeria-${chave}.${ext}`
}

export function caminhoAvatar(pasta: string, ext: string): string {
  return `avatars/${pasta}/avatar.${ext}`
}

function pathLimpo(path: string): string {
  return path.split('?')[0].replace(/^\/+/, '')
}

export function urlAntigaSupabase(origem: string, bucket: string, path: string): string {
  const base = origem.replace(/\/$/, '')
  return `${base}${MARCA_URL}${bucket}/${pathLimpo(path)}`
}

export function urlBlob(bucket: string, path: string, conta = CONTA_BLOB_OFERTA): string {
  return `https://${conta}.blob.core.windows.net/${bucket}/${pathLimpo(path)}`
}

export function lerUrlAntiga(url: string): { bucket: string; path: string } | null {
  const semQuery = url.split('?')[0]
  const i = semQuery.indexOf(MARCA_URL)
  if (i < 0) return null
  const resto = semQuery.slice(i + MARCA_URL.length)
  const barra = resto.indexOf('/')
  if (barra <= 0) return null
  const bucket = decodeURIComponent(resto.slice(0, barra))
  const path = decodeURIComponent(resto.slice(barra + 1))
  if (!bucket || !path) return null
  return { bucket, path }
}

export type EspelhoArquivo = {
  bucket: BaldeEspelho
  path: string
  /** Valor que permanece na linha. */
  urlAntiga: string
  urlBlob: string
}

export function espelhoArquivo(
  origemSupabase: string,
  bucket: string,
  path: string,
): EspelhoArquivo | null {
  if (!baldeEspelhado(bucket)) return null
  if (!path || path.startsWith('data:')) return null
  const limpo = pathLimpo(path)
  return {
    bucket,
    path: limpo,
    urlAntiga: urlAntigaSupabase(origemSupabase, bucket, limpo),
    urlBlob: urlBlob(bucket, limpo),
  }
}

/** Lê uma URL já gravada e aponta o Blob no mesmo caminho, sem trocar a URL antiga. */
export function espelhoDaUrlAntiga(url: string): EspelhoArquivo | null {
  if (!url || url.startsWith('data:')) return null
  const lido = lerUrlAntiga(url)
  if (!lido || !baldeEspelhado(lido.bucket)) return null
  return {
    bucket: lido.bucket,
    path: lido.path,
    urlAntiga: url,
    urlBlob: urlBlob(lido.bucket, lido.path),
  }
}
