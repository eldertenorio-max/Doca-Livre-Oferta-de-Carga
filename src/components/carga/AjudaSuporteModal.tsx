import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { ChevronDown, Mail, Search, X } from 'lucide-react'
import { filtrarAjudaFaq } from '../../lib/ajudaFaq'
import { EMAIL_SUPORTE_DOCA, hrefEmailSuporte } from '../../lib/suporteContato'
import { hrefWhatsappSuporte } from '../../lib/whatsappSuporte'
import { WhatsAppIconOnGreen } from '../ui/WhatsAppIcon'
import '../../styles/ajuda-suporte.css'

type Props = {
  open: boolean
  onClose: () => void
  origem?: string
  destino?: string
  pagina?: string
}

export function AjudaSuporteModal({ open, onClose, origem, destino, pagina }: Props) {
  const [busca, setBusca] = useState('')
  const [aberta, setAberta] = useState<string | null>(null)
  const [nome, setNome] = useState('')
  const [email, setEmail] = useState('')
  const [mensagem, setMensagem] = useState('')
  const [aviso, setAviso] = useState('')

  const itens = useMemo(() => filtrarAjudaFaq(busca), [busca])

  useEffect(() => {
    if (!open) return
    setBusca('')
    setAberta(null)
    setAviso('')
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = prev
      window.removeEventListener('keydown', onKey)
    }
  }, [open, onClose])

  if (!open || typeof document === 'undefined') return null

  function enviarEmail() {
    const msg = mensagem.trim()
    if (msg.length < 8) {
      setAviso('Escreva o que aconteceu (pelo menos algumas palavras).')
      return
    }
    setAviso('')
    window.location.href = hrefEmailSuporte({
      nome,
      email,
      mensagem: msg,
      origem,
      destino,
    })
  }

  return createPortal(
    <div className="ajuda-suporte" role="presentation">
      <button type="button" className="ajuda-suporte__backdrop" aria-label="Fechar" onClick={onClose} />
      <div
        className="ajuda-suporte__card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="ajuda-suporte-title"
      >
        <header className="ajuda-suporte__head">
          <h2 id="ajuda-suporte-title">Perguntas Frequentes</h2>
          <button type="button" className="ajuda-suporte__fechar" onClick={onClose} aria-label="Fechar ajuda">
            <X size={18} />
          </button>
        </header>

        <label className="ajuda-suporte__busca">
          <Search size={16} aria-hidden />
          <input
            type="search"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Pesquisar no sistema…"
            autoComplete="off"
          />
        </label>

        <div className="ajuda-suporte__body">
          <div className="ajuda-suporte__lista">
            {itens.length === 0 ? (
              <p className="ajuda-suporte__vazio">Nenhuma pergunta encontrada para “{busca.trim()}”.</p>
            ) : (
              itens.map((item) => {
                const on = aberta === item.id
                return (
                  <article key={item.id} className={`ajuda-faq${on ? ' is-open' : ''}`}>
                    <button
                      type="button"
                      className="ajuda-faq__btn"
                      aria-expanded={on}
                      onClick={() => setAberta(on ? null : item.id)}
                    >
                      <span className="ajuda-faq__icon" aria-hidden>
                        ?
                      </span>
                      <span className="ajuda-faq__q">{item.pergunta}</span>
                      <ChevronDown size={18} className="ajuda-faq__chev" aria-hidden />
                    </button>
                    {on ? <p className="ajuda-faq__a">{item.resposta}</p> : null}
                  </article>
                )
              })
            )}
          </div>

          <section className="ajuda-suporte__contato" aria-labelledby="ajuda-contato-title">
            <h3 id="ajuda-contato-title">Não encontrou? Fale com a gente</h3>
            <p>
              Relate um problema para <strong>{EMAIL_SUPORTE_DOCA}</strong> ou chame no WhatsApp.
            </p>
            <a
              className="ajuda-suporte__whats"
              href={hrefWhatsappSuporte({
                origem,
                destino,
                pagina,
              })}
              target="_blank"
              rel="noopener noreferrer"
            >
              <WhatsAppIconOnGreen size={18} />
              Chamar no WhatsApp
            </a>

            <form
              className="ajuda-suporte__form"
              onSubmit={(e) => {
                e.preventDefault()
                enviarEmail()
              }}
            >
              <label>
                Seu nome
                <input value={nome} onChange={(e) => setNome(e.target.value)} autoComplete="name" />
              </label>
              <label>
                Seu e-mail
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="email"
                  placeholder="para respondermos"
                />
              </label>
              <label>
                Relato
                <textarea
                  rows={4}
                  value={mensagem}
                  onChange={(e) => setMensagem(e.target.value)}
                  placeholder="Descreva o problema ou a dúvida…"
                />
              </label>
              {aviso ? <p className="ajuda-suporte__aviso">{aviso}</p> : null}
              <button type="submit" className="ajuda-suporte__mail">
                <Mail size={16} />
                Enviar e-mail
              </button>
            </form>
          </section>
        </div>
      </div>
    </div>,
    document.body,
  )
}
