import { useEffect, useMemo, useRef, useState } from 'react'
import {
  baixarModeloPlanilhaMotoristas,
  montarMotoristasParaImportacao,
  parsePlanilhaMotoristasArquivo,
  type LinhaMotoristaPlanilha,
} from '../../lib/motoristasPlanilha'
import type { Motorista, Transportador, Veiculo } from '../../types'
import { Button, Field, Modal, inputClass } from '../ui/Modal'

type Props = {
  open: boolean
  onClose: () => void
  transportadorIdFixo?: string | null
  transportadores: Transportador[]
  veiculos: Veiculo[]
  motoristasExistentes: Motorista[]
  onImport: (motoristas: Motorista[]) => void
}

export function ImportarMotoristasModal({
  open,
  onClose,
  transportadorIdFixo,
  transportadores,
  veiculos,
  motoristasExistentes,
  onImport,
}: Props) {
  const fileRef = useRef<HTMLInputElement>(null)
  const precisaEscolherEmpresa = !transportadorIdFixo
  const [transportadorId, setTransportadorId] = useState(transportadorIdFixo ?? '')
  const [linhas, setLinhas] = useState<LinhaMotoristaPlanilha[]>([])
  const [headersOk, setHeadersOk] = useState(true)
  const [missingHeaders, setMissingHeaders] = useState<string[]>([])
  const [fileName, setFileName] = useState('')
  const [erro, setErro] = useState('')
  const [concluidoQtd, setConcluidoQtd] = useState<number | null>(null)
  const [detalheDup, setDetalheDup] = useState(false)
  const [detalheErro, setDetalheErro] = useState(false)
  const [errosMontagem, setErrosMontagem] = useState<Array<{ linha: number; erros: string[] }>>(
    [],
  )

  useEffect(() => {
    if (!open) return
    setTransportadorId(transportadorIdFixo ?? '')
    setLinhas([])
    setFileName('')
    setHeadersOk(true)
    setMissingHeaders([])
    setErro('')
    setConcluidoQtd(null)
    setDetalheDup(false)
    setDetalheErro(false)
    setErrosMontagem([])
    if (fileRef.current) fileRef.current.value = ''
  }, [open, transportadorIdFixo])

  const empresasAtivas = useMemo(
    () =>
      [...transportadores]
        .filter((t) => t.situacao === 'ativo')
        .sort((a, b) => a.nome_fantasia.localeCompare(b.nome_fantasia, 'pt-BR')),
    [transportadores],
  )

  const cpfsSet = useMemo(() => {
    const s = new Set<string>()
    for (const m of motoristasExistentes) {
      const c = (m.cpf || '').replace(/\D/g, '')
      if (c.length === 11) s.add(c)
    }
    return s
  }, [motoristasExistentes])

  const baseOk = useMemo(() => {
    const seenCpf = new Set<string>()
    return linhas.filter((l) => {
      if (!l.ok || !l.motorista) return false
      const cpf = l.motorista.cpf
      if (cpf) {
        if (cpfsSet.has(cpf) || seenCpf.has(cpf)) return false
        seenCpf.add(cpf)
      }
      return true
    })
  }, [linhas, cpfsSet])

  const jaCadastradosCpf = useMemo(
    () =>
      linhas
        .filter((l) => l.motorista?.cpf && cpfsSet.has(l.motorista.cpf))
        .map((l) => ({ linha: l.linha, cpf: l.motorista!.cpf! })),
    [linhas, cpfsSet],
  )

  const qtdDuplicadas = jaCadastradosCpf.length
  const invalidas = useMemo(() => {
    const montagemByLinha = new Map(errosMontagem.map((e) => [e.linha, e.erros]))
    return linhas
      .filter((l) => !l.ok || montagemByLinha.has(l.linha))
      .map((l) => ({
        linha: l.linha,
        erros: [...l.erros, ...(montagemByLinha.get(l.linha) ?? [])],
      }))
  }, [linhas, errosMontagem])

  const previewValidas = useMemo(() => {
    const tid = transportadorIdFixo || transportadorId || null
    if (precisaEscolherEmpresa && !tid) return []
    return montarMotoristasParaImportacao(baseOk, tid, veiculos, motoristasExistentes).ok
  }, [
    baseOk,
    transportadorIdFixo,
    transportadorId,
    precisaEscolherEmpresa,
    veiculos,
    motoristasExistentes,
  ])

  function resetFile() {
    setLinhas([])
    setFileName('')
    setHeadersOk(true)
    setMissingHeaders([])
    setErro('')
    setErrosMontagem([])
    if (fileRef.current) fileRef.current.value = ''
  }

  async function onPickFile(file: File | null) {
    if (!file) return
    setErro('')
    setConcluidoQtd(null)
    setDetalheDup(false)
    setDetalheErro(false)
    setErrosMontagem([])
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
      const parsed = await parsePlanilhaMotoristasArquivo(file)
      setFileName(file.name)
      setHeadersOk(parsed.headersOk)
      setMissingHeaders(parsed.missingHeaders)
      setLinhas(parsed.linhas)
      if (!parsed.headersOk) {
        setErro(
          `Planilha incompleta. Faltam colunas obrigatórias: ${parsed.missingHeaders.join(', ')}. Baixe o modelo.`,
        )
      } else if (parsed.linhas.length === 0) {
        setErro('Nenhuma linha de motorista encontrada na planilha.')
      }
    } catch {
      setErro('Não foi possível ler a planilha. Baixe o modelo .xlsx e tente novamente.')
    }
  }

  function handleImport() {
    setErro('')
    const tid = transportadorIdFixo || transportadorId || null
    if (precisaEscolherEmpresa && !tid) {
      setErro('Selecione a transportadora para vincular os motoristas.')
      return
    }
    const { ok, errosExtras } = montarMotoristasParaImportacao(
      baseOk,
      tid,
      veiculos,
      motoristasExistentes,
    )
    setErrosMontagem(errosExtras)
    if (ok.length === 0) {
      setErro(
        errosExtras.length > 0
          ? 'Nenhuma linha válida: confira placas cadastradas e CPFs.'
          : 'Não há linhas válidas para importar.',
      )
      return
    }
    onImport(ok)
    resetFile()
    setConcluidoQtd(ok.length)
  }

  return (
    <Modal open={open} title="Importar motoristas por planilha" onClose={onClose} wide>
      <div className="space-y-4">
        {concluidoQtd != null ? (
          <div
            className="rounded-lg border border-emerald-300 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-950"
            role="status"
            aria-live="polite"
          >
            <p className="text-base font-extrabold text-emerald-900">Importação concluída</p>
            <p className="mt-1 font-medium text-emerald-900">
              {concluidoQtd} motorista(s) cadastrado(s) com sucesso.
            </p>
            <p className="mt-1 text-xs font-medium text-emerald-800">
              A foto pode ser anexada depois em Editar, se precisar.
            </p>
          </div>
        ) : (
          <p className="text-sm font-medium text-black">
            Baixe o modelo em Excel (.xlsx), preencha e envie. A coluna <strong>placa</strong> deve
            ser de um veículo já cadastrado. Foto não entra na planilha.
          </p>
        )}

        {concluidoQtd == null ? (
          <>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="ghost"
                className="!border !border-ink/20"
                onClick={baixarModeloPlanilhaMotoristas}
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
              <Field label="Transportadora para vincular *">
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
                Os motoristas serão vinculados automaticamente à sua transportadora (exceto linhas
                marcadas como autônomo).
              </p>
            )}

            {fileName ? (
              <p className="text-xs font-semibold text-ink">
                Arquivo: <span className="text-black">{fileName}</span> · {linhas.length} linha(s)
                {headersOk ? '' : ' · cabeçalho incompleto'}
              </p>
            ) : null}

            {linhas.length > 0 && headersOk ? (
              <div className="grid gap-2 sm:grid-cols-3 text-xs">
                <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2">
                  <p className="font-bold text-emerald-900">Prontas</p>
                  <p className="text-lg font-extrabold text-emerald-800">{previewValidas.length}</p>
                </div>
                <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
                  <p className="font-bold text-amber-900">CPF já cadastrado</p>
                  <p className="text-lg font-extrabold text-amber-800">{qtdDuplicadas}</p>
                  {qtdDuplicadas > 0 ? (
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
                  <p className="text-lg font-extrabold text-red-800">
                    {invalidas.length + errosMontagem.length}
                  </p>
                  {invalidas.length + errosMontagem.length > 0 ? (
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

            {detalheDup && qtdDuplicadas > 0 ? (
              <div className="max-h-44 overflow-y-auto rounded-lg border border-amber-200 bg-amber-50/70 p-2.5 text-[11px] text-amber-950">
                <p className="mb-1.5 font-extrabold uppercase tracking-wide">
                  CPF já no sistema ({jaCadastradosCpf.length})
                </p>
                {jaCadastradosCpf.map((item) => (
                  <p key={`cad-${item.linha}-${item.cpf}`}>
                    Linha {item.linha}: CPF {item.cpf}
                  </p>
                ))}
              </div>
            ) : null}

            {detalheErro && (invalidas.length > 0 || errosMontagem.length > 0) ? (
              <div className="max-h-44 overflow-y-auto rounded-lg border border-red-200 bg-red-50/70 p-2.5 text-[11px] text-red-900">
                <p className="mb-1.5 font-extrabold uppercase tracking-wide">Com erro</p>
                {invalidas.map((l) => (
                  <p key={`inv-${l.linha}`}>
                    Linha {l.linha}: {l.erros.join('; ')}
                  </p>
                ))}
                {errosMontagem.map((e) => (
                  <p key={`mont-${e.linha}`}>
                    Linha {e.linha}: {e.erros.join('; ')}
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
              disabled={
                previewValidas.length === 0 || (precisaEscolherEmpresa && !transportadorId)
              }
              onClick={handleImport}
            >
              Importar {previewValidas.length > 0 ? `(${previewValidas.length})` : ''}
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
