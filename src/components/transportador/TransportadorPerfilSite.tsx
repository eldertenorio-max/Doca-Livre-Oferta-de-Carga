import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { ChevronLeft, ChevronRight, ExternalLink, Mail, MapPin, X } from 'lucide-react'
import type { Transportador } from '../../types'
import { formatCnpj } from '../../lib/cnpj'
import { formatPhoneBr } from '../../lib/phoneBr'
import { normalizePerfilPublico } from '../../lib/perfilPublicoTransportador'
import { PontoMapPreview } from '../ui/PontoMapPreview'
import '../../styles/transportador-perfil-site.css'

type Props = {
  transportador: Transportador
  veiculosCount?: number
  motoristasCount?: number
  onClose: () => void
  onLocalizar?: () => void
  /** Se false, renderiza embutido (sem portal/overlay). */
  asModal?: boolean
}

function whatsappLink(raw?: string | null) {
  const d = (raw || '').replace(/\D/g, '')
  if (d.length < 10) return null
  const full = d.startsWith('55') ? d : `55${d}`
  return `https://wa.me/${full}`
}

function formatCepBr(cep?: string | null): string {
  const d = (cep || '').replace(/\D/g, '').slice(0, 8)
  if (d.length !== 8) return (cep || '').trim()
  return `${d.slice(0, 5)}-${d.slice(5)}`
}

/** Endereço completo (origem operacional, com fallback do cadastro CNPJ). */
function enderecoCompletoTransportador(t: Transportador): string {
  const rua = (t.origem_endereco || t.endereco || '').trim()
  const numero = (t.origem_numero || t.numero || '').trim()
  const complem = (t.origem_complemento || t.complemento || '').trim()
  const bairro = (t.origem_bairro || t.bairro || '').trim()
  const cidade = (t.origem_cidade || t.cidade || '').trim()
  const uf = (t.origem_uf || t.uf || '').trim().toUpperCase()
  const cepRaw = (t.origem_cep || t.cep || '').trim()
  const cep = formatCepBr(cepRaw)

  const logradouro = [rua, numero].filter(Boolean).join(', ')
  const partes: string[] = []
  if (logradouro) partes.push(logradouro)
  if (complem) partes.push(complem)
  if (bairro) partes.push(bairro)
  const cidadeUf = [cidade, uf].filter(Boolean).join(' / ')
  if (cidadeUf) partes.push(cidadeUf)
  if (cep) partes.push(`CEP ${cep}`)
  return partes.join(' · ')
}

