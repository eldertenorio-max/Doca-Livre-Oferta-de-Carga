import { useEffect, useState, type FormEvent } from 'react'
import { LOGO_DOCA_LIVRE_SRC } from '../lib/brandAssets'
import {
  SISTEMAS_CADEIA,
  hydrateHomeMural,
  loadHomeMural,
  publicarMural,
  saveHomeMural,
  type ItemMural,
  type SistemaCadeia,
  type TipoMural,
} from '../lib/homeMural'
import { isSuperSession } from '../lib/superUsers'
import { useData } from '../context/DataContext'
import '../styles/home-cadeia.css'

function quando(iso: string) {
  try {
    return new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })
  } catch {
    return iso
  }
}

export function HomeCadeiaPage() {
  const { user } = useData()
  const superUser = isSuperSession(user)
  const [itens, setItens] = useState<ItemMural[]>(() => loadHomeMural())
  const [tipo, setTipo] = useState<TipoMural>('noticia')
  const [titulo, setTitulo] = useState('')
  const [texto, setTexto] = useState('')
  const [sistema, setSistema] = useState<SistemaCadeia>('cadeia')
  const [link, setLink] = useState('')
  const [erro, setErro] = useState('')

  useEffect(() => {
    void hydrateHomeMural().then(setItens)
  }, [])

  function publicar(e: FormEvent) {
    e.preventDefault()
    setErro('')
    if (!titulo.trim() || !texto.trim()) {
      setErro('Informe o título e o texto.')
      return
    }
    const next = publicarMural(itens, {
      tipo,
      titulo,
      texto,
      sistema,
      link,
      autor_nome: user?.nome || 'Doca Livre',
    })
    setItens(next)
    saveHomeMural(next)
    setTitulo('')
    setTexto('')
    setLink('')
  }

  function apagar(id: string) {
    const next = itens.filter((item) => item.id !== id)
    setItens(next)
    saveHomeMural(next)
  }

  return (
    <div className="home-cadeia">
      <header className="home-cadeia__boas">
        <img src={LOGO_DOCA_LIVRE_SRC} alt="Doca Livre" />
        <div>
          <p>Cadeia de sistemas</p>
          <h1>Bem-vindo</h1>
        </div>
      </header>

      <nav className="home-cadeia__sistemas" aria-label="Sistemas">
        {SISTEMAS_CADEIA.filter((s) => s.id !== 'cadeia').map((s) => (
          <a key={s.id} href={s.href} target={s.id === 'sistema' ? undefined : '_blank'} rel="noreferrer">
            {s.label}
          </a>
        ))}
      </nav>

      {superUser ? (
        <form className="home-cadeia__form" onSubmit={publicar}>
          <h2>Publicar anúncio ou notícia</h2>
          <div className="home-cadeia__campos">
            <label>
              Tipo
              <select value={tipo} onChange={(e) => setTipo(e.target.value as TipoMural)}>
                <option value="noticia">Notícia</option>
                <option value="anuncio">Anúncio</option>
              </select>
            </label>
            <label>
              Sistema
              <select value={sistema} onChange={(e) => setSistema(e.target.value as SistemaCadeia)}>
                {SISTEMAS_CADEIA.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="home-cadeia__span">
              Título
              <input value={titulo} onChange={(e) => setTitulo(e.target.value)} placeholder="Título" />
            </label>
            <label className="home-cadeia__span">
              Texto
              <textarea value={texto} onChange={(e) => setTexto(e.target.value)} rows={3} placeholder="O que a cadeia precisa saber" />
            </label>
            <label className="home-cadeia__span">
              Link
              <input value={link} onChange={(e) => setLink(e.target.value)} placeholder="Opcional" />
            </label>
          </div>
          {erro ? <p className="home-cadeia__erro">{erro}</p> : null}
          <button type="submit">Publicar</button>
        </form>
      ) : null}

      {itens.length === 0 ? (
        <p className="home-cadeia__vazio">Ainda não há anúncios nem notícias.</p>
      ) : (
        <ul className="home-cadeia__lista">
          {itens.map((item) => {
            const sistemaItem = SISTEMAS_CADEIA.find((s) => s.id === item.sistema)
            const href = item.link || sistemaItem?.href || ''
            return (
              <li key={item.id} className={`home-cadeia__item home-cadeia__item--${item.tipo}`}>
                <div>
                  <span>{item.tipo === 'anuncio' ? 'Anúncio' : 'Notícia'}</span>
                  <strong>{item.titulo}</strong>
                  <p>{item.texto}</p>
                  <small>
                    {sistemaItem?.label || 'Cadeia'} · {item.autor_nome} · {quando(item.created_at)}
                  </small>
                  {href ? (
                    <a href={href} target="_blank" rel="noreferrer">
                      Abrir
                    </a>
                  ) : null}
                </div>
                {superUser ? (
                  <button type="button" onClick={() => apagar(item.id)}>
                    Apagar
                  </button>
                ) : null}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
