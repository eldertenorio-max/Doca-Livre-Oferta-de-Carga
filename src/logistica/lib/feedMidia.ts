import { supabase } from './supabase'
import { tabelaAindaNaoExiste } from './supabaseSync'

export type TipoMidiaFeed = 'imagem' | 'video' | 'audio' | 'arquivo'

export type MidiaFeed = {
  url: string
  tipo: TipoMidiaFeed
  nome: string
  mime: string
  tamanho?: number
}

export const MAX_ANEXOS_FEED = 10
const BUCKET = 'feed-midias'

const LIMITE: Record<TipoMidiaFeed, number> = {
  imagem: 12 * 1024 * 1024,
  video: 50 * 1024 * 1024,
  audio: 20 * 1024 * 1024,
  arquivo: 15 * 1024 * 1024,
}

export function classificarMidia(file: File): TipoMidiaFeed {
  const mime = (file.type || '').toLowerCase()
  const nome = file.name.toLowerCase()
  if (mime.startsWith('image/')) return 'imagem'
  if (mime.startsWith('video/')) return 'video'
  if (mime.startsWith('audio/')) return 'audio'
  if (/\.(jpe?g|png|gif|webp|bmp|heic|heif|avif)$/i.test(nome)) return 'imagem'
  if (/\.(mp4|webm|mov|m4v|avi|mkv|ogv)$/i.test(nome)) return 'video'
  if (/\.(mp3|wav|ogg|m4a|aac|flac)$/i.test(nome)) return 'audio'
  return 'arquivo'
}

export function formatarTamanhoArquivo(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function nomeSeguro(nome: string) {
  return nome
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\w.\-]+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 80)
}

function arquivoParaDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result || ''))
    reader.onerror = () => reject(new Error('Não foi possível ler o arquivo.'))
    reader.readAsDataURL(file)
  })
}

export function validarArquivoFeed(file: File) {
  const tipo = classificarMidia(file)
  const limite = LIMITE[tipo]
  if (file.size > limite) {
    throw new Error(
      `${file.name} passa de ${formatarTamanhoArquivo(limite)}. Envie um arquivo menor.`,
    )
  }
  return tipo
}

export async function enviarArquivoFeed(file: File): Promise<MidiaFeed> {
  const tipo = validarArquivoFeed(file)
  const mime = file.type || 'application/octet-stream'
  const base: Omit<MidiaFeed, 'url'> = {
    tipo,
    nome: file.name || `arquivo-${Date.now()}`,
    mime,
    tamanho: file.size,
  }

  if (supabase) {
    const path = `${Date.now()}-${crypto.randomUUID()}-${nomeSeguro(file.name || 'arquivo')}`
    const { error } = await supabase.storage.from(BUCKET).upload(path, file, {
      cacheControl: '3600',
      contentType: mime,
      upsert: false,
    })
    if (!error) {
      const { data } = supabase.storage.from(BUCKET).getPublicUrl(path)
      return { ...base, url: data.publicUrl }
    }
    if (!tabelaAindaNaoExiste(error)) {
      console.warn('Upload do feed:', error.message)
    }
  }

  if (tipo === 'imagem' && file.size <= 1_400_000) {
    return { ...base, url: await arquivoParaDataUrl(file) }
  }

  throw new Error('Não foi possível enviar o arquivo agora. Tente uma foto menor ou outro formato.')
}

export async function enviarArquivosFeed(files: File[]) {
  if (files.length > MAX_ANEXOS_FEED) {
    throw new Error(`Envie no máximo ${MAX_ANEXOS_FEED} arquivos por publicação.`)
  }
  const midias: MidiaFeed[] = []
  for (const file of files) {
    midias.push(await enviarArquivoFeed(file))
  }
  return midias
}

export function midiasDoPost(post: { imagem_url?: string | null; midias?: MidiaFeed[] | null }): MidiaFeed[] {
  if (Array.isArray(post.midias) && post.midias.length > 0) {
    return post.midias.filter((m) => m && typeof m.url === 'string' && m.url)
  }
  if (post.imagem_url) {
    return [{ url: post.imagem_url, tipo: 'imagem', nome: 'imagem', mime: 'image/*' }]
  }
  return []
}
