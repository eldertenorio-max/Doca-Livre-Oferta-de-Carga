import type { Empresa } from '../types'
import { supabase } from './supabase'
import { tabelaAindaNaoExiste } from './supabaseSync'
import { midiasDoPost, type MidiaFeed } from './feedMidia'

export type TipoPostFeed = 'servico' | 'capacidade' | 'parceria' | 'aviso'

export const TIPOS_POST_FEED: { id: TipoPostFeed; label: string }[] = [
  { id: 'servico', label: 'Serviço' },
  { id: 'capacidade', label: 'Capacidade' },
  { id: 'parceria', label: 'Parceria' },
  { id: 'aviso', label: 'Aviso' },
]

export type ComentarioFeed = {
  id: string
  post_id: string
  autor_usuario: string
  autor_nome: string
  texto: string
  created_at: string
}

export type PostFeed = {
  id: string
  empresa_id: string | null
  empresa_slug: string | null
  empresa_nome: string
  autor_usuario: string
  autor_nome: string
  tipo: TipoPostFeed
  texto: string
  imagem_url?: string | null
  midias?: MidiaFeed[]
  created_at: string
  curtidas: string[]
  comentarios: ComentarioFeed[]
}

export type NotificacaoFeed = {
  id: string
  usuario_destino: string
  tipo: 'curtida' | 'comentario' | 'publicacao'
  post_id: string | null
  de_usuario: string | null
  de_nome: string | null
  resumo: string
  lida: boolean
  created_at: string
}

const POSTS_KEY = 'mapa-logistica-feed-posts-v1'
const CURTIDAS_KEY = 'mapa-logistica-feed-curtidas-v1'
const COMENTARIOS_KEY = 'mapa-logistica-feed-comentarios-v1'
const NOTIFS_KEY = 'mapa-logistica-feed-notifs-v1'

function loadJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return fallback
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

function saveJson(key: string, value: unknown) {
  localStorage.setItem(key, JSON.stringify(value))
}

function novoId() {
  return crypto.randomUUID()
}

function agoraIso() {
  return new Date().toISOString()
}

export function labelTipoPost(tipo: TipoPostFeed) {
  return TIPOS_POST_FEED.find((t) => t.id === tipo)?.label ?? 'Publicação'
}

export function tempoRelativo(iso: string) {
  const ms = Date.now() - new Date(iso).getTime()
  const min = Math.max(0, Math.floor(ms / 60_000))
  if (min < 1) return 'agora'
  if (min < 60) return `há ${min} min`
  const h = Math.floor(min / 60)
  if (h < 24) return `há ${h} h`
  const d = Math.floor(h / 24)
  if (d === 1) return 'ontem'
  if (d < 7) return `há ${d} dias`
  return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })
}

type LinhaPost = Omit<PostFeed, 'curtidas' | 'comentarios'>
type LinhaCurtida = { post_id: string; usuario: string }
type LinhaComentario = ComentarioFeed

function localPosts(): LinhaPost[] {
  return loadJson<LinhaPost[]>(POSTS_KEY, [])
}

function montarFeed(
  posts: LinhaPost[],
  curtidas: LinhaCurtida[],
  comentarios: LinhaComentario[],
): PostFeed[] {
  return [...posts]
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .map((p) => ({
      ...p,
      midias: midiasDoPost(p),
      curtidas: curtidas.filter((c) => c.post_id === p.id).map((c) => c.usuario),
      comentarios: comentarios
        .filter((c) => c.post_id === p.id)
        .sort((a, b) => a.created_at.localeCompare(b.created_at)),
    }))
}

