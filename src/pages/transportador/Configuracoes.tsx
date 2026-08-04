import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { useData } from '../../context/DataContext'
import {
  DEFAULT_CONFIG_TRANSPORTADOR,
  type ConfigTransportador,
} from '../../lib/configTransportador'
import { formatMoneyInput, moneyFromDigits, parseMoneyInput } from '../../lib/businessRules'
import { TIPOS_VEICULO } from '../../lib/tiposVeiculo'
import { Button, Field, inputClass } from '../../components/ui/Modal'
import { TransportadorPerfilEditor } from '../../components/transportador/TransportadorPerfilEditor'
import { TransportadorPerfilSite } from '../../components/transportador/TransportadorPerfilSite'
import {
  EMPTY_PERFIL_PUBLICO,
  normalizePerfilPublico,
  type PerfilPublicoTransportador,
} from '../../lib/perfilPublicoTransportador'
import '../../styles/cadastro.css'
import '../../styles/perfil.css'

type AbaConfig = 'geral' | 'portfolio'

function Hint({ children }: { children: ReactNode }) {
  return <p className="text-[12px] leading-relaxed text-ink-muted">{children}</p>
}

function SimNao({
  label,
  checked,
  disabled,
  onChange,
  hint,
}: {
  label: string
  checked: boolean
  disabled?: boolean
  onChange: (v: boolean) => void
  hint?: string
}) {
  return (
    <label className="flex items-start gap-2 rounded-lg border border-ink/10 bg-sand-light/40 px-3 py-2.5 text-sm">
      <input
        type="checkbox"
        className="mt-0.5"
        disabled={disabled}
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span>
        <span className="font-semibold text-ink">{label}</span>
        {hint ? (
          <span className="mt-0.5 block text-[12px] text-ink-muted">{hint}</span>
        ) : null}
      </span>
    </label>
  )
}

