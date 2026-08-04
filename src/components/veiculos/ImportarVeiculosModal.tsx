import { useEffect, useMemo, useRef, useState } from 'react'
import {
  baixarModeloPlanilhaVeiculos,
  montarVeiculosParaImportacao,
  parsePlanilhaVeiculosArquivo,
  type LinhaVeiculoPlanilha,
} from '../../lib/veiculosPlanilha'
import type { Transportador, Veiculo } from '../../types'
import { Button, Field, Modal, inputClass } from '../ui/Modal'

type Props = {
  open: boolean
  onClose: () => void
  /** Embarcador/super escolhe; transportador já vem preenchido. */
  transportadorIdFixo?: string | null
  transportadores: Transportador[]
  /** Frota atual (para re-vincular placas Autônomo e atualizar). */
  veiculosExistentes: Veiculo[]
  onImport: (veiculos: Veiculo[]) => void
}

function normPlaca(p: string): string {
  return (p || '').replace(/[^A-Z0-9]/gi, '').toUpperCase()
}

export function ImportarVeiculosModal({
  open,
  onClose,
  transportadorIdFixo,
  transportadores,
  veiculosExistentes,
  onImport,
}: Props) {
  const fileRef = useRef<HTMLInputElement>(null)
  const precisaEscolherEmpresa = !transportadorIdFixo
  const [transportadorId, setTransportadorId] = useState(transportadorIdFixo ?? '')
  const [linhas, setLinhas] = useState<LinhaVeiculoPlanilha[]>([])
  const [headersOk, setHeadersOk] = useState(true)
  const [missingHeaders, setMissingHeaders] = useState<string[]>([])
  const [fileName, setFileName] = useState('')
  const [erro, setErro] = useState('')
  const [concluidoQtd, setConcluidoQtd] = useState<number | null>(null)
  const [detalheDup, setDetalheDup] = useState(false)
  const [detalheErro, setDetalheErro] = useState(false)

  const empresasAtivas = useMemo(
    () =>
      [...transportadores]
        .filter((t) => t.situacao === 'ativo')
        .sort((a, b) => a.nome_fantasia.localeCompare(b.nome_fantasia, 'pt-BR')),
    [transportadores],
  )

  /** Preferência: fixo do login, senão empresa cujo nome bate com “dalonso” / arquivo. */
  function preferEmpresaId(fileHint = ''): string {
    if (transportadorIdFixo) return transportadorIdFixo
    const slug = (t: Transportador) =>
      `${t.nome_fantasia} ${t.razao_social || ''}`
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
    const dalonso = empresasAtivas.find(
      (t) =>
        slug(t).includes('dalonso') ||
        slug(t).includes('d alonso') ||
        slug(t).includes('d lonso'),
    )
    if (dalonso) return dalonso.id
    const hint = fileHint
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
    if (hint.includes('lonso')) {
      const byFile = empresasAtivas.find((t) => slug(t).includes('lonso'))
      if (byFile) return byFile.id
    }
    return ''
  }

  useEffect(() => {
    if (!open) return
    setTransportadorId(preferEmpresaId())
    setLinhas([])
    setFileName('')
    setHeadersOk(true)
    setMissingHeaders([])
    setErro('')
    setConcluidoQtd(null)
    setDetalheDup(false)
    setDetalheErro(false)
    if (fileRef.current) fileRef.current.value = ''
    // eslint-disable-next-line react-hooks/exhaustive-deps -- só ao abrir / lista carregar
  }, [open, transportadorIdFixo, empresasAtivas.length])

  const tidEfetivo = (transportadorIdFixo || transportadorId || '').trim() || null

  const transportadorSel = useMemo(
    () =>
      tidEfetivo
        ? (transportadores.find((t) => t.id === tidEfetivo) ??
          empresasAtivas.find((t) => t.id === tidEfetivo) ??
          null)
        : null,
    [tidEfetivo, transportadores, empresasAtivas],
  )

  const empresaNome = transportadorSel?.nome_fantasia || ''

  /** Linhas parseadas OK e sem placa duplicada no próprio arquivo. */
  const linhasElegiveis = useMemo(() => {
    const seen = new Set<string>()
    return linhas.filter((l) => {
      if (!l.ok || !l.veiculo) return false
      const placa = l.veiculo.placa
      if (seen.has(placa)) return false
      seen.add(placa)
      return true
    })
  }, [linhas])

  const montagem = useMemo(() => {
    if (!tidEfetivo) {
      return { criar: [] as Veiculo[], atualizar: [] as Veiculo[], semEmpresa: 0 }
    }
    return montarVeiculosParaImportacao(
      linhasElegiveis,
      tidEfetivo,
      veiculosExistentes,
      transportadorSel,
    )
  }, [linhasElegiveis, tidEfetivo, veiculosExistentes, transportadorSel])

  const paraImportar = useMemo(
    () => [...montagem.criar, ...montagem.atualizar],
    [montagem],
  )

  const qtdNovas = montagem.criar.length
  const qtdAtualizar = montagem.atualizar.length
  const qtdProntas = paraImportar.length

  const jaCadastradas = useMemo(() => {
    const set = new Set(veiculosExistentes.map((v) => normPlaca(v.placa)))
    return linhas
      .filter((l) => l.veiculo && set.has(l.veiculo.placa))
      .map((l) => {
        const v = veiculosExistentes.find((x) => normPlaca(x.placa) === l.veiculo!.placa)
        const emp = v?.transportador_id
          ? (transportadores.find((t) => t.id === v.transportador_id)?.nome_fantasia ?? 'empresa')
          : 'Autônomo'
        return { linha: l.linha, placa: l.veiculo!.placa, emp }
      })
  }, [linhas, veiculosExistentes, transportadores])

  const duplicadasNoArquivo = useMemo(() => {
    const byPlaca = new Map<string, number[]>()
    for (const l of linhas) {
      const p = l.veiculo?.placa
      if (!p) continue
      const arr = byPlaca.get(p) ?? []
      arr.push(l.linha)
      byPlaca.set(p, arr)
    }
    return [...byPlaca.entries()]
      .filter(([, nums]) => nums.length > 1)
      .map(([placa, nums]) => ({ placa, linhas: nums }))
  }, [linhas])

  const qtdDupArquivo = duplicadasNoArquivo.length
  const invalidas = linhas.filter((l) => !l.ok)

  function resetFile() {
    setLinhas([])
    setFileName('')
    setHeadersOk(true)
    setMissingHeaders([])
    setErro('')
    if (fileRef.current) fileRef.current.value = ''
  }

  async function onPickFile(file: File | null) {
    if (!file) return
    setErro('')
    setConcluidoQtd(null)
    setDetalheDup(false)
    setDetalheErro(false)
    const name = file.name.toLowerCase()
    if (
      !name.endsWith('.xlsx') &&
      !name.endsWith('.xls') &&
      !name.endsWith('.csv') &&
      !name.endsWith('.txt')
    ) {
      setErro('Use o modelo Excel (.xlsx) baixado aqui. Também aceitamos .xls ou .csv.')
      return
    }
    try {
      const parsed = await parsePlanilhaVeiculosArquivo(file)
      setFileName(file.name)
      // Se ainda não escolheu empresa, tenta casar com o nome do arquivo (ex.: “… d lonso”)
      if (!transportadorIdFixo && !transportadorId) {
        const prefer = preferEmpresaId(file.name)
        if (prefer) setTransportadorId(prefer)
      }
      setHeadersOk(parsed.headersOk)
      setMissingHeaders(parsed.missingHeaders)
      setLinhas(parsed.linhas)
      if (!parsed.headersOk) {
        setErro(
          `Planilha incompleta. Faltam colunas obrigatórias: ${parsed.missingHeaders.join(', ')}. Baixe o modelo.`,
        )
      } else if (parsed.linhas.length === 0) {
        setErro('Nenhuma linha de veículo encontrada na planilha.')
      }
    } catch {
      setErro('Não foi possível ler a planilha. Baixe o modelo .xlsx e tente novamente.')
    }
  }

  function handleImport() {
    setErro('')
    if (!tidEfetivo) {
      setErro('Selecione a transportadora para vincular as placas (senão ficam Autônomo).')
      return
    }
    if (paraImportar.length === 0) {
      setErro('Não há linhas válidas para importar.')
      return
    }
    // Garante vínculo em todas as placas (nunca grava sem empresa quando o usuário escolheu)
    const comEmpresa = paraImportar.map((v) => ({
      ...v,
      transportador_id: tidEfetivo,
    }))
    onImport(comEmpresa)
    resetFile()
    setConcluidoQtd(comEmpresa.length)
  }

  return (
    <Modal open={open} title="Importar veículos por planilha" onClose={onClose} wide>
      <div className="space-y-4">
        {concluidoQtd != null ? (
          <div
            className="rounded-lg border border-emerald-300 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-950"
            role="status"
            aria-live="polite"
          >
            <p className="text-base font-extrabold text-emerald-900">Importação concluída</p>
            <p className="mt-1 font-medium text-emerald-900">
              {concluidoQtd} veículo(s) gravado(s)
              {empresaNome ? (
                <>
                  {' '}
                  em <strong>{empresaNome}</strong>
                </>
              ) : null}
              .
            </p>
            <p className="mt-1 text-xs font-medium text-emerald-800">
              As fotos podem ser anexadas depois em Editar, se precisar.
            </p>
          </div>
        ) : (
          <p className="text-sm font-medium text-black">
            Baixe o modelo em Excel (.xlsx), preencha e envie. As placas são vinculadas à
            transportadora escolhida e o <strong>endereço do cadastro da transportadora</strong>{' '}
            é copiado para cada veículo. Placas já cadastradas são atualizadas e re-vinculadas.
          </p>
        )}

        {concluidoQtd == null ? (
          <>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="ghost"
                className="!border !border-ink/20"
                onClick={baixarModeloPlanilhaVeiculos}
              >
                Baixar modelo de planilha
              </Button>
              <Button type="button" variant="primary" onClick={() => fileRef.current?.click()}>
                Selecionar planilha
              </Button>
              <input
                ref={fileRef}
                type="file"
                accept=".xlsx,.xls,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,text/csv"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0] ?? null
                  void onPickFile(f)
                }}
              />
            </div>

            {precisaEscolherEmpresa ? (
              <Field label="Transportadora para vincular as placas *">
                <select
                  className={inputClass}
                  value={transportadorId}
                  onChange={(e) => setTransportadorId(e.target.value)}
                >
                  <option value="">Selecione…</option>
                  {empresasAtivas.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.nome_fantasia}
                    </option>
                  ))}
                </select>
              </Field>
            ) : (
              <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-900">
                As placas serão vinculadas automaticamente à sua transportadora
                {empresaNome ? ` (${empresaNome})` : ''}.
              </p>
            )}

            {fileName ? (
              <p className="text-xs font-semibold text-ink">
                Arquivo: <span className="text-black">{fileName}</span> · {linhas.length} linha(s)
                {headersOk ? '' : ' · cabeçalho incompleto'}
                {tidEfetivo && empresaNome ? (
                  <>
                    {' '}
                    · empresa: <span className="text-black">{empresaNome}</span>
                  </>
                ) : null}
              </p>
            ) : null}

            {linhas.length > 0 && headersOk ? (
              <div className="grid gap-2 sm:grid-cols-3 text-xs">
                <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2">
                  <p className="font-bold text-emerald-900">Prontas</p>
                  <p className="text-lg font-extrabold text-emerald-800">{qtdProntas}</p>
                  {qtdProntas > 0 ? (
                    <p className="mt-0.5 text-[11px] font-medium text-emerald-900">
                      {qtdNovas} nova(s)
                      {qtdAtualizar > 0 ? ` · ${qtdAtualizar} atualizar` : ''}
                    </p>
                  ) : null}
                </div>
                <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
                  <p className="font-bold text-amber-900">Já no sistema</p>
                  <p className="text-lg font-extrabold text-amber-800">
                    {jaCadastradas.length + qtdDupArquivo}
                  </p>
                  {jaCadastradas.length + qtdDupArquivo > 0 ? (
                    <button
                      type="button"
                      className="mt-1 text-[11px] font-bold text-amber-950 underline underline-offset-2 hover:no-underline"
                      onClick={() => {
                        setDetalheDup((v) => !v)
                        if (!detalheDup) setDetalheErro(false)
                      }}
                    >
                      {detalheDup ? 'Ocultar detalhes' : 'Mostrar detalhes'}
                    </button>
                  ) : null}
                </div>
                <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2">
                  <p className="font-bold text-red-900">Com erro</p>
                  <p className="text-lg font-extrabold text-red-800">{invalidas.length}</p>
                  {invalidas.length > 0 ? (
                    <button
                      type="button"
                      className="mt-1 text-[11px] font-bold text-red-950 underline underline-offset-2 hover:no-underline"
                      onClick={() => {
                        setDetalheErro((v) => !v)
                        if (!detalheErro) setDetalheDup(false)
                      }}
                    >
                      {detalheErro ? 'Ocultar detalhes' : 'Mostrar detalhes'}
                    </button>
                  ) : null}
                </div>
              </div>
            ) : null}

            {linhas.length > 0 && headersOk && !tidEfetivo ? (
              <p className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-950">
                Selecione a <strong>transportadora</strong> acima. Sem isso as placas não podem ser
                importadas (ficariam Autônomo).
              </p>
            ) : null}

            {detalheDup && jaCadastradas.length + qtdDupArquivo > 0 ? (
              <div className="max-h-44 overflow-y-auto rounded-lg border border-amber-200 bg-amber-50/70 p-2.5 text-[11px] text-amber-950">
                <p className="mb-1.5 font-extrabold uppercase tracking-wide">Já no sistema</p>
                {jaCadastradas.length > 0 ? (
                  <div className="mb-2">
                    <p className="mb-0.5 font-bold">
                      Serão atualizadas e vinculadas ({jaCadastradas.length})
                    </p>
                    {jaCadastradas.map((item) => (
                      <p key={`cad-${item.linha}-${item.placa}`}>
                        Linha {item.linha}: placa {item.placa} · hoje: {item.emp}
                      </p>
                    ))}
                  </div>
                ) : null}
                {duplicadasNoArquivo.length > 0 ? (
                  <div>
                    <p className="mb-0.5 font-bold">
                      Repetidas na planilha ({duplicadasNoArquivo.length})
                    </p>
                    {duplicadasNoArquivo.map((item) => (
                      <p key={`dup-${item.placa}`}>
                        Placa {item.placa}: linhas {item.linhas.join(', ')}
                      </p>
                    ))}
                  </div>
                ) : null}
              </div>
            ) : null}

            {detalheErro && invalidas.length > 0 ? (
              <div className="max-h-44 overflow-y-auto rounded-lg border border-red-200 bg-red-50/70 p-2.5 text-[11px] text-red-900">
                <p className="mb-1.5 font-extrabold uppercase tracking-wide">
                  Com erro ({invalidas.length})
                </p>
                {invalidas.map((l) => (
                  <p key={l.linha}>
                    Linha {l.linha}: {l.erros.join('; ')}
                  </p>
                ))}
              </div>
            ) : null}

            {erro ? (
              <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-800">
                {erro}
              </p>
            ) : null}
          </>
        ) : null}

        <div className="flex flex-wrap justify-end gap-2">
          <Button type="button" variant="ghost" className="!border !border-ink/15" onClick={onClose}>
            Fechar
          </Button>
          {concluidoQtd == null ? (
            <Button
              type="button"
              variant="success"
              disabled={qtdProntas === 0 || !tidEfetivo}
              onClick={handleImport}
            >
              Importar {qtdProntas > 0 ? `(${qtdProntas})` : ''}
            </Button>
          ) : (
            <Button type="button" variant="success" onClick={onClose}>
              Concluir
            </Button>
          )}
        </div>
      </div>
    </Modal>
  )
}