export async function listarPostsFeed(): Promise<PostFeed[]> {
  if (supabase) {
    try {
      const [{ data: posts, error: e1 }, { data: curtidas, error: e2 }, { data: comentarios, error: e3 }] =
        await Promise.all([
          supabase.from('mapa_feed_posts').select('*').order('created_at', { ascending: false }).limit(120),
          supabase.from('mapa_feed_curtidas').select('post_id,usuario'),
          supabase.from('mapa_feed_comentarios').select('*').order('created_at', { ascending: true }),
        ])
      if (e1) throw e1
      if (e2) throw e2
      if (e3) throw e3
      return montarFeed((posts ?? []) as LinhaPost[], (curtidas ?? []) as LinhaCurtida[], (comentarios ?? []) as LinhaComentario[])
    } catch (err) {
      if (!tabelaAindaNaoExiste(err)) console.warn('Feed remoto:', err)
    }
  }
  return montarFeed(localPosts(), loadJson(CURTIDAS_KEY, []), loadJson(COMENTARIOS_KEY, []))
}

export async function publicarPostFeed(params: {
  sessaoUsuario: string
  sessaoNome: string
  empresa?: Empresa
  tipo: TipoPostFeed
  texto: string
  imagem_url?: string
  midias?: MidiaFeed[]
}) {
  const texto = params.texto.trim()
  const midias = (params.midias ?? []).filter((m) => m?.url)
  if (texto.length < 3 && midias.length === 0) {
    throw new Error('Escreva algo ou anexe uma foto, vídeo ou arquivo.')
  }
  const primeiraImagem = midias.find((m) => m.tipo === 'imagem')?.url || params.imagem_url?.trim() || null
  const post: LinhaPost = {
    id: novoId(),
    empresa_id: params.empresa?.id ?? null,
    empresa_slug: params.empresa?.slug ?? null,
    empresa_nome: params.empresa?.nome_fantasia ?? 'Doca Livre',
    autor_usuario: params.sessaoUsuario,
    autor_nome: params.sessaoNome,
    tipo: params.tipo,
    texto,
    imagem_url: primeiraImagem,
    midias,
    created_at: agoraIso(),
  }

  if (supabase) {
    const { error } = await supabase.from('mapa_feed_posts').insert(post)
    if (error && /midias/i.test(error.message)) {
      const semMidias = { ...post }
      delete (semMidias as { midias?: unknown }).midias
      const { error: e2 } = await supabase.from('mapa_feed_posts').insert(semMidias)
      if (e2 && !tabelaAindaNaoExiste(e2)) throw new Error(e2.message)
    } else if (error && !tabelaAindaNaoExiste(error)) {
      throw new Error(error.message)
    }
  }
  saveJson(POSTS_KEY, [post, ...localPosts().filter((p) => p.id !== post.id)])
  return post
}

export async function excluirPostFeed(id: string) {
  if (supabase) {
    const { error } = await supabase.from('mapa_feed_posts').delete().eq('id', id)
    if (error && !tabelaAindaNaoExiste(error)) throw new Error(error.message)
  }
  saveJson(POSTS_KEY, localPosts().filter((p) => p.id !== id))
  saveJson(
    CURTIDAS_KEY,
    loadJson<LinhaCurtida[]>(CURTIDAS_KEY, []).filter((c) => c.post_id !== id),
  )
  saveJson(
    COMENTARIOS_KEY,
    loadJson<LinhaComentario[]>(COMENTARIOS_KEY, []).filter((c) => c.post_id !== id),
  )
}

