import { useState, type ReactNode } from 'react'
import { FileSpreadsheet, FileText, Save, Share2 } from 'lucide-react'
import {
  copiarOuCompartilharRota,
  exportarPlanilhaRota,
  googleMapsDirUrl,
  salvarRotaNesteAparelho,
  wazeRotaUrl,
  type RotaResultadoPayload,
} from '../../lib/rotaResultadoAcoes'
import { abrirRelatorioRota } from '../../lib/rotaRelatorioPdf'
import type { Profile, Rota } from '../../types'
import { LinkSistema } from '../ui/HostLink'
import { WhatsAppIconOnGreen } from '../ui/WhatsAppIcon'
import { hrefWhatsappSuporte } from '../../lib/whatsappSuporte'
import '../../styles/rota-resultado-acoes.css'

type Props = RotaResultadoPayload & {
  className?: string
  /** No sistema: grava na aba Rotas. No site público fica vazio (só o aparelho). */
  conta?: {
    user: Profile | null
    rotas: Rota[]
    salvarRota: (r: Rota) => void
  }
}

export function RotaFaleConosco({
  origem,
  destino,
}: {
  origem?: string
  destino?: string
}) {
  return (
    <a
      className="rota-resultado-acoes__fale"
      href={hrefWhatsappSuporte({ origem, destino })}
      target="_blank"
      rel="noopener noreferrer"
    >
      <WhatsAppIconOnGreen size={18} />
      Fale conosco
    </a>
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
  const [busy, setBusy] = useState<'relatorio' | 'share' | 'salvar' | null>(null)

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
        salvarRotaNesteAparelho(payload)
        avisar('Rota salva neste aparelho.', { login: true })
      }
    } catch {
      avisar('Não foi possível salvar a rota.', { erro: true })
    } finally {
      setBusy(null)
    }
  }

  async function relatorio() {
    setBusy('relatorio')
    try {
      await abrirRelatorioRota(payload)
      avisar('Relatório aberto.')
    } catch {
      avisar('Não foi possível abrir o relatório.', { erro: true })
    } finally {
      setBusy(null)
    }
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
          className="rota-resultado-acoes__btn rota-resultado-acoes__btn--save"
          title="Salvar rota"
          aria-label="Salvar rota"
          disabled={busy === 'salvar'}
          onClick={() => void salvar()}
        >
          <Save size={26} strokeWidth={2.1} />
        </button>
        <button
          type="button"
          className="rota-resultado-acoes__btn rota-resultado-acoes__btn--pdf"
          title="Abrir relatório da rota"
          aria-label="Abrir relatório da rota"
          disabled={busy === 'relatorio'}
          onClick={() => void relatorio()}
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
    </div>
  )
}
