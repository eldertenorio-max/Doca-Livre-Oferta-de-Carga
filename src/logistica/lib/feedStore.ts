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
  resposta_a?: string | null
  curtidas: string[]
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
const CURTIDAS_COMENTARIO_KEY = 'mapa-logistica-feed-comentario-curtidas-v1'
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
type LinhaComentario = Omit<ComentarioFeed, 'curtidas'>
type LinhaCurtidaComentario = { comentario_id: string; usuario: string }

function localCurtidasComentario(): LinhaCurtidaComentario[] {
  return loadJson<LinhaCurtidaComentario[]>(CURTIDAS_COMENTARIO_KEY, [])
}

function unirPorChave<T>(a: T[], b: T[], chave: (item: T) => string): T[] {
  const visto = new Set<string>()
  const out: T[] = []
  for (const item of [...a, ...b]) {
    const k = chave(item)
    if (visto.has(k)) continue
    visto.add(k)
    out.push(item)
  }
  return out
}

function unirComentarios(remoto: LinhaComentario[], local: LinhaComentario[]): LinhaComentario[] {
  const porId = new Map<string, LinhaComentario>()
  for (const c of remoto) {
    porId.set(c.id, { ...c, resposta_a: c.resposta_a || null })
  }
  for (const c of local) {
    const prev = porId.get(c.id)
    if (!prev) {
      porId.set(c.id, { ...c, resposta_a: c.resposta_a || null })
      continue
    }
    porId.set(c.id, { ...prev, resposta_a: prev.resposta_a || c.resposta_a || null })
  }
  return [...porId.values()]
}

export function comentariosRaiz(comentarios: ComentarioFeed[]) {
  const ids = new Set(comentarios.map((c) => c.id))
  return comentarios.filter((c) => !c.resposta_a || !ids.has(c.resposta_a))
}

export function respostasDoComentario(comentarios: ComentarioFeed[], raizId: string) {
  const porPai = new Map<string, ComentarioFeed[]>()
  for (const c of comentarios) {
    if (!c.resposta_a) continue
    const lista = porPai.get(c.resposta_a) ?? []
    lista.push(c)
    porPai.set(c.resposta_a, lista)
  }
  const out: ComentarioFeed[] = []
  const fila = [raizId]
  const visto = new Set<string>()
  while (fila.length) {
    const id = fila.shift()!
    for (const filho of porPai.get(id) ?? []) {
      if (visto.has(filho.id)) continue
      visto.add(filho.id)
      out.push(filho)
      fila.push(filho.id)
    }
  }
  return out.sort((a, b) => a.created_at.localeCompare(b.created_at))
}

export async function compartilharPublicacaoFeed(post: PostFeed): Promise<'compartilhado' | 'copiado'> {
  const url = urlPublicacaoFeed(post.id)
  const titulo = `${post.empresa_nome} · Doca Livre`
  const texto = (post.texto || `Divulgação de ${post.empresa_nome}`).slice(0, 180)
  if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
    try {
      await navigator.share({ title: titulo, text: texto, url })
      return 'compartilhado'
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') throw err
    }
  }
  await navigator.clipboard.writeText(url)
  return 'copiado'
}

export function urlPublicacaoFeed(postId: string) {
  const origem =
    typeof window !== 'undefined'
      ? `${window.location.origin}${window.location.pathname.replace(/\/$/, '')}`
      : 'https://ofertadecargas.docalivre.com.br'
  return `${origem}/#/embarcador/mapa-logistica/feed?post=${encodeURIComponent(postId)}`
}

function localPosts(): LinhaPost[] {
  return loadJson<LinhaPost[]>(POSTS_KEY, [])
}

function montarFeed(
  posts: LinhaPost[],
  curtidas: LinhaCurtida[],
  comentarios: LinhaComentario[],
  curtidasComentario: LinhaCurtidaComentario[] = [],
): PostFeed[] {
  return [...posts]
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .map((p) => ({
      ...p,
      midias: midiasDoPost(p),
      curtidas: curtidas.filter((c) => c.post_id === p.id).map((c) => c.usuario),
      comentarios: comentarios
        .filter((c) => c.post_id === p.id)
        .sort((a, b) => a.created_at.localeCompare(b.created_at))
        .map((c) => ({
          ...c,
          resposta_a: c.resposta_a || null,
          curtidas: curtidasComentario
            .filter((x) => x.comentario_id === c.id)
            .map((x) => x.usuario),
        })),
    }))
}

