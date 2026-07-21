import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { useData } from '../../context/DataContext'
import { formatPrazoLabel } from '../../lib/businessRules'
import { canEditModulo } from '../../lib/portalModules'
import type { ClassificacaoRota } from '../../types'
import { Button, Field, inputClass } from '../../components/ui/Modal'
import '../../styles/cadastro.css'

function Hint({ children }: { children: ReactNode }) {
  return <p className="text-[12px] leading-relaxed text-ink-muted">{children}</p>
}

export function ConfiguracoesPage() {
  const { config, salvarConfig, user } = useData()
  const canEdit =
    canEditModulo(user?.permissoes_modulos, 'configuracoes') || Boolean(user?.is_superuser)
  const [form, setForm] = useState(config)
  const [msg, setMsg] = useState('')
  const [avancado, setAvancado] = useState(false)

  useEffect(() => setForm(config), [config])

  function setMargem(classe: ClassificacaoRota, idx: number, value: number) {
    setForm((prev) => {
      const arr = [...prev.margens[classe]]
      arr[idx] = value
      return { ...prev, margens: { ...prev.margens, [classe]: arr } }
    })
  }

  const resumoPrioridade = useMemo(() => {
    const lim = form.limite_urgencia_minutos
    return {
      limLabel: formatPrazoLabel(lim),
      padraoLabel: formatPrazoLabel(form.prazo_oferta_padrao_minutos),
      alocLabel: formatPrazoLabel(form.prazo_alocacao_padrao_minutos),
    }
  }, [form.limite_urgencia_minutos, form.prazo_oferta_padrao_minutos, form.prazo_alocacao_padrao_minutos])

  const exemploLance = useMemo(() => {
    const base = 1000
    const minPct = form.lance_min_percentual
    const maxPct = form.lance_max_percentual
    if (minPct == null && maxPct == null) return 'Sem limite de valor no lance.'
    const min =
      minPct != null ? `R$ ${(base * (1 + minPct / 100)).toFixed(0)}` : 'sem piso'
    const max =
      maxPct != null ? `R$ ${(base * (1 + maxPct / 100)).toFixed(0)}` : 'sem teto'
    return `Exemplo com frete oferta R$ 1.000: lance entre ${min} e ${max}.`
  }, [form.lance_min_percentual, form.lance_max_percentual])

  function save() {
    if (!canEdit) return
    if (form.prazo_oferta_minimo_minutos > form.prazo_oferta_maximo_minutos) {
      setMsg('O tempo mínimo não pode ser maior que o máximo.')
      return
    }
    salvarConfig(form)
    setMsg('Configurações salvas.')
  }

  return (
    <div className="cadastro-page animate-fade-up mx-auto max-w-3xl">
      <header className="mb-5">
        <h1 className="cadastro-page-title">Configurações</h1>
        <p className="text-sm text-ink-muted">
          Defina os padrões usados ao publicar e negociar cargas.
        </p>
      </header>

      {!canEdit && (
        <p className="mb-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
          Perfil de consulta — apenas visualização.
        </p>
      )}

      <div className="space-y-4">
        {/* 1. Tempos simples */}
        <section className="rounded-xl border border-ink/10 bg-white p-4 space-y-3">
          <div>
            <h2 className="font-display text-base font-semibold">1. Tempos padrão</h2>
            <Hint>Valores usados automaticamente ao publicar uma carga.</Hint>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Quanto tempo fica aberta a negociação?">
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min={1}
                  className={inputClass}
                  disabled={!canEdit}
                  value={form.prazo_oferta_padrao_minutos}
                  onChange={(e) =>
                    setForm({ ...form, prazo_oferta_padrao_minutos: Number(e.target.value) })
                  }
                />
                <span className="shrink-0 text-xs text-ink-muted">min</span>
              </div>
              <p className="mt-1 text-[11px] text-ink-muted">Agora: {resumoPrioridade.padraoLabel}</p>
            </Field>
            <Field label="Quanto tempo o transportador tem para alocar?">
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min={1}
                  className={inputClass}
                  disabled={!canEdit}
                  value={form.prazo_alocacao_padrao_minutos}
                  onChange={(e) =>
                    setForm({ ...form, prazo_alocacao_padrao_minutos: Number(e.target.value) })
                  }
                />
                <span className="shrink-0 text-xs text-ink-muted">min</span>
              </div>
              <p className="mt-1 text-[11px] text-ink-muted">Agora: {resumoPrioridade.alocLabel}</p>
            </Field>
          </div>
        </section>

        {/* 2. Prioridade / Modo — a parte que mais confunde */}
        <section className="rounded-xl border border-ink/10 bg-white p-4 space-y-3">
          <div>
            <h2 className="font-display text-base font-semibold">2. Prioridade e modo</h2>
            <Hint>
              Não se escolhe na mão. O sistema define conforme o prazo da negociação.
            </Hint>
          </div>

          <Field label="A partir de quantos minutos vira urgente (Oferta)?">
            <div className="flex items-center gap-2">
              <input
                type="number"
                min={1}
                className={inputClass}
                disabled={!canEdit}
                value={form.limite_urgencia_minutos}
                onChange={(e) =>
                  setForm({ ...form, limite_urgencia_minutos: Number(e.target.value) })
                }
              />
              <span className="shrink-0 text-xs text-ink-muted">min</span>
            </div>
          </Field>

          <div className="grid gap-2 sm:grid-cols-2">
            <div className="rounded-lg border border-brand/30 bg-brand/5 px-3 py-2.5 text-xs">
              <p className="font-bold text-brand">Prazo ≤ {resumoPrioridade.limLabel}</p>
              <p className="mt-1 text-ink">
                Prioridade <strong>Alta</strong> · Modo <strong>Oferta</strong>
              </p>
              <p className="mt-0.5 text-ink-muted">Primeiro lance válido fecha. Pede justificativa.</p>
            </div>
            <div className="rounded-lg border border-ink/15 bg-sand-light/60 px-3 py-2.5 text-xs">
              <p className="font-bold text-ink">Prazo &gt; {resumoPrioridade.limLabel}</p>
              <p className="mt-1 text-ink">
                Prioridade <strong>Média/Baixa</strong> · Modo <strong>Leilão</strong>
              </p>
              <p className="mt-0.5 text-ink-muted">Recebe várias propostas até o fim do prazo.</p>
            </div>
          </div>
        </section>

        {/* 3. Margens */}
        <section className="rounded-xl border border-ink/10 bg-white p-4 space-y-3">
          <div>
            <h2 className="font-display text-base font-semibold">3. Margens do frete oferta</h2>
            <Hint>
              Percentual aplicado sobre o frete tabela ao publicar. Valores negativos = desconto.
              Cada rota tem 3 opções para escolher na publicação.
            </Hint>
          </div>
          {(['A', 'B', 'C'] as const).map((classe) => (
            <div key={classe} className="rounded-lg border border-ink/10 bg-sand-light/40 p-3">
              <p className="mb-2 text-xs font-bold text-ink">Rota {classe}</p>
              <div className="grid grid-cols-3 gap-2">
                {form.margens[classe].map((v, i) => (
                  <Field key={i} label={`Opção ${i + 1} (%)`}>
                    <input
                      type="number"
                      className={inputClass}
                      disabled={!canEdit}
                      value={v}
                      onChange={(e) => setMargem(classe, i, Number(e.target.value))}
                    />
                  </Field>
                ))}
              </div>
            </div>
          ))}
        </section>

        {/* 4. Lances */}
        <section className="rounded-xl border border-ink/10 bg-white p-4 space-y-3">
          <div>
            <h2 className="font-display text-base font-semibold">4. Limites do lance</h2>
            <Hint>
              Em % sobre o frete oferta. Ex.: −20 = até 20% abaixo; 0 = não pode passar do frete
              oferta.
            </Hint>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Mais baixo permitido (%)">
              <input
                type="number"
                className={inputClass}
                disabled={!canEdit}
                placeholder="ex.: -20"
                value={form.lance_min_percentual ?? ''}
                onChange={(e) =>
                  setForm({
                    ...form,
                    lance_min_percentual: e.target.value === '' ? null : Number(e.target.value),
                  })
                }
              />
            </Field>
            <Field label="Mais alto permitido (%)">
              <input
                type="number"
                className={inputClass}
                disabled={!canEdit}
                placeholder="ex.: 0"
                value={form.lance_max_percentual ?? ''}
                onChange={(e) =>
                  setForm({
                    ...form,
                    lance_max_percentual: e.target.value === '' ? null : Number(e.target.value),
                  })
                }
              />
            </Field>
          </div>
          <Hint>{exemploLance} Deixe em branco para sem limite.</Hint>

          <label className="flex items-start gap-2 rounded-lg border border-ink/10 bg-sand-light/40 px-3 py-2.5 text-sm">
            <input
              type="checkbox"
              className="mt-0.5"
              disabled={!canEdit}
              checked={form.empate_exige_aceite_manual}
              onChange={(e) =>
                setForm({ ...form, empate_exige_aceite_manual: e.target.checked })
              }
            />
            <span>
              <span className="font-semibold text-ink">Empate: eu escolho o vencedor</span>
              <span className="mt-0.5 block text-[12px] text-ink-muted">
                Se dois lances empatam no valor, a carga não fecha sozinha — o embarcador aceita.
              </span>
            </span>
          </label>
        </section>

        {/* 5. Avançado */}
        <section className="rounded-xl border border-ink/10 bg-white p-4 space-y-3">
          <button
            type="button"
            className="flex w-full items-center justify-between text-left"
            onClick={() => setAvancado((v) => !v)}
          >
            <div>
              <h2 className="font-display text-base font-semibold">5. Opções avançadas</h2>
              <Hint>Faixa de prazos permitidos e integração com Controle de Fretes.</Hint>
            </div>
            <span className="text-xs font-bold text-ink-muted">{avancado ? 'Ocultar' : 'Mostrar'}</span>
          </button>

          {avancado && (
            <div className="space-y-4 border-t border-ink/10 pt-3">
              <div>
                <p className="mb-2 text-xs font-bold text-ink">Faixa de prazo ao publicar</p>
                <Hint>Só entram no seletor de prazo valores entre o mínimo e o máximo.</Hint>
                <div className="mt-2 grid gap-3 sm:grid-cols-2">
                  <Field label="Menor prazo permitido (min)">
                    <input
                      type="number"
                      min={1}
                      className={inputClass}
                      disabled={!canEdit}
                      value={form.prazo_oferta_minimo_minutos}
                      onChange={(e) =>
                        setForm({
                          ...form,
                          prazo_oferta_minimo_minutos: Number(e.target.value),
                        })
                      }
                    />
                  </Field>
                  <Field label="Maior prazo permitido (min)">
                    <input
                      type="number"
                      min={1}
                      className={inputClass}
                      disabled={!canEdit}
                      value={form.prazo_oferta_maximo_minutos}
                      onChange={(e) =>
                        setForm({
                          ...form,
                          prazo_oferta_maximo_minutos: Number(e.target.value),
                        })
                      }
                    />
                  </Field>
                </div>
                <p className="mt-1 text-[11px] text-ink-muted">
                  Atual: de {formatPrazoLabel(form.prazo_oferta_minimo_minutos)} até{' '}
                  {formatPrazoLabel(form.prazo_oferta_maximo_minutos)}.
                </p>
              </div>

              <div className="space-y-2">
                <p className="text-xs font-bold text-ink">Controle de Fretes</p>
                <label className="flex items-start gap-2 text-sm">
                  <input
                    type="checkbox"
                    className="mt-0.5"
                    disabled={!canEdit}
                    checked={form.controle_fretes_ativo}
                    onChange={(e) =>
                      setForm({ ...form, controle_fretes_ativo: e.target.checked })
                    }
                  />
                  <span>
                    Enviar automaticamente depois que a carga for alocada
                    <span className="mt-0.5 block text-[12px] text-ink-muted">
                      Sem URL, o envio fica só registrado no histórico (simulado).
                    </span>
                  </span>
                </label>
                <Field label="URL do sistema (opcional)">
                  <input
                    className={inputClass}
                    disabled={!canEdit}
                    placeholder="https://seu-sistema/api/controle-fretes"
                    value={form.controle_fretes_url}
                    onChange={(e) => setForm({ ...form, controle_fretes_url: e.target.value })}
                  />
                </Field>
              </div>
            </div>
          )}
        </section>
      </div>

      {msg && (
        <p
          className={`mt-4 text-sm ${
            msg.includes('não pode') ? 'text-brand' : 'text-emerald-700'
          }`}
        >
          {msg}
        </p>
      )}

      {canEdit && (
        <div className="sticky bottom-3 mt-5">
          <Button variant="success" className="w-full sm:w-auto" onClick={save}>
            Salvar configurações
          </Button>
        </div>
      )}
    </div>
  )
}
