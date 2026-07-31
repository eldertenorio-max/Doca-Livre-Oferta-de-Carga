import { useEffect, useMemo, useRef, useState } from 'react'
import { MapPin } from 'lucide-react'
import { useData } from '../../context/DataContext'
import { LocalizacaoVeiculoModal } from '../veiculos/LocalizacaoVeiculoModal'
import type { Transportador, Veiculo } from '../../types'
import '../../styles/mapa-frota.css'

type Props = {
  transportadorId: string
  /** Compacto para a topbar (ao lado do sininho). */
  variant?: 'panel' | 'topbar'
}

const EXPLICACAO =
  'Clique em Disponível para ver as placas cadastradas e marcar cada uma como disponível ou indisponível no Mapa da Frota.'

/** ~80 m — considera mesma origem da transportadora. */
const TOLERANCIA_COORD = 0.0008

function locDiferenteDaOrigem(v: Veiculo, t: Transportador | undefined): boolean {
  const vLat = v.origem_lat
  const vLng = v.origem_lng
  if (vLat == null || vLng == null || !Number.isFinite(vLat) || !Number.isFinite(vLng)) {
    return false
  }
  const tLat = t?.origem_lat
  const tLng = t?.origem_lng
  if (tLat == null || tLng == null || !Number.isFinite(tLat) || !Number.isFinite(tLng)) {
    // Tem localização própria e a empresa não tem origem cadastrada → destaca
    return true
  }
  return (
    Math.abs(vLat - tLat) > TOLERANCIA_COORD || Math.abs(vLng - tLng) > TOLERANCIA_COORD
  )
}