export async function listarPostsFeed(): Promise<PostFeed[]> {
  const curtidasComentarioLocal = localCurtidasComentario()
  if (supabase) {
    try {
      const [
        { data: posts, error: e1 },
        { data: curtidas, error: e2 },
        { data: comentarios, error: e3 },
        curtidasComentarioRemoto,
      ] = await Promise.all([
        supabase.from('mapa_feed_posts').select('*').order('created_at', { ascending: false }).limit(120),
        supabase.from('mapa_feed_curtidas').select('post_id,usuario'),
        supabase.from('mapa_feed_comentarios').select('*').order('created_at', { ascending: true }),
        supabase
          .from('mapa_feed_comentario_curtidas')
          .select('comentario_id,usuario')
          .then(({ data, error }) => {
            if (error) return [] as LinhaCurtidaComentario[]
            return (data ?? []) as LinhaCurtidaComentario[]
          }),
      ])
      if (e1) throw e1
      if (e2) throw e2
      if (e3) throw e3
      const curtidasComentario = unirPorChave(
        (curtidasComentarioRemoto ?? []) as LinhaCurtidaComentario[],
        curtidasComentarioLocal,
        (c) => `${c.comentario_id}:${c.usuario}`,
      )
      return montarFeed(
        (posts ?? []) as LinhaPost[],
        (curtidas ?? []) as LinhaCurtida[],
        unirComentarios((comentarios ?? []) as LinhaComentario[], loadJson(COMENTARIOS_KEY, [])),
        curtidasComentario,
      )
    } catch (err) {
      if (!tabelaAindaNaoExiste(err)) console.warn('Feed remoto:', err)
    }
  }
  return montarFeed(
    localPosts(),
    loadJson(CURTIDAS_KEY, []),
    loadJson(COMENTARIOS_KEY, []),
    curtidasComentarioLocal,
  )
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
  const comentariosRestantes = loadJson<LinhaComentario[]>(COMENTARIOS_KEY, []).filter((c) => c.post_id !== id)
  const idsComentario = new Set(comentariosRestantes.map((c) => c.id))
  saveJson(COMENTARIOS_KEY, comentariosRestantes)
  saveJson(
    CURTIDAS_COMENTARIO_KEY,
    localCurtidasComentario().filter((c) => idsComentario.has(c.comentario_id)),
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

function erroSemColunaResposta(err: { message?: string } | null) {
  const msg = err?.message || ''
  return /resposta_a|schema cache|column/i.test(msg)
}

export async function comentarPost(
  post: PostFeed,
  usuario: string,
  nome: string,
  texto: string,
  respostaA?: string | null,
) {
  const limpo = texto.trim()
  if (limpo.length < 2) throw new Error('Escreva um comentário.')
  const comentario: LinhaComentario = {
    id: novoId(),
    post_id: post.id,
    autor_usuario: usuario,
    autor_nome: nome,
    texto: limpo,
    created_at: agoraIso(),
    resposta_a: respostaA || null,
  }
  if (supabase) {
    const { error } = await supabase.from('mapa_feed_comentarios').insert(comentario)
    if (error && erroSemColunaResposta(error)) {
      const semResposta = {
        id: comentario.id,
        post_id: comentario.post_id,
        autor_usuario: comentario.autor_usuario,
        autor_nome: comentario.autor_nome,
        texto: comentario.texto,
        created_at: comentario.created_at,
      }
      const retry = await supabase.from('mapa_feed_comentarios').insert(semResposta)
      if (retry.error && !tabelaAindaNaoExiste(retry.error)) throw new Error(retry.error.message)
    } else if (error && !tabelaAindaNaoExiste(error)) {
      throw new Error(error.message)
    }
  }
  saveJson(COMENTARIOS_KEY, [...loadJson<LinhaComentario[]>(COMENTARIOS_KEY, []), comentario])

  const pai = respostaA ? post.comentarios.find((c) => c.id === respostaA) : undefined
  if (pai && pai.autor_usuario !== usuario) {
    await criarNotificacao({
      usuario_destino: pai.autor_usuario,
      tipo: 'comentario',
      post_id: post.id,
      de_usuario: usuario,
      de_nome: nome,
      resumo: `${nome} respondeu seu comentário na divulgação de ${post.empresa_nome}.`,
    })
  }
  if (post.autor_usuario !== usuario && post.autor_usuario !== pai?.autor_usuario) {
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

export async function alternarCurtidaComentario(
  post: PostFeed,
  comentario: ComentarioFeed,
  usuario: string,
  nome: string,
) {
  const jaCurtiu = comentario.curtidas.includes(usuario)
  if (jaCurtiu) {
    if (supabase) {
      const { error } = await supabase
        .from('mapa_feed_comentario_curtidas')
        .delete()
        .eq('comentario_id', comentario.id)
        .eq('usuario', usuario)
      if (error && !tabelaAindaNaoExiste(error)) throw new Error(error.message)
    }
    saveJson(
      CURTIDAS_COMENTARIO_KEY,
      localCurtidasComentario().filter(
        (c) => !(c.comentario_id === comentario.id && c.usuario === usuario),
      ),
    )
    return
  }

  if (supabase) {
    const { error } = await supabase
      .from('mapa_feed_comentario_curtidas')
      .insert({ comentario_id: comentario.id, usuario })
    if (error && !tabelaAindaNaoExiste(error)) throw new Error(error.message)
  }
  saveJson(CURTIDAS_COMENTARIO_KEY, [
    ...localCurtidasComentario(),
    { comentario_id: comentario.id, usuario },
  ])

  if (comentario.autor_usuario !== usuario) {
    await criarNotificacao({
      usuario_destino: comentario.autor_usuario,
      tipo: 'curtida',
      post_id: post.id,
      de_usuario: usuario,
      de_nome: nome,
      resumo: `${nome} curtiu seu comentário na divulgação de ${post.empresa_nome}.`,
    })
  }
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
