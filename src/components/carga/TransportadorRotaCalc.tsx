import { useEffect, useMemo, useRef, useState } from 'react'
import { ArrowUpDown, Calculator, Fuel, Minus, Plus } from 'lucide-react'
import { formatCurrency, roundMoney } from '../../lib/businessRules'
import {
  calcularRotaOperacional,
  consumoPadraoKmL,
  eixosDoVeiculo,
  PRECO_DIESEL_SUGERIDO,
  type AnttCalculo,
  type PreferenciaRota,
} from '../../lib/anttFrete'
import { limparPontosPassagemRota } from '../../lib/rotasSync'
import type { Carga, PontoPassagemRota } from '../../types'
import { useData } from '../../context/DataContext'
import { AddressSuggestInput, PLACEHOLDER_ENDERECO_EXEMPLO } from '../ui/AddressSuggestInput'
import { Button, Field, Modal, inputClass } from '../ui/Modal'
import { AnttFretePanel } from './AnttFretePanel'
import { RotaMapPreview } from './RotaMapPreview'

type Props = {
  carga: Carga | null
  open: boolean
  onClose: () => void
}

type CalcParams = {
  origem: string
  destino: string
  eixos: number
  consumo: string
  preco: string
  volta: boolean
  pref: PreferenciaRota
  waypoints?: PontoPassagemRota[]
}

function parseNumBr(raw: string, fallback: number): number {
  const n = Number(String(raw).trim().replace(/\./g, '').replace(',', '.'))
  return Number.isFinite(n) && n > 0 ? n : fallback
}

function fmtConsumo(n: number): string {
  return String(n).replace('.', ',')
}

