import { useEffect, useMemo, useRef, useState, type DragEvent, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Camera,
  Heart,
  ImagePlus,
  MessageCircle,
  Paperclip,
  Send,
  Trash2,
  Video,
  X,
} from 'lucide-react'
import type { Empresa } from '../../types'
import { useAuth } from '../../lib/AuthContext'
import { iniciaisEmpresa, logoSrcEmpresa } from '../../lib/empresaVisual'
import {
  classificarMidia,
  enviarArquivosFeed,
  formatarTamanhoArquivo,
  MAX_ANEXOS_FEED,
  midiasDoPost,
  validarArquivoFeed,
} from '../../lib/feedMidia'
import {
  TIPOS_POST_FEED,
  alternarCurtida,
  comentarPost,
  excluirPostFeed,
  labelTipoPost,
  listarPostsFeed,
  publicarPostFeed,
  tempoRelativo,
  type PostFeed,
  type TipoPostFeed,
} from '../../lib/feedStore'
import { FeedGaleria } from './FeedGaleria'
import '../../styles/feed.css'

type Props = {
  empresaFiltro?: Pick<Empresa, 'id' | 'slug'>
  mostrarComposer: boolean
  composerEmpresa?: Empresa
  vazio?: string
}

type AnexoLocal = {
  id: string
  file: File
  preview: string
  tipo: ReturnType<typeof classificarMidia>
}

export function postsDaEmpresa(posts: PostFeed[], empresa: Pick<Empresa, 'id' | 'slug'>) {
  return posts.filter((p) => {
    if (p.empresa_slug === empresa.slug) return true
    if (empresa.id && p.empresa_id === empresa.id) return true
    if (
      empresa.slug === 'doca-livre' &&
      !p.empresa_slug &&
      (p.empresa_nome === 'Doca Livre' || !p.empresa_id)
    ) {
      return true
    }
    return false
  })
}

