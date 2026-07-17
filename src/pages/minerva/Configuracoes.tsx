import { useEffect, useState } from 'react'
import { useData } from '../../context/DataContext'
import { canEditModulo } from '../../lib/portalModules'
import type { ClassificacaoRota } from '../../types'
import { Button, Field, inputClass } from '../../components/ui/Modal'
import '../../styles/cadastro.css'

export function ConfiguracoesPage() {
  const { config, salvarConfig, user } = useData()
  const canEdit = canEditModulo(user?.permissoes_modulos, 'configuracoes') || Boolean(user?.is_superuser)
  const [form, setForm] = useState(config)
  const [msg, setMsg] = useState('')

  useEffect(() => setForm(config), [config])

  function setMargem(classe: ClassificacaoRota, idx: number, value: number) {
    setForm((prev) => {
      const arr = [...prev.margens[classe]]
      arr[idx] = value
      return { ...prev, margens: { ...prev.margens, [classe]: arr } }
    })
  }

  function save() {
    if (!canEdit) return
    if (form.prazo_oferta_minimo_minutos > form.prazo_oferta_maximo_minutos) {
      setMsg('Tempo mínimo não pode ser maior que o máximo.')
      return
    }
    salvarConfig(form)
    setMsg('Configurações salvas.')
  }

  return (
    <div className="cadastro-page animate-fade-up">
      <header className="mb-4">
        <h1 className="cadastro-page-title">Configurações de Oferta</h1>
        <p className="text-sm text-ink-muted">
          Tempos padrão, margens por rota ABC, urgência e integração com Controle de Fretes.
        </p>
      </header>

      {!canEdit && (
        <p className="mb-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
          Perfil de consulta — apenas visualização.
        </p>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-xl border border-ink/10 bg-white p-4 space-y-3">
          <h2 className="font-display font-semibold">Tempos da oferta</h2>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Padrão (min)">
              <input
                type="number"
                className={inputClass}
                disabled={!canEdit}
                value={form.prazo_oferta_padrao_minutos}
                onChange={(e) =>
                  setForm({ ...form, prazo_oferta_padrao_minutos: Number(e.target.value) })
                }
              />
            </Field>
            <Field label="Alocação padrão (min)">
              <input
                type="number"
                className={inputClass}
                disabled={!canEdit}
                value={form.prazo_alocacao_padrao_minutos}
                onChange={(e) =>
                  setForm({ ...form, prazo_alocacao_padrao_minutos: Number(e.target.value) })
                }
              />
            </Field>
            <Field label="Mínimo (min)">
              <input
                type="number"
                className={inputClass}
                disabled={!canEdit}
                value={form.prazo_oferta_minimo_minutos}
                onChange={(e) =>
                  setForm({ ...form, prazo_oferta_minimo_minutos: Number(e.target.value) })
                }
              />
            </Field>
            <Field label="Máximo (min)">
              <input
                type="number"
                className={inputClass}
                disabled={!canEdit}
                value={form.prazo_oferta_maximo_minutos}
                onChange={(e) =>
                  setForm({ ...form, prazo_oferta_maximo_minutos: Number(e.target.value) })
                }
              />
            </Field>
            <Field label="Limite urgência / Oferta (min)">
              <input
                type="number"
                className={inputClass}
                disabled={!canEdit}
                value={form.limite_urgencia_minutos}
                onChange={(e) =>
                  setForm({ ...form, limite_urgencia_minutos: Number(e.target.value) })
                }
              />
            </Field>
          </div>
          <p className="text-xs text-ink-muted">
            Abaixo do limite de urgência: prioridade Alta + modo Oferta (exige justificativa). Acima:
            Leilão com melhor proposta ao fim do prazo.
          </p>
        </section>

        <section className="rounded-xl border border-ink/10 bg-white p-4 space-y-3">
          <h2 className="font-display font-semibold">Margens por rota (ABC)</h2>
          {(['A', 'B', 'C'] as const).map((classe) => (
            <div key={classe}>
              <p className="mb-1 text-xs font-semibold text-ink-muted">Classe {classe} (%)</p>
              <div className="grid grid-cols-3 gap-2">
                {form.margens[classe].map((v, i) => (
                  <input
                    key={i}
                    type="number"
                    className={inputClass}
                    disabled={!canEdit}
                    value={v}
                    onChange={(e) => setMargem(classe, i, Number(e.target.value))}
                  />
                ))}
              </div>
            </div>
          ))}
        </section>

        <section className="rounded-xl border border-ink/10 bg-white p-4 space-y-3">
          <h2 className="font-display font-semibold">Limites de lance</h2>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Mínimo (% sobre frete oferta)">
              <input
                type="number"
                className={inputClass}
                disabled={!canEdit}
                placeholder="-20"
                value={form.lance_min_percentual ?? ''}
                onChange={(e) =>
                  setForm({
                    ...form,
                    lance_min_percentual:
                      e.target.value === '' ? null : Number(e.target.value),
                  })
                }
              />
            </Field>
            <Field label="Máximo (% sobre frete oferta)">
              <input
                type="number"
                className={inputClass}
                disabled={!canEdit}
                placeholder="0"
                value={form.lance_max_percentual ?? ''}
                onChange={(e) =>
                  setForm({
                    ...form,
                    lance_max_percentual:
                      e.target.value === '' ? null : Number(e.target.value),
                  })
                }
              />
            </Field>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              disabled={!canEdit}
              checked={form.empate_exige_aceite_manual}
              onChange={(e) =>
                setForm({ ...form, empate_exige_aceite_manual: e.target.checked })
              }
            />
            Empate de valor exige aceite manual (não fecha no timer)
          </label>
          <p className="text-xs text-ink-muted">
            Ex.: mínimo −20 e máximo 0 = lances entre 80% e 100% do frete oferta. Deixe vazio para
            sem limite.
          </p>
        </section>

        <section className="rounded-xl border border-ink/10 bg-white p-4 space-y-3 lg:col-span-2">
          <h2 className="font-display font-semibold">Integração Controle de Fretes</h2>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              disabled={!canEdit}
              checked={form.controle_fretes_ativo}
              onChange={(e) => setForm({ ...form, controle_fretes_ativo: e.target.checked })}
            />
            Enviar automaticamente após alocação
          </label>
          <Field label="URL do endpoint (POST JSON)">
            <input
              className={inputClass}
              disabled={!canEdit}
              placeholder="https://seu-sistema/api/controle-fretes"
              value={form.controle_fretes_url}
              onChange={(e) => setForm({ ...form, controle_fretes_url: e.target.value })}
            />
          </Field>
          <p className="text-xs text-ink-muted">
            Sem URL, o sistema registra a integração como “simulada” no histórico (fila local).
          </p>
        </section>
      </div>

      {msg && <p className="mt-3 text-sm text-emerald-700">{msg}</p>}

      {canEdit && (
        <div className="mt-4">
          <Button variant="success" onClick={save}>
            Salvar configurações
          </Button>
        </div>
      )}
    </div>
  )
}
