import { useEffect, useMemo, useRef, useState } from 'react'
import {
  baixarModeloPlanilhaVeiculos,
  montarVeiculosParaImportacao,
  parsePlanilhaVeiculos,
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
  placasExistentes: string[]
  onImport: (veiculos: Veiculo[]) => void
}

export function ImportarVeiculosModal({
  open,
  onClose,
  transportadorIdFixo,
  transportadores,
  placasExistentes,
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
  const [okMsg, setOkMsg] = useState('')

  useEffect(() => {
    if (!open) return
    setTransportadorId(transportadorIdFixo ?? '')
    setLinhas([])
    setFileName('')
    setHeadersOk(true)
    setMissingHeaders([])
    setErro('')
    setOkMsg('')
    if (fileRef.current) fileRef.current.value = ''
  }, [open, transportadorIdFixo])

  const empresasAtivas = useMemo(
    () =>
      [...transportadores]
        .filter((t) => t.situacao === 'ativo')
        .sort((a, b) => a.nome_fantasia.localeCompare(b.nome_fantasia, 'pt-BR')),
    [transportadores],
  )

  const placasSet = useMemo(
    () => new Set(placasExistentes.map((p) => p.replace(/[^A-Z0-9]/gi, '').toUpperCase())),
    [placasExistentes],
  )

  const validas = useMemo(() => {
    const seen = new Set<string>()
    return linhas.filter((l) => {
      if (!l.ok || !l.veiculo) return false
      const placa = l.veiculo.placa
      if (placasSet.has(placa) || seen.has(placa)) return false
      seen.add(placa)
      return true
    })
  }, [linhas, placasSet])

  const duplicadasArquivo = useMemo(() => {
    const count = new Map<string, number>()
    for (const l of linhas) {
      const p = l.veiculo?.placa
      if (!p) continue
      count.set(p, (count.get(p) ?? 0) + 1)
    }
    return [...count.entries()].filter(([, n]) => n > 1).map(([p]) => p)
  }, [linhas])

  const jaCadastradas = useMemo(
    () =>
      linhas
        .filter((l) => l.veiculo && placasSet.has(l.veiculo.placa))
        .map((l) => l.veiculo!.placa),
    [linhas, placasSet],
  )

  const invalidas = linhas.filter((l) => !l.ok)

  function resetFile() {
    setLinhas([])
    setFileName('')
    setHeadersOk(true)
    setMissingHeaders([])
    setErro('')
    setOkMsg('')
    if (fileRef.current) fileRef.current.value = ''
  }

  async function onPickFile(file: File | null) {
    if (!file) return
    setErro('')
    setOkMsg('')
    const name = file.name.toLowerCase()
    if (!name.endsWith('.csv') && !name.endsWith('.txt')) {
      setErro('Use o modelo em CSV (Excel → Salvar como CSV / baixe o modelo).')
      return
    }
    const text = await file.text()
    const parsed = parsePlanilhaVeiculos(text)
    setFileName(file.name)
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
  }

  function handleImport() {
    setErro('')
    setOkMsg('')
    const tid = transportadorIdFixo || transportadorId || null
    if (precisaEscolherEmpresa && !tid) {
      setErro('Selecione a transportadora para vincular as placas.')
      return
    }
    if (validas.length === 0) {
      setErro('Não há linhas válidas para importar.')
      return
    }
    const veiculos = montarVeiculosParaImportacao(validas, tid)
    onImport(veiculos)
    setOkMsg(`${veiculos.length} veículo(s) importado(s). Fotos podem ser anexadas depois em Editar.`)
    resetFile()
  }

  return (
    <Modal open={open} title="Importar veículos por planilha" onClose={onClose} wide>
      <div className="space-y-4">
        <p className="text-sm font-medium text-black">
          Baixe o modelo, preencha com os mesmos campos do cadastro e envie o arquivo CSV. As fotos
          não entram na planilha — complete depois em Editar, se precisar.
        </p>

        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="ghost" className="!border !border-ink/20" onClick={baixarModeloPlanilhaVeiculos}>
            Baixar modelo de planilha
          </Button>
          <Button type="button" variant="primary" onClick={() => fileRef.current?.click()}>
            Selecionar planilha
          </Button>
          <input
            ref={fileRef}
            type="file"
            accept=".csv,text/csv,.txt"
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
            As placas serão vinculadas automaticamente à sua transportadora.
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
              <p className="text-lg font-extrabold text-emerald-800">{validas.length}</p>
            </div>
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
              <p className="font-bold text-amber-900">Já cadastradas / duplicadas</p>
              <p className="text-lg font-extrabold text-amber-800">
                {jaCadastradas.length + duplicadasArquivo.length}
              </p>
            </div>
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2">
              <p className="font-bold text-red-900">Com erro</p>
              <p className="text-lg font-extrabold text-red-800">{invalidas.length}</p>
            </div>
          </div>
        ) : null}

        {invalidas.length > 0 ? (
          <div className="max-h-36 overflow-y-auto rounded-lg border border-red-100 bg-red-50/50 p-2 text-[11px] text-red-900">
            {invalidas.slice(0, 20).map((l) => (
              <p key={l.linha}>
                Linha {l.linha}: {l.erros.join('; ')}
              </p>
            ))}
            {invalidas.length > 20 ? <p>… e mais {invalidas.length - 20}</p> : null}
          </div>
        ) : null}

        {erro ? (
          <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-800">
            {erro}
          </p>
        ) : null}
        {okMsg ? (
          <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-900">
            {okMsg}
          </p>
        ) : null}

        <div className="flex flex-wrap justify-end gap-2">
          <Button type="button" variant="ghost" className="!border !border-ink/15" onClick={onClose}>
            Fechar
          </Button>
          <Button
            type="button"
            variant="success"
            disabled={validas.length === 0 || (precisaEscolherEmpresa && !transportadorId)}
            onClick={handleImport}
          >
            Importar {validas.length > 0 ? `(${validas.length})` : ''}
          </Button>
        </div>
      </div>
    </Modal>
  )
}
