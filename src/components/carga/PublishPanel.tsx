import { useEffect, useMemo, useState } from 'react'
import { useData } from '../../context/DataContext'
import {
  MARGENS_POR_ROTA,
  MOTIVOS_PRIORIDADE_ALTA,
  PRAZOS_ALOCACAO_MINUTOS,
  PRAZOS_LEILAO_MINUTOS,
  calcularFreteOferta,
  calcularPrioridadeEModo,
  formatCurrency,
  formatDateTime,
  formatNumber,
  formatPrazoLabel,
} from '../../lib/businessRules'
import type { Carga } from '../../types'
import { Button, Field, Modal, inputClass } from '../ui/Modal'

interface Props {
  carga: Carga | null
  open: boolean
  onClose: () => void
}

export function PublishPanel({ carga, open, onClose }: Props) {
  const { grupos, publicarCarga, lancesDaCarga, transportadorById, aceitarLance, recusarCargaMinerva } =
    useData()

  const classificacao = carga?.classificacao_rota ?? 'B'
  const margens = MARGENS_POR_ROTA[classificacao]

  const [margem, setMargem] = useState(margens[1])
  const [grupoIds, setGrupoIds] = useState<string[]>([])
  const [prazoLeilao, setPrazoLeilao] = useState(60)
  const [prazoAlocacao, setPrazoAlocacao] = useState(10)
  const [showJustificativa, setShowJustificativa] = useState(false)
  const [motivo, setMotivo] = useState('')
  const [obs, setObs] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    if (!carga) return
    const m = MARGENS_POR_ROTA[carga.classificacao_rota ?? 'B']
    setMargem(m[1])
    setGrupoIds(carga.grupo_ids.length ? carga.grupo_ids : [])
    setPrazoLeilao(carga.prazo_leilao_minutos ?? 60)
    setPrazoAlocacao(carga.prazo_alocacao_minutos ?? 10)
    setError('')
    setMotivo(carga.justificativa_motivo ?? '')
    setObs(carga.justificativa_obs ?? '')
  }, [carga])

  const { ganho, freteOferta } = useMemo(
    () => calcularFreteOferta(carga?.frete_tabela ?? 0, margem),
    [carga, margem],
  )

  const { prioridade, modo, exigeJustificativa } = useMemo(
    () => calcularPrioridadeEModo(prazoLeilao),
    [prazoLeilao],
  )

  const lances = carga ? lancesDaCarga(carga.id) : []
  const isNova = carga?.status === 'nova_carga'

  if (!open || !carga) return null

  function toggleGrupo(id: string) {
    setGrupoIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))
  }

  function handlePublicar() {
    setError('')
    if (exigeJustificativa && !motivo) {
      setShowJustificativa(true)
      return
    }
    const res = publicarCarga({
      cargaId: carga!.id,
      margemPercentual: margem,
      grupoIds,
      prazoLeilaoMinutos: prazoLeilao,
      prazoAlocacaoMinutos: prazoAlocacao,
      justificativaMotivo: motivo || undefined,
      justificativaObs: obs || undefined,
    })
    if (!res.ok) {
      setError(res.error ?? 'Erro ao publicar')
      return
    }
    onClose()
  }

  function confirmJustificativa() {
    if (!motivo) {
      setError('Selecione o motivo')
      return
    }
    setShowJustificativa(false)
    const res = publicarCarga({
      cargaId: carga!.id,
      margemPercentual: margem,
      grupoIds,
      prazoLeilaoMinutos: prazoLeilao,
      prazoAlocacaoMinutos: prazoAlocacao,
      justificativaMotivo: motivo,
      justificativaObs: obs,
    })
    if (!res.ok) {
      setError(res.error ?? 'Erro ao publicar')
      return
    }
    onClose()
  }

  const classColor =
    classificacao === 'A' ? 'bg-emerald-500' : classificacao === 'B' ? 'bg-amber-500' : 'bg-brand'

  return (
    <>
      <aside className="animate-slide-in flex h-full w-[380px] shrink-0 flex-col overflow-hidden rounded-xl border border-ink/10 bg-white shadow-lg">
        <div className="border-b border-ink/10 bg-ink px-4 py-3 text-white">
          <p className="text-xs text-sand/70">Carga {carga.numero}</p>
          <p className="font-display text-sm font-semibold">
            {formatDateTime(carga.data_carregamento)}
          </p>
        </div>

        <div className="flex-1 space-y-3 overflow-y-auto p-4 text-sm">
          <Detail label="Pedido" value={carga.pedido} />
          <Detail label="Tipo de Carga" value={carga.tipo_carga} />
          <Detail label="Veículo" value={carga.veiculo} />
          <Detail label="Remetente" value={`${carga.remetente} — ${carga.remetente_cnpj}`} />
          <Detail label="Origem" value={carga.origem} />
          <Detail label="Destino" value={carga.destino} />
          <Detail label="Destinatário" value={carga.destinatario} />
          <Detail label="Peso" value={formatNumber(carga.peso)} />
          <Detail label="Volumes" value={String(carga.volumes)} />
          <Detail label="Valor Frete (Tabela)" value={formatCurrency(carga.frete_tabela)} />
          <Detail label="Valor Mercadorias" value={formatCurrency(carga.valor_mercadorias)} />

          {isNova ? (
            <div className="mt-2 space-y-3 rounded-lg border border-ink/10 bg-sand-light/40 p-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-ink-muted">Configurações de Oferta</span>
                <span className={`rounded px-2 py-0.5 text-xs font-bold text-white ${classColor}`}>
                  Classificação {classificacao}
                </span>
              </div>

              <div className="grid grid-cols-3 gap-2 text-xs">
                <div>
                  <p className="text-ink-muted">Frete Tabela</p>
                  <p className="font-semibold">{formatCurrency(carga.frete_tabela)}</p>
                </div>
                <div>
                  <p className="text-ink-muted">Oportunidade</p>
                  <p className="font-semibold text-emerald-700">{formatCurrency(ganho)}</p>
                </div>
                <Field label="%">
                  <select
                    className={inputClass}
                    value={margem}
                    onChange={(e) => setMargem(Number(e.target.value))}
                  >
                    {margens.map((m) => (
                      <option key={m} value={m}>
                        {m}%
                      </option>
                    ))}
                  </select>
                </Field>
              </div>

              <p className="text-center font-display text-lg font-bold text-ink">
                Frete Oferta {formatCurrency(freteOferta)}
              </p>

              <Field label="Grupos de Transportadores">
                <div className="flex flex-col gap-1 rounded-lg border border-ink/15 bg-white p-2">
                  {grupos
                    .filter((g) => g.situacao === 'ativo')
                    .map((g) => (
                      <label key={g.id} className="flex items-center gap-2 text-xs">
                        <input
                          type="checkbox"
                          checked={grupoIds.includes(g.id)}
                          onChange={() => toggleGrupo(g.id)}
                        />
                        {g.descricao}
                      </label>
                    ))}
                </div>
              </Field>

              <div className="grid grid-cols-2 gap-2">
                <Field label="Prazo para Leilão">
                  <select
                    className={inputClass}
                    value={prazoLeilao}
                    onChange={(e) => setPrazoLeilao(Number(e.target.value))}
                  >
                    {PRAZOS_LEILAO_MINUTOS.map((m) => (
                      <option key={m} value={m}>
                        {formatPrazoLabel(m)}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Prazo para Alocação">
                  <select
                    className={inputClass}
                    value={prazoAlocacao}
                    onChange={(e) => setPrazoAlocacao(Number(e.target.value))}
                  >
                    {PRAZOS_ALOCACAO_MINUTOS.map((m) => (
                      <option key={m} value={m}>
                        {formatPrazoLabel(m)}
                      </option>
                    ))}
                  </select>
                </Field>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <p className="mb-1 text-xs text-ink-muted">Prioridade</p>
                  <span
                    className={`inline-block rounded-lg px-3 py-2 text-xs font-bold capitalize text-white ${
                      prioridade === 'alta'
                        ? 'bg-brand'
                        : prioridade === 'media'
                          ? 'bg-amber-500'
                          : 'bg-emerald-600'
                    }`}
                  >
                    {prioridade}
                  </span>
                </div>
                <div>
                  <p className="mb-1 text-xs text-ink-muted">Modo de Publicação</p>
                  <span
                    className={`inline-block rounded-lg px-3 py-2 text-xs font-bold capitalize text-white ${
                      modo === 'oferta' ? 'bg-brand' : 'bg-ink'
                    }`}
                  >
                    {modo === 'oferta' ? 'Oferta' : 'Leilão'}
                  </span>
                </div>
              </div>

              {error && <p className="text-xs text-brand">{error}</p>}

              <div className="flex gap-2">
                <Button variant="success" className="flex-1" onClick={handlePublicar}>
                  Publicar
                </Button>
                <Button variant="danger" className="flex-1" onClick={onClose}>
                  Fechar
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="grid grid-cols-3 gap-2 rounded-lg bg-sand-light/50 p-3 text-center text-xs">
                <div>
                  <p className="text-ink-muted">Visualizações</p>
                  <p className="font-display text-xl font-bold">{carga.visualizacoes}</p>
                </div>
                <div>
                  <p className="text-ink-muted">Recusas</p>
                  <p className="font-display text-xl font-bold">{carga.recusas}</p>
                </div>
                <div>
                  <p className="text-ink-muted">Propostas</p>
                  <p className="font-display text-xl font-bold">{lances.length}</p>
                </div>
              </div>

              <div>
                <p className="mb-2 text-xs font-semibold text-ink-muted">Propostas recebidas</p>
                {lances.length === 0 ? (
                  <p className="text-xs text-ink-muted">Nenhum lance ainda</p>
                ) : (
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-ink/10 text-left text-ink-muted">
                        <th className="py-1">Transportador</th>
                        <th>Lance</th>
                        <th>Ganho</th>
                        <th />
                      </tr>
                    </thead>
                    <tbody>
                      {lances.map((l) => {
                        const t = transportadorById(l.transportador_id)
                        const ref = carga.frete_oferta ?? carga.frete_tabela
                        const ganhoLance = ref - l.valor
                        return (
                          <tr key={l.id} className="border-b border-ink/5">
                            <td className="py-2 pr-1">{t?.nome_fantasia ?? '—'}</td>
                            <td className="font-semibold">{formatCurrency(l.valor)}</td>
                            <td className="text-emerald-700">{formatCurrency(ganhoLance)}</td>
                            <td>
                              {l.status === 'ativo' && !carga.transportador_vencedor_id && (
                                <button
                                  type="button"
                                  className="text-[10px] font-bold text-emerald-700 hover:underline"
                                  onClick={() => aceitarLance(l.id)}
                                >
                                  Aceitar
                                </button>
                              )}
                              {l.status === 'vencedor' && (
                                <span className="text-[10px] font-bold text-emerald-700">
                                  Vencedor
                                </span>
                              )}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                )}
              </div>

              {carga.transportador_vencedor_id && carga.status !== 'alocadas' && (
                <Button
                  variant="danger"
                  className="w-full"
                  onClick={() => {
                    recusarCargaMinerva(carga.id)
                    onClose()
                  }}
                >
                  Recusar frete fechado
                </Button>
              )}

              <Button variant="ghost" className="w-full" onClick={onClose}>
                Fechar
              </Button>
            </div>
          )}
        </div>
      </aside>

      <Modal
        open={showJustificativa}
        title="Justificativa Prioridade Alta"
        onClose={() => setShowJustificativa(false)}
      >
        <div className="space-y-3">
          <p className="text-sm text-ink-muted">
            Prazo ≤ 30 min define prioridade alta e modo Oferta. Informe o motivo.
          </p>
          <Field label="Motivo">
            <select className={inputClass} value={motivo} onChange={(e) => setMotivo(e.target.value)}>
              <option value="">Selecione...</option>
              {MOTIVOS_PRIORIDADE_ALTA.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Observação">
            <textarea
              className={`${inputClass} min-h-24`}
              value={obs}
              onChange={(e) => setObs(e.target.value)}
            />
          </Field>
          {error && <p className="text-xs text-brand">{error}</p>}
          <div className="flex gap-2">
            <Button variant="success" className="flex-1" onClick={confirmJustificativa}>
              Enviar
            </Button>
            <Button variant="danger" className="flex-1" onClick={() => setShowJustificativa(false)}>
              Fechar
            </Button>
          </div>
        </div>
      </Modal>
    </>
  )
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3 border-b border-ink/5 pb-1">
      <span className="shrink-0 text-xs text-ink-muted">{label}</span>
      <span className="text-right text-xs font-medium">{value}</span>
    </div>
  )
}