function fmtDiesel(n: number): string {
  return n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function pontosDaCarga(
  carga: Carga,
  rotas: { id: string; pontos_passagem?: PontoPassagemRota[] }[],
): PontoPassagemRota[] {
  const daCarga = limparPontosPassagemRota(carga.pontos_passagem)
  if (daCarga.length > 0) return daCarga
  if (!carga.rota_id) return []
  const r = rotas.find((x) => x.id === carga.rota_id)
  return limparPontosPassagemRota(r?.pontos_passagem)
}

export function TransportadorRotaCalc({ carga, open, onClose }: Props) {
  const { rotas } = useData()
  const rotasRef = useRef(rotas)
  rotasRef.current = rotas
  const [origem, setOrigem] = useState('')
  const [destino, setDestino] = useState('')
  const [waypoints, setWaypoints] = useState<PontoPassagemRota[]>([])
  const [eixos, setEixos] = useState(5)
  const [consumo, setConsumo] = useState('3,2')
  const [precoDiesel, setPrecoDiesel] = useState(fmtDiesel(PRECO_DIESEL_SUGERIDO))
  const [idaEVolta, setIdaEVolta] = useState(false)
  const [preferencia, setPreferencia] = useState<PreferenciaRota>('eficiente')
  const [busy, setBusy] = useState(false)
  const [erro, setErro] = useState('')
  const [calc, setCalc] = useState<AnttCalculo | null>(null)
  const [consumoAplicado, setConsumoAplicado] = useState<number | null>(null)
  const [dieselAplicado, setDieselAplicado] = useState<number | null>(null)
  const reqId = useRef(0)
  const iniciadoId = useRef<string | null>(null)

  const origemLat = carga?.origem_lat
  const origemLng = carga?.origem_lng
  const destinoLat = carga?.destino_lat
  const destinoLng = carga?.destino_lng

  const origemCoords = useMemo(() => {
    if (origemLat == null || origemLng == null) return null
    if (!Number.isFinite(origemLat) || !Number.isFinite(origemLng)) return null
    return { lat: Number(origemLat), lng: Number(origemLng) }
  }, [origemLat, origemLng])

  const destinoCoords = useMemo(() => {
    if (destinoLat == null || destinoLng == null) return null
    if (!Number.isFinite(destinoLat) || !Number.isFinite(destinoLng)) return null
    return { lat: Number(destinoLat), lng: Number(destinoLng) }
  }, [destinoLat, destinoLng])

  async function calcular(override?: Partial<CalcParams>) {
    const o = override?.origem ?? origem
    const d = override?.destino ?? destino
    const ex = override?.eixos ?? eixos
    const cons = override?.consumo ?? consumo
    const preco = override?.preco ?? precoDiesel
    const volta = override?.volta ?? idaEVolta
    const pref = override?.pref ?? preferencia
    const vias = override?.waypoints ?? waypoints

    if (o.trim().length < 3 || d.trim().length < 3) {
      setErro('Informe origem e destino.')
      return
    }

    const id = ++reqId.current
    setBusy(true)
    setErro('')
    const res = await calcularRotaOperacional({
      origem: o,
      destino: d,
      eixos: ex,
      consumoKmL: parseNumBr(cons, consumoPadraoKmL(ex)),
      precoDiesel: parseNumBr(preco, 6.5),
      idaEVolta: volta,
      preferencia: pref,
      tabela: carga?.antt?.tabela ?? 'A',
      categoriaId: carga?.antt?.categoria_id ?? null,
      waypoints: vias,
      origemCoords,
      destinoCoords,
    })
    if (id !== reqId.current) return
    setBusy(false)
    if (!res.ok) {
      setErro(res.erro)
      setCalc(null)
      return
    }
    setCalc(res.data)
    setConsumoAplicado(parseNumBr(cons, consumoPadraoKmL(ex)))
    setDieselAplicado(parseNumBr(preco, PRECO_DIESEL_SUGERIDO))
  }

  useEffect(() => {
    if (!open) {
      iniciadoId.current = null
      return
    }
    if (!carga) return
    // Só inicializa uma vez por carga. Sync/tick NÃO pode resetar o que o usuário está digitando.
    if (iniciadoId.current === carga.id) return

    const o = carga.origem || ''
    const d = carga.destino || ''
    const vias = pontosDaCarga(carga, rotasRef.current)
    const ex = eixosDoVeiculo(carga.veiculo || 'Carreta')
    const consSug = fmtConsumo(consumoPadraoKmL(ex))
    const precoSug = fmtDiesel(PRECO_DIESEL_SUGERIDO)

    iniciadoId.current = carga.id
    setWaypoints(vias)
    setOrigem(o)
    setDestino(d)
    setEixos(ex)
    setConsumo(consSug)
    setPrecoDiesel(precoSug)
    setIdaEVolta(false)
    setPreferencia('eficiente')
    setErro('')
    setCalc(null)
    setConsumoAplicado(null)
    setDieselAplicado(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, carga?.id])

  function usarSugestao() {
    const consSug = fmtConsumo(consumoPadraoKmL(eixos))
    const precoSug = fmtDiesel(PRECO_DIESEL_SUGERIDO)
    setConsumo(consSug)
    setPrecoDiesel(precoSug)
    void calcular({ consumo: consSug, preco: precoSug })
  }

  function trocarPontos() {
    setOrigem(destino)
    setDestino(origem)
  }

  if (!carga) return null

  const freteOferta = carga.frete_oferta ?? carga.frete_tabela ?? null
  const custo = calc?.rota.custo_total ?? null
  const margem =
    freteOferta != null && custo != null ? roundMoney(freteOferta - custo) : null
  const consSugNum = consumoPadraoKmL(eixos)
  const consSug = fmtConsumo(consSugNum)
  const usandoSugestao =
    parseNumBr(consumo, consSugNum) === consSugNum &&
    parseNumBr(precoDiesel, PRECO_DIESEL_SUGERIDO) === PRECO_DIESEL_SUGERIDO

  return (
    <Modal open={open} onClose={onClose} title={`Calcular rota · Carga ${carga.numero}`} wide>
      <div className="space-y-4">
        <AnttFretePanel
          origem={origem || carga.origem}
          destino={destino || carga.destino}
          veiculo={carga.veiculo}
          value={carga.antt ?? null}
          modoConsulta
          waypoints={waypoints}
          origemCoords={origemCoords}
          destinoCoords={destinoCoords}
          consumoKmL={parseNumBr(consumo, consSugNum)}
          precoDiesel={parseNumBr(precoDiesel, PRECO_DIESEL_SUGERIDO)}
        />

        <p className="text-xs font-bold uppercase tracking-wide text-ink-muted">
          Calculadora avançada (eixos · consumo · diesel)
        </p>
        <p className="text-xs text-ink-muted">
          Ajuste eixos, consumo e diesel. Use a sugestão (valores padrão) ou recálcule o
          combustível para comparar com o frete da carga.
        </p>

        <div className="grid grid-cols-1 gap-2 sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] sm:items-end">
          <Field label="Ponto A — Origem" className="min-w-0">
            <AddressSuggestInput
              value={origem}
              onChange={setOrigem}
              placeholder={PLACEHOLDER_ENDERECO_EXEMPLO}
            />
          </Field>
          <button
            type="button"
            title="Inverter origem e destino"
            onClick={trocarPontos}
            className="mb-0.5 inline-flex h-10 w-10 shrink-0 items-center justify-center justify-self-center rounded-lg border border-ink/15 bg-white text-ink hover:bg-sand-light"
          >
            <ArrowUpDown size={16} />
          </button>
          <Field label="Ponto B — Destino" className="min-w-0">
            <AddressSuggestInput
              value={destino}
              onChange={setDestino}
              placeholder={PLACEHOLDER_ENDERECO_EXEMPLO}
            />
          </Field>
        </div>

        {waypoints.length > 0 ? (
          <div className="rounded-lg border border-sky-200 bg-sky-50/60 px-3 py-2.5">
            <p className="text-[12px] font-bold text-sky-900">
              Pontos de passagem ({waypoints.length})
            </p>
            <ol className="mt-1.5 list-decimal space-y-1 pl-5 text-[12px] text-sky-950">
              {waypoints.map((p, idx) => (
                <li key={p.id || idx}>
                  {(p.endereco || '').trim() ||
                    (p.lat != null && p.lng != null
                      ? `${p.lat}, ${p.lng}`
                      : `Ponto ${idx + 1}`)}
                </li>
              ))}
            </ol>
          </div>
        ) : (
          <p className="rounded-md border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-[11px] text-amber-900">
            Esta carga não tem pontos de passagem cadastrados. Em rota circular
            (origem = destino), o embarcador precisa informar as vias.
          </p>
        )}

        {open && origem.trim().length >= 3 && destino.trim().length >= 3 ? (
          <div className="space-y-1.5">
            <p className="text-[12px] font-bold uppercase tracking-wide text-ink">
              Mapa da rota
            </p>
            <RotaMapPreview
              key={`calc-map-${carga.id}`}
              origem={origem}
              destino={destino}
              origemCoords={origemCoords}
              destinoCoords={destinoCoords}
              waypoints={waypoints}
              veiculo={carga.veiculo}
              eixos={eixos}
              consumoKmL={consumoAplicado ?? consSugNum}
              precoDiesel={dieselAplicado ?? PRECO_DIESEL_SUGERIDO}
              className="h-[280px] min-h-[280px] w-full"
            />
          </div>
        ) : null}

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Eixos" className="min-w-0">
            <div className="flex min-w-0 items-center gap-1.5">
              <button
                type="button"
                className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-ink/15 bg-white"
                onClick={() => setEixos((e) => Math.max(2, e - 1))}
              >
                <Minus size={14} />
              </button>
              <span className="min-w-0 flex-1 truncate text-center text-sm font-bold tabular-nums text-ink">
                {eixos} eixos
              </span>
              <button
                type="button"
                className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-ink/15 bg-white"
                onClick={() => setEixos((e) => Math.min(9, e + 1))}
              >
                <Plus size={14} />
              </button>
            </div>
          </Field>
          <Field label="Ida e volta" className="min-w-0">
            <button
              type="button"
              role="switch"
              aria-checked={idaEVolta}
              onClick={() => setIdaEVolta((v) => !v)}
              className={`flex h-10 w-full min-w-0 items-center justify-between gap-2 rounded-lg border px-3 text-sm font-semibold ${
                idaEVolta
                  ? 'border-brand/40 bg-brand/10 text-ink'
                  : 'border-ink/15 bg-white text-ink-muted'
              }`}
            >
              <span className="truncate">{idaEVolta ? 'Sim' : 'Não'}</span>
              <span
                className={`relative h-5 w-9 shrink-0 rounded-full transition ${
                  idaEVolta ? 'bg-brand' : 'bg-ink/20'
                }`}
              >
                <span
                  className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition ${
                    idaEVolta ? 'left-[18px]' : 'left-0.5'
                  }`}
                />
              </span>
            </button>
          </Field>
        </div>

        <div className="space-y-3 rounded-xl border border-amber-200 bg-amber-50/70 px-3 py-3">
          <div>
            <p className="text-[13px] font-extrabold uppercase tracking-wide text-ink">
              Recalcule seu combustível
            </p>
            <p className="mt-0.5 text-[12px] text-ink-muted">
              Sugestão: {consSug} km/l · diesel {formatCurrency(PRECO_DIESEL_SUGERIDO)}/L.
              Consumo é km por litro: número maior = caminhão mais econômico = menos gasto.
              O cálculo só roda quando você clicar em Recalcular.
            </p>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Consumo (km por litro)" className="min-w-0">
              <input
                className={`${inputClass} w-full min-w-0 bg-white`}
                value={consumo}
                onChange={(e) => setConsumo(e.target.value)}
                inputMode="decimal"
                autoComplete="off"
              />
            </Field>
            <Field label="Preço diesel (R$)" className="min-w-0">
              <div className="relative min-w-0">
                <Fuel
                  size={14}
                  className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-ink-muted"
                />
                <input
                  className={`${inputClass} w-full min-w-0 bg-white pl-9`}
                  value={precoDiesel}
                  onChange={(e) => setPrecoDiesel(e.target.value)}
                  inputMode="decimal"
                  autoComplete="off"
                />
              </div>
            </Field>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button
              type="button"
              variant="ghost"
              className="flex-1 !border !border-ink/20 !bg-white"
              disabled={usandoSugestao}
              onClick={usarSugestao}
            >
              Usar sugestão
            </Button>
            <Button
              type="button"
              className="flex-1 !bg-ink !py-2.5"
              disabled={busy}
              onClick={() => void calcular()}
            >
              <Calculator size={18} />
              {busy ? 'Recalculando…' : 'Recalcular combustível'}
            </Button>
          </div>
        </div>

        <fieldset className="space-y-2">
          <legend className="text-xs font-bold uppercase tracking-wide text-ink-muted">
            Preferência de rota
          </legend>
          <div className="flex flex-wrap gap-2">
            {(
              [
                ['eficiente', 'Rota eficiente'],
                ['curta', 'Rota curta'],
                ['evitar_pedagio', 'Evitar pedágios'],
              ] as const
            ).map(([id, label]) => (
              <label
                key={id}
                className={`inline-flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm ${
                  preferencia === id
                    ? 'border-brand bg-brand/10 font-semibold text-ink'
                    : 'border-ink/15 bg-white text-ink-muted'
                }`}
              >
                <input
                  type="radio"
                  name="pref-rota"
                  className="accent-[var(--color-brand,#c45c26)]"
                  checked={preferencia === id}
                  onChange={() => setPreferencia(id)}
                />
                {label}
              </label>
            ))}
          </div>
        </fieldset>

        {erro && (
          <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">
            {erro}
          </p>
        )}

        {calc?.rota && (
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5 rounded-xl border border-ink/10 bg-sand-light/40 px-3 py-3 text-sm">
              <p className="text-[11px] font-extrabold uppercase tracking-wide text-ink">
                Resultado com combustível recalculado
              </p>
              {consumoAplicado != null && dieselAplicado != null && (
                <p className="text-[11px] text-ink-muted">
                  Usando {fmtConsumo(consumoAplicado)} km/l · diesel{' '}
                  {formatCurrency(dieselAplicado)}/L
                  {calc.rota.litros != null
                    ? ` · ${calc.rota.distancia_km} km ÷ ${fmtConsumo(consumoAplicado)} km/l = ${String(calc.rota.litros).replace('.', ',')} L × ${formatCurrency(dieselAplicado)}`
                    : ''}
                </p>
              )}
              <Row label="Duração" value={calc.rota.duracao_label} />
              <Row label="Distância" value={`${calc.rota.distancia_km} km`} />
              <Row label="Pedágio" value={formatCurrency(calc.rota.pedagio)} />
              <Row label="Pedágio / eixo" value={formatCurrency(calc.rota.pedagio_por_eixo)} />
              <Row
                label="Vale-Pedágio"
                value={formatCurrency(calc.rota.vale_pedagio ?? calc.rota.pedagio)}
              />
              <div className="flex justify-between rounded-lg bg-white px-2 py-1.5 font-bold text-ink">
                <span>Combustível</span>
                <span className="tabular-nums">{formatCurrency(calc.rota.combustivel)}</span>
              </div>
              <div className="flex justify-between border-t border-ink/15 pt-2 font-bold">
                <span>Custo total</span>
                <span className="tabular-nums">{formatCurrency(calc.rota.custo_total)}</span>
              </div>
              {freteOferta != null && (
                <>
                  <div className="flex justify-between rounded-lg bg-ink px-2 py-1.5 font-bold text-white">
                    <span>Frete da carga</span>
                    <span className="tabular-nums">{formatCurrency(freteOferta)}</span>
                  </div>
                  {margem != null && (
                    <div
                      className={`flex justify-between pt-1 text-sm font-bold ${
                        margem >= 0 ? 'text-emerald-700' : 'text-red-700'
                      }`}
                    >
                      <span>Frete − combustível/custos</span>
                      <span className="tabular-nums">{formatCurrency(margem)}</span>
                    </div>
                  )}
                </>
              )}
              {calc.piso_selecionado != null && (
                <Row label="Piso ANTT (categoria)" value={formatCurrency(calc.piso_selecionado)} />
              )}
            </div>

            <div className="max-h-56 space-y-1 overflow-y-auto rounded-xl border border-ink/10 bg-white px-3 py-2">
              <p className="text-[10px] font-bold uppercase tracking-wide text-ink-muted">
                Praças na rota ({calc.rota.pracas?.length ?? 0})
              </p>
              {(calc.rota.pracas?.length ?? 0) === 0 ? (
                <p className="text-xs text-ink-muted">
                  Nenhuma praça de pedágio detectada nesta rota.
                </p>
              ) : (
                <ul className="space-y-1 text-[11px]">
                  {calc.rota.pracas!.map((p, i) => (
                    <li key={`${p.nome}-${i}`} className="flex justify-between gap-2">
                      <span className="text-ink/80">
                        {p.nome}
                        {p.free_flow ? (
                          <span className="ml-1 rounded bg-emerald-100 px-1 text-[9px] font-bold text-emerald-800">
                            Free Flow
                          </span>
                        ) : null}
                      </span>
                      <span className="tabular-nums font-medium">{formatCurrency(p.valor)}</span>
                    </li>
                  ))}
                </ul>
              )}
              <p className="pt-2 text-[10px] text-ink-muted">{calc.fonte}</p>
            </div>
          </div>
        )}
      </div>
    </Modal>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 text-[13px]">
      <span className="text-ink-muted">{label}</span>
      <span className="tabular-nums text-ink">{value}</span>
    </div>
  )
}