export function TransportadorPerfilSite({
  transportador: t,
  onClose,
  onLocalizar,
  asModal = true,
}: Props) {
  const perfil = normalizePerfilPublico(t.perfil_publico)
  const galeria = perfil.galeria.filter(Boolean).slice(0, 5)
  const [fotoZoomIdx, setFotoZoomIdx] = useState<number | null>(null)
  const fotoZoom =
    fotoZoomIdx != null && galeria[fotoZoomIdx] ? galeria[fotoZoomIdx] : null

  function abrirFoto(index: number) {
    if (index < 0 || index >= galeria.length) return
    setFotoZoomIdx(index)
  }

  function fotoAnterior(e?: { stopPropagation?: () => void }) {
    e?.stopPropagation?.()
    if (fotoZoomIdx == null || galeria.length < 2) return
    setFotoZoomIdx((fotoZoomIdx - 1 + galeria.length) % galeria.length)
  }

  function fotoProxima(e?: { stopPropagation?: () => void }) {
    e?.stopPropagation?.()
    if (fotoZoomIdx == null || galeria.length < 2) return
    setFotoZoomIdx((fotoZoomIdx + 1) % galeria.length)
  }
  const cidadeUf = [t.origem_cidade || t.cidade, t.origem_uf || t.uf]
    .filter(Boolean)
    .join('-')
  const titulo = `${t.nome_fantasia || t.razao_social}${cidadeUf ? ` ${cidadeUf}` : ''}`
  const tel = t.contato_telefone || t.telefone
  const wa = whatsappLink(tel)
  const temEspecialidades = perfil.especialidades.length > 0
  const temServicos = perfil.servicos.length > 0
  const temReferencias = Boolean(perfil.referencias.trim())
  const lat = t.origem_lat ?? null
  const lng = t.origem_lng ?? null
  const temCoords =
    lat != null && lng != null && Number.isFinite(lat) && Number.isFinite(lng)
  const localTxt = [t.origem_cidade || t.cidade, t.origem_uf || t.uf]
    .filter(Boolean)
    .join('/')
  const enderecoCompleto = enderecoCompletoTransportador(t)
  const mapsUrl = temCoords
    ? `https://www.google.com/maps?q=${lat},${lng}`
    : enderecoCompleto || localTxt
      ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
          enderecoCompleto || localTxt,
        )}`
      : null

  useEffect(() => {
    if (!asModal) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [asModal])

  useEffect(() => {
    if (fotoZoomIdx == null) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setFotoZoomIdx(null)
      if (e.key === 'ArrowLeft') fotoAnterior()
      if (e.key === 'ArrowRight') fotoProxima()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- handlers usam state fechado no momento
  }, [fotoZoomIdx, galeria.length])

  const content = (
    <article
      className={`tv-perfil${asModal ? ' tv-perfil--fullscreen' : ' tv-perfil--embed'}`}
      onClick={(e) => e.stopPropagation()}
    >
      <header className="tv-perfil__top">
        {asModal ? (
          <button type="button" className="tv-perfil__close" aria-label="Fechar" onClick={onClose}>
            <X size={18} />
          </button>
        ) : null}
        <div className="tv-perfil__brand-row">
          {t.logo_url ? (
            <img className="tv-perfil__logo" src={t.logo_url} alt="" />
          ) : (
            <div className="tv-perfil__logo tv-perfil__logo--empty" aria-hidden>
              {(t.nome_fantasia || '?').slice(0, 1).toUpperCase()}
            </div>
          )}
          <div className="tv-perfil__titles">
            <h1>{titulo}</h1>
            <p className="tv-perfil__especialidades">
              {temEspecialidades
                ? perfil.especialidades.join(' · ')
                : 'Nenhuma especialidade cadastrada'}
            </p>
          </div>
        </div>
        <p className="tv-perfil__meta">
          <strong>RAZÃO SOCIAL:</strong> {t.razao_social || '—'}
          {t.cnpj ? (
            <>
              {' '}
              - <strong>CNPJ:</strong> {formatCnpj(t.cnpj)}
            </>
          ) : null}
          {t.inscricao_estadual ? (
            <>
              {' '}
              - <strong>I.E.:</strong> {t.inscricao_estadual}
            </>
          ) : null}
        </p>
      </header>

      <div className="tv-perfil__body">
        <div className="tv-perfil__main">
          <section className="tv-perfil__section">
            <h2>Apresentação</h2>
            {perfil.apresentacao ? (
              <p>{perfil.apresentacao}</p>
            ) : (
              <p className="tv-perfil__empty">Sem informações</p>
            )}
          </section>

          <section className="tv-perfil__section">
            <h2>Serviços</h2>
            {perfil.servicos_intro ? <p>{perfil.servicos_intro}</p> : null}
            {temServicos ? (
              <ul>
                {perfil.servicos.map((s) => (
                  <li key={s}>{s}</li>
                ))}
              </ul>
            ) : !perfil.servicos_intro ? (
              <p className="tv-perfil__empty">Sem informações</p>
            ) : null}
          </section>

          {perfil.cobertura ? (
            <section className="tv-perfil__section">
              <h2>Cobertura</h2>
              <p>{perfil.cobertura}</p>
            </section>
          ) : null}

          <section className="tv-perfil__section">
            <h2>Referências</h2>
            {temReferencias ? (
              <p className="tv-perfil__pre">{perfil.referencias}</p>
            ) : (
              <p className="tv-perfil__empty">Sem informações</p>
            )}
          </section>

          <section className="tv-perfil__section">
            <h2>Contato</h2>
            <ul className="tv-perfil__contato">
              {t.contato_nome ? <li>Contato: {t.contato_nome}</li> : null}
              {tel ? <li>Telefone / WhatsApp: {formatPhoneBr(tel)}</li> : null}
              {t.email ? <li>E-mail: {t.email}</li> : null}
              {t.rntrc ? <li>RNTRC: {t.rntrc}</li> : null}
              {enderecoCompleto ? (
                <li className="tv-perfil__endereco">
                  <MapPin size={14} aria-hidden />
                  <span>
                    <strong>Endereço:</strong> {enderecoCompleto}
                  </span>
                </li>
              ) : null}
              {!tel && !t.email && !t.contato_nome && !enderecoCompleto ? (
                <li className="tv-perfil__empty">Sem informações</li>
              ) : null}
            </ul>
          </section>

          <div className="tv-perfil__actions">
            {wa ? (
              <a className="tv-perfil__btn tv-perfil__btn--wa" href={wa} target="_blank" rel="noreferrer">
                WhatsApp
              </a>
            ) : null}
            {t.email ? (
              <a
                className="tv-perfil__btn tv-perfil__btn--mail"
                href={`mailto:${t.email}?subject=${encodeURIComponent(
                  `Contato — ${t.nome_fantasia || t.razao_social}`,
                )}`}
              >
                <Mail size={14} /> Enviar e-mail
              </a>
            ) : null}
            {perfil.site_url ? (
              <a
                className="tv-perfil__btn"
                href={perfil.site_url}
                target="_blank"
                rel="noreferrer"
              >
                <ExternalLink size={14} /> Site
              </a>
            ) : null}
            {onLocalizar ? (
              <button type="button" className="tv-perfil__btn" onClick={onLocalizar}>
                <MapPin size={14} /> Localizar no mapa
              </button>
            ) : null}
            {asModal ? (
              <button type="button" className="tv-perfil__btn tv-perfil__btn--ghost" onClick={onClose}>
                Fechar
              </button>
            ) : null}
          </div>
        </div>

        <aside className="tv-perfil__mapa">
          <div className="tv-perfil__mapa-card">
            <div className="tv-perfil__mapa-head">
              <h2>Mapa de localização</h2>
              {mapsUrl ? (
                <a
                  className="tv-perfil__mapa-open"
                  href={mapsUrl}
                  target="_blank"
                  rel="noreferrer"
                >
                  <ExternalLink size={13} /> Abrir no Maps
                </a>
              ) : null}
            </div>
            {temCoords ? (
              <>
                <PontoMapPreview
                  lat={lat}
                  lng={lng}
                  raioKm={Number(t.raio_km) > 0 ? Number(t.raio_km) : null}
                  height={480}
                  className="tv-perfil__mapa-preview"
                />
                <p className="tv-perfil__mapa-meta">
                  {enderecoCompleto || localTxt || 'Origem cadastrada'}
                  {Number(t.raio_km) > 0 ? ` · raio ${t.raio_km} km` : ''}
                </p>
              </>
            ) : (
              <p className="tv-perfil__mapa-empty">
                Esta transportadora ainda não tem coordenadas de origem no mapa.
              </p>
            )}

            {galeria.length > 0 ? (
              <div className="tv-perfil__galeria">
                <h3 className="tv-perfil__galeria-title">Galeria</h3>
                <div className="tv-perfil__galeria-grid">
                  {galeria.map((src, i) => (
                    <button
                      key={`${i}-${src.slice(0, 24)}`}
                      type="button"
                      className="tv-perfil__galeria-item"
                      onClick={() => abrirFoto(i)}
                      title="Ampliar"
                    >
                      <img src={src} alt={`Foto da empresa ${i + 1}`} />
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        </aside>
      </div>

      {fotoZoom && fotoZoomIdx != null
        ? createPortal(
            <div
              className="tv-perfil__lightbox"
              role="dialog"
              aria-modal="true"
              aria-label={`Foto ${fotoZoomIdx + 1} de ${galeria.length}`}
              onClick={() => setFotoZoomIdx(null)}
            >
              <button
                type="button"
                className="tv-perfil__lightbox-close"
                aria-label="Fechar foto"
                onClick={(e) => {
                  e.stopPropagation()
                  setFotoZoomIdx(null)
                }}
              >
                <X size={22} />
              </button>

              <div
                className="tv-perfil__lightbox-frame"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="tv-perfil__lightbox-photo-wrap">
                  {/* Setas sempre sobre a imagem — não dependem da largura da tela */}
                  {galeria.length > 1 ? (
                    <>
                      <button
                        type="button"
                        className="tv-perfil__lightbox-arrow tv-perfil__lightbox-arrow--left"
                        aria-label="Foto anterior"
                        onClick={(e) => {
                          e.stopPropagation()
                          fotoAnterior()
                        }}
                      >
                        <ChevronLeft size={32} strokeWidth={2.5} />
                        <span className="tv-perfil__lightbox-arrow-fallback" aria-hidden>
                          ‹
                        </span>
                      </button>
                      <button
                        type="button"
                        className="tv-perfil__lightbox-arrow tv-perfil__lightbox-arrow--right"
                        aria-label="Próxima foto"
                        onClick={(e) => {
                          e.stopPropagation()
                          fotoProxima()
                        }}
                      >
                        <ChevronRight size={32} strokeWidth={2.5} />
                        <span className="tv-perfil__lightbox-arrow-fallback" aria-hidden>
                          ›
                        </span>
                      </button>
                    </>
                  ) : null}

                  <img src={fotoZoom} alt={`Foto ampliada ${fotoZoomIdx + 1}`} />
                </div>

                {galeria.length > 1 ? (
                  <>
                    <p className="tv-perfil__lightbox-count">
                      {fotoZoomIdx + 1} / {galeria.length}
                    </p>
                    <div className="tv-perfil__lightbox-thumbs">
                      {galeria.map((src, i) => (
                        <button
                          key={`lb-${i}`}
                          type="button"
                          className={`tv-perfil__lightbox-thumb${
                            i === fotoZoomIdx ? ' is-on' : ''
                          }`}
                          onClick={() => setFotoZoomIdx(i)}
                          aria-label={`Ir para foto ${i + 1}`}
                        >
                          <img src={src} alt="" />
                        </button>
                      ))}
                    </div>
                  </>
                ) : null}
              </div>
            </div>,
            document.body,
          )
        : null}
    </article>
  )

  if (!asModal) return content

  return createPortal(
    <div className="tv-perfil-overlay" role="dialog" aria-modal="true" onClick={onClose}>
      {content}
    </div>,
    document.body,
  )
}
