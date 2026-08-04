import { useMemo, useState } from 'react'
import { useData } from '../../context/DataContext'
import { CadastroStatsCards } from '../../components/cadastro/CadastroStatsCards'
import {
  formatCurrency,
  formatMoneyInput,
  roundMoney,
} from '../../lib/businessRules'
import {
  FOTOS_VEICULO_ROTEIRO,
  emptyFotosVeiculo,
  fileToDataUrl,
  fotosCompletas,
  isAcceptedImageFile,
  normalizeFotosVeiculo,
} from '../../lib/veiculoFotos'
import { TIPOS_VEICULO } from '../../lib/tiposVeiculo'
import { newVeiculoId } from '../../lib/veiculosSync'
import { localizacaoDaTransportadora } from '../../lib/veiculoLocalizacao'
import { CarroceriaSuggestInput } from '../../components/ui/CarroceriaSuggestInput'
import { VeiculoSuggestInput } from '../../components/ui/VeiculoSuggestInput'
import { ImportarVeiculosModal } from '../../components/veiculos/ImportarVeiculosModal'
import { LocalizacaoVeiculoModal } from '../../components/veiculos/LocalizacaoVeiculoModal'
import {
  VeiculoLocalizacaoFields,
  validarLocalizacaoVeiculo,
} from '../../components/veiculos/VeiculoLocalizacaoFields'
import { VeiculoAvaliacoesModal } from '../../components/veiculos/VeiculoAvaliacoesModal'
import { ImageCropModal } from '../../components/ui/ImageCropModal'
import type { FotoVeiculoSlot, FotosVeiculo, Veiculo } from '../../types'
import '../../styles/cadastro.css'

const MARCAS = ['Volvo', 'Scania', 'Mercedes-Benz', 'Volkswagen', 'Iveco', 'Ford', 'Outra']
const ACLIMATACAO = ['Seco', 'Refrigerado', 'Congelado']
const UFS = [
  'AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO',
]

/** Só dígitos → valor em reais (centavos da direita) e texto pt-BR. */
function moneyFromDigits(raw: string): { display: string; value: number } {
  const digits = raw.replace(/\D/g, '').slice(0, 12)
  const value = roundMoney(Number(digits || '0') / 100)
  return { display: formatMoneyInput(value), value }
}

const emptyForm = (): Partial<Veiculo> => ({
  placa: '',
  transportador_id: '',
  renavam: '',
  condutor: '',
  tipo: '',
  marca: '',
  modelo: '',
  cor: '',
  ano_fabricacao: '',
  ano_modelo: '',
  uf_licenciamento: 'SP',
  foto_url: '',
  fotos: emptyFotosVeiculo(),
  tipo_carroceria: '',
  qtd_pallets: undefined,
  aclimatacao: '',
  capacidade_kg: undefined,
  comprimento_m: undefined,
  largura_m: undefined,
  altura_m: undefined,
  cubagem_m3: undefined,
  eixos: undefined,
  frete_minimo: 0,
  usa_manobrista: false,
  padiado: false,
  gerenciamento_risco: 'nenhum',
  rastreador_dados: '',
  situacao: 'ativo',
})

