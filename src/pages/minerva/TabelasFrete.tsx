import { useMemo, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { Plus, Trash2 } from 'lucide-react'
import { useData } from '../../context/DataContext'
import { isSuperSession } from '../../lib/superUsers'
import {
  formatMoneyInput,
  moneyFromDigits,
} from '../../lib/businessRules'
import {
  TIPOS_TABELA_FRETE,
  emptyFaixaKm,
  emptyFaixaPeso,
  emptyTabelaFrete,
  useTabelasFrete,
} from '../../lib/tabelasFrete'
import type { FaixaKmValor, FaixaPesoValor, TabelaFrete, TipoTabelaFrete } from '../../types'
import { Button, Field, inputClass } from '../../components/ui/Modal'
import { VeiculoSuggestInput } from '../../components/ui/VeiculoSuggestInput'
import '../../styles/cadastro.css'

function MoneyInput({
  value,
  onChange,
}: {
  value?: number
  onChange: (n: number) => void
}) {
  const n = Number(value) || 0
  return (
    <input
      className={inputClass}
      inputMode="decimal"
      placeholder="0,00"
      value={n ? formatMoneyInput(n) : ''}
      onChange={(e) => {
        const digits = e.target.value.replace(/\D/g, '')
        if (!digits) {
          onChange(0)
          return
        }
        onChange(moneyFromDigits(digits).value)
      }}
    />
  )
}

function NumInput({
  value,
  onChange,
  step = 1,
}: {
  value?: number
  onChange: (n: number) => void
  step?: number
}) {
  return (
    <input
      className={inputClass}
      type="number"
      step={step}
      min={0}
      value={value ?? 0}
      onChange={(e) => onChange(Number(e.target.value) || 0)}
    />
  )
}

function FaixasKm({
  rows,
  colKm,
  onChange,
}: {
  rows: FaixaKmValor[]
  colKm: string
  onChange: (next: FaixaKmValor[]) => void
}) {
  return (
    <div className="space-y-1.5">
      <button
        type="button"
        className="rounded-md border border-ink/20 bg-white px-2.5 py-1 text-[11px] font-bold text-ink hover:bg-sand-light"
        onClick={() => onChange([...(rows ?? []), emptyFaixaKm()])}
      >
        + Adicionar
      </button>
      <div className="overflow-x-auto rounded-md border border-ink/10">
        <table className="w-full text-left text-[12px]">
          <thead className="bg-sand-light/80 text-[10px] font-extrabold uppercase tracking-wide text-ink">
            <tr>
              <th className="px-2 py-1.5">{colKm}</th>
              <th className="px-2 py-1.5">Valor</th>
              <th className="w-16 px-2 py-1.5">Excluir</th>
            </tr>
          </thead>
          <tbody>
            {(rows ?? []).length === 0 ? (
              <tr>
                <td colSpan={3} className="px-2 py-3 text-ink-muted">
                  Nenhuma faixa.
                </td>
              </tr>
            ) : (
              (rows ?? []).map((row, idx) => (
                <tr key={row.id} className="border-t border-ink/10">
                  <td className="px-2 py-1">
                    <NumInput
                      value={row.km_max}
                      onChange={(km_max) =>
                        onChange(rows.map((r, i) => (i === idx ? { ...r, km_max } : r)))
                      }
                    />
                  </td>
                  <td className="px-2 py-1">
                    <MoneyInput
                      value={row.valor}
                      onChange={(valor) =>
                        onChange(rows.map((r, i) => (i === idx ? { ...r, valor } : r)))
                      }
                    />
                  </td>
                  <td className="px-2 py-1">
                    <button
                      type="button"
                      className="rounded p-1 text-ink-muted hover:bg-red-50 hover:text-red-700"
                      onClick={() => onChange(rows.filter((_, i) => i !== idx))}
                    >
                      <Trash2 size={14} />
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function FaixasPeso({
  rows,
  onChange,
}: {
  rows: FaixaPesoValor[]
  onChange: (next: FaixaPesoValor[]) => void
}) {
  return (
    <div className="space-y-1.5">
      <button
        type="button"
        className="rounded-md border border-ink/20 bg-white px-2.5 py-1 text-[11px] font-bold text-ink hover:bg-sand-light"
        onClick={() => onChange([...(rows ?? []), emptyFaixaPeso()])}
      >
        + Adicionar
      </button>
      <div className="overflow-x-auto rounded-md border border-ink/10">
        <table className="w-full text-left text-[12px]">
          <thead className="bg-sand-light/80 text-[10px] font-extrabold uppercase tracking-wide text-ink">
            <tr>
              <th className="px-2 py-1.5">Peso</th>
              <th className="px-2 py-1.5">Valor</th>
              <th className="w-16 px-2 py-1.5">Excluir</th>
            </tr>
          </thead>
          <tbody>
            {(rows ?? []).length === 0 ? (
              <tr>
                <td colSpan={3} className="px-2 py-3 text-ink-muted">
                  Nenhuma faixa.
                </td>
              </tr>
            ) : (
              (rows ?? []).map((row, idx) => (
                <tr key={row.id} className="border-t border-ink/10">
                  <td className="px-2 py-1">
                    <NumInput
                      step={0.01}
                      value={row.peso_max}
                      onChange={(peso_max) =>
                        onChange(rows.map((r, i) => (i === idx ? { ...r, peso_max } : r)))
                      }
                    />
                  </td>
                  <td className="px-2 py-1">
                    <MoneyInput
                      value={row.valor}
                      onChange={(valor) =>
                        onChange(rows.map((r, i) => (i === idx ? { ...r, valor } : r)))
                      }
                    />
                  </td>
                  <td className="px-2 py-1">
                    <button
                      type="button"
                      className="rounded p-1 text-ink-muted hover:bg-red-50 hover:text-red-700"
                      onClick={() => onChange(rows.filter((_, i) => i !== idx))}
                    >
                      <Trash2 size={14} />
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export function TabelasFretePage() {
  const { user } = useData()
  const isSuper = isSuperSession(user)
  const { tabelas, salvarTabela, excluirTabela } = useTabelasFrete()
  const [tipo, setTipo] = useState<TipoTabelaFrete>('basica')
  const [form, setForm] = useState<TabelaFrete>(() => emptyTabelaFrete('basica'))
  const [msg, setMsg] = useState('')
  const [erro, setErro] = useState('')

  const lista = useMemo(
    () =>
      tabelas
        .filter((t) => t.tipo === tipo)
        .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR')),
    [tabelas, tipo],
  )

  function patch(p: Partial<TabelaFrete>) {
    setForm((prev) => ({ ...prev, ...p }))
  }

  function nova() {
    setForm(emptyTabelaFrete(tipo))
    setErro('')
    setMsg('')
  }

  function escolherTipo(next: TipoTabelaFrete) {
    setTipo(next)
    setForm(emptyTabelaFrete(next))
    setErro('')
    setMsg('')
  }

  function salvar() {
    setErro('')
    if (!form.nome.trim()) {
      setErro('Informe o nome da tabela.')
      return
    }
    if (!form.codigo.trim()) {
      setErro('Informe o código.')
      return
    }
    if (!form.perfil_veiculo.trim()) {
      setErro('Informe o perfil do veículo.')
      return
    }
    if (!(form.capacidade_kg > 0)) {
      setErro('Informe a capacidade de peso do perfil.')
      return
    }
    const gravada = salvarTabela({ ...form, tipo })
    setForm(gravada)
    setMsg(`Tabela “${gravada.nome}” salva.`)
  }

  if (!user) return <Navigate to="/login" replace />
  if (!isSuper) {
    return (
      <div className="cadastro-page">
        <h1 className="cadastro-page-title">Tabelas de frete</h1>
        <p className="cadastro-empty">Apenas Super Usuários podem cadastrar tabelas de frete.</p>
      </div>
    )
  }

  return (
    <div className="cadastro-page animate-fade-up space-y-4">
      <header>
        <h1 className="cadastro-page-title">Tabelas de frete</h1>
        <p className="text-sm text-ink-muted">
          Cadastre tabelas separadas. O cabeçalho (nome, código, perfil e capacidade) vale para
          todas. Frete tabela = diária + franquia de km + km excedente.
        </p>
      </header>

      <div className="flex flex-wrap gap-1 rounded-lg border border-ink/10 bg-white p-1">
        {TIPOS_TABELA_FRETE.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => escolherTipo(t.id)}
            className={`min-w-0 flex-1 rounded-md px-3 py-2 text-[12px] font-extrabold uppercase tracking-wide ${
              tipo === t.id
                ? 'bg-ink text-white'
                : 'text-ink hover:bg-sand-light'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="grid min-h-[calc(100vh-12rem)] gap-3 lg:grid-cols-[minmax(280px,22%)_1fr]">
        <aside className="rounded-xl border border-ink/10 bg-white p-3">
          <div className="mb-2 flex items-center justify-between gap-2">
            <p className="text-[11px] font-extrabold uppercase tracking-wide text-ink">
              {TIPOS_TABELA_FRETE.find((t) => t.id === tipo)?.label} ({lista.length})
            </p>
            <button
              type="button"
              className="inline-flex items-center gap-1 rounded-md bg-brand px-2 py-1 text-[11px] font-bold text-ink"
              onClick={nova}
            >
              <Plus size={12} /> Nova
            </button>
          </div>
          {lista.length === 0 ? (
            <p className="text-[12px] text-ink-muted">Nenhuma tabela deste tipo.</p>
          ) : (
            <ul className="max-h-[70vh] space-y-1 overflow-y-auto">
              {lista.map((t) => (
                <li key={t.id}>
                  <button
                    type="button"
                    onClick={() => {
                      setForm({ ...emptyTabelaFrete(tipo), ...t, tipo })
                      setMsg('')
                      setErro('')
                    }}
                    className={`w-full rounded-md border px-2 py-1.5 text-left text-[12px] ${
                      form.id === t.id
                        ? 'border-brand bg-brand/15 font-bold'
                        : 'border-ink/10 hover:bg-sand-light/60'
                    }`}
                  >
                    <span className="block truncate">{t.nome}</span>
                    <span className="block truncate text-[10px] text-ink-muted">
                      {t.codigo} · {t.perfil_veiculo} · {formatMoneyInput(t.capacidade_kg)} kg
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </aside>

        <section className="space-y-3 rounded-xl border border-ink/10 bg-white p-4">
          {erro && (
            <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-800">
              {erro}
            </p>
          )}
          {msg && (
            <p className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-900">
              {msg}
            </p>
          )}

          <div>
            <h2 className="mb-2 text-[13px] font-extrabold uppercase tracking-wide text-ink">
              Cabeçalho
            </h2>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
              <Field label="Nome *">
                <input
                  className={inputClass}
                  value={form.nome}
                  onChange={(e) => patch({ nome: e.target.value })}
                />
              </Field>
              <Field label="Código *">
                <input
                  className={inputClass}
                  value={form.codigo}
                  onChange={(e) => patch({ codigo: e.target.value })}
                />
              </Field>
              <Field label="Perfil do veículo *">
                <VeiculoSuggestInput
                  value={form.perfil_veiculo}
                  onChange={(perfil_veiculo) => patch({ perfil_veiculo })}
                />
              </Field>
              <Field label="Capacidade de peso (kg) *">
                <NumInput
                  step={0.01}
                  value={form.capacidade_kg}
                  onChange={(capacidade_kg) => patch({ capacidade_kg })}
                />
              </Field>
              <Field label="Tipologia">
                <input
                  className={inputClass}
                  value={form.tipologia ?? ''}
                  onChange={(e) => patch({ tipologia: e.target.value })}
                />
              </Field>
              <Field label="Ano do veículo">
                <NumInput
                  value={form.ano_veiculo}
                  onChange={(ano_veiculo) => patch({ ano_veiculo })}
                />
              </Field>
              <Field label="Faixa de peso">
                <select
                  className={inputClass}
                  value={form.faixa_peso ? 'sim' : 'nao'}
                  onChange={(e) => patch({ faixa_peso: e.target.value === 'sim' })}
                >
                  <option value="nao">Não</option>
                  <option value="sim">Sim</option>
                </select>
              </Field>
            </div>
          </div>

          {tipo === 'basica' && (
            <>
              <div>
                <h2 className="mb-2 text-[13px] font-extrabold uppercase tracking-wide text-ink">
                  Frete base
                </h2>
                <p className="mb-2 text-[11px] font-semibold text-ink-muted">
                  Frete tabela = diária + franquia de km + km excedente.
                </p>
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
                  <Field label="Diária">
                    <MoneyInput value={form.diaria} onChange={(diaria) => patch({ diaria })} />
                  </Field>
                  <Field label="Quantidade de diária">
                    <NumInput
                      value={form.qtd_diaria}
                      onChange={(qtd_diaria) => patch({ qtd_diaria })}
                    />
                  </Field>
                  <Field label="Valor saída">
                    <MoneyInput
                      value={form.valor_saida}
                      onChange={(valor_saida) => patch({ valor_saida })}
                    />
                  </Field>
                  <Field label="Pernoite">
                    <MoneyInput value={form.pernoite} onChange={(pernoite) => patch({ pernoite })} />
                  </Field>
                  <Field label="Km (R$)">
                    <MoneyInput value={form.valor_km} onChange={(valor_km) => patch({ valor_km })} />
                  </Field>
                  <Field label="Franquia de KM">
                    <NumInput
                      value={form.franquia_km}
                      onChange={(franquia_km) => patch({ franquia_km })}
                    />
                  </Field>
                  <Field label="KM excedente">
                    <MoneyInput
                      value={form.km_excedente}
                      onChange={(km_excedente) => patch({ km_excedente })}
                    />
                  </Field>
                </div>
                <div className="mt-2 grid gap-2 sm:grid-cols-2">
                  <Field label="Valor por km">
                    <select
                      className={inputClass}
                      value={form.valor_por_km ?? 'max_roteirizado'}
                      onChange={(e) =>
                        patch({
                          valor_por_km: e.target.value as TabelaFrete['valor_por_km'],
                        })
                      }
                    >
                      <option value="max_roteirizado">Km máximo roteirizado</option>
                      <option value="maior_distancia">Maior distância entre origem e entrega</option>
                    </select>
                  </Field>
                  <Field label="Pagamento por">
                    <select
                      className={inputClass}
                      value={form.pagamento_por ?? 'planejado'}
                      onChange={(e) =>
                        patch({
                          pagamento_por: e.target.value as TabelaFrete['pagamento_por'],
                        })
                      }
                    >
                      <option value="planejado">Km planejado</option>
                      <option value="rodado">Km rodado</option>
                    </select>
                  </Field>
                </div>
              </div>
              <div>
                <h2 className="mb-2 text-[13px] font-extrabold uppercase tracking-wide text-ink">
                  Diária dinâmica (faixa de km)
                </h2>
                <FaixasKm
                  colKm="KM máximo"
                  rows={form.diaria_dinamica ?? []}
                  onChange={(diaria_dinamica) => patch({ diaria_dinamica })}
                />
              </div>
              <div>
                <h2 className="mb-2 text-[13px] font-extrabold uppercase tracking-wide text-ink">
                  Diária dinâmica peso (faixa de preço)
                </h2>
                <FaixasPeso
                  rows={form.diaria_dinamica_peso ?? []}
                  onChange={(diaria_dinamica_peso) => patch({ diaria_dinamica_peso })}
                />
              </div>
            </>
          )}

          {tipo === 'raio' && (
            <div>
              <h2 className="mb-2 text-[13px] font-extrabold uppercase tracking-wide text-ink">
                Faixas de km (raio)
              </h2>
              <FaixasKm
                colKm="KM máximo"
                rows={form.faixas_km ?? []}
                onChange={(faixas_km) => patch({ faixas_km })}
              />
            </div>
          )}

          {tipo === 'peso' && (
            <div>
              <h2 className="mb-2 text-[13px] font-extrabold uppercase tracking-wide text-ink">
                Faixas de peso
              </h2>
              <FaixasPeso
                rows={form.faixas_peso ?? []}
                onChange={(faixas_peso) => patch({ faixas_peso })}
              />
            </div>
          )}

          {tipo === 'complementos' && (
            <>
              <div>
                <h2 className="mb-2 text-[13px] font-extrabold uppercase tracking-wide text-ink">
                  Saída dinâmica
                </h2>
                <FaixasKm
                  colKm="KM máximo"
                  rows={form.saida_dinamica ?? []}
                  onChange={(saida_dinamica) => patch({ saida_dinamica })}
                />
              </div>
              <div className="rounded-lg border border-sky-200 bg-sky-50/40 p-3">
                <h2 className="mb-2 text-[13px] font-extrabold uppercase tracking-wide text-sky-950">
                  Adicionais
                </h2>
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
                  <Field label="Valor por kg">
                    <MoneyInput value={form.valor_kg} onChange={(valor_kg) => patch({ valor_kg })} />
                  </Field>
                  <Field label="Ajudante">
                    <MoneyInput value={form.ajudante} onChange={(ajudante) => patch({ ajudante })} />
                  </Field>
                  <Field label="Diesel">
                    <MoneyInput value={form.diesel} onChange={(diesel) => patch({ diesel })} />
                  </Field>
                  <Field label="Chapa">
                    <MoneyInput value={form.chapa} onChange={(chapa) => patch({ chapa })} />
                  </Field>
                  <Field label="Pedágio">
                    <MoneyInput value={form.pedagio} onChange={(pedagio) => patch({ pedagio })} />
                  </Field>
                  <Field label="Adicional de entrega">
                    <MoneyInput
                      value={form.adicional_entrega}
                      onChange={(adicional_entrega) => patch({ adicional_entrega })}
                    />
                  </Field>
                  <Field label="Descarga">
                    <MoneyInput value={form.descarga} onChange={(descarga) => patch({ descarga })} />
                  </Field>
                  <Field label="Imposto">
                    <MoneyInput value={form.imposto} onChange={(imposto) => patch({ imposto })} />
                  </Field>
                  <Field label="Incentivo">
                    <MoneyInput
                      value={form.incentivo}
                      onChange={(incentivo) => patch({ incentivo })}
                    />
                  </Field>
                  <Field label="Adicional por escada">
                    <NumInput
                      value={form.adicional_escada}
                      onChange={(adicional_escada) => patch({ adicional_escada })}
                    />
                  </Field>
                  <Field label="Adicional por cidade">
                    <NumInput
                      value={form.adicional_cidade}
                      onChange={(adicional_cidade) => patch({ adicional_cidade })}
                    />
                  </Field>
                  <Field label="Contar cidade da origem?">
                    <select
                      className={inputClass}
                      value={form.contar_cidade_origem ? 'sim' : 'nao'}
                      onChange={(e) =>
                        patch({ contar_cidade_origem: e.target.value === 'sim' })
                      }
                    >
                      <option value="nao">Não</option>
                      <option value="sim">Sim</option>
                    </select>
                  </Field>
                  <Field label="Adicional sobre frete base (%)">
                    <NumInput
                      step={0.01}
                      value={form.adicional_sobre_frete_base_pct}
                      onChange={(adicional_sobre_frete_base_pct) =>
                        patch({ adicional_sobre_frete_base_pct })
                      }
                    />
                  </Field>
                </div>
              </div>
              <div>
                <h2 className="mb-2 text-[13px] font-extrabold uppercase tracking-wide text-ink">
                  Adicional por km
                </h2>
                <FaixasKm
                  colKm="Limite de km"
                  rows={form.adicional_por_km ?? []}
                  onChange={(adicional_por_km) => patch({ adicional_por_km })}
                />
              </div>
            </>
          )}

          <div className="flex flex-wrap justify-end gap-2 border-t border-ink/10 pt-3">
            {tabelas.some((t) => t.id === form.id) && (
              <Button
                variant="ghost"
                onClick={() => {
                  if (!window.confirm(`Excluir a tabela “${form.nome}”?`)) return
                  excluirTabela(form.id)
                  nova()
                  setMsg('Tabela excluída.')
                }}
              >
                Excluir
              </Button>
            )}
            <Button variant="ghost" onClick={nova}>
              Limpar
            </Button>
            <Button onClick={salvar}>Salvar</Button>
          </div>
        </section>
      </div>
    </div>
  )
}
