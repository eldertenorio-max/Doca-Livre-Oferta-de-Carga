import { useEffect, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { FeedMural } from '../components/feed/FeedMural'
import { RedeAbas } from '../components/feed/RedeAbas'
import { useAuth } from '../lib/AuthContext'
import {
  listarNotificacoes,
  marcarNotificacoesLidas,
  tempoRelativo,
  type NotificacaoFeed,
} from '../lib/feedStore'
import '../styles/feed.css'

export function FeedPage() {
  const { sessao, minhaEmpresa } = useAuth()
  const location = useLocation()
  const abaNotificacoes = location.pathname.endsWith('/notificacoes')
  const [notifs, setNotifs] = useState<NotificacaoFeed[]>([])

  async function recarregarNotifs() {
    if (!sessao) return
    setNotifs(await listarNotificacoes(sessao.usuario))
  }

  useEffect(() => {
    void recarregarNotifs()
  }, [sessao?.usuario])

  useEffect(() => {
    if (!abaNotificacoes || !sessao) return
    void marcarNotificacoesLidas(sessao.usuario).then(() => recarregarNotifs())
  }, [abaNotificacoes, sessao?.usuario])

  const podePublicar = Boolean(sessao?.isSuper || minhaEmpresa)

  return (
    <div className="feed animate-fade-up">
      <header className="feed__hero">
        <div>
          <p className="feed__kicker">Doca Livre · Rede</p>
          <h1>{abaNotificacoes ? 'Notificações' : 'Feed notícias'}</h1>
          <p>
            {abaNotificacoes
              ? 'Curtidas e comentários nas suas divulgações aparecem aqui.'
              : 'Publique serviços e capacidade da sua operação e acompanhe as divulgações das outras empresas da rede.'}
          </p>
        </div>
      </header>

      <RedeAbas />

      {abaNotificacoes ? (
        <section className="feed__lista" aria-label="Notificações">
          {notifs.length === 0 ? (
            <p className="feed__vazio">
              Nenhuma notificação ainda. Quando alguém curtir ou comentar sua divulgação, aparece aqui.
            </p>
          ) : (
            notifs.map((n) => (
              <article key={n.id} className={`feed__notif ${n.lida ? '' : 'is-nova'}`}>
                <span className="feed__notif-dot" aria-hidden />
                <div>
                  <p>{n.resumo}</p>
                  <time>{tempoRelativo(n.created_at)}</time>
                </div>
              </article>
            ))
          )}
        </section>
      ) : (
        <FeedMural
          mostrarComposer={podePublicar}
          composerEmpresa={minhaEmpresa}
          vazio="Nenhuma divulgação ainda. Publique a capacidade da sua operação."
        />
      )}
    </div>
  )
}
