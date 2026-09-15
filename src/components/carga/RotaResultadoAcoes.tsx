import { useEffect, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Check, FileSpreadsheet, FileText, Save, Share2 } from 'lucide-react'
import {
  copiarOuCompartilharRota,
  exportarPlanilhaRota,
  googleMapsDirUrl,
  salvarRotaNesteAparelho,
  wazeRotaUrl,
  type RotaResultadoPayload,
  type RotaSalvaLocal,
} from '../../lib/rotaResultadoAcoes'
import { montarHtmlRelatorioRota } from '../../lib/rotaRelatorioHtml'
import type { Profile, Rota } from '../../types'
import { LinkSistema } from '../ui/HostLink'
import { WhatsAppIconOnGreen } from '../ui/WhatsAppIcon'
import { AjudaSuporteModal } from './AjudaSuporteModal'
import '../../styles/rota-resultado-acoes.css'

type Props = RotaResultadoPayload & {
  className?: string
  /** No sistema: grava na aba Rotas. No site público fica vazio (só o aparelho). */
  conta?: {
    user: Profile | null
    rotas: Rota[]
    salvarRota: (r: Rota) => void
  }
  onSalvouLocal?: (item: RotaSalvaLocal) => void
}

export function RotaFaleConosco({
  origem,
  destino,
}: {
  origem?: string
  destino?: string
}) {
  const [ajuda, setAjuda] = useState(false)
  return (
    <>
      <button type="button" className="rota-resultado-acoes__fale" onClick={() => setAjuda(true)}>
        <WhatsAppIconOnGreen size={18} />
        Fale conosco
      </button>
      <AjudaSuporteModal open={ajuda} onClose={() => setAjuda(false)} origem={origem} destino={destino} />
    </>
  )
}

function IconeWaze() {
  return (
    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M12 3.2c4.7 0 8.4 3.4 8.4 8.1 0 2.4-.9 4.4-2.4 6.1-.4.4-.8 1.3-.6 2 .3 1.1-.4 2.2-1.5 2.4-.4.1-.8 0-1.1-.2-.6-.4-1.3-.6-2.8-.6s-2.2.2-2.8.6c-.3.2-.7.3-1.1.2-1.1-.2-1.8-1.3-1.5-2.4.2-.7-.2-1.6-.6-2C4.5 15.7 3.6 13.7 3.6 11.3 3.6 6.6 7.3 3.2 12 3.2Z"
        fill="#33CCFF"
      />
      <circle cx="9.1" cy="11.2" r="1.4" fill="#fff" />
      <circle cx="14.9" cy="11.2" r="1.4" fill="#fff" />
      <circle cx="9.1" cy="11.35" r="0.55" fill="#0f172a" />
      <circle cx="14.9" cy="11.35" r="0.55" fill="#0f172a" />
      <path
        d="M9.4 15.1c.7.7 1.6 1.1 2.6 1.1s1.9-.4 2.6-1.1"
        stroke="#fff"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  )
}

function IconeGoogleMaps() {
  return (
    <svg width="26" height="26" viewBox="0 0 24 24" aria-hidden>
      <path
        d="M12 2.2c-3.9 0-7.1 3.1-7.1 7.2 0 5.3 7.1 12.4 7.1 12.4s7.1-7.1 7.1-12.4c0-4.1-3.2-7.2-7.1-7.2Z"
        fill="#EA4335"
      />
      <circle cx="12" cy="9.3" r="3.15" fill="#fff" />
      <path d="M12 6.4c.7 0 1.3.2 1.8.6L12 9.3V6.4Z" fill="#FBBC04" />
      <path d="M13.8 7c.5.5.8 1.2.8 2 0 .4-.1.8-.3 1.1L12 9.3l1.8-2.3Z" fill="#34A853" />
      <path d="M12 6.4c-.7 0-1.3.2-1.8.6L12 9.3V6.4Z" fill="#4285F4" />
    </svg>
  )
}