/** Disponibilidade por placa no Mapa da Frota. */
export function DisponibilidadeMapaFlag({ transportadorId, variant = 'panel' }: Props) {
  const {
    transportadores,
    veiculos,
    setDisponivelMapa,
    setDisponivelMapaVeiculo,
    salvarVeiculo,
    transportadorById,
  } = useData()
  const t = transportadores.find((x) => x.id === transportadorId)
  const [open, setOpen] = useState(false)
  const [locVeiculo, setLocVeiculo] = useState<Veiculo | null>(null)
  const rootRef = useRef<HTMLDivElement>(null)

  const placas = useMemo(
    () =>
      (veiculos ?? [])
        .filter((v) => v.transportador_id === transportadorId && v.situacao === 'ativo')
        .slice()
        .sort((a, b) => a.placa.localeCompare(b.placa)),
    [veiculos, transportadorId],
  )

  const nDisp = placas.filter((v) => v.disponivel_mapa !== false).length
  const todasDisp = placas.length > 0 && nDisp === placas.length
  const nenhumaDisp = placas.length === 0 || nDisp === 0

  useEffect(() => {
    if (!open) return
    function onDoc(e: MouseEvent) {
      // Modal de localização é portal — não fecha o painel enquanto ele estiver aberto
      if (locVeiculo) return
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false)
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && !locVeiculo) setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      document.removeEventListener('keydown', onKey)
    }
  }, [open, locVeiculo])

  if (!t) return null

  const lista = (
    <div className="disp-placas" role="dialog" aria-label="Disponibilidade por placa">
      <div className="disp-placas__head">
        <strong>Placas no mapa</strong>
        <span>
          {placas.length === 0
            ? 'Nenhuma placa cadastrada.'
            : `${nDisp} de ${placas.length} disponível(is)`}
        </span>
      </div>
      {placas.length > 0 && (
        <>
          <div className="disp-placas__bulk">
            <button
              type="button"
              className="disp-placas__bulk-btn"
              onClick={() => void setDisponivelMapa(transportadorId, true)}
            >
              Todas disponíveis
            </button>
            <button
              type="button"
              className="disp-placas__bulk-btn"
              onClick={() => void setDisponivelMapa(transportadorId, false)}
            >
              Todas indisponíveis
            </button>
          </div>
          <ul className="disp-placas__list">
            {placas.map((v) => {
              const on = v.disponivel_mapa !== false
              const foraDaOrigem = locDiferenteDaOrigem(v, t)
              return (
                <li key={v.id} className="disp-placas__row">
                  <div className="disp-placas__meta">
                    <strong>{v.placa}</strong>
                    <span>{v.tipo || 'Veículo'}</span>
                  </div>
                  <div className="disp-placas__actions">
                    <div className="disp-placas__toggle" role="group" aria-label={`Status ${v.placa}`}>
                      <button
                        type="button"
                        className={`disp-placas__btn disp-placas__btn--ok${on ? ' is-on' : ''}`}
                        aria-pressed={on}
                        onClick={() => void setDisponivelMapaVeiculo(v.id, true)}
                      >
                        Disponível
                      </button>
                      <button
                        type="button"
                        className={`disp-placas__btn disp-placas__btn--off${!on ? ' is-on' : ''}`}
                        aria-pressed={!on}
                        onClick={() => void setDisponivelMapaVeiculo(v.id, false)}
                      >
                        Indisponível
                      </button>
                    </div>
                    <button
                      type="button"
                      className={`disp-placas__loc${foraDaOrigem ? ' is-away' : ''}`}
                      title={
                        foraDaOrigem
                          ? 'Localização diferente da origem — alterar localização do veículo'
                          : 'Alterar localização do veículo'
                      }
                      aria-label={`Alterar localização do veículo ${v.placa}`}
                      onClick={() => {
                        // Snapshot completo da localização salva (não perde no reopen)
                        const fresh =
                          (veiculos ?? []).find((x) => x.id === v.id) ?? v
                        setLocVeiculo({
                          ...fresh,
                          origem_cep: fresh.origem_cep,
                          origem_cidade: fresh.origem_cidade,
                          origem_uf: fresh.origem_uf,
                          origem_endereco: fresh.origem_endereco,
                          origem_numero: fresh.origem_numero,
                          origem_bairro: fresh.origem_bairro,
                          origem_complemento: fresh.origem_complemento,
                          origem_lat: fresh.origem_lat ?? null,
                          origem_lng: fresh.origem_lng ?? null,
                          raio_km: fresh.raio_km,
                          updated_at: fresh.updated_at ?? new Date().toISOString(),
                        })
                      }}
                    >
                      <MapPin size={16} aria-hidden />
                    </button>
                  </div>
                </li>
              )
            })}
          </ul>
        </>
      )}
    </div>
  )

  // Prefere o que está no state; se o sync remoto veio sem coords, mantém o snapshot do clique
  const veiculoModal = useMemo(() => {
    if (!locVeiculo) return null
    const live = (veiculos ?? []).find((x) => x.id === locVeiculo.id)
    if (!live) return locVeiculo
    const liveTem =
      live.origem_lat != null &&
      live.origem_lng != null &&
      Number.isFinite(live.origem_lat) &&
      Number.isFinite(live.origem_lng)
    const snapTem =
      locVeiculo.origem_lat != null &&
      locVeiculo.origem_lng != null &&
      Number.isFinite(locVeiculo.origem_lat) &&
      Number.isFinite(locVeiculo.origem_lng)
    if (!liveTem && snapTem) {
      return {
        ...live,
        origem_cep: locVeiculo.origem_cep ?? live.origem_cep,
        origem_cidade: locVeiculo.origem_cidade ?? live.origem_cidade,
        origem_uf: locVeiculo.origem_uf ?? live.origem_uf,
        origem_endereco: locVeiculo.origem_endereco ?? live.origem_endereco,
        origem_numero: locVeiculo.origem_numero ?? live.origem_numero,
        origem_bairro: locVeiculo.origem_bairro ?? live.origem_bairro,
        origem_complemento: locVeiculo.origem_complemento ?? live.origem_complemento,
        origem_lat: locVeiculo.origem_lat,
        origem_lng: locVeiculo.origem_lng,
        raio_km: locVeiculo.raio_km ?? live.raio_km,
      }
    }
    return live
  }, [locVeiculo, veiculos])

  const modalLoc = (
    <LocalizacaoVeiculoModal
      key={
        veiculoModal
          ? `${veiculoModal.id}-${veiculoModal.updated_at ?? ''}-${veiculoModal.origem_lat ?? ''}-${veiculoModal.origem_lng ?? ''}`
          : 'loc-closed'
      }
      open={Boolean(locVeiculo)}
      veiculo={veiculoModal}
      transportador={
        veiculoModal?.transportador_id
          ? transportadorById(veiculoModal.transportador_id) ?? t ?? null
          : t ?? null
      }
      onClose={() => setLocVeiculo(null)}
      onSave={(patch) => {
        if (!veiculoModal) return
        const salvo = {
          ...veiculoModal,
          ...patch,
          updated_at: new Date().toISOString(),
        }
        salvarVeiculo(salvo)
        setLocVeiculo(salvo)
        setLocVeiculo(null)
      }}
    />
  )

  if (variant === 'topbar') {
    return (
      <>
        <div className="app-topbar-disp" ref={rootRef} role="group" aria-label="Disponibilidade no mapa">
          <div className="app-topbar-disp-toggle">
            <button
              type="button"
              className={`app-topbar-disp-btn app-topbar-disp-btn--ok${open || !nenhumaDisp ? ' is-on' : ''}`}
              onClick={() => setOpen((v) => !v)}
              aria-expanded={open}
              aria-haspopup="dialog"
              title="Escolher placas disponíveis"
            >
              Disponível{placas.length > 0 ? ` (${nDisp})` : ''}
            </button>
            <button
              type="button"
              className={`app-topbar-disp-btn app-topbar-disp-btn--off${nenhumaDisp && !open ? ' is-on' : ''}`}
              onClick={() => {
                void setDisponivelMapa(transportadorId, false)
                setOpen(false)
              }}
              aria-pressed={nenhumaDisp}
              title="Marcar todas as placas como indisponíveis"
            >
              Indisponível
            </button>
          </div>
          <span className="app-topbar-disp-help">
            <button
              type="button"
              className="app-topbar-disp-info"
              aria-label={EXPLICACAO}
              title={EXPLICACAO}
            >
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" aria-hidden>
                <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.75" />
                <path
                  d="M12 10.5v6M12 7.75h.01"
                  stroke="currentColor"
                  strokeWidth="1.75"
                  strokeLinecap="round"
                />
              </svg>
            </button>
            <span className="app-topbar-disp-tip" role="tooltip">
              {EXPLICACAO}
            </span>
          </span>
          {open && <div className="app-topbar-disp-panel">{lista}</div>}
        </div>
        {modalLoc}
      </>
    )
  }

  return (
    <>
      <div className="disponivel-flag" ref={rootRef} role="group" aria-label="Disponibilidade no mapa">
        <div className="disponivel-flag__label">
          <strong>Disponibilidade no Mapa da Frota</strong>
          <span>
            Clique em <em>Disponível</em> para ver as placas e marcar cada uma. Só as disponíveis
            aparecem no filtro padrão do mapa.
          </span>
        </div>
        <div className="disponivel-flag__toggle">
          <button
            type="button"
            className={`disponivel-flag__btn disponivel-flag__btn--ok${open || todasDisp ? ' is-on' : ''}`}
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
          >
            Disponível{placas.length > 0 ? ` (${nDisp}/${placas.length})` : ''}
          </button>
          <button
            type="button"
            className={`disponivel-flag__btn disponivel-flag__btn--off${nenhumaDisp && !open ? ' is-on' : ''}`}
            onClick={() => {
              void setDisponivelMapa(transportadorId, false)
              setOpen(false)
            }}
          >
            Indisponível
          </button>
        </div>
        {open && <div className="disponivel-flag__panel">{lista}</div>}
      </div>
      {modalLoc}
    </>
  )
}
