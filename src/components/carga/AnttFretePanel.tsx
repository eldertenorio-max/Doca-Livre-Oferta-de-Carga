import { useEffect, useRef, useState } from 'react'
import { formatCurrency } from '../../lib/businessRules'
import {
  calcularAnttCompleto,
  CATEGORIAS_ANTT,
  TABELAS_ANTT,
  type AnttCalculo,
  type TabelaAntt,
} from '../../lib/anttFrete'
import type { AnttInfoCarga } from '../../types'
import { Button, Field, inputClass } from '../ui/Modal'

type Props = {
  origem: string
  destino: string
  veiculo: string
  value?: AnttInfoCarga | null
  /** Embarcador grava na carga; transportador pode omitir (só consulta). */
  onChange?: (info: AnttInfoCarga | null, freteTabela?: number) => void
  /** Só visualização/recálculo — não altera frete da publicação */
  modoConsulta?: boolean
}

export function AnttFretePanel({
  origem,
  destino,
  veiculo,
  value,
  onChange,
  modoConsulta = false,
}: Props) {
  const [tabela, setTabela] = useState<TabelaAntt>(value?.tabela ?? 'A')
  const [categoriaId, setCategoriaId] = useState<number | ''>(value?.categoria_id ?? '')
  const [busy, setBusy] = useState(false)
  const [erro, setErro] = useState('')
  const [calc, setCalc] = useState<AnttCalculo | null>(value ? fromSaved(value) : null)
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange
  const reqId = useRef(0)

  useEffect(() => {
    if (value) {
      setTabela(value.tabela)
      setCategoriaId(value.categoria_id ?? '')
      setCalc(fromSaved(value))
    }
  }, [value])

  async function calcular(catId: number | '' = categoriaId) {
    const id = ++reqId.current
    setBusy(true)
    setErro('')
    const res = await calcularAnttCompleto({
      origem,
      destino,
      veiculo,
      tabela,
      categoriaId: catId === '' ? null : catId,
    })
    if (id !== reqId.current) return
    setBusy(false)
    if (!res.ok) {
      setErro(res.erro)
      return
    }
    setCalc(res.data)
    const info = toSaved(res.data)
    const frete =
      catId !== '' ? (res.data.pisos.find((p) => p.id === catId)?.valor ?? undefined) : undefined
    onChangeRef.current?.(info, frete)
  }

  // Automático ao mudar origem / destino / veículo / tabela
  useEffect(() => {
    const o = origem.trim()
    const d = destino.trim()
    const v = veiculo.trim()
    if (o.length < 5 || d.length < 5 || !v) return
    // Em consulta com snapshot: só recalcula se mudar tabela (Recalcular sempre disponível)
    if (modoConsulta && value?.rota && tabela === value.tabela) return
    const t = window.setTimeout(() => {
      void calcular(categoriaId)
    }, 900)
    return () => window.clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [origem, destino, veiculo, tabela])

  function selecionarCategoria(id: number) {
    setCategoriaId(id)
    if (!calc) {
      void calcular(id)
      return
    }
    const piso = calc.pisos.find((p) => p.id === id)?.valor ?? null
    const next: AnttCalculo = {
      ...calc,
      categoria_id: id,
      categoria_label: CATEGORIAS_ANTT.find((c) => c.id === id)?.label ?? null,
      piso_selecionado: piso,
    }
    setCalc(next)
    onChange?.(toSaved(next), piso ?? undefined)
  }

  const rota = calc?.rota
  const pracas = rota?.pracas ?? []

  return (
    <section className="space-y-1.5 rounded-lg border border-ink/15 bg-sand-light/40 p-2.5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="text-[12px] font-bold uppercase tracking-wide text-ink">
            Frete ANTT + rota (gratuito)
          </h3>
          <p className="text-[11px] font-medium leading-snug text-ink">
            {modoConsulta
              ? 'Mesmas informações do embarcador: pisos ANTT, duração, distância, pedágio e combustível. Use Recalcular para atualizar.'
              : 'Automático: rota OSRM · pisos Res. 6.084/2026 · pedágio pelas '}
            {!modoConsulta && (
              <>
                <a
                  href="https://dados.antt.gov.br/dataset/praca-de-pedagio"
                  target="_blank"
                  rel="noreferrer"
                  className="font-bold text-ink underline"
                >
                  praças dos Dados Abertos ANTT
                </a>{' '}
                · Vale-Pedágio Res. 6.024/2023 · RNTRC do transportador.
              </>
            )}
          </p>
        </div>
        <Button
          type="button"
          variant="ghost"
          className="!border !border-ink/25 !bg-white !py-1 !text-xs !font-bold !text-ink"
          disabled={busy}
          onClick={() => void calcular()}
        >
          {busy ? 'Calculando…' : 'Recalcular'}
        </Button>
      </div>

      <div className="grid gap-1.5 sm:grid-cols-2">
        <Field label="Tabela ANTT">
          <div className="flex items-center gap-2">
            <select
              className={inputClass}
              value={tabela}
              onChange={(e) => setTabela(e.target.value as TabelaAntt)}
            >
              {TABELAS_ANTT.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.label}
                </option>
              ))}
            </select>
            <span
              className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-ink/30 text-[11px] font-bold text-ink"
              title="A/C = lotação (composição). B/D = só cavalo/agregado. C/D = alto desempenho."
            >
              ?
            </span>
          </div>
        </Field>
        <Field label="Categoria da carga">
          <select
            className={inputClass}
            value={categoriaId === '' ? '' : String(categoriaId)}
            onChange={(e) => {
              const v = e.target.value
              if (!v) {
                setCategoriaId('')
                return
              }
              selecionarCategoria(Number(v))
            }}
          >
            <option value="">Selecione a categoria da carga</option>
            {CATEGORIAS_ANTT.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </select>
        </Field>
      </div>

      {erro && (
        <p className="rounded-lg border border-red-200 bg-red-50 px-2.5 py-1.5 text-xs text-red-800">
          {erro}
        </p>
      )}

      {calc && (
        <div className="grid gap-3 lg:grid-cols-2">
          <div className="overflow-hidden rounded-lg border border-ink/10 bg-white">
            <table className="w-full text-left text-xs">
              <thead className="bg-ink/5 text-[10px] uppercase tracking-wide text-ink-muted">
                <tr>
                  <th className="px-2.5 py-1.5 font-semibold">Carga</th>
                  <th className="px-2.5 py-1.5 text-right font-semibold">Valor</th>
                </tr>
              </thead>
              <tbody>
                {calc.pisos.map((p) => {
                  const ativo = categoriaId === p.id
                  return (
                    <tr
                      key={p.id}
                      className={`cursor-pointer border-t border-ink/5 ${
                        ativo ? 'bg-brand/10 font-semibold' : 'hover:bg-sand-light/80'
                      }`}
                      onClick={() => p.valor != null && selecionarCategoria(p.id)}
                    >
                      <td className="px-2.5 py-1.5 text-ink">{p.label}</td>
                      <td className="px-2.5 py-1.5 text-right tabular-nums text-ink">
                        {p.valor != null ? formatCurrency(p.valor) : '—'}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {rota && (
            <div className="space-y-2">
              <div className="rounded-lg border border-ink/10 bg-white px-3 py-2 text-sm">
                <RowCusto label="Duração" value={rota.duracao_label} />
                <RowCusto label="Distância" value={`${rota.distancia_km} km`} />
                <RowCusto label="Pedágio" value={formatCurrency(rota.pedagio)} />
                <RowCusto label="Pedágio por eixo" value={formatCurrency(rota.pedagio_por_eixo)} />
                <RowCusto
                  label="Vale-Pedágio (obrigatório)"
                  value={formatCurrency(rota.vale_pedagio ?? rota.pedagio)}
                />
                <RowCusto label="Combustível" value={formatCurrency(rota.combustivel)} />
                <div className="mt-1.5 flex items-center justify-between border-t border-ink/15 pt-2 font-bold text-ink">
                  <span>Custo Total</span>
                  <span className="tabular-nums">{formatCurrency(rota.custo_total)}</span>
                </div>
                <p className="mt-2 text-[10px] text-ink-muted">
                  Eixos: {calc.eixos_utilizados}
                  {rota.provedor === 'antt_aberto'
                    ? ' · praças na rota'
                    : ' · pedágio estimado'}
                  {rota.free_flow ? ' · Free Flow/OCR na base' : ''}
                  {calc.piso_selecionado != null && (
                    <>
                      {' '}
                      · Piso: <strong>{formatCurrency(calc.piso_selecionado)}</strong>
                    </>
                  )}
                </p>
              </div>

              {pracas.length > 0 && (
                <div className="max-h-40 overflow-y-auto rounded-lg border border-ink/10 bg-white px-3 py-2">
                  <p className="mb-1 text-[10px] font-bold uppercase tracking-wide text-ink-muted">
                    Praças na rota ({pracas.length})
                  </p>
                  <ul className="space-y-1 text-[11px]">
                    {pracas.map((p, i) => (
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
                </div>
              )}

              <p className="rounded-lg border border-ink/10 bg-white px-2.5 py-1.5 text-[10px] text-ink-muted">
                <strong className="text-ink">RNTRC:</strong> o transportador vencedor precisa ter
                RNTRC ativo (cadastro ANTT). Vale-Pedágio conforme Res. 6.024/2023.
              </p>
            </div>
          )}
        </div>
      )}
    </section>
  )
}

function RowCusto({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 py-1 text-[13px]">
      <span className="text-ink-muted">{label}</span>
      <span className="tabular-nums text-ink">{value}</span>
    </div>
  )
}

function toSaved(c: AnttCalculo): AnttInfoCarga {
  return {
    tabela: c.tabela,
    eixos: c.eixos,
    eixos_utilizados: c.eixos_utilizados,
    categoria_id: c.categoria_id,
    categoria_label: c.categoria_label,
    piso_selecionado: c.piso_selecionado,
    pisos: c.pisos,
    rota: c.rota,
    fonte: c.fonte,
  }
}

function fromSaved(v: AnttInfoCarga): AnttCalculo {
  return {
    tabela: v.tabela,
    eixos: v.eixos,
    eixos_utilizados: v.eixos_utilizados,
    categoria_id: v.categoria_id,
    categoria_label: v.categoria_label,
    piso_selecionado: v.piso_selecionado,
    pisos: v.pisos,
    rota: v.rota,
    fonte: v.fonte,
  }
}
