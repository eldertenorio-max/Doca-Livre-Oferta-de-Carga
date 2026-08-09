import { useMemo, useRef, useState } from 'react'
import { useData } from '../../context/DataContext'
import { CadastroStatsCards } from '../../components/cadastro/CadastroStatsCards'
import { CadastroPagination, usePaginatedList } from '../../components/cadastro/CadastroPagination'
import { MotoristaAvaliacoesModal } from '../../components/motorista/MotoristaAvaliacoesModal'
import { ImportarMotoristasModal } from '../../components/motorista/ImportarMotoristasModal'
import { MotoristaMedalhasBadges } from '../../components/motorista/MotoristaConquistas'
import { inputClass } from '../../components/ui/Modal'
import { fileToDataUrl, isAcceptedImageFile } from '../../lib/veiculoFotos'
import { isAcceptedDocFile, openLocalDocumento } from '../../lib/transportadorDocs'
import { ImageCropModal } from '../../components/ui/ImageCropModal'
import { iniciaisNome } from '../../lib/mapaFrota'
import type { Motorista } from '../../types'
import { formatCpf } from '../../lib/cpf'
import '../../styles/cadastro.css'

/** Categorias oficiais de CNH (ordem de exibição). Sem A (só moto). */
const CATEGORIAS_CNH = ['B', 'C', 'D', 'E', 'AB', 'AC', 'AD', 'AE'] as const

const emptyForm = (): Partial<Motorista> => ({
  nome: '',
  transportador_id: '',
  veiculo_id: '',
  autonomo: false,
  cpf: '',
  cnh: '',
  categoria_cnh: 'E',
  validade_cnh: '',
  telefone: '',
  whatsapp_no_mapa: false,
  foto_url: '',
  cnh_arquivo_url: '',
  cnh_arquivo_nome: '',
  situacao: 'ativo',
})

