import { createPortal } from 'react-dom'
import { Briefcase, Mail, MapPin, Phone, X } from 'lucide-react'
import type { Transportador } from '../../types'
import { formatPhoneBr } from '../../lib/phoneBr'
import { formatCnpj } from '../../lib/cnpj'

type Props = {
  transportador: Transportador
  veiculosCount?: number
  motoristasCount?: number
  onClose: () => void
  onLocalizar?: () => void
}

function iniciais(nome: string) {
  return nome
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('')
}

function whatsappLink(raw?: string | null) {
  const d = (raw || '').replace(/\D/g, '')
  if (d.length < 10) return null
  const full = d.startsWith('55') ? d : `55${d}`
  return `https://wa.me/${full}`
}

export function TransportadorPerfilSite({
  transportador: t,
  veiculosCount = 0,
  motoristasCount = 0,
  onClose,
  onLocalizar,
}: Props) {
  const tel = t.contato_telefone || t.telefone
  const wa = whatsappLink(tel)
  const cidade = [t.origem_cidade || t.cidade, t.origem_uf || t.uf].filter(Boolean).join(' / ')
  const endereco = [
    t.origem_endereco || t.endereco,
    t.origem_numero || t.numero,
    t.origem_bairro || t.bairro,
    cidade,
  ]
    .filter(Boolean)
    .join(', ')

  return createPortal(
    <div className="transp-perfil" role="dialog" aria-modal="true" onClick={onClose}>
      <article className="transp-perfil__site" onClick={(e) => e.stopPropagation()}>
        <header className="transp-perfil__hero">
          <button type="button" className="transp-perfil__close" aria-label="Fechar" onClick={onClose}>
            <X size={18} />
          </button>
          <div className="transp-perfil__brand">
            <div className="transp-perfil__logo">
              {t.logo_url ? (
                <img src={t.logo_url} alt="" />
              ) : (
                <span>{iniciais(t.nome_fantasia || t.razao_social)}</span>
              )}
            </div>
            <div>
              <h2>{t.nome_fantasia || t.razao_social}</h2>
              <p>{t.razao_social}</p>
              <div className="transp-perfil__chips">
                <span className="transp-perfil__chip">{t.classificacao}</span>
                <span className="transp-perfil__chip">{t.situacao}</span>
                {cidade ? <span className="transp-perfil__chip">{cidade}</span> : null}
                {t.raio_km ? <span className="transp-perfil__chip">Raio {t.raio_km} km</span> : null}
              </div>
            </div>
          </div>
        </header>

        <div className="transp-perfil__body">
          <section className="transp-perfil__section">
            <h3>Sobre a transportadora</h3>
            <p>
              {t.nome_fantasia || t.razao_social} atua no transporte de cargas
              {cidade ? ` com base em ${cidade}` : ''}.
              {t.raio_km
                ? ` Atende carregamentos em um raio de até ${t.raio_km} km a partir da origem.`
                : ''}{' '}
              Cadastro {t.situacao === 'ativo' ? 'ativo' : t.situacao} na plataforma Doca Livre.
            </p>
          </section>

          <div className="transp-perfil__grid">
            <div className="transp-perfil__stat">
              <strong>{t.pontuacao}</strong>
              <span>Pontuação</span>
            </div>
            <div className="transp-perfil__stat">
              <strong>{veiculosCount}</strong>
              <span>Veículos</span>
            </div>
            <div className="transp-perfil__stat">
              <strong>{motoristasCount}</strong>
              <span>Motoristas</span>
            </div>
            <div className="transp-perfil__stat">
              <strong>{(t.classificacao || '—').toUpperCase()}</strong>
              <span>Classificação</span>
            </div>
          </div>

          <section className="transp-perfil__section">
            <h3>Contato</h3>
            <ul>
              {t.contato_nome ? <li>Contato: {t.contato_nome}</li> : null}
              {tel ? <li>Telefone / WhatsApp: {formatPhoneBr(tel)}</li> : null}
              {t.email ? <li>E-mail: {t.email}</li> : null}
              {t.cnpj ? <li>CNPJ: {formatCnpj(t.cnpj)}</li> : null}
              {t.rntrc ? <li>RNTRC: {t.rntrc}</li> : null}
            </ul>
          </section>

          <section className="transp-perfil__section">
            <h3>Localização</h3>
            <p>{endereco || 'Endereço não informado.'}</p>
          </section>

          <div className="transp-perfil__cta">
            {wa ? (
              <a href={wa} target="_blank" rel="noreferrer">
                <Phone size={16} /> WhatsApp
              </a>
            ) : null}
            {t.email ? (
              <a href={`mailto:${t.email}`}>
                <Mail size={16} /> E-mail
              </a>
            ) : null}
            {onLocalizar ? (
              <button type="button" onClick={onLocalizar}>
                <MapPin size={16} /> Localizar no mapa
              </button>
            ) : null}
            <button type="button" onClick={onClose}>
              <Briefcase size={16} /> Fechar perfil
            </button>
          </div>
        </div>
      </article>
    </div>,
    document.body,
  )
}