export function ConfiguracoesTransportadorPage() {
  const {
    configTransportador,
    salvarConfigTransportador,
    salvarTransportador,
    effectiveTransportadorId,
    transportadorById,
  } = useData()
  const tid = effectiveTransportadorId()
  const empresa = tid ? transportadorById(tid) : undefined
  const [form, setForm] = useState<ConfigTransportador>(
    configTransportador ?? DEFAULT_CONFIG_TRANSPORTADOR,
  )
  const [freteMinStr, setFreteMinStr] = useState('')
  const [msg, setMsg] = useState('')
  const [perfil, setPerfil] = useState<PerfilPublicoTransportador>(EMPTY_PERFIL_PUBLICO)
  const [previewPerfil, setPreviewPerfil] = useState(false)
  const [aba, setAba] = useState<AbaConfig>('geral')

  useEffect(() => {
    const cfg = configTransportador ?? DEFAULT_CONFIG_TRANSPORTADOR
    setForm(cfg)
    setFreteMinStr(
      cfg.frete_minimo_empresa != null && cfg.frete_minimo_empresa > 0
        ? formatMoneyInput(cfg.frete_minimo_empresa)
        : '',
    )
  }, [configTransportador, tid])

  useEffect(() => {
    setPerfil(normalizePerfilPublico(empresa?.perfil_publico))
  }, [empresa?.id, empresa?.perfil_publico])

  const tiposSelecionados = useMemo(
    () => new Set(form.tipos_veiculo_preferidos),
    [form.tipos_veiculo_preferidos],
  )

  function toggleTipo(tipo: string) {
    setForm((prev) => {
      const set = new Set(prev.tipos_veiculo_preferidos)
      if (set.has(tipo)) set.delete(tipo)
      else set.add(tipo)
      return { ...prev, tipos_veiculo_preferidos: [...set] }
    })
  }

  function save() {
    if (!tid) {
      setMsg('Conta sem transportadora vinculada.')
      return
    }
    const min = freteMinStr.trim() ? parseMoneyInput(freteMinStr) : null
    const pct = form.porcentagem_aceita
    if (pct != null && (!Number.isFinite(pct) || pct < 0 || pct > 100)) {
      setMsg('Informe uma porcentagem aceita entre 0 e 100.')
      return
    }
    salvarConfigTransportador({
      ...form,
      frete_minimo_empresa: min != null && Number.isFinite(min) ? min : null,
      porcentagem_aceita: pct != null && Number.isFinite(pct) ? pct : null,
    })
    if (empresa) {
      salvarTransportador({
        ...empresa,
        perfil_publico: normalizePerfilPublico(perfil),
      })
    }
    setMsg(aba === 'portfolio' ? 'Portfólio salvo.' : 'Configurações salvas.')
  }

  if (!tid) {
    return (
      <div className="cadastro-page animate-fade-up">
        <h1 className="cadastro-page-title">Configurações</h1>
        <p className="text-sm text-ink-muted">
          Sua conta não está vinculada a uma transportadora.
        </p>
      </div>
    )
  }

  return (
    <div className="cadastro-page animate-fade-up">
      <header className="mb-5">
        <h1 className="cadastro-page-title">Configurações</h1>
        <p className="text-sm text-ink-muted">
          Preferências de {empresa?.nome_fantasia || 'sua transportadora'} — negociação,
          notificações, operação e portfólio.
        </p>
      </header>

      <div className="perfil-tabs" role="tablist" aria-label="Seções de configurações">
        <button
          type="button"
          role="tab"
          aria-selected={aba === 'geral'}
          className={aba === 'geral' ? 'is-active' : undefined}
          onClick={() => {
            setAba('geral')
            setMsg('')
          }}
        >
          Geral
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={aba === 'portfolio'}
          className={aba === 'portfolio' ? 'is-active' : undefined}
          onClick={() => {
            setAba('portfolio')
            setMsg('')
          }}
        >
          Portfólio
        </button>
      </div>

      {aba === 'geral' ? (
      <div className="space-y-4">
        {/* 1 · Negociação */}
        <section className="space-y-3 rounded-xl border border-ink/10 bg-white p-4">
          <div>
            <h2 className="font-display text-base font-semibold">1. Negociação e lances</h2>
            <Hint>Limites e preferências ao ofertar frete nas cargas.</Hint>
          </div>
          <div className="grid max-w-md gap-3">
            <Field label="Frete mínimo da empresa (R$)">
              <input
                className={inputClass}
                inputMode="decimal"
                placeholder="Opcional"
                value={freteMinStr}
                onChange={(e) => {
                  const digits = e.target.value.replace(/\D/g, '')
                  if (!digits) {
                    setFreteMinStr('')
                    return
                  }
                  setFreteMinStr(moneyFromDigits(digits).display)
                }}
              />
            </Field>
            <Field label="Porcentagem aceita (%)">
              <div className="flex items-center gap-2">
                <input
                  className={inputClass}
                  type="number"
                  min={0}
                  max={100}
                  step={0.1}
                  placeholder="ex.: 10"
                  value={form.porcentagem_aceita ?? ''}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      porcentagem_aceita:
                        e.target.value === '' ? null : Number(e.target.value),
                    })
                  }
                />
                <span className="shrink-0 text-xs text-ink-muted">%</span>
              </div>
              <p className="mt-1 text-[11px] text-ink-muted">
                Margem percentual que você aceita negociar em relação ao frete
                oferta.
              </p>
            </Field>
          </div>
          <SimNao
            label="Alertar se frete oferta estiver abaixo do frete mínimo da placa"
            checked={form.alertar_frete_abaixo_minimo_placa}
            onChange={(v) => setForm({ ...form, alertar_frete_abaixo_minimo_placa: v })}
            hint="Avisa no lance quando o valor estiver abaixo do mínimo cadastrado no veículo."
          />
          <SimNao
            label="Aceitar cargas de retorno"
            checked={form.aceita_carga_retorno}
            onChange={(v) => setForm({ ...form, aceita_carga_retorno: v })}
          />
          <SimNao
            label="Aceitar cargas que retornam para origem"
            checked={form.aceita_retorna_origem}
            onChange={(v) => setForm({ ...form, aceita_retorna_origem: v })}
          />
          <div>
            <p className="mb-2 text-xs font-bold text-ink">Tipos de veículo preferidos</p>
            <Hint>Deixe vazio para aceitar qualquer tipo. Marque os que sua frota prioriza.</Hint>
            <div className="mt-2 max-h-40 space-y-1 overflow-y-auto rounded-lg border border-ink/15 p-3">
              {TIPOS_VEICULO.map((tipo) => (
                <label key={tipo} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={tiposSelecionados.has(tipo)}
                    onChange={() => toggleTipo(tipo)}
                  />
                  <span>{tipo}</span>
                </label>
              ))}
            </div>
          </div>
        </section>

        {/* 4 · Notificações */}
        <section className="space-y-3 rounded-xl border border-ink/10 bg-white p-4">
          <div>
            <h2 className="font-display text-base font-semibold">2. Notificações</h2>
            <Hint>
              Escolha o que deseja receber. O push no celular ainda depende da permissão do
              navegador (banner Ativar alertas).
            </Hint>
          </div>
          <SimNao
            label="Nova oferta de carga"
            checked={form.notif_nova_oferta}
            onChange={(v) => setForm({ ...form, notif_nova_oferta: v })}
          />
          <SimNao
            label="Contra-proposta do embarcador"
            checked={form.notif_contra_proposta}
            onChange={(v) => setForm({ ...form, notif_contra_proposta: v })}
          />
          <SimNao
            label="Frete fechado / vencedor"
            checked={form.notif_frete_fechado}
            onChange={(v) => setForm({ ...form, notif_frete_fechado: v })}
          />
          <SimNao
            label="Viagem (iniciar / finalizar)"
            checked={form.notif_viagem}
            onChange={(v) => setForm({ ...form, notif_viagem: v })}
          />
          <SimNao
            label="Som / alerta no navegador"
            checked={form.notif_som_navegador}
            onChange={(v) => setForm({ ...form, notif_som_navegador: v })}
            hint="Quando o navegador permitir, toca alerta local além do push."
          />
        </section>

        {/* 6 · Operação */}
        <section className="space-y-3 rounded-xl border border-ink/10 bg-white p-4">
          <div>
            <h2 className="font-display text-base font-semibold">3. Operação</h2>
            <Hint>Padrões da frota e atualização automática no mapa.</Hint>
          </div>
          <Field label="Gerenciamento de risco padrão (novos veículos)">
            <select
              className={inputClass}
              value={form.gerenciamento_risco_padrao ?? 'nenhum'}
              onChange={(e) =>
                setForm({
                  ...form,
                  gerenciamento_risco_padrao: e.target.value as ConfigTransportador['gerenciamento_risco_padrao'],
                })
              }
            >
              <option value="nenhum">Nenhum</option>
              <option value="localizador">Localizador</option>
              <option value="rastreador">Rastreador</option>
            </select>
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Consumo médio (km/l)">
              <input
                className={inputClass}
                type="number"
                min={1}
                step={0.1}
                placeholder="ex.: 2,5"
                value={form.consumo_km_l ?? ''}
                onChange={(e) =>
                  setForm({
                    ...form,
                    consumo_km_l:
                      e.target.value === '' ? null : Number(e.target.value),
                  })
                }
              />
            </Field>
            <Field label="Preço do diesel (R$/l)">
              <input
                className={inputClass}
                type="number"
                min={0}
                step={0.01}
                placeholder="ex.: 6,20"
                value={form.preco_diesel ?? ''}
                onChange={(e) =>
                  setForm({
                    ...form,
                    preco_diesel:
                      e.target.value === '' ? null : Number(e.target.value),
                  })
                }
              />
            </Field>
          </div>
          <SimNao
            label="Ao finalizar viagem, atualizar localização do veículo"
            checked={form.atualizar_localizacao_ao_finalizar}
            onChange={(v) =>
              setForm({ ...form, atualizar_localizacao_ao_finalizar: v })
            }
            hint="A placa passa a ficar no destino da carga no Mapa da Frota (endereço + coordenadas)."
          />
        </section>
      </div>
      ) : (
      <div className="space-y-4">
        <section className="space-y-3 rounded-xl border border-ink/10 bg-white p-4">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <h2 className="font-display text-base font-semibold">Portfólio</h2>
              <Hint>
                Página da sua transportadora (estilo site). Preencha apresentação, serviços,
                referências e personalize com até 5 imagens abaixo do mapa.
              </Hint>
            </div>
            <button
              type="button"
              className="cadastro-btn cadastro-btn--ghost"
              style={{ padding: '6px 12px', fontSize: '0.78rem' }}
              onClick={() => setPreviewPerfil(true)}
              disabled={!empresa}
            >
              Ver página do perfil
            </button>
          </div>
          <TransportadorPerfilEditor
            value={perfil}
            onChange={setPerfil}
            empresa={empresa}
          />
        </section>
      </div>
      )}

      {previewPerfil && empresa ? (
        <TransportadorPerfilSite
          transportador={{ ...empresa, perfil_publico: normalizePerfilPublico(perfil) }}
          onClose={() => setPreviewPerfil(false)}
        />
      ) : null}

      {msg ? (
        <p
          className={`mt-4 text-sm ${
            msg.includes('não pode') || msg.includes('sem transportadora')
              ? 'text-brand'
              : 'text-emerald-700'
          }`}
        >
          {msg}
        </p>
      ) : null}

      <div className="sticky bottom-3 mt-5">
        <Button variant="success" className="w-full sm:w-auto" onClick={save}>
          {aba === 'portfolio' ? 'Salvar portfólio' : 'Salvar configurações'}
        </Button>
      </div>
    </div>
  )
}