function AcaoExterna({
  href,
  title,
  className,
  children,
}: {
  href: string | null
  title: string
  className: string
  children: ReactNode
}) {
  if (href) {
    return (
      <a
        className={className}
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        title={title}
        aria-label={title}
      >
        {children}
      </a>
    )
  }
  return (
    <button type="button" className={className} title={title} aria-label={title} disabled>
      {children}
    </button>
  )
}

export function RotaResultadoAcoes(props: Props) {
  const user = props.conta?.user ?? null
  const rotas = props.conta?.rotas ?? []
  const salvarRota = props.conta?.salvarRota
  const [msg, setMsg] = useState<{ texto: string; erro?: boolean; login?: boolean } | null>(null)
  const [busy, setBusy] = useState<'share' | 'salvar' | null>(null)
  const [salvaOk, setSalvaOk] = useState(false)
  const [relatorioHtml, setRelatorioHtml] = useState<string | null>(null)

  useEffect(() => {
    if (!relatorioHtml) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setRelatorioHtml(null)
    }
    window.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = prev
      window.removeEventListener('keydown', onKey)
    }
  }, [relatorioHtml])

  const payload: RotaResultadoPayload = {
    origem: props.origem,
    destino: props.destino,
    vias: props.vias,
    origemCoords: props.origemCoords,
    destinoCoords: props.destinoCoords,
    calc: props.calc,
    tipoVeiculo: props.tipoVeiculo,
    idaEVolta: props.idaEVolta,
    preferencia: props.preferencia,
  }

  const mapsUrl = googleMapsDirUrl(payload)
  const wazeUrl = wazeRotaUrl(payload)

  function avisar(texto: string, extra?: { erro?: boolean; login?: boolean }) {
    setMsg({ texto, ...extra })
  }

  async function exportar() {
    try {
      await exportarPlanilhaRota(payload)
      avisar('Planilha baixada.')
    } catch {
      avisar('Não foi possível gerar a planilha.', { erro: true })
    }
  }

  async function salvar() {
    setBusy('salvar')
    try {
      const item = salvarRotaNesteAparelho(payload)
      props.onSalvouLocal?.(item)
      setSalvaOk(true)
      if (user && salvarRota) {
        const { chaveRota, limparPontosPassagemRota, newPontoPassagemId, newRotaId } =
          await import('../../lib/rotasSync')
        const vias = limparPontosPassagemRota(
          (payload.vias ?? []).map((v) => ({
            id: newPontoPassagemId(),
            endereco: v.endereco,
            lat: v.lat ?? null,
            lng: v.lng ?? null,
          })),
        )
        const descricao = `${payload.origem} → ${payload.destino}`.slice(0, 140)
        const chave = chaveRota({
          origem: payload.origem,
          destino: payload.destino,
          pontos_passagem: vias,
        })
        const existente = rotas.find(
          (r) =>
            chaveRota(r) === chave ||
            (r.origem.trim().toLowerCase() === payload.origem.trim().toLowerCase() &&
              r.destino.trim().toLowerCase() === payload.destino.trim().toLowerCase()),
        )
        const rota: Rota = {
          id: existente?.id ?? newRotaId(),
          descricao: existente?.descricao || descricao,
          origem: payload.origem,
          destino: payload.destino,
          origem_lat: payload.origemCoords?.lat ?? null,
          origem_lng: payload.origemCoords?.lng ?? null,
          destino_lat: payload.destinoCoords?.lat ?? null,
          destino_lng: payload.destinoCoords?.lng ?? null,
          pontos_passagem: vias,
          classificacao: existente?.classificacao ?? 'B',
          frete_tabela:
            existente?.frete_tabela ??
            payload.calc.piso_selecionado ??
            payload.calc.rota.custo_total,
          km: payload.calc.rota.distancia_km,
          situacao: 'ativo',
        }
        salvarRota(rota)
        avisar(`Rota “${rota.descricao}” salva na aba Rotas.`)
      } else {
        avisar('Rota salva neste aparelho. Abra de novo em Trajeto → Salvas.')
      }
    } catch (e) {
      setSalvaOk(false)
      avisar(e instanceof Error ? e.message : 'Não foi possível salvar a rota.', { erro: true })
    } finally {
      setBusy(null)
    }
  }

  function relatorio() {
    setRelatorioHtml(montarHtmlRelatorioRota(payload))
    avisar('Marque o que quer ver, imprimir ou salvar como PDF.')
  }

  async function compartilhar() {
    setBusy('share')
    const res = await copiarOuCompartilharRota(payload)
    if (!res.ok) avisar(res.erro, { erro: true })
    else if (res.via === 'clipboard') avisar('Resumo copiado. Cole onde quiser compartilhar.')
    else avisar('Rota compartilhada.')
    setBusy(null)
  }

  return (
    <div className={`rota-resultado-acoes${props.className ? ` ${props.className}` : ''}`}>
      <div className="rota-resultado-acoes__bar" role="toolbar" aria-label="Ações da rota">
        <AcaoExterna
          href={mapsUrl}
          title="Abrir rota no Google Maps"
          className="rota-resultado-acoes__btn rota-resultado-acoes__btn--maps"
        >
          <IconeGoogleMaps />
        </AcaoExterna>
        <AcaoExterna
          href={wazeUrl}
          title="Abrir rota no Waze"
          className="rota-resultado-acoes__btn rota-resultado-acoes__btn--waze"
        >
          <IconeWaze />
        </AcaoExterna>
        <button
          type="button"
          className="rota-resultado-acoes__btn rota-resultado-acoes__btn--share"
          title="Compartilhar rota"
          aria-label="Compartilhar rota"
          disabled={busy === 'share'}
          onClick={() => void compartilhar()}
        >
          <Share2 size={26} strokeWidth={2.1} />
        </button>
        <button
          type="button"
          className={`rota-resultado-acoes__btn rota-resultado-acoes__btn--save${salvaOk ? ' is-ok' : ''}`}
          title={salvaOk ? 'Rota salva neste aparelho' : 'Salvar rota'}
          aria-label={salvaOk ? 'Rota salva neste aparelho' : 'Salvar rota'}
          disabled={busy === 'salvar'}
          onClick={() => void salvar()}
        >
          {salvaOk ? <Check size={26} strokeWidth={2.4} /> : <Save size={26} strokeWidth={2.1} />}
        </button>
        <button
          type="button"
          className="rota-resultado-acoes__btn rota-resultado-acoes__btn--pdf"
          title="Relatório: escolher seções, imprimir ou salvar PDF"
          aria-label="Relatório: escolher seções, imprimir ou salvar PDF"
          onClick={() => relatorio()}
        >
          <FileText size={26} strokeWidth={2.1} />
        </button>
        <button
          type="button"
          className="rota-resultado-acoes__btn rota-resultado-acoes__btn--excel"
          title="Exportar para planilha"
          aria-label="Exportar para planilha"
          onClick={() => void exportar()}
        >
          <FileSpreadsheet size={26} strokeWidth={2.1} />
        </button>
      </div>
      {msg ? (
        <p className={`rota-resultado-acoes__msg${msg.erro ? ' is-erro' : ''}`}>
          {msg.texto}
          {msg.login ? (
            <>
              {' '}
              <LinkSistema to="/login">Entre</LinkSistema> para ver na aba Rotas.
            </>
          ) : null}
        </p>
      ) : null}
      {relatorioHtml
        ? createPortal(
            <div className="rota-relatorio-overlay" role="dialog" aria-modal="true" aria-label="Relatório da rota">
              <div className="rota-relatorio-overlay__top">
                <strong>Relatório da rota</strong>
                <button type="button" onClick={() => setRelatorioHtml(null)}>
                  Fechar
                </button>
              </div>
              <iframe className="rota-relatorio-overlay__frame" title="Relatório da rota" srcDoc={relatorioHtml} />
            </div>,
            document.body,
          )
        : null}
    </div>
  )
}
