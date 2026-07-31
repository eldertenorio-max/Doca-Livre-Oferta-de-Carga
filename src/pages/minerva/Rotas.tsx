import { useMemo, useState } from 'react'
import { useData } from '../../context/DataContext'
import { formatCurrency, moneyFromDigits } from '../../lib/businessRules'
import { newRotaId } from '../../lib/rotasSync'
import { buscarCidades, filtrarSugestoes } from '../../lib/cidadesBrasil'
import type { ClassificacaoRota, Rota } from '../../types'
import { Button, Field, Modal, inputClass } from '../../components/ui/Modal'
import { AddressSuggestInput } from '../../components/ui/AddressSuggestInput'
import { RotaMapPreview } from '../../components/carga/RotaMapPreview'

const emptyForm = (): Partial<Rota> => ({
  descricao: '',
  origem: '',
  destino: '',
  classificacao: 'B',
  frete_tabela: 0,
  km: 0,
  situacao: 'ativo',
})

export function RotasPage() {
  const { rotas, salvarRota } = useData()
  const [form, setForm] = useState<Partial<Rota>>(emptyForm)
  const [freteStr, setFreteStr] = useState('')
  const [kmStr, setKmStr] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [mapaRota, setMapaRota] = useState<Rota | null>(null)

  function carregarForm(r?: Partial<Rota> | null) {
    if (!r) {
      setForm(emptyForm())
      setFreteStr('')
      setKmStr('')
      return
    }
    setForm(r)
    setFreteStr(
      r.frete_tabela && r.frete_tabela > 0
        ? moneyFromDigits(String(Math.round(r.frete_tabela * 100))).display
        : '',
    )
    setKmStr(r.km && r.km > 0 ? String(r.km) : '')
  }

  const sugOrigem = useMemo(
    () => (q: string) =>
      filtrarSugestoes(q, [buscarCidades(q, 10), rotas.map((r) => r.origem)], 10),
    [rotas],
  )
  const sugDestino = useMemo(
    () => (q: string) =>
      filtrarSugestoes(q, [buscarCidades(q, 10), rotas.map((r) => r.destino)], 10),
    [rotas],
  )

  function save() {
    if (!form.descricao || !form.origem || !form.destino) return
    const rota: Rota = {
      id: editingId ?? newRotaId(),
      descricao: form.descricao!,
      origem: form.origem!,
      destino: form.destino!,
      classificacao: (form.classificacao as ClassificacaoRota) ?? 'B',
      frete_tabela: Number(form.frete_tabela) || 0,
      km: Number(form.km) || 0,
      situacao: (form.situacao as 'ativo' | 'inativo') ?? 'ativo',
    }
    salvarRota(rota)
    setEditingId(null)
    carregarForm(null)
  }

  return (
    <div className="w-full space-y-6 animate-fade-up">
      <header>
        <h2 className="font-display text-2xl font-bold">Rotas de Frete</h2>
        <p className="text-sm text-ink-muted">
          Cadastro de rotas de frete com classificação ABC.
        </p>
      </header>

      <div className="overflow-hidden rounded-xl border border-ink/10 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-ink text-left text-xs text-sand-light">
            <tr>
              <th className="px-4 py-3">Descrição</th>
              <th>Classificação</th>
              <th>Frete Tabela</th>
              <th>KM</th>
              <th>Situação</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rotas.map((r) => (
              <tr key={r.id} className="border-t border-ink/5">
                <td className="px-4 py-3">
                  <p className="font-medium">{r.descricao}</p>
                  <p className="text-xs text-ink-muted">
                    {r.origem} → {r.destino}
                  </p>
                </td>
                <td>
                  <span
                    className={`rounded px-2 py-0.5 text-xs font-bold text-white ${
                      r.classificacao === 'A'
                        ? 'bg-emerald-500'
                        : r.classificacao === 'B'
                          ? 'bg-amber-500'
                          : 'bg-brand'
                    }`}
                  >
                    Rota {r.classificacao}
                  </span>
                </td>
                <td>{formatCurrency(r.frete_tabela)}</td>
                <td>{r.km}</td>
                <td className="capitalize">{r.situacao}</td>
                <td className="px-4">
                  <div className="flex flex-wrap items-center justify-end gap-2">
                    <button
                      type="button"
                      className="rounded-md border border-ink/20 bg-white px-2 py-1 text-xs font-bold text-ink hover:bg-ink/5"
                      onClick={() => setMapaRota(r)}
                    >
                      Ver mapa
                    </button>
                    <button
                      type="button"
                      className="text-xs font-semibold text-ink hover:underline"
                      onClick={() => {
                        setEditingId(r.id)
                        carregarForm(r)
                      }}
                    >
                      Editar
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Modal
        open={Boolean(mapaRota)}
        title={mapaRota ? `Mapa — ${mapaRota.descricao}` : 'Mapa da rota'}
        onClose={() => setMapaRota(null)}
        wide
      >
        {mapaRota && (
          <div className="space-y-2">
            <p className="text-xs text-ink-muted">
              {mapaRota.origem} → {mapaRota.destino}
              {mapaRota.km > 0 ? ` · ${mapaRota.km} km cadastrados` : ''}
            </p>
            <RotaMapPreview
              key={mapaRota.id}
              origem={mapaRota.origem}
              destino={mapaRota.destino}
              className="h-[360px] min-h-[360px] w-full"
            />
          </div>
        )}
      </Modal>

      <div className="rounded-xl border border-ink/10 bg-white p-4">
        <h3 className="mb-3 font-display font-semibold">
          {editingId ? 'Editar rota' : 'Nova rota'}
        </h3>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Descrição">
            <input
              className={inputClass}
              value={form.descricao ?? ''}
              onChange={(e) => setForm({ ...form, descricao: e.target.value })}
            />
          </Field>
          <Field label="Classificação">
            <select
              className={inputClass}
              value={form.classificacao}
              onChange={(e) =>
                setForm({ ...form, classificacao: e.target.value as ClassificacaoRota })
              }
            >
              <option value="A">A</option>
              <option value="B">B</option>
              <option value="C">C</option>
            </select>
          </Field>
          <Field label="Origem">
            <AddressSuggestInput
              value={form.origem ?? ''}
              onChange={(origem) => setForm({ ...form, origem })}
              localSuggestions={sugOrigem}
              minChars={2}
              placeholder="Digite o endereço como no Google Maps"
            />
          </Field>
          <Field label="Destino">
            <AddressSuggestInput
              value={form.destino ?? ''}
              onChange={(destino) => setForm({ ...form, destino })}
              localSuggestions={sugDestino}
              minChars={2}
              placeholder="Digite o endereço como no Google Maps"
            />
          </Field>
          <Field label="Frete Tabela">
            <input
              className={inputClass}
              inputMode="decimal"
              placeholder="0,00"
              value={freteStr}
              onChange={(e) => {
                const digits = e.target.value.replace(/\D/g, '')
                if (!digits) {
                  setFreteStr('')
                  setForm({ ...form, frete_tabela: 0 })
                  return
                }
                const { display, value } = moneyFromDigits(digits)
                setFreteStr(display)
                setForm({ ...form, frete_tabela: value })
              }}
            />
          </Field>
          <Field label="KM">
            <input
              className={inputClass}
              inputMode="decimal"
              placeholder="0"
              value={kmStr}
              onChange={(e) => {
                const raw = e.target.value.replace(/[^\d.,]/g, '')
                setKmStr(raw)
                const n = Number(raw.replace(',', '.'))
                setForm({ ...form, km: Number.isFinite(n) ? n : 0 })
              }}
            />
          </Field>
        </div>
        <Button variant="success" className="mt-4" onClick={save}>
          {editingId ? 'Salvar' : 'Adicionar'}
        </Button>
      </div>
    </div>
  )
}