export async function alternarCurtida(post: PostFeed, usuario: string, nome: string) {
  const jaCurtiu = post.curtidas.includes(usuario)
  if (jaCurtiu) {
    if (supabase) {
      const { error } = await supabase
        .from('mapa_feed_curtidas')
        .delete()
        .eq('post_id', post.id)
        .eq('usuario', usuario)
      if (error && !tabelaAindaNaoExiste(error)) throw new Error(error.message)
    }
    saveJson(
      CURTIDAS_KEY,
      loadJson<LinhaCurtida[]>(CURTIDAS_KEY, []).filter((c) => !(c.post_id === post.id && c.usuario === usuario)),
    )
    return
  }

  if (supabase) {
    const { error } = await supabase.from('mapa_feed_curtidas').insert({ post_id: post.id, usuario })
    if (error && !tabelaAindaNaoExiste(error)) throw new Error(error.message)
  }
  saveJson(CURTIDAS_KEY, [...loadJson<LinhaCurtida[]>(CURTIDAS_KEY, []), { post_id: post.id, usuario }])

  if (post.autor_usuario !== usuario) {
    await criarNotificacao({
      usuario_destino: post.autor_usuario,
      tipo: 'curtida',
      post_id: post.id,
      de_usuario: usuario,
      de_nome: nome,
      resumo: `${nome} curtiu a divulgação de ${post.empresa_nome}.`,
    })
  }
}

export async function comentarPost(post: PostFeed, usuario: string, nome: string, texto: string) {
  const limpo = texto.trim()
  if (limpo.length < 2) throw new Error('Escreva um comentário.')
  const comentario: LinhaComentario = {
    id: novoId(),
    post_id: post.id,
    autor_usuario: usuario,
    autor_nome: nome,
    texto: limpo,
    created_at: agoraIso(),
  }
  if (supabase) {
    const { error } = await supabase.from('mapa_feed_comentarios').insert(comentario)
    if (error && !tabelaAindaNaoExiste(error)) throw new Error(error.message)
  }
  saveJson(COMENTARIOS_KEY, [...loadJson<LinhaComentario[]>(COMENTARIOS_KEY, []), comentario])

  if (post.autor_usuario !== usuario) {
    await criarNotificacao({
      usuario_destino: post.autor_usuario,
      tipo: 'comentario',
      post_id: post.id,
      de_usuario: usuario,
      de_nome: nome,
      resumo: `${nome} comentou na divulgação de ${post.empresa_nome}.`,
    })
  }
  return comentario
}

async function criarNotificacao(n: Omit<NotificacaoFeed, 'id' | 'lida' | 'created_at'>) {
  const row: NotificacaoFeed = {
    ...n,
    id: novoId(),
    lida: false,
    created_at: agoraIso(),
  }
  if (supabase) {
    const { error } = await supabase.from('mapa_notificacoes').insert(row)
    if (error && !tabelaAindaNaoExiste(error)) console.warn('Notificação:', error.message)
  }
  saveJson(NOTIFS_KEY, [row, ...loadJson<NotificacaoFeed[]>(NOTIFS_KEY, [])])
}

export async function listarNotificacoes(usuario: string): Promise<NotificacaoFeed[]> {
  if (supabase) {
    try {
      const { data, error } = await supabase
        .from('mapa_notificacoes')
        .select('*')
        .eq('usuario_destino', usuario)
        .order('created_at', { ascending: false })
        .limit(80)
      if (error) throw error
      return (data ?? []) as NotificacaoFeed[]
    } catch (err) {
      if (!tabelaAindaNaoExiste(err)) console.warn('Notificações remotas:', err)
    }
  }
  return loadJson<NotificacaoFeed[]>(NOTIFS_KEY, [])
    .filter((n) => n.usuario_destino === usuario)
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
}

export async function contarNotificacoesNaoLidas(usuario: string) {
  const lista = await listarNotificacoes(usuario)
  return lista.filter((n) => !n.lida).length
}

export async function marcarNotificacoesLidas(usuario: string) {
  if (supabase) {
    const { error } = await supabase
      .from('mapa_notificacoes')
      .update({ lida: true })
      .eq('usuario_destino', usuario)
      .eq('lida', false)
    if (error && !tabelaAindaNaoExiste(error)) console.warn(error.message)
  }
  saveJson(
    NOTIFS_KEY,
    loadJson<NotificacaoFeed[]>(NOTIFS_KEY, []).map((n) =>
      n.usuario_destino === usuario ? { ...n, lida: true } : n,
    ),
  )
}