export function FeedMural({ empresaFiltro, mostrarComposer, composerEmpresa, vazio }: Props) {
  const navigate = useNavigate()
  const { sessao, empresas } = useAuth()
  const [posts, setPosts] = useState<PostFeed[]>([])
  const [filtro, setFiltro] = useState<TipoPostFeed | 'todos'>('todos')
  const [texto, setTexto] = useState('')
  const [tipo, setTipo] = useState<TipoPostFeed>('servico')
  const [anexos, setAnexos] = useState<AnexoLocal[]>([])
  const anexosRef = useRef<AnexoLocal[]>([])
  anexosRef.current = anexos
  const [arrastando, setArrastando] = useState(false)
  const [enviando, setEnviando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [comentarioAberto, setComentarioAberto] = useState<string | null>(null)
  const [rascunhoComentario, setRascunhoComentario] = useState('')
  const fotoRef = useRef<HTMLInputElement>(null)
  const videoRef = useRef<HTMLInputElement>(null)
  const arquivoRef = useRef<HTMLInputElement>(null)
  const cameraRef = useRef<HTMLInputElement>(null)

  async function recarregar() {
    setPosts(await listarPostsFeed())
  }

  useEffect(() => {
    void recarregar()
  }, [sessao?.usuario, empresaFiltro?.slug])

  useEffect(() => {
    return () => {
      anexosRef.current.forEach((a) => URL.revokeObjectURL(a.preview))
    }
  }, [])

  const visiveis = useMemo(() => {
    const base = empresaFiltro ? postsDaEmpresa(posts, empresaFiltro) : posts
    return filtro === 'todos' ? base : base.filter((p) => p.tipo === filtro)
  }, [empresaFiltro, filtro, posts])

  function acrescentarArquivos(lista: FileList | File[] | null) {
    if (!lista) return
    const novos = Array.from(lista)
    setErro(null)
    setAnexos((atual) => {
      const resto = MAX_ANEXOS_FEED - atual.length
      if (resto <= 0) {
        setErro(`Envie no máximo ${MAX_ANEXOS_FEED} arquivos por publicação.`)
        return atual
      }
      const aceitos: AnexoLocal[] = []
      for (const file of novos.slice(0, resto)) {
        try {
          const tipoArquivo = validarArquivoFeed(file)
          const jaTem = atual.some((a) => a.file.name === file.name && a.file.size === file.size)
          if (jaTem) continue
          aceitos.push({
            id: crypto.randomUUID(),
            file,
            preview: URL.createObjectURL(file),
            tipo: tipoArquivo,
          })
        } catch (err) {
          setErro(err instanceof Error ? err.message : 'Arquivo não aceito.')
        }
      }
      return [...atual, ...aceitos]
    })
  }

  function removerAnexo(id: string) {
    setAnexos((atual) => {
      const alvo = atual.find((a) => a.id === id)
      if (alvo) URL.revokeObjectURL(alvo.preview)
      return atual.filter((a) => a.id !== id)
    })
  }

  function onSoltar(e: DragEvent) {
    e.preventDefault()
    setArrastando(false)
    acrescentarArquivos(e.dataTransfer.files)
  }

  async function onPublicar(e: FormEvent) {
    e.preventDefault()
    if (!sessao) return
    setEnviando(true)
    setErro(null)
    try {
      const midias = await enviarArquivosFeed(anexos.map((a) => a.file))
      await publicarPostFeed({
        sessaoUsuario: sessao.usuario,
        sessaoNome: sessao.nome,
        empresa: composerEmpresa,
        tipo,
        texto,
        midias,
      })
      anexos.forEach((a) => URL.revokeObjectURL(a.preview))
      setTexto('')
      setAnexos([])
      await recarregar()
    } catch (err) {
      setErro(err instanceof Error ? err.message : 'Não foi possível publicar.')
    } finally {
      setEnviando(false)
    }
  }

  async function onCurtir(post: PostFeed) {
    if (!sessao) return
    await alternarCurtida(post, sessao.usuario, sessao.nome)
    await recarregar()
  }

  async function onComentar(post: PostFeed) {
    if (!sessao) return
    try {
      await comentarPost(post, sessao.usuario, sessao.nome, rascunhoComentario)
      setRascunhoComentario('')
      await recarregar()
    } catch (err) {
      setErro(err instanceof Error ? err.message : 'Não foi possível comentar.')
    }
  }

  return (
    <div className="feed-mural">
      {mostrarComposer && sessao ? (
        <form
          className={`feed__composer ${arrastando ? 'is-drop' : ''}`}
          onSubmit={onPublicar}
          onDragOver={(e) => {
            e.preventDefault()
            setArrastando(true)
          }}
          onDragLeave={() => setArrastando(false)}
          onDrop={onSoltar}
          onPaste={(e) => {
            const arquivos = Array.from(e.clipboardData.files || [])
            if (arquivos.length) acrescentarArquivos(arquivos)
          }}
        >
          <div className="feed__composer-top">
            <span className="feed__avatar" aria-hidden>
              {iniciaisEmpresa(composerEmpresa?.nome_fantasia || sessao.nome)}
            </span>
            <div>
              <strong>{composerEmpresa?.nome_fantasia || 'Doca Livre'}</strong>
              <span>{empresaFiltro ? 'Publicar no perfil e no feed da rede' : 'Publicar para a rede do mapa'}</span>
            </div>
          </div>
          <div className="feed__tipos">
            {TIPOS_POST_FEED.map((t) => (
              <button
                key={t.id}
                type="button"
                className={`feed__chip ${tipo === t.id ? 'is-active' : ''}`}
                onClick={() => setTipo(t.id)}
              >
                {t.label}
              </button>
            ))}
          </div>
          <textarea
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            placeholder="Divulgue um serviço, capacidade de frota, rota ou parceria…"
            rows={4}
            maxLength={1200}
          />
          {anexos.length > 0 ? (
            <div className="feed__anexos">
              {anexos.map((a) => (
                <div key={a.id} className={`feed__anexo feed__anexo--${a.tipo}`}>
                  {a.tipo === 'imagem' ? (
                    <img src={a.preview} alt="" />
                  ) : a.tipo === 'video' ? (
                    <video src={a.preview} muted />
                  ) : (
                    <div className="feed__anexo-arquivo">
                      <Paperclip size={16} />
                      <span>
                        {a.file.name}
                        <em>{formatarTamanhoArquivo(a.file.size)}</em>
                      </span>
                    </div>
                  )}
                  <button type="button" className="feed__anexo-x" onClick={() => removerAnexo(a.id)} aria-label="Remover arquivo">
                    <X size={14} />
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <p className="feed__drop-hint">Arraste fotos, vídeos ou arquivos para cá, ou use os botões abaixo.</p>
          )}
          <input
            ref={fotoRef}
            type="file"
            accept="image/*"
            multiple
            hidden
            onChange={(e) => {
              acrescentarArquivos(e.target.files)
              e.target.value = ''
            }}
          />
          <input
            ref={videoRef}
            type="file"
            accept="video/*"
            multiple
            hidden
            onChange={(e) => {
              acrescentarArquivos(e.target.files)
              e.target.value = ''
            }}
          />
          <input
            ref={arquivoRef}
            type="file"
            accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.zip,.txt,audio/*,application/pdf"
            multiple
            hidden
            onChange={(e) => {
              acrescentarArquivos(e.target.files)
              e.target.value = ''
            }}
          />
          <input
            ref={cameraRef}
            type="file"
            accept="image/*,video/*"
            capture="environment"
            hidden
            onChange={(e) => {
              acrescentarArquivos(e.target.files)
              e.target.value = ''
            }}
          />
          <div className="feed__toolbar">
            <button type="button" onClick={() => fotoRef.current?.click()}>
              <ImagePlus size={16} /> Foto
            </button>
            <button type="button" onClick={() => videoRef.current?.click()}>
              <Video size={16} /> Vídeo
            </button>
            <button type="button" onClick={() => arquivoRef.current?.click()}>
              <Paperclip size={16} /> Arquivo
            </button>
            <button type="button" onClick={() => cameraRef.current?.click()}>
              <Camera size={16} /> Câmera
            </button>
            <button type="submit" className="feed__publicar" disabled={enviando}>
              <Send size={16} />
              {enviando ? 'Publicando…' : 'Publicar'}
            </button>
          </div>
          {erro ? <p className="feed__erro">{erro}</p> : null}
        </form>
      ) : null}

      {!empresaFiltro ? (
        <div className="feed__filtros" aria-label="Filtrar publicações">
          <button
            type="button"
            className={`feed__chip ${filtro === 'todos' ? 'is-active' : ''}`}
            onClick={() => setFiltro('todos')}
          >
            Tudo
          </button>
          {TIPOS_POST_FEED.map((t) => (
            <button
              key={t.id}
              type="button"
              className={`feed__chip ${filtro === t.id ? 'is-active' : ''}`}
              onClick={() => setFiltro(t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>
      ) : null}

      <section className="feed__lista" aria-label="Publicações">
        {visiveis.length === 0 ? (
          <p className="feed__vazio">{vazio || 'Nenhuma publicação ainda.'}</p>
        ) : (
          visiveis.map((post) => {
            const emp = post.empresa_slug ? empresas.find((e) => e.slug === post.empresa_slug) : undefined
            const logo = emp ? logoSrcEmpresa(emp) : null
            const curtiu = sessao ? post.curtidas.includes(sessao.usuario) : false
            const podeApagar = sessao?.isSuper || sessao?.usuario === post.autor_usuario
            const midias = midiasDoPost(post)
            return (
              <article key={post.id} className="feed__card">
                <header className="feed__card-head">
                  <button
                    type="button"
                    className="feed__autor"
                    onClick={() => post.empresa_slug && navigate(`/embarcador/mapa-logistica/empresa/${post.empresa_slug}`)}
                    disabled={!post.empresa_slug}
                  >
                    {logo ? (
                      <img src={logo} alt="" className="feed__avatar feed__avatar--img" />
                    ) : (
                      <span className="feed__avatar">{iniciaisEmpresa(post.empresa_nome)}</span>
                    )}
                    <span>
                      <strong>{post.empresa_nome}</strong>
                      <em>
                        {post.autor_nome} · {tempoRelativo(post.created_at)}
                      </em>
                    </span>
                  </button>
                  <span className="feed__tipo">{labelTipoPost(post.tipo)}</span>
                </header>
                {post.texto ? <p className="feed__texto">{post.texto}</p> : null}
                <FeedGaleria midias={midias} />
                <footer className="feed__acoes">
                  <button type="button" className={curtiu ? 'is-on' : ''} onClick={() => void onCurtir(post)}>
                    <Heart size={16} fill={curtiu ? 'currentColor' : 'none'} />
                    {post.curtidas.length || ''}
                  </button>
                  <button
                    type="button"
                    onClick={() => setComentarioAberto(comentarioAberto === post.id ? null : post.id)}
                  >
                    <MessageCircle size={16} />
                    {post.comentarios.length || ''}
                  </button>
                  {podeApagar ? (
                    <button
                      type="button"
                      className="feed__apagar"
                      onClick={() => void excluirPostFeed(post.id).then(recarregar)}
                    >
                      <Trash2 size={16} />
                    </button>
                  ) : null}
                </footer>
                {comentarioAberto === post.id ? (
                  <div className="feed__comentarios">
                    {post.comentarios.map((c) => (
                      <p key={c.id}>
                        <strong>{c.autor_nome}</strong> {c.texto}
                        <time>{tempoRelativo(c.created_at)}</time>
                      </p>
                    ))}
                    <form
                      onSubmit={(e) => {
                        e.preventDefault()
                        void onComentar(post)
                      }}
                    >
                      <input
                        value={rascunhoComentario}
                        onChange={(e) => setRascunhoComentario(e.target.value)}
                        placeholder="Escreva um comentário…"
                      />
                      <button type="submit" aria-label="Enviar comentário">
                        <Send size={16} />
                      </button>
                    </form>
                  </div>
                ) : null}
              </article>
            )
          })
        )}
      </section>
    </div>
  )
}
