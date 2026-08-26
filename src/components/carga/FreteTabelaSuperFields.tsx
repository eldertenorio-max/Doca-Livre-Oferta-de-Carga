import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { formatCurrency, formatMoneyInput, moneyFromDigits } from '../../lib/businessRules'
import {
  calcularFreteDaTabela,
  labelTipoTabelaFrete,
  useTabelasFrete,
} from '../../lib/tabelasFrete'
import type { Carga, TabelaFrete } from '../../types'
import { Field, inputClass } from '../ui/Modal'

export function FreteTabelaSuperFields({
  carga,
  canEdit,
  onAplicar,
}: {
  carga: Carga
  canEdit: boolean
  onAplicar: (patch: {
    frete_tabela: number
    tabela_frete_id: string | null
    tabela_frete_nome: string | null
  }) => void
}) {
  const { tabelas } = useTabelasFrete()
  const [busca, setBusca] = useState('')
  const [escolhidaId, setEscolhidaId] = useState(carga.tabela_frete_id ?? '')
  const kmRota = carga.antt?.rota?.distancia_km || carga.distancia_km_rota || 0
  const [kmOverride, setKmOverride] = useState(String(kmRota || ''))
  const [manualStr, setManualStr] = useState(
    carga.frete_tabela ? formatMoneyInput(carga.frete_tabela) : '',
  )

  // Preenche automaticamente quando a rota é calculada (ex.: mapa da distribuição)
  // depois que este painel já foi montado, sem sobrescrever um valor digitado.
  useEffect(() => {
    if (kmRota > 0 && !kmOverride) {
      setKmOverride(String(kmRota))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kmRota])
  const kmUsado = Number(String(kmOverride).replace(',', '.'))
  const km = Number.isFinite(kmUsado) && kmUsado > 0 ? kmUsado : kmRota
  const peso = carga.peso || 0

  const ativas = useMemo(
    () => tabelas.filter((t) => t.situacao !== 'inativo'),
    [tabelas],
  )
  const filtradas = useMemo(() => {
    const q = busca.trim().toLowerCase()
    if (!q) return ativas
    return ativas.filter((t) =>
      [t.nome, t.codigo, t.perfil_veiculo, labelTipoTabelaFrete(t.tipo)]
        .join(' ')
        .toLowerCase()
        .includes(q),
    )
  }, [ativas, busca])

  const escolhida: TabelaFrete | undefined = ativas.find((t) => t.id === escolhidaId)
  const previsto = escolhida
    ? calcularFreteDaTabela(escolhida, { km, peso })
    : 0

  return (
    <div className="space-y-2 rounded-md border border-brand/40 bg-brand/10 p-2.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[11px] font-extrabold uppercase tracking-wide text-ink">
          Frete tabela (Super Usuário)
        </p>
        <Link
          to="/embarcador/tabelas-frete"
          className="text-[11px] font-bold text-ink underline"
        >
          Abrir Tabelas de Frete
        </Link>
      </div>
      <p className="text-[11px] font-semibold text-ink-muted">
        Informe o valor manualmente ou busque uma tabela cadastrada (básica, raio, peso ou
        complementos).
      </p>

      <div className="grid gap-2 sm:grid-cols-2">
        <Field label="Valor manual">
          <input
            className={inputClass}
            inputMode="decimal"
            disabled={!canEdit}
            placeholder="0,00"
            value={manualStr}
            onChange={(e) => {
              const digits = e.target.value.replace(/\D/g, '')
              if (!digits) {
                setManualStr('')
                return
              }
              const { display, value } = moneyFromDigits(digits)
              setManualStr(display)
              onAplicar({
                frete_tabela: value,
                tabela_frete_id: null,
                tabela_frete_nome: null,
              })
              setEscolhidaId('')
            }}
          />
        </Field>
        <Field label="Km para cálculo">
          <input
            className={inputClass}
            inputMode="decimal"
            disabled={!canEdit}
            placeholder={kmRota ? String(kmRota) : 'Km da rota'}
            value={kmOverride}
            onChange={(e) => setKmOverride(e.target.value.replace(/[^\d.,]/g, ''))}
          />
        </Field>
      </div>

      <Field label="Buscar tabela">
        <input
          className={inputClass}
          disabled={!canEdit}
          placeholder="Nome, código ou perfil…"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
        />
      </Field>
      <select
        className={inputClass}
        disabled={!canEdit}
        value={escolhidaId}
        onChange={(e) => {
          const id = e.target.value
          setEscolhidaId(id)
          const t = ativas.find((x) => x.id === id)
          if (!t) return
          const valor = calcularFreteDaTabela(t, { km, peso })
          setManualStr(valor ? formatMoneyInput(valor) : '')
          onAplicar({
            frete_tabela: valor,
            tabela_frete_id: t.id,
            tabela_frete_nome: t.nome,
          })
        }}
      >
        <option value="">Selecione uma tabela…</option>
        {(['basica', 'raio', 'peso', 'complementos'] as const).map((tipo) => {
          const opts = filtradas.filter((t) => t.tipo === tipo)
          if (opts.length === 0) return null
          return (
            <optgroup key={tipo} label={labelTipoTabelaFrete(tipo)}>
              {opts.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.nome} · {t.codigo} · {t.perfil_veiculo}
                </option>
              ))}
            </optgroup>
          )
        })}
      </select>
      {escolhida && (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-[11px] font-semibold text-ink">
            {labelTipoTabelaFrete(escolhida.tipo)} · {escolhida.nome} →{' '}
            <span className="font-extrabold">{formatCurrency(previsto)}</span>
            {km > 0 ? ` · ${km.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} km` : ''}
            {peso > 0 ? ` · ${peso.toLocaleString('pt-BR')} kg` : ''}
          </p>
          {canEdit && (
            <button
              type="button"
              className="rounded-md bg-ink px-2 py-1 text-[11px] font-bold text-white"
              onClick={() => {
                setManualStr(previsto ? formatMoneyInput(previsto) : '')
                onAplicar({
                  frete_tabela: previsto,
                  tabela_frete_id: escolhida.id,
                  tabela_frete_nome: escolhida.nome,
                })
              }}
            >
              Aplicar nesta carga
            </button>
          )}
        </div>
      )}
    </div>
  )
}