export function VeiculosPage() {
  const { veiculos, transportadores, motoristas, cargas, salvarVeiculo, excluirVeiculo, transportadorById, user } =
    useData()
  const [mode, setMode] = useState<'lista' | 'form'>('lista')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<Partial<Veiculo>>(emptyForm)
  const [freteMinimoTxt, setFreteMinimoTxt] = useState('0,00')
  const [search, setSearch] = useState('')
  const [error, setError] = useState('')
  const [dicaFoto, setDicaFoto] = useState<FotoVeiculoSlot | null>(null)
  const [importOpen, setImportOpen] = useState(false)
  const [locVeiculo, setLocVeiculo] = useState<Veiculo | null>(null)
  const [avaliacoesDe, setAvaliacoesDe] = useState<Veiculo | null>(null)
  const [fotoCrop, setFotoCrop] = useState<{ slot: FotoVeiculoSlot; file: File } | null>(null)

  const listaVeiculos = veiculos ?? []
  const listaTransportadores = transportadores ?? []
  const listaMotoristas = motoristas ?? []

  const scopedVeiculos = useMemo(() => {
    if (user?.role !== 'transportador' || !user.transportador_id) return listaVeiculos
    const tid = user.transportador_id
    const minha = listaTransportadores.find((t) => t.id === tid)
    const meuCnpj = (minha?.cnpj || '').replace(/\D/g, '')
    const meuNome = (minha?.nome_fantasia || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '')

    return listaVeiculos.filter((v) => {
      if (v.transportador_id === tid) return true
      if (!v.transportador_id || !minha) return false
      const emp = listaTransportadores.find((t) => t.id === v.transportador_id)
      if (!emp) return false
      const cnpj = (emp.cnpj || '').replace(/\D/g, '')
      if (meuCnpj && cnpj && meuCnpj === cnpj) return true
      const nome = (emp.nome_fantasia || '')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, '')
      return meuNome.length >= 5 && nome.length >= 5 && (meuNome.includes(nome) || nome.includes(meuNome))
    })
  }, [listaVeiculos, listaTransportadores, user])

  const scopedTransportadores = useMemo(() => {
    if (user?.role === 'transportador' && user.transportador_id) {
      return listaTransportadores.filter((t) => t.id === user.transportador_id)
    }
    return listaTransportadores
  }, [listaTransportadores, user])

  /** Motoristas disponíveis para o select de condutor (todos cadastrados, escopo do usuário). */
  const motoristasParaCondutor = useMemo(() => {
    let list = listaMotoristas.filter((m) => (m.nome || '').trim().length > 0)
    if (user?.role === 'transportador' && user.transportador_id) {
      list = list.filter(
        (m) => m.transportador_id === user.transportador_id || m.autonomo,
      )
    }
    // Preferir da empresa selecionada no formulário, sem esconder os demais
    const tid = form.transportador_id || null
    return [...list].sort((a, b) => {
      const aEmp = tid && a.transportador_id === tid ? 0 : 1
      const bEmp = tid && b.transportador_id === tid ? 0 : 1
      if (aEmp !== bEmp) return aEmp - bEmp
      const aSit = a.situacao === 'ativo' ? 0 : 1
      const bSit = b.situacao === 'ativo' ? 0 : 1
      if (aSit !== bSit) return aSit - bSit
      return a.nome.localeCompare(b.nome, 'pt-BR')
    })
  }, [listaMotoristas, user, form.transportador_id])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return scopedVeiculos
    return scopedVeiculos.filter((v) => {
      const emp = v.transportador_id
        ? (transportadorById(v.transportador_id)?.nome_fantasia ?? '')
        : 'autônomo'
      return (
        (v.placa ?? '').toLowerCase().includes(q) ||
        (v.tipo ?? '').toLowerCase().includes(q) ||
        emp.toLowerCase().includes(q) ||
        (v.modelo ?? '').toLowerCase().includes(q)
      )
    })
  }, [scopedVeiculos, search, transportadorById])

  const statsCadastro = useMemo(() => {
    const total = scopedVeiculos.length
    const ativos = scopedVeiculos.filter((v) => v.situacao === 'ativo').length
    const inativos = scopedVeiculos.filter((v) => v.situacao === 'inativo').length
    return { total, ativos, inativos }
  }, [scopedVeiculos])

  /** Todos os tipos do catálogo + eventuais fora da lista. */
  const porPerfil = useMemo(() => {
    const map = new Map<string, number>()
    for (const t of TIPOS_VEICULO) map.set(t, 0)
    for (const v of scopedVeiculos) {
      const tipo = (v.tipo || '').trim() || 'Sem tipo'
      map.set(tipo, (map.get(tipo) ?? 0) + 1)
    }
    const catalog = TIPOS_VEICULO.map((tipo) => ({ tipo, qtd: map.get(tipo) ?? 0 }))
    const extras = [...map.entries()]
      .filter(([tipo]) => !(TIPOS_VEICULO as readonly string[]).includes(tipo))
      .map(([tipo, qtd]) => ({ tipo, qtd }))
      .sort((a, b) => b.qtd - a.qtd || a.tipo.localeCompare(b.tipo, 'pt-BR'))
    return [...catalog, ...extras]
  }, [scopedVeiculos])

  function openNew() {
    setEditingId(null)
    setForm({
      ...emptyForm(),
      transportador_id:
        user?.role === 'transportador' && user.transportador_id
          ? user.transportador_id
          : scopedTransportadores[0]?.id ?? '',
    })
    setFreteMinimoTxt('0,00')
    setError('')
    setMode('form')
  }

  function openEdit(v: Veiculo) {
    setEditingId(v.id)
    setForm({
      ...v,
      fotos: normalizeFotosVeiculo(v.fotos, v.foto_url),
    })
    setFreteMinimoTxt(formatMoneyInput(Number(v.frete_minimo) || 0))
    setError('')
    setMode('form')
  }

  function set<K extends keyof Veiculo>(key: K, value: Veiculo[K]) {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  function setDimensaoBau(
    key: 'comprimento_m' | 'largura_m' | 'altura_m',
    value: number | undefined,
  ) {
    setForm((prev) => {
      const next = { ...prev, [key]: value }
      const c = Number(next.comprimento_m)
      const l = Number(next.largura_m)
      const a = Number(next.altura_m)
      if (c > 0 && l > 0 && a > 0) {
        next.cubagem_m3 = Math.round(c * l * a * 100) / 100
      }
      return next
    })
  }

  function onFreteMinimoChange(raw: string) {
    const { display, value } = moneyFromDigits(raw)
    setFreteMinimoTxt(display)
    set('frete_minimo', value)
  }

  const fotosAtuais: FotosVeiculo = normalizeFotosVeiculo(form.fotos, form.foto_url)

  function escolherFoto(slot: FotoVeiculoSlot, file: File | null) {
    setError('')
    if (!file) {
      void aplicarFoto(slot, null)
      return
    }
    if (!isAcceptedImageFile(file)) {
      setError('Use JPG, PNG ou WEBP.')
      return
    }
    if (file.size > 8 * 1024 * 1024) {
      setError('Imagem muito grande (máx. 8 MB).')
      return
    }
    setFotoCrop({ slot, file })
  }

  async function aplicarFoto(slot: FotoVeiculoSlot, file: File | null) {
    setError('')
    if (!file) {
      setForm((prev) => {
        const fotos = { ...normalizeFotosVeiculo(prev.fotos, prev.foto_url) }
        delete fotos[slot]
        return {
          ...prev,
          fotos,
          foto_url: slot === 'dianteira' ? '' : prev.foto_url,
        }
      })
      return
    }
    const dataUrl = await fileToDataUrl(file)
    setForm((prev) => {
      const fotos = { ...normalizeFotosVeiculo(prev.fotos, prev.foto_url), [slot]: dataUrl }
      return {
        ...prev,
        fotos,
        foto_url: slot === 'dianteira' ? dataUrl : prev.foto_url,
      }
    })
  }

  async function reconstruirFotoParaAjuste(slot: FotoVeiculoSlot, url: string) {
    setError('')
    try {
      let file: File
      if (url.startsWith('data:')) {
        const res = await fetch(url)
        const blob = await res.blob()
        file = new File([blob], `${slot}.jpg`, { type: blob.type || 'image/jpeg' })
      } else {
        const res = await fetch(url)
        const blob = await res.blob()
        file = new File([blob], `${slot}.jpg`, { type: blob.type || 'image/jpeg' })
      }
      setFotoCrop({ slot, file })
    } catch {
      setError('Não foi possível abrir a foto para ajuste.')
    }
  }

  function save() {
    const isTransportador = user?.role === 'transportador'
    // Transportador sempre grava na própria empresa (nunca autônomo / outra empresa)
    const transportadorId = isTransportador
      ? user?.transportador_id || null
      : form.transportador_id == null || form.transportador_id === ''
        ? null
        : form.transportador_id
    if (isTransportador && !transportadorId) {
      setError('Sua conta não está vinculada a uma transportadora. Peça ao Super para ajustar no Portal.')
      return
    }
    if (!form.placa?.trim() || !form.tipo) {
      setError('Preencha Placa e Tipo (categoria) do veículo.')
      return
    }
    const freteMin = Number(form.frete_minimo)
    if (!Number.isFinite(freteMin) || freteMin <= 0) {
      setError('Informe o frete mínimo (maior que zero) para esta categoria de veículo.')
      return
    }
    const fotos = normalizeFotosVeiculo(form.fotos, form.foto_url)
    if (!fotosCompletas(fotos)) {
      setError('Anexe as 5 fotos obrigatórias do veículo (roteiro completo).')
      return
    }
    const risco =
      form.gerenciamento_risco === 'rastreador' ||
      form.gerenciamento_risco === 'localizador' ||
      form.gerenciamento_risco === 'nenhum'
        ? form.gerenciamento_risco
        : 'nenhum'
    const dadosRastreador = (form.rastreador_dados || '').trim()
    if (risco === 'rastreador' && !dadosRastreador) {
      setError('Cole os dados do rastreador (IMEI, serial, fornecedor…).')
      return
    }
    const locErro = validarLocalizacaoVeiculo(
      {
        origem_cep: form.origem_cep,
        origem_cidade: form.origem_cidade,
        origem_uf: form.origem_uf,
        origem_endereco: form.origem_endereco,
        origem_numero: form.origem_numero,
        origem_bairro: form.origem_bairro,
        origem_complemento: form.origem_complemento,
        origem_lat: form.origem_lat,
        origem_lng: form.origem_lng,
        raio_km: form.raio_km,
      },
      false,
    )
    if (locErro) {
      setError(locErro)
      return
    }
    const v: Veiculo = {
      id: editingId ?? newVeiculoId(),
      placa: form.placa!.trim().toUpperCase(),
      transportador_id: transportadorId,
      renavam: form.renavam,
      condutor: form.condutor,
      tipo: form.tipo!,
      marca: form.marca,
      modelo: form.modelo,
      cor: form.cor,
      ano_fabricacao: form.ano_fabricacao,
      ano_modelo: form.ano_modelo,
      uf_licenciamento: form.uf_licenciamento,
      fotos,
      foto_url: fotos.dianteira,
      tipo_carroceria: form.tipo_carroceria,
      qtd_pallets: form.qtd_pallets != null ? Number(form.qtd_pallets) : undefined,
      aclimatacao: form.aclimatacao,
      capacidade_kg: form.capacidade_kg != null ? Number(form.capacidade_kg) : undefined,
      comprimento_m: form.comprimento_m != null ? Number(form.comprimento_m) : undefined,
      largura_m: form.largura_m != null ? Number(form.largura_m) : undefined,
      altura_m: form.altura_m != null ? Number(form.altura_m) : undefined,
      cubagem_m3: form.cubagem_m3 != null ? Number(form.cubagem_m3) : undefined,
      eixos: form.eixos != null ? Number(form.eixos) : undefined,
      frete_minimo: roundMoney(freteMin),
      disponivel_mapa: form.disponivel_mapa !== false,
      usa_manobrista: Boolean(form.usa_manobrista),
      padiado: Boolean(form.padiado),
      gerenciamento_risco: risco,
      rastreador_dados: risco === 'rastreador' ? dadosRastreador : undefined,
      situacao: (form.situacao as 'ativo' | 'inativo') ?? 'ativo',
      created_at: form.created_at ?? new Date().toISOString(),
      // Preserva localização do veículo (editada em “Alterar localização”)
      origem_cep: form.origem_cep,
      origem_endereco: form.origem_endereco,
      origem_numero: form.origem_numero,
      origem_complemento: form.origem_complemento,
      origem_bairro: form.origem_bairro,
      origem_cidade: form.origem_cidade,
      origem_uf: form.origem_uf,
      origem_lat: form.origem_lat,
      origem_lng: form.origem_lng,
      raio_km: form.raio_km,
    }
    salvarVeiculo(v)
    setMode('lista')
  }

  if (mode === 'lista') {
    return (
      <div className="cadastro-page animate-fade-up">
        <h1 className="cadastro-page-title">
          <IconTruck />
          Cadastro de Veículo
        </h1>

        <CadastroStatsCards
          total={statsCadastro.total}
          ativos={statsCadastro.ativos}
          inativos={statsCadastro.inativos}
        />

        {porPerfil.length > 0 && (
          <section className="mb-4 rounded-xl border border-ink/10 bg-white p-3 shadow-sm">
            <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-muted">
              Por perfil de veículo
            </h2>
            <div className="flex flex-wrap gap-1.5">
              {porPerfil.map((p) => (
                <span
                  key={p.tipo}
                  className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs ${
                    p.qtd > 0
                      ? 'border-ink/15 bg-sand-light/70 text-ink'
                      : 'border-ink/5 bg-white text-ink-muted'
                  }`}
                  title={`${p.qtd} × ${p.tipo}`}
                >
                  <strong className="tabular-nums font-bold">{p.qtd}</strong>
                  <span className="max-w-[10rem] truncate">{p.tipo}</span>
                </span>
              ))}
            </div>
          </section>
        )}

        <div className="cadastro-toolbar">
          <input
            className="cadastro-search"
            placeholder="Pesquisar placa, tipo ou empresa..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <button
            type="button"
            className="cadastro-btn cadastro-btn--ghost"
            onClick={() => setImportOpen(true)}
          >
            Importar planilha
          </button>
          <button type="button" className="cadastro-btn cadastro-btn--primary" onClick={openNew}>
            + Novo Veículo
          </button>
        </div>

        <ImportarVeiculosModal
          open={importOpen}
          onClose={() => setImportOpen(false)}
          transportadorIdFixo={
            user?.role === 'transportador' ? user.transportador_id || null : undefined
          }
          transportadores={scopedTransportadores}
          veiculosExistentes={listaVeiculos}
          onImport={(lista) => {
            for (const v of lista) {
              if (!v.transportador_id) continue
              const t = transportadorById(v.transportador_id)
              const patch = t ? localizacaoDaTransportadora(t) : null
              salvarVeiculo(
                patch
                  ? { ...v, ...patch, disponivel_mapa: true, transportador_id: v.transportador_id }
                  : v,
              )
            }
          }}
        />

        <LocalizacaoVeiculoModal
          open={Boolean(locVeiculo)}
          veiculo={locVeiculo}
          transportador={
            locVeiculo?.transportador_id
              ? transportadorById(locVeiculo.transportador_id) ?? null
              : null
          }
          onClose={() => setLocVeiculo(null)}
          onSave={(patch) => {
            if (!locVeiculo) return
            salvarVeiculo({
              ...locVeiculo,
              ...patch,
              updated_at: new Date().toISOString(),
            })
            setLocVeiculo(null)
          }}
        />

        {avaliacoesDe ? (
          <VeiculoAvaliacoesModal
            veiculo={avaliacoesDe}
            cargas={cargas ?? []}
            empresa={
              avaliacoesDe.transportador_id
                ? transportadorById(avaliacoesDe.transportador_id)?.nome_fantasia
                : 'Autônomo'
            }
            onClose={() => setAvaliacoesDe(null)}
          />
        ) : null}

        <div className="cadastro-table-wrap">
          {filtered.length === 0 ? (
            <p className="cadastro-empty">Nenhum veículo encontrado.</p>
          ) : (
            <table className="cadastro-table">
              <thead>
                <tr>
                  <th>Placa</th>
                  <th>Empresa</th>
                  <th>Tipo</th>
                  <th>Frete mín.</th>
                  <th>Modelo</th>
                  <th>Capacidade</th>
                  <th>Risco</th>
                  <th>Situação</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {filtered.map((v) => (
                  <tr key={v.id}>
                    <td>
                      <strong>{v.placa}</strong>
                    </td>
                    <td>
                      {v.transportador_id
                        ? (transportadorById(v.transportador_id)?.nome_fantasia ?? '—')
                        : 'Autônomo'}
                    </td>
                    <td>{v.tipo}</td>
                    <td>
                      {v.frete_minimo > 0 ? formatCurrency(v.frete_minimo) : '—'}
                    </td>
                    <td>
                      {[v.marca, v.modelo].filter(Boolean).join(' ') || '—'}
                    </td>
                    <td>
                      {v.capacidade_kg != null
                        ? `${v.capacidade_kg.toLocaleString('pt-BR')} kg`
                        : '—'}
                    </td>
                    <td className="capitalize">
                      {v.gerenciamento_risco === 'rastreador'
                        ? 'Rastreador'
                        : v.gerenciamento_risco === 'localizador'
                          ? 'Localizador'
                          : 'Nenhum'}
                    </td>
                    <td>
                      <span className={`badge-situacao badge-situacao--${v.situacao}`}>
                        {v.situacao}
                      </span>
                    </td>
                    <td className="cadastro-table__acoes">
                      <div className="cadastro-table__acoes-list">
                        <button type="button" className="cadastro-link" onClick={() => openEdit(v)}>
                          Editar
                        </button>
                        <button
                          type="button"
                          className="cadastro-link cadastro-link--avaliacao"
                          title="Ver avaliações do veículo"
                          aria-label="Ver avaliações do veículo"
                          onClick={(e) => {
                            e.preventDefault()
                            e.stopPropagation()
                            setAvaliacoesDe(v)
                          }}
                        >
                          <span className="cadastro-link--avaliacao-ico" aria-hidden>
                            ★
                          </span>
                          <span className="cadastro-link--avaliacao-txt">Ver avaliações</span>
                        </button>
                        <button
                          type="button"
                          className="cadastro-link"
                          onClick={() => setLocVeiculo(v)}
                        >
                          Alterar localização
                        </button>
                        <button
                          type="button"
                          className="cadastro-link"
                          style={{ color: '#dc2626' }}
                          onClick={() => {
                            if (window.confirm(`Excluir veículo ${v.placa}?`)) excluirVeiculo(v.id)
                          }}
                        >
                          Excluir
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="cadastro-page animate-fade-up">
      <button type="button" className="cadastro-back" onClick={() => setMode('lista')}>
        ← Voltar para Lista
      </button>
      <h1 className="cadastro-page-title">
        <IconTruck />
        {editingId ? 'Editar Veículo' : 'Cadastro de Veículo'}
      </h1>

      <section className="form-card form-card--blue">
        <header className="form-card__head">
          <IconTruck />
          <h2 className="form-card__title">Dados do Veículo</h2>
        </header>
        <div className="form-card__body">
          <div className="form-fields">
            <Field label="Placa" required>
              <input
                placeholder="ABC-1234"
                value={form.placa ?? ''}
                onChange={(e) => set('placa', e.target.value.toUpperCase())}
              />
            </Field>
            <Field label="Empresa Vinculada">
              <select
                value={form.transportador_id ?? ''}
                onChange={(e) => set('transportador_id', e.target.value || null)}
                disabled={user?.role === 'transportador'}
              >
                <option value="">Sem empresa (veículo autônomo)</option>
                {scopedTransportadores.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.nome_fantasia}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Renavam">
              <input value={form.renavam ?? ''} onChange={(e) => set('renavam', e.target.value)} />
            </Field>
            <Field label="Condutor (Proprietário)">
              <select
                value={form.condutor ?? ''}
                onChange={(e) => set('condutor', e.target.value)}
              >
                <option value="">Selecione o motorista...</option>
                {form.condutor &&
                  !motoristasParaCondutor.some((m) => m.nome === form.condutor) && (
                    <option value={form.condutor}>{form.condutor} (atual)</option>
                  )}
                {motoristasParaCondutor.map((m) => (
                  <option key={m.id} value={m.nome}>
                    {m.nome}
                    {m.situacao !== 'ativo' ? ' (inativo)' : ''}
                  </option>
                ))}
              </select>
              {motoristasParaCondutor.length === 0 && (
                <p className="cadastro-empty" style={{ marginTop: 6, fontSize: '0.8rem' }}>
                  Nenhum motorista cadastrado. Cadastre em Motoristas para listar aqui.
                </p>
              )}
            </Field>
            <Field label="Tipo (categoria do veículo)" required>
              <VeiculoSuggestInput
                value={form.tipo ?? ''}
                onChange={(v) => set('tipo', v)}
                placeholder="Carreta, Truck, Fiorino…"
              />
            </Field>
            <Field label="Frete mínimo (R$)" required>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontWeight: 700, color: '#1a1d21' }}>R$</span>
                <input
                  inputMode="numeric"
                  autoComplete="off"
                  placeholder="0,00"
                  value={freteMinimoTxt}
                  onChange={(e) => onFreteMinimoChange(e.target.value)}
                  aria-label="Frete mínimo em reais"
                />
              </div>
              <p className="form-field-hint" style={{ marginTop: 6, fontSize: 12, color: '#1a1d21' }}>
                Valor mínimo de frete que este veículo/categoria aceita. Digite só números.
              </p>
            </Field>
            <Field label="Marca">
              <select value={form.marca ?? ''} onChange={(e) => set('marca', e.target.value)}>
                <option value="">Selecione a Marca...</option>
                {MARCAS.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Modelo">
              <input value={form.modelo ?? ''} onChange={(e) => set('modelo', e.target.value)} />
            </Field>
            <Field label="Cor">
              <input value={form.cor ?? ''} onChange={(e) => set('cor', e.target.value)} />
            </Field>
            <Field label="Ano Fabricação">
              <input value={form.ano_fabricacao ?? ''} onChange={(e) => set('ano_fabricacao', e.target.value)} />
            </Field>
            <Field label="Ano Modelo">
              <input value={form.ano_modelo ?? ''} onChange={(e) => set('ano_modelo', e.target.value)} />
            </Field>
            <Field label="UF Licenciamento">
              <select
                value={form.uf_licenciamento ?? 'SP'}
                onChange={(e) => set('uf_licenciamento', e.target.value)}
              >
                {UFS.map((uf) => (
                  <option key={uf} value={uf}>
                    {uf}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Situação">
              <select
                value={form.situacao ?? 'ativo'}
                onChange={(e) => set('situacao', e.target.value as 'ativo' | 'inativo')}
              >
                <option value="ativo">Ativo</option>
                <option value="inativo">Inativo</option>
              </select>
            </Field>
          </div>
        </div>
      </section>

      <section className="form-card form-card--purple" style={{ marginTop: 16 }}>
        <header className="form-card__head">
          <h2 className="form-card__title">Gerenciamento de risco</h2>
        </header>
        <div className="form-card__body">
          <div className="form-fields">
            <Field label="Exige" required>
              <select
                value={form.gerenciamento_risco ?? 'nenhum'}
                onChange={(e) => {
                  const value = e.target.value as Veiculo['gerenciamento_risco']
                  setForm((prev) => ({
                    ...prev,
                    gerenciamento_risco: value,
                    rastreador_dados:
                      value === 'rastreador' ? prev.rastreador_dados ?? '' : '',
                  }))
                }}
              >
                <option value="rastreador">Rastreador</option>
                <option value="localizador">Localizador</option>
                <option value="nenhum">Nenhum</option>
              </select>
            </Field>
            {form.gerenciamento_risco === 'rastreador' && (
              <Field label="Dados do rastreador" required>
                <textarea
                  rows={3}
                  value={form.rastreador_dados ?? ''}
                  onChange={(e) => set('rastreador_dados', e.target.value)}
                  placeholder="Cole aqui IMEI, serial, fornecedor, link do portal…"
                  style={{ width: '100%', resize: 'vertical' }}
                />
              </Field>
            )}
          </div>
        </div>
      </section>

      <section className="form-card form-card--blue" style={{ marginTop: 16 }}>
        <header className="form-card__head">
          <IconCamera />
          <h2 className="form-card__title">Fotos do Veículo (5 obrigatórias)</h2>
        </header>
        <div className="form-card__body">
          <p className="cadastro-publico__hint" style={{ marginBottom: 14 }}>
            Anexe as 5 fotos do roteiro. JPG, PNG ou WEBP (máx. 8 MB cada).
          </p>
          <div className="fotos-veiculo-grid">
            {FOTOS_VEICULO_ROTEIRO.map((item) => {
              const url = fotosAtuais[item.slot]
              return (
                <div key={item.slot} className="foto-veiculo-slot">
                  <div className="foto-veiculo-slot__head">
                    <div className="foto-veiculo-slot__title">
                      <strong>{item.titulo}</strong>
                      <button
                        type="button"
                        className="foto-veiculo-slot__info"
                        aria-label={`O que fotografar: ${item.titulo}`}
                        aria-expanded={dicaFoto === item.slot}
                        title="Ver explicação"
                        onClick={() =>
                          setDicaFoto((atual) => (atual === item.slot ? null : item.slot))
                        }
                      >
                        ?
                      </button>
                    </div>
                    {dicaFoto === item.slot && (
                      <span className="foto-veiculo-slot__dica">{item.descricao}</span>
                    )}
                  </div>
                  <div className="foto-box">
                    {url ? (
                      <img src={url} alt={item.titulo} />
                    ) : (
                      <>
                        <IconCamera />
                        <span>Sem Foto</span>
                      </>
                    )}
                  </div>
                  <div className="foto-veiculo-slot__actions">
                    <label className="cadastro-btn cadastro-btn--ghost doc-upload-row__btn">
                      {url ? 'Trocar foto' : 'Anexar foto'}
                      <input
                        type="file"
                        accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp"
                        hidden
                        onChange={(e) => {
                          const f = e.target.files?.[0] ?? null
                          e.target.value = ''
                          escolherFoto(item.slot, f)
                        }}
                      />
                    </label>
                    {url ? (
                      <>
                        <button
                          type="button"
                          className="cadastro-link"
                          onClick={() => void reconstruirFotoParaAjuste(item.slot, url)}
                        >
                          Ajustar
                        </button>
                        <button
                          type="button"
                          className="cadastro-link"
                          style={{ color: '#dc2626' }}
                          onClick={() => void aplicarFoto(item.slot, null)}
                        >
                          Remover
                        </button>
                      </>
                    ) : null}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </section>

      <div className="cadastro-grid cadastro-grid--equal" style={{ marginTop: 16 }}>
        <section className="form-card form-card--green">
          <header className="form-card__head">
            <IconTruck />
            <h2 className="form-card__title">Carroceria</h2>
          </header>
          <div className="form-card__body">
            <div className="form-fields form-fields--photo">
              <Field label="Tipo de carroceria">
                <CarroceriaSuggestInput
                  value={form.tipo_carroceria ?? ''}
                  onChange={(v) => set('tipo_carroceria', v)}
                  placeholder="Baú, Sider, Graneleiro…"
                />
              </Field>
              <Field label="Quantidade de Pallets (Max 32)">
                <input
                  type="number"
                  min={0}
                  max={32}
                  value={form.qtd_pallets ?? ''}
                  onChange={(e) =>
                    set('qtd_pallets', e.target.value === '' ? undefined : Number(e.target.value))
                  }
                />
              </Field>
              <Field label="Aclimação">
                <select
                  value={form.aclimatacao ?? ''}
                  onChange={(e) => set('aclimatacao', e.target.value)}
                >
                  <option value="">Selecione...</option>
                  {ACLIMATACAO.map((a) => (
                    <option key={a} value={a}>
                      {a}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
          </div>
        </section>

        <section className="form-card form-card--orange">
          <header className="form-card__head">
            <IconExpand />
            <h2 className="form-card__title">Capacidade</h2>
          </header>
          <div className="form-card__body">
            <div className="form-fields form-fields--photo">
              <Field label="Capacidade (KG)">
                <input
                  type="number"
                  value={form.capacidade_kg ?? ''}
                  onChange={(e) =>
                    set('capacidade_kg', e.target.value === '' ? undefined : Number(e.target.value))
                  }
                />
              </Field>
              <Field label="Comprimento (m)">
                <input
                  type="number"
                  min={0}
                  step={0.01}
                  inputMode="decimal"
                  placeholder="Ex.: 14,00"
                  value={form.comprimento_m ?? ''}
                  onChange={(e) =>
                    setDimensaoBau(
                      'comprimento_m',
                      e.target.value === '' ? undefined : Number(e.target.value),
                    )
                  }
                />
              </Field>
              <Field label="Largura (m)">
                <input
                  type="number"
                  min={0}
                  step={0.01}
                  inputMode="decimal"
                  placeholder="Ex.: 2,60"
                  value={form.largura_m ?? ''}
                  onChange={(e) =>
                    setDimensaoBau(
                      'largura_m',
                      e.target.value === '' ? undefined : Number(e.target.value),
                    )
                  }
                />
              </Field>
              <Field label="Altura (m)">
                <input
                  type="number"
                  min={0}
                  step={0.01}
                  inputMode="decimal"
                  placeholder="Ex.: 2,70"
                  value={form.altura_m ?? ''}
                  onChange={(e) =>
                    setDimensaoBau(
                      'altura_m',
                      e.target.value === '' ? undefined : Number(e.target.value),
                    )
                  }
                />
              </Field>
              <Field label="Cubagem (m³)">
                <input
                  type="number"
                  min={0}
                  step={0.01}
                  inputMode="decimal"
                  title="Preenchido automaticamente com Comprimento × Largura × Altura"
                  value={form.cubagem_m3 ?? ''}
                  onChange={(e) =>
                    set('cubagem_m3', e.target.value === '' ? undefined : Number(e.target.value))
                  }
                />
                <p className="mt-1 text-[11px] text-ink-muted">
                  Calculado automático: comprimento × largura × altura.
                </p>
              </Field>
              <Field label="Eixos (Max 20)">
                <input
                  type="number"
                  min={0}
                  max={20}
                  value={form.eixos ?? ''}
                  onChange={(e) =>
                    set('eixos', e.target.value === '' ? undefined : Number(e.target.value))
                  }
                />
              </Field>
            </div>
          </div>
        </section>
      </div>

      <section className="form-card form-card--blue" style={{ marginTop: 16 }}>
        <header className="form-card__head">
          <IconMapPin />
          <h2 className="form-card__title">Localização no Mapa da Frota</h2>
        </header>
        <div className="form-card__body">
          <VeiculoLocalizacaoFields
            resetKey={editingId ?? 'novo-veiculo'}
            value={{
              origem_cep: form.origem_cep,
              origem_cidade: form.origem_cidade,
              origem_uf: form.origem_uf,
              origem_endereco: form.origem_endereco,
              origem_numero: form.origem_numero,
              origem_bairro: form.origem_bairro,
              origem_complemento: form.origem_complemento,
              origem_lat: form.origem_lat,
              origem_lng: form.origem_lng,
              raio_km: form.raio_km,
            }}
            transportador={
              form.transportador_id
                ? transportadorById(form.transportador_id) ?? null
                : null
            }
            onChange={(patch) => {
              setForm((prev) => ({ ...prev, ...patch }))
            }}
          />
        </div>
      </section>

      {error && <p style={{ color: '#dc2626', marginTop: 12, textAlign: 'center' }}>{error}</p>}

      <div className="cadastro-actions">
        <button type="button" className="cadastro-btn cadastro-btn--save" onClick={save}>
          Salvar Veículo
        </button>
      </div>

      <ImageCropModal
        open={Boolean(fotoCrop)}
        file={fotoCrop?.file ?? null}
        shape="square"
        title={
          fotoCrop
            ? `Ajustar — ${FOTOS_VEICULO_ROTEIRO.find((x) => x.slot === fotoCrop.slot)?.titulo ?? 'Foto'}`
            : 'Ajustar foto'
        }
        onCancel={() => setFotoCrop(null)}
        onConfirm={(f) => {
          const slot = fotoCrop?.slot
          setFotoCrop(null)
          if (slot) void aplicarFoto(slot, f)
        }}
      />
    </div>
  )
}

function Field({
  label,
  required,
  children,
}: {
  label: string
  required?: boolean
  children: React.ReactNode
}) {
  return (
    <div className="form-field">
      <label>
        {label}
        {required && <span className="req">*</span>}
      </label>
      {children}
    </div>
  )
}

function IconTruck() {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" fill="none" aria-hidden>
      <path d="M1 16V7h11v9M12 10h4l3 3v3h-7" stroke="currentColor" strokeWidth="1.75" strokeLinejoin="round" />
      <circle cx="5.5" cy="16.5" r="1.5" stroke="currentColor" strokeWidth="1.75" />
      <circle cx="16.5" cy="16.5" r="1.5" stroke="currentColor" strokeWidth="1.75" />
    </svg>
  )
}

function IconMapPin() {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" fill="none" aria-hidden>
      <path
        d="M12 21s7-4.5 7-11a7 7 0 1 0-14 0c0 6.5 7 11 7 11z"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinejoin="round"
      />
      <circle cx="12" cy="10" r="2.5" stroke="currentColor" strokeWidth="1.75" />
    </svg>
  )
}

function IconCamera() {
  return (
    <svg viewBox="0 0 24 24" width="28" height="28" fill="none" aria-hidden>
      <path
        d="M4 8h3l2-2h6l2 2h3v11H4V8z"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinejoin="round"
      />
      <circle cx="12" cy="13" r="3.5" stroke="currentColor" strokeWidth="1.75" />
    </svg>
  )
}

function IconExpand() {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" fill="none" aria-hidden>
      <path d="M9 4H4v5M15 4h5v5M9 20H4v-5M20 15v5h-5" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}
