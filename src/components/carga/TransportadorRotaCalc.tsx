import { useEffect, useState } from 'react'
import { ArrowUpDown, Calculator, Fuel, Minus, Plus } from 'lucide-react'
import { formatCurrency, roundMoney } from '../../lib/businessRules'
import {
  calcularRotaOperacional,
  consumoPadraoKmL,
  eixosDoVeiculo,
  type AnttCalculo,
  type PreferenciaRota,
} from '../../lib/anttFrete'
import type { Carga } from '../../types'
import { AddressSuggestInput } from '../ui/AddressSuggestInput'
import { Button, Field, Modal, inputClass } from '../ui/Modal'
import { AnttFretePanel } from './AnttFretePanel'

type Props = {
  carga: Carga | null
  open: boolean
  onClose: () => void
}

function parseNumBr(raw: string, fallback: number): number {
  const n = Number(String(raw).trim().replace(/\./g, '').replace(',', '.'))
  return Number.isFinite(n) && n > 0 ? n : fallback
}

export function TransportadorRotaCalc({ carga, open, onClose }: Props) {
  const [origem, setOrigem] = useState('')
  const [destino, setDestino] = useState('')
  const [eixos, setEixos] = useState(5)
  const [consumo, setConsumo] = useState('3,2')
  const [precoDiesel, setPrecoDiesel] = useState('6,50')
  const [idaEVolta, setIdaEVolta] = useState(true)
  const [preferencia, setPreferencia] = useState<PreferenciaRota>('eficiente')
  const [busy, setBusy] = useState(false)
  const [erro, setErro] = useState('')
  const [calc, setCalc] = useState<AnttCalculo | null>(null)

  useEffect(() => {
    if (!open || !carga) return
    setOrigem(carga.origem || '')
    setDestino(carga.destino || '')
    const ex = eixosDoVeiculo(carga.veiculo || 'Carreta')
    setEixos(ex)
    setConsumo(String(consumoPadraoKmL(ex)).replace('.', ','))
    setPrecoDiesel('6,50')
    setIdaEVolta(true)
    setPreferencia('eficiente')
    setErro('')
    setCalc(null)
    // Auto-puxa ao abrir com origem/destino da carga
    if ((carga.origem || '').trim().length >= 3 && (carga.destino || '').trim().length >= 3) {
      void calcular({
        origem: carga.origem || '',
        destino: carga.destino || '',
        eixos: ex,
        consumo: String(consumoPadraoKmL(ex)).replace('.', ','),
        preco: '6,50',
        volta: true,
        pref: 'eficiente',
      })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, carga?.id])

  async function calcular(override?: {
    origem: string
    destino: string
    eixos: number
    consumo: string
    preco: string
    volta: boolean
    pref: PreferenciaRota
  }) {
    const o = override?.origem ?? origem
    const d = override?.destino ?? destino
    const ex = override?.eixos ?? eixos
    const cons = override?.consumo ?? consumo
    const preco = override?.preco ?? precoDiesel
    const volta = override?.volta ?? idaEVolta
    const pref = override?.pref ?? preferencia

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
    })
    setBusy(false)
    if (!res.ok) {
      setErro(res.erro)
      setCalc(null)
      return
    }
    setCalc(res.data)
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

  return (
    <Modal open={open} onClose={onClose} title={`Calcular rota · Carga ${carga.numero}`} wide>
      <div className="space-y-4">
        <AnttFretePanel
          origem={origem || carga.origem}
          destino={destino || carga.destino}
          veiculo={carga.veiculo}
          value={carga.antt ?? null}
          modoConsulta
        />

        <p className="text-xs font-bold uppercase tracking-wide text-ink-muted">
          Calculadora avançada (eixos · consumo · diesel)
        </p>
        <p className="text-xs text-ink-muted">
          Ajuste os parâmetros abaixo e calcule de novo. Origem/destino vêm da carga.
        </p>

        <div className="grid grid-cols-1 gap-2 sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] sm:items-end">
          <Field label="Ponto A — Origem" className="min-w-0">
            <AddressSuggestInput
              value={origem}
              onChange={setOrigem}
              placeholder="Cidade / UF ou endereço"
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
              placeholder="Cidade / UF ou endereço"
            />
          </Field>
        </div>

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
          <Field label="Consumo (KM/L)" className="min-w-0">
            <input
              className={`${inputClass} w-full min-w-0`}
              value={consumo}
              onChange={(e) => setConsumo(e.target.value)}
              inputMode="decimal"
            />
          </Field>
          <Field label="Preço diesel (R$)" className="min-w-0">
            <div className="relative min-w-0">
              <Fuel
                size={14}
                className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-ink-muted"
              />
              <input
                className={`${inputClass} w-full min-w-0 pl-9`}
                value={precoDiesel}
                onChange={(e) => setPrecoDiesel(e.target.value)}
                inputMode="decimal"
              />
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

        <Button
          type="button"
          className="w-full !bg-ink !py-3 !text-base"
          disabled={busy}
          onClick={() => void calcular()}
        >
          <Calculator size={18} />
          {busy ? 'Calculando…' : 'Calcular'}
        </Button>

        {erro && (
          <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">
            {erro}
          </p>
        )}

        {calc?.rota && (
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5 rounded-xl border border-ink/10 bg-sand-light/40 px-3 py-3 text-sm">
              <Row label="Duração" value={calc.rota.duracao_label} />
              <Row label="Distância" value={`${calc.rota.distancia_km} km`} />
              <Row label="Pedágio" value={formatCurrency(calc.rota.pedagio)} />
              <Row label="Pedágio / eixo" value={formatCurrency(calc.rota.pedagio_por_eixo)} />
              <Row
                label="Vale-Pedágio"
                value={formatCurrency(calc.rota.vale_pedagio ?? calc.rota.pedagio)}
              />
              <Row label="Combustível" value={formatCurrency(calc.rota.combustivel)} />
              <div className="flex justify-between border-t border-ink/15 pt-2 font-bold">
                <span>Custo total</span>
                <span className="tabular-nums">{formatCurrency(calc.rota.custo_total)}</span>
              </div>
              {freteOferta != null && (
                <>
                  <Row label="Frete oferta (carga)" value={formatCurrency(freteOferta)} />
                  {margem != null && (
                    <div
                      className={`flex justify-between pt-1 text-sm font-bold ${
                        margem >= 0 ? 'text-emerald-700' : 'text-red-700'
                      }`}
                    >
                      <span>Margem vs custo</span>
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
                <p className="text-xs text-ink-muted">Nenhuma praça ANTT detectada nesta rota.</p>
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
