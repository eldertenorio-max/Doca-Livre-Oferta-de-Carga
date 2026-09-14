import { useState } from 'react'
import { FileSpreadsheet, FileText, MapPin, Save, Share2 } from 'lucide-react'
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

function IconeWaze() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M12 3.2c4.7 0 8.4 3.4 8.4 8.1 0 2.4-.9 4.4-2.4 6.1-.4.4-.8 1.3-.6 2 .3 1.1-.4 2.2-1.5 2.4-.4.1-.8 0-1.1-.2-.6-.4-1.3-.6-2.8-.6s-2.2.2-2.8.6c-.3.2-.7.3-1.1.2-1.1-.2-1.8-1.3-1.5-2.4.2-.7-.2-1.6-.6-2C4.5 15.7 3.6 13.7 3.6 11.3 3.6 6.6 7.3 3.2 12 3.2Z"
        fill="currentColor"
      />
      <circle cx="9.1" cy="11.2" r="1.35" fill="#fff" />
      <circle cx="14.9" cy="11.2" r="1.35" fill="#fff" />
      <path
        d="M9.4 15.1c.7.7 1.6 1.1 2.6 1.1s1.9-.4 2.6-1.1"
        stroke="#fff"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
    </svg>
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
        <button
          type="button"
          className="rota-resultado-acoes__btn"
          title="Exportar para planilha"
          aria-label="Exportar para planilha"
          onClick={() => void exportar()}
        >
          <FileSpreadsheet size={20} strokeWidth={1.8} />
        </button>
        <button
          type="button"
          className="rota-resultado-acoes__btn"
          title="Salvar rota"
          aria-label="Salvar rota"
          disabled={busy === 'salvar'}
          onClick={() => void salvar()}
        >
          <Save size={20} strokeWidth={1.8} />
        </button>
        <button
          type="button"
          className="rota-resultado-acoes__btn"
          title="Abrir relatório da rota"
          aria-label="Abrir relatório da rota"
          disabled={busy === 'relatorio'}
          onClick={() => void relatorio()}
        >
          <FileText size={20} strokeWidth={1.8} />
        </button>
        <button
          type="button"
          className="rota-resultado-acoes__btn"
          title="Compartilhar rota"
          aria-label="Compartilhar rota"
          disabled={busy === 'share'}
          onClick={() => void compartilhar()}
        >
          <Share2 size={20} strokeWidth={1.8} />
        </button>
        {wazeUrl ? (
          <a
            className="rota-resultado-acoes__btn"
            href={wazeUrl}
            target="_blank"
            rel="noopener noreferrer"
            title="Abrir rota no Waze"
            aria-label="Abrir rota no Waze"
          >
            <IconeWaze />
          </a>
        ) : (
          <button
            type="button"
            className="rota-resultado-acoes__btn"
            title="Abrir rota no Waze"
            aria-label="Abrir rota no Waze"
            disabled
          >
            <IconeWaze />
          </button>
        )}
        {mapsUrl ? (
          <a
            className="rota-resultado-acoes__btn"
            href={mapsUrl}
            target="_blank"
            rel="noopener noreferrer"
            title="Abrir rota no Google Maps"
            aria-label="Abrir rota no Google Maps"
          >
            <MapPin size={20} strokeWidth={1.8} />
          </a>
        ) : (
          <button
            type="button"
            className="rota-resultado-acoes__btn"
            title="Abrir rota no Google Maps"
            aria-label="Abrir rota no Google Maps"
            disabled
          >
            <MapPin size={20} strokeWidth={1.8} />
          </button>
        )}
      </div>
      <a
        className="rota-resultado-acoes__fale"
        href={hrefWhatsappSuporte({ origem: payload.origem, destino: payload.destino })}
        target="_blank"
        rel="noopener noreferrer"
      >
        <WhatsAppIconOnGreen size={18} />
        Fale conosco
      </a>
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