export function MotoristasPage() {
  const {
    motoristas,
    veiculos,
    transportadores,
    cargas,
    salvarMotorista,
    excluirMotorista,
    transportadorById,
    user,
  } = useData()
  const [mode, setMode] = useState<'lista' | 'form'>('lista')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<Partial<Motorista>>(emptyForm)
  const [search, setSearch] = useState('')
  const [error, setError] = useState('')
  const [avaliacoesDe, setAvaliacoesDe] = useState<Motorista | null>(null)
  const [importOpen, setImportOpen] = useState(false)
  const fotoInputRef = useRef<HTMLInputElement>(null)
  const cnhInputRef = useRef<HTMLInputElement>(null)
  const [fotoParaAjustar, setFotoParaAjustar] = useState<File | null>(null)

  const lista = motoristas ?? []
  const listaVeiculos = veiculos ?? []
  const listaTransportadores = transportadores ?? []
  const isTransportador = user?.role === 'transportador' && Boolean(user.transportador_id)

  const scoped = useMemo(() => {
    if (isTransportador && user?.transportador_id) {
      return lista.filter(
        (m) => m.transportador_id === user.transportador_id || m.autonomo === false,
      ).filter((m) => m.transportador_id === user.transportador_id)
    }
    return lista
  }, [lista, user, isTransportador])

  const scopedTransportadores = useMemo(() => {
    if (isTransportador && user?.transportador_id) {
      return listaTransportadores.filter((t) => t.id === user.transportador_id)
    }
    return listaTransportadores.filter((t) => t.situacao === 'ativo' || t.situacao === 'pendente')
  }, [listaTransportadores, user, isTransportador])

  const veiculosDisponiveis = useMemo(() => {
    if (form.autonomo) {
      return listaVeiculos.filter(
        (v) =>
          v.situacao === 'ativo' &&
          (v.transportador_id == null ||
            v.id === form.veiculo_id ||
            !lista.some((m) => m.veiculo_id === v.id && m.id !== editingId && !m.autonomo)),
      )
    }
    const tid = form.transportador_id
    if (!tid) return []
    return listaVeiculos.filter(
      (v) =>
        v.situacao === 'ativo' &&
        (v.transportador_id === tid || v.id === form.veiculo_id),
    )
  }, [form.autonomo, form.transportador_id, form.veiculo_id, listaVeiculos, lista, editingId])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return scoped
    return scoped.filter((m) => {
      const emp = m.autonomo
        ? 'autônomo'
        : (transportadorById(m.transportador_id ?? '')?.nome_fantasia ?? '')
      const placa = listaVeiculos.find((v) => v.id === m.veiculo_id)?.placa ?? ''
      return (
        m.nome.toLowerCase().includes(q) ||
        (m.cpf ?? '').includes(q) ||
        (m.cnh ?? '').includes(q) ||
        emp.toLowerCase().includes(q) ||
        placa.toLowerCase().includes(q)
      )
    })
  }, [scoped, search, transportadorById, listaVeiculos])

  const {
    pageItems: motoristasPagina,
    page,
    setPage,
    totalPages,
    total: totalFiltrados,
    from,
    to,
  } = usePaginatedList(filtered)

  const statsCadastro = useMemo(() => {
    const total = scoped.length
    const ativos = scoped.filter((m) => m.situacao === 'ativo').length
    const inativos = scoped.filter((m) => m.situacao === 'inativo').length
    return { total, ativos, inativos }
  }, [scoped])

  /** Quantidade por categoria de habilitação (CNH). */
  const porCategoria = useMemo(() => {
    const map = new Map<string, number>()
    for (const c of CATEGORIAS_CNH) map.set(c, 0)
    for (const m of scoped) {
      const cat = (m.categoria_cnh || '').trim().toUpperCase() || '—'
      map.set(cat, (map.get(cat) ?? 0) + 1)
    }
    const catalog = CATEGORIAS_CNH.map((cat) => ({ cat, qtd: map.get(cat) ?? 0 }))
    const extras = [...map.entries()]
      .filter(([cat]) => !(CATEGORIAS_CNH as readonly string[]).includes(cat))
      .map(([cat, qtd]) => ({ cat, qtd }))
      .sort((a, b) => b.qtd - a.qtd || a.cat.localeCompare(b.cat))
    return [...catalog, ...extras]
  }, [scoped])

  function openNew() {
    setEditingId(null)
    setForm({
      ...emptyForm(),
      transportador_id: isTransportador ? user!.transportador_id! : '',
      autonomo: false,
    })
    setError('')
    setMode('form')
  }

  function openEdit(m: Motorista) {
    setEditingId(m.id)
    setForm({
      ...m,
      transportador_id: m.transportador_id ?? '',
      veiculo_id: m.veiculo_id ?? '',
      cpf: m.cpf ? formatCpf(m.cpf) : '',
    })
    setError('')
    setMode('form')
  }

  function set<K extends keyof Motorista>(key: K, value: Motorista[K]) {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  function setAutonomo(checked: boolean) {
    setForm((prev) => ({
      ...prev,
      autonomo: checked,
      transportador_id: checked ? null : prev.transportador_id || '',
      veiculo_id: '',
    }))
  }

  function save() {
    if (!form.nome?.trim()) {
      setError('Informe o nome do motorista.')
      return
    }
    if (!form.veiculo_id) {
      setError('Vincule uma placa (veículo) ao motorista.')
      return
    }
    if (!form.autonomo && !form.transportador_id) {
      setError('Selecione a transportadora ou marque Motorista autônomo.')
      return
    }
    const veiculo = listaVeiculos.find((v) => v.id === form.veiculo_id)
    if (!veiculo) {
      setError('Veículo selecionado não encontrado.')
      return
    }
    if (!form.autonomo && veiculo.transportador_id && veiculo.transportador_id !== form.transportador_id) {
      setError('A placa selecionada pertence a outra transportadora.')
      return
    }

    const now = new Date().toISOString()
    salvarMotorista({
      id: editingId ?? `m-${Date.now()}`,
      transportador_id: form.autonomo ? null : (form.transportador_id as string),
      veiculo_id: form.veiculo_id as string,
      autonomo: Boolean(form.autonomo),
      nome: form.nome.trim(),
      cpf: form.cpf ? formatCpf(form.cpf) : undefined,
      cnh: form.cnh?.trim() || undefined,
      categoria_cnh: form.categoria_cnh?.trim() || undefined,
      validade_cnh: form.validade_cnh || undefined,
      cnh_arquivo_url: (form.cnh_arquivo_url || '').trim() || undefined,
      cnh_arquivo_nome: (form.cnh_arquivo_nome || '').trim() || undefined,
      telefone: form.telefone?.trim() || undefined,
      whatsapp_no_mapa: form.whatsapp_no_mapa === true,
      foto_url: (form.foto_url || '').trim() || undefined,
      avaliacao: form.avaliacao,
      total_avaliacoes: form.total_avaliacoes,
      situacao: form.situacao ?? 'ativo',
      created_at: form.created_at ?? now,
    })
    setMode('lista')
  }

  function onFotoSelecionada(file: File | undefined) {
    if (!file) return
    if (!isAcceptedImageFile(file)) {
      setError('Use JPG, PNG ou WEBP para a foto.')
      return
    }
    if (file.size > 4 * 1024 * 1024) {
      setError('A foto deve ter no máximo 4 MB.')
      return
    }
    setError('')
    setFotoParaAjustar(file)
  }

  async function onConfirmarFoto(file: File) {
    setFotoParaAjustar(null)
    const dataUrl = await fileToDataUrl(file)
    set('foto_url', dataUrl)
  }

  async function onCnhAnexoSelecionado(file: File | undefined) {
    if (!file) return
    if (!isAcceptedDocFile(file)) {
      setError('Use JPG, PNG, WEBP ou PDF para a CNH.')
      return
    }
    if (file.size > 8 * 1024 * 1024) {
      setError('O arquivo da CNH deve ter no máximo 8 MB.')
      return
    }
    setError('')
    const dataUrl = await fileToDataUrl(file)
    setForm((prev) => ({
      ...prev,
      cnh_arquivo_url: dataUrl,
      cnh_arquivo_nome: file.name,
    }))
  }

  function isCnhPdf(url?: string, nome?: string): boolean {
    const n = (nome || '').toLowerCase()
    if (n.endsWith('.pdf')) return true
    return Boolean(url?.startsWith('data:application/pdf'))
  }

  return (
    <div className="cadastro-page animate-fade-up">
      {mode === 'lista' ? (
        <>
          <header className="mb-4 flex flex-wrap items-end justify-between gap-3">
            <div>
              <h1 className="cadastro-page-title">Motoristas</h1>
              <p className="text-sm text-ink-muted">
                Vincule motorista + placa + transportadora (ou autônomo).
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className="cadastro-btn cadastro-btn--ghost"
                onClick={() => setImportOpen(true)}
              >
                Importar planilha
              </button>
              <button type="button" className="cadastro-btn cadastro-btn--primary" onClick={openNew}>
                Novo motorista
              </button>
            </div>
          </header>

          <ImportarMotoristasModal
            open={importOpen}
            onClose={() => setImportOpen(false)}
            transportadorIdFixo={
              isTransportador ? user?.transportador_id || null : undefined
            }
            transportadores={scopedTransportadores}
            veiculos={listaVeiculos}
            motoristasExistentes={scoped}
            onImport={(lista) => {
              for (const m of lista) salvarMotorista(m)
            }}
          />

          <CadastroStatsCards
            total={statsCadastro.total}
            ativos={statsCadastro.ativos}
            inativos={statsCadastro.inativos}
          />

          <section className="mb-3 rounded-xl border border-ink/10 bg-white p-3 shadow-sm">
            <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-muted">
              Por categoria de habilitação
            </h2>
            <div className="flex flex-wrap gap-1.5">
              {porCategoria.map((p) => (
                <span
                  key={p.cat}
                  className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs ${
                    p.qtd > 0
                      ? 'border-ink/15 bg-sand-light/70 text-ink'
                      : 'border-ink/5 bg-white text-ink-muted'
                  }`}
                  title={`${p.qtd} motorista(s) categoria ${p.cat}`}
                >
                  <span className="font-medium text-ink-muted">Cat. {p.cat}</span>
                  <strong className="tabular-nums font-bold">{p.qtd}</strong>
                </span>
              ))}
            </div>
          </section>

          <input
            className="cadastro-search mb-3 max-w-md"
            placeholder="Buscar por nome, CPF, CNH, placa ou transportadora…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />

          <div className="overflow-x-auto rounded-xl border border-ink/10 bg-white">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-ink/10 text-left text-xs text-ink-muted">
                  <th className="p-3">Nome</th>
                  <th className="p-3">Conquistas</th>
                  <th className="p-3">Placa</th>
                  <th className="p-3">Transportadora</th>
                  <th className="p-3">CNH</th>
                  <th className="p-3">WhatsApp</th>
                  <th className="p-3">Situação</th>
                  <th className="p-3" />
                </tr>
              </thead>
              <tbody>
                {motoristasPagina.map((m) => {
                  const placa = listaVeiculos.find((v) => v.id === m.veiculo_id)?.placa
                  const foto = (m.foto_url || '').trim()
                  return (
                    <tr key={m.id} className="border-b border-ink/5">
                      <td className="p-3 font-medium">
                        <span className="inline-flex items-center gap-2">
                          {foto ? (
                            <img
                              src={foto}
                              alt=""
                              className="h-8 w-8 shrink-0 rounded-full object-cover border border-ink/10"
                            />
                          ) : (
                            <span
                              className="inline-grid h-8 w-8 shrink-0 place-items-center rounded-full bg-ink text-[10px] font-extrabold text-brand"
                              aria-hidden
                            >
                              {iniciaisNome(m.nome)}
                            </span>
                          )}
                          {m.nome}
                        </span>
                      </td>
                      <td className="p-3">
                        <MotoristaMedalhasBadges motorista={m} cargas={cargas ?? []} />
                      </td>
                      <td className="p-3 font-semibold tabular-nums">{placa ?? '—'}</td>
                      <td className="p-3">
                        {m.autonomo
                          ? 'Motorista autônomo'
                          : (transportadorById(m.transportador_id ?? '')?.nome_fantasia ?? '—')}
                      </td>
                      <td className="p-3">
                        <span className="inline-flex flex-wrap items-center gap-1.5">
                          <span>
                            {m.cnh ?? '—'}
                            {m.categoria_cnh ? ` (${m.categoria_cnh})` : ''}
                          </span>
                          {(m.cnh_arquivo_url || '').trim() ? (
                            <span
                              className="rounded-md border border-emerald-200 bg-emerald-50 px-1.5 py-0.5 text-[10px] font-extrabold uppercase tracking-wide text-emerald-800"
                              title={m.cnh_arquivo_nome || 'CNH anexada'}
                            >
                              Anexo
                            </span>
                          ) : null}
                        </span>
                      </td>
                      <td className="p-3">{m.telefone ?? '—'}</td>
                      <td className="p-3 capitalize">{m.situacao}</td>
                      <td className="cadastro-table__acoes p-3">
                        <div className="cadastro-table__acoes-list">
                          <button
                            type="button"
                            className="cadastro-link"
                            onClick={() => openEdit(m)}
                          >
                            Editar
                          </button>
                          <button
                            type="button"
                            className="cadastro-link cadastro-link--avaliacao"
                            title="Ver avaliações do motorista"
                            aria-label="Ver avaliações do motorista"
                            onClick={(e) => {
                              e.preventDefault()
                              e.stopPropagation()
                              setAvaliacoesDe(m)
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
                            style={{ color: '#dc2626' }}
                            onClick={() => {
                              if (window.confirm('Excluir este motorista?')) excluirMotorista(m.id)
                            }}
                          >
                            Excluir
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={8} className="p-6 text-center text-ink-muted">
                      Nenhum motorista cadastrado.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
            {filtered.length > 0 ? (
              <CadastroPagination
                page={page}
                totalPages={totalPages}
                total={totalFiltrados}
                from={from}
                to={to}
                onPageChange={setPage}
              />
            ) : null}
          </div>
        </>
      ) : (
        <>
          <header className="mb-4">
            <h1 className="cadastro-page-title">
              {editingId ? 'Editar motorista' : 'Novo motorista'}
            </h1>
            <p className="text-sm text-ink-muted">
              Os três devem ficar vinculados: motorista, placa e transportadora — ou motorista
              autônomo com placa.
            </p>
          </header>

          <div className="max-w-xl space-y-3 rounded-xl border border-ink/10 bg-white p-4">
            <div className="flex flex-wrap items-center gap-4 rounded-lg border border-ink/10 bg-sand-light/40 px-3 py-3">
              <input
                ref={fotoInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp"
                hidden
                onChange={(e) => {
                  const file = e.target.files?.[0]
                  e.target.value = ''
                  onFotoSelecionada(file)
                }}
              />
              {(form.foto_url || '').trim() ? (
                <img
                  src={form.foto_url}
                  alt=""
                  className="h-[84px] w-[84px] shrink-0 rounded-full border-2 border-brand object-cover"
                />
              ) : (
                <span
                  className="inline-grid h-[84px] w-[84px] shrink-0 place-items-center rounded-full border-2 border-brand bg-ink text-xl font-extrabold text-brand"
                  aria-hidden
                >
                  {iniciaisNome(form.nome || '?')}
                </span>
              )}
              <div className="min-w-0 space-y-2">
                <p className="text-sm font-semibold text-ink">Foto do motorista</p>
                <p className="text-[12px] text-ink-muted">
                  JPG, PNG ou WEBP · máx. 4 MB. Aparece no mapa e nas avaliações.
                </p>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    className="cadastro-btn cadastro-btn--ghost"
                    style={{ padding: '6px 12px', fontSize: '0.78rem' }}
                    onClick={() => fotoInputRef.current?.click()}
                  >
                    {(form.foto_url || '').trim() ? 'Trocar foto' : 'Enviar foto'}
                  </button>
                  {(form.foto_url || '').trim() ? (
                    <button
                      type="button"
                      className="cadastro-btn cadastro-btn--ghost"
                      style={{ padding: '6px 12px', fontSize: '0.78rem' }}
                      onClick={() => set('foto_url', '')}
                    >
                      Remover
                    </button>
                  ) : null}
                </div>
              </div>
            </div>

            {!isTransportador && (
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={Boolean(form.autonomo)}
                  onChange={(e) => setAutonomo(e.target.checked)}
                />
                Motorista autônomo (sem transportadora)
              </label>
            )}

            {!form.autonomo && (
              <label className="block text-sm">
                <span className="mb-1 block text-xs font-semibold text-ink-muted">
                  Transportadora
                </span>
                <select
                  className={inputClass}
                  value={form.transportador_id ?? ''}
                  disabled={isTransportador}
                  onChange={(e) => {
                    set('transportador_id', e.target.value)
                    set('veiculo_id', null)
                  }}
                >
                  <option value="">Selecione…</option>
                  {scopedTransportadores.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.nome_fantasia}
                    </option>
                  ))}
                </select>
              </label>
            )}

            <label className="block text-sm">
              <span className="mb-1 block text-xs font-semibold text-ink-muted">
                Placa / veículo vinculado
              </span>
              <select
                className={inputClass}
                value={form.veiculo_id ?? ''}
                onChange={(e) => set('veiculo_id', e.target.value || null)}
                disabled={!form.autonomo && !form.transportador_id}
              >
                <option value="">
                  {form.autonomo || form.transportador_id
                    ? 'Selecione a placa…'
                    : 'Selecione a transportadora primeiro…'}
                </option>
                {veiculosDisponiveis.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.placa}
                    {v.tipo ? ` — ${v.tipo}` : ''}
                    {v.transportador_id == null ? ' (sem transportadora)' : ''}
                  </option>
                ))}
              </select>
              {form.autonomo && (
                <p className="mt-1 text-[11px] text-ink-muted">
                  Cadastre o veículo em Veículos sem empresa, ou use uma placa sem transportadora.
                </p>
              )}
            </label>

            <label className="block text-sm">
              <span className="mb-1 block text-xs font-semibold text-ink-muted">Nome</span>
              <input
                className={inputClass}
                value={form.nome ?? ''}
                onChange={(e) => set('nome', e.target.value)}
              />
            </label>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block text-sm">
                <span className="mb-1 block text-xs font-semibold text-ink-muted">CPF</span>
                <input
                  className={inputClass}
                  value={form.cpf ?? ''}
                  onChange={(e) => set('cpf', formatCpf(e.target.value))}
                  placeholder="000.000.000-00"
                  inputMode="numeric"
                  autoComplete="off"
                  maxLength={14}
                />
              </label>
              <div className="block text-sm">
                <span className="mb-1 block text-xs font-semibold text-ink-muted">WhatsApp</span>
                <input
                  className={inputClass}
                  value={form.telefone ?? ''}
                  onChange={(e) => set('telefone', e.target.value)}
                  placeholder="(00) 00000-0000"
                  inputMode="tel"
                />
                <label className="mt-2 flex cursor-pointer items-start gap-2 text-xs text-ink">
                  <input
                    type="checkbox"
                    className="mt-0.5"
                    checked={form.whatsapp_no_mapa === true}
                    onChange={(e) => set('whatsapp_no_mapa', e.target.checked)}
                  />
                  <span>
                    <span className="font-semibold">Mostrar no mapa de frota</span>
                    <span className="mt-0.5 block text-[11px] font-normal text-ink-muted">
                      Marcado: exibe este WhatsApp. Desmarcado: exibe o da transportadora.
                    </span>
                  </span>
                </label>
              </div>
              <label className="block text-sm">
                <span className="mb-1 block text-xs font-semibold text-ink-muted">CNH</span>
                <input
                  className={inputClass}
                  value={form.cnh ?? ''}
                  onChange={(e) => set('cnh', e.target.value)}
                />
              </label>
              <label className="block text-sm">
                <span className="mb-1 block text-xs font-semibold text-ink-muted">Categoria</span>
                <select
                  className={inputClass}
                  value={form.categoria_cnh ?? ''}
                  onChange={(e) => set('categoria_cnh', e.target.value)}
                >
                  <option value="">Selecione…</option>
                  {CATEGORIAS_CNH.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-sm">
                <span className="mb-1 block text-xs font-semibold text-ink-muted">
                  Validade CNH
                </span>
                <input
                  type="date"
                  className={inputClass}
                  value={form.validade_cnh ?? ''}
                  onChange={(e) => set('validade_cnh', e.target.value)}
                />
              </label>

              <div className="sm:col-span-2 rounded-xl border border-ink/10 bg-sand-light/40 p-3">
                <p className="mb-1 text-xs font-semibold text-ink-muted">Anexo da CNH</p>
                <p className="mb-2 text-[11px] text-ink-muted">
                  Foto (JPG, PNG, WEBP) ou PDF · máx. 8 MB.
                </p>
                {(form.cnh_arquivo_url || '').trim() ? (
                  <div className="mb-2 flex flex-wrap items-center gap-3">
                    {isCnhPdf(form.cnh_arquivo_url, form.cnh_arquivo_nome) ? (
                      <div className="inline-flex h-16 w-16 items-center justify-center rounded-lg border border-ink/15 bg-white text-xs font-extrabold text-ink">
                        PDF
                      </div>
                    ) : (
                      <img
                        src={form.cnh_arquivo_url}
                        alt="CNH anexada"
                        className="h-16 w-auto max-w-[140px] rounded-lg border border-ink/15 object-cover"
                      />
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-ink">
                        {form.cnh_arquivo_nome || 'CNH anexada'}
                      </p>
                      <div className="mt-1.5 flex flex-wrap gap-2">
                        <button
                          type="button"
                          className="cadastro-btn cadastro-btn--ghost !px-2.5 !py-1 text-xs"
                          onClick={() => {
                            void openLocalDocumento({ data_url: form.cnh_arquivo_url }).catch(() =>
                              setError('Não foi possível abrir o anexo da CNH.'),
                            )
                          }}
                        >
                          Ver anexo
                        </button>
                        <button
                          type="button"
                          className="cadastro-btn cadastro-btn--ghost !px-2.5 !py-1 text-xs"
                          onClick={() => cnhInputRef.current?.click()}
                        >
                          Trocar
                        </button>
                        <button
                          type="button"
                          className="cadastro-btn cadastro-btn--ghost !px-2.5 !py-1 text-xs"
                          style={{ color: '#dc2626' }}
                          onClick={() =>
                            setForm((prev) => ({
                              ...prev,
                              cnh_arquivo_url: '',
                              cnh_arquivo_nome: '',
                            }))
                          }
                        >
                          Remover
                        </button>
                      </div>
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    className="cadastro-btn cadastro-btn--ghost"
                    onClick={() => cnhInputRef.current?.click()}
                  >
                    Anexar CNH (foto ou PDF)
                  </button>
                )}
                <input
                  ref={cnhInputRef}
                  type="file"
                  accept=".pdf,.jpg,.jpeg,.png,.webp,application/pdf,image/jpeg,image/png,image/webp"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0]
                    void onCnhAnexoSelecionado(f)
                    e.target.value = ''
                  }}
                />
              </div>

              <label className="block text-sm">
                <span className="mb-1 block text-xs font-semibold text-ink-muted">Situação</span>
                <select
                  className={inputClass}
                  value={form.situacao ?? 'ativo'}
                  onChange={(e) => set('situacao', e.target.value as Motorista['situacao'])}
                >
                  <option value="ativo">Ativo</option>
                  <option value="inativo">Inativo</option>
                </select>
              </label>
            </div>

            {error && <p className="text-sm text-brand">{error}</p>}

            <div className="flex gap-2 pt-2">
              <button type="button" className="cadastro-btn cadastro-btn--save" onClick={save}>
                Salvar
              </button>
              <button
                type="button"
                className="cadastro-btn cadastro-btn--ghost"
                onClick={() => setMode('lista')}
              >
                Cancelar
              </button>
            </div>
          </div>
        </>
      )}

      {avaliacoesDe ? (
        <MotoristaAvaliacoesModal
          motorista={avaliacoesDe}
          cargas={cargas ?? []}
          onClose={() => setAvaliacoesDe(null)}
        />
      ) : null}

      <ImageCropModal
        open={Boolean(fotoParaAjustar)}
        file={fotoParaAjustar}
        shape="circle"
        title="Ajustar foto do motorista"
        onCancel={() => setFotoParaAjustar(null)}
        onConfirm={(f) => void onConfirmarFoto(f)}
      />
    </div>
  )
}
