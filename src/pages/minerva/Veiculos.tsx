import { useMemo, useState } from 'react'
import { useData } from '../../context/DataContext'
import {
  FOTOS_VEICULO_ROTEIRO,
  emptyFotosVeiculo,
  fileToDataUrl,
  fotosCompletas,
  isAcceptedImageFile,
  normalizeFotosVeiculo,
} from '../../lib/veiculoFotos'
import type { FotoVeiculoSlot, FotosVeiculo, Veiculo } from '../../types'
import '../../styles/cadastro.css'

const TIPOS_VEICULO = ['Caminhão', 'Carreta', 'Bitrem', 'Truck', 'Van', 'Utilitário']
const MARCAS = ['Volvo', 'Scania', 'Mercedes-Benz', 'Volkswagen', 'Iveco', 'Ford', 'Outra']
const TIPOS_CARROCERIA = ['Baú', 'Sider', 'Graneleiro', 'Tanque', 'Container', 'Plataforma']
const ACLIMATACAO = ['Seco', 'Refrigerado', 'Congelado']
const UFS = [
  'AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO',
]

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
  cubagem_m3: undefined,
  eixos: undefined,
  usa_manobrista: false,
  padiado: false,
  situacao: 'ativo',
})

export function VeiculosPage() {
  const { veiculos, transportadores, salvarVeiculo, excluirVeiculo, transportadorById, user } =
    useData()
  const [mode, setMode] = useState<'lista' | 'form'>('lista')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<Partial<Veiculo>>(emptyForm)
  const [search, setSearch] = useState('')
  const [error, setError] = useState('')

  const listaVeiculos = veiculos ?? []
  const listaTransportadores = transportadores ?? []

  const scopedVeiculos = useMemo(() => {
    if (user?.role === 'transportador' && user.transportador_id) {
      return listaVeiculos.filter((v) => v.transportador_id === user.transportador_id)
    }
    return listaVeiculos
  }, [listaVeiculos, user])

  const scopedTransportadores = useMemo(() => {
    if (user?.role === 'transportador' && user.transportador_id) {
      return listaTransportadores.filter((t) => t.id === user.transportador_id)
    }
    return listaTransportadores
  }, [listaTransportadores, user])

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

  function openNew() {
    setEditingId(null)
    setForm({
      ...emptyForm(),
      transportador_id:
        user?.role === 'transportador' && user.transportador_id
          ? user.transportador_id
          : scopedTransportadores[0]?.id ?? '',
    })
    setError('')
    setMode('form')
  }

  function openEdit(v: Veiculo) {
    setEditingId(v.id)
    setForm({
      ...v,
      fotos: normalizeFotosVeiculo(v.fotos, v.foto_url),
    })
    setError('')
    setMode('form')
  }

  function set<K extends keyof Veiculo>(key: K, value: Veiculo[K]) {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  const fotosAtuais: FotosVeiculo = normalizeFotosVeiculo(form.fotos, form.foto_url)

  async function setFoto(slot: FotoVeiculoSlot, file: File | null) {
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
    if (!isAcceptedImageFile(file)) {
      setError('Use JPG, PNG ou WEBP.')
      return
    }
    if (file.size > 8 * 1024 * 1024) {
      setError('Imagem muito grande (máx. 8 MB).')
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

  function save() {
    const semEmpresa = form.transportador_id == null || form.transportador_id === ''
    if (!form.placa?.trim() || !form.tipo) {
      setError('Preencha Placa e Tipo.')
      return
    }
    if (!semEmpresa && !form.transportador_id) {
      setError('Selecione a empresa vinculada ou deixe em branco para veículo autônomo.')
      return
    }
    const fotos = normalizeFotosVeiculo(form.fotos, form.foto_url)
    if (!fotosCompletas(fotos)) {
      setError('Anexe as 5 fotos obrigatórias do veículo (roteiro completo).')
      return
    }
    const v: Veiculo = {
      id: editingId ?? `v-${Math.random().toString(36).slice(2, 8)}`,
      placa: form.placa!.trim().toUpperCase(),
      transportador_id: semEmpresa ? null : form.transportador_id!,
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
      cubagem_m3: form.cubagem_m3 != null ? Number(form.cubagem_m3) : undefined,
      eixos: form.eixos != null ? Number(form.eixos) : undefined,
      usa_manobrista: Boolean(form.usa_manobrista),
      padiado: Boolean(form.padiado),
      situacao: (form.situacao as 'ativo' | 'inativo') ?? 'ativo',
      created_at: form.created_at ?? new Date().toISOString(),
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

        <div className="cadastro-toolbar">
          <input
            className="cadastro-search"
            placeholder="Pesquisar placa, tipo ou empresa..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <button type="button" className="cadastro-btn cadastro-btn--primary" onClick={openNew}>
            + Novo Veículo
          </button>
        </div>

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
                  <th>Modelo</th>
                  <th>Capacidade</th>
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
                      {[v.marca, v.modelo].filter(Boolean).join(' ') || '—'}
                    </td>
                    <td>
                      {v.capacidade_kg != null
                        ? `${v.capacidade_kg.toLocaleString('pt-BR')} kg`
                        : '—'}
                    </td>
                    <td>
                      <span className={`badge-situacao badge-situacao--${v.situacao}`}>
                        {v.situacao}
                      </span>
                    </td>
                    <td style={{ display: 'flex', gap: 10 }}>
                      <button type="button" className="cadastro-link" onClick={() => openEdit(v)}>
                        Editar
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
              <input
                placeholder="Nome do condutor..."
                value={form.condutor ?? ''}
                onChange={(e) => set('condutor', e.target.value)}
              />
            </Field>
            <Field label="Tipo (Ex: Caminhão, Carreta)" required>
              <select value={form.tipo ?? ''} onChange={(e) => set('tipo', e.target.value)}>
                <option value="">Selecione o Tipo...</option>
                {TIPOS_VEICULO.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
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
                    <strong>{item.titulo}</strong>
                    <span>{item.descricao}</span>
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
                        onChange={(e) => setFoto(item.slot, e.target.files?.[0] ?? null)}
                      />
                    </label>
                    {url && (
                      <button
                        type="button"
                        className="cadastro-link"
                        style={{ color: '#dc2626' }}
                        onClick={() => setFoto(item.slot, null)}
                      >
                        Remover
                      </button>
                    )}
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
              <Field label="Tipo de Carroceria">
                <select
                  value={form.tipo_carroceria ?? ''}
                  onChange={(e) => set('tipo_carroceria', e.target.value)}
                >
                  <option value="">Selecione...</option>
                  {TIPOS_CARROCERIA.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
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
              <Field label="Cubagem (m³)">
                <input
                  type="number"
                  value={form.cubagem_m3 ?? ''}
                  onChange={(e) =>
                    set('cubagem_m3', e.target.value === '' ? undefined : Number(e.target.value))
                  }
                />
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

      <section className="form-card form-card--purple" style={{ marginTop: 16 }}>
        <header className="form-card__head">
          <IconUser />
          <h2 className="form-card__title">Configurações de Manobra / Pátio</h2>
        </header>
        <div className="form-card__body">
          <div className="check-row">
            <label className="check-box check-box--purple">
              <input
                type="checkbox"
                checked={Boolean(form.usa_manobrista)}
                onChange={(e) => set('usa_manobrista', e.target.checked)}
              />
              <div>
                <strong>Veículo utiliza manobrista?</strong>
                <span>Se ativo, libera o acionamento para a fila do manobrista.</span>
              </div>
            </label>
            <label className="check-box check-box--green">
              <input
                type="checkbox"
                checked={Boolean(form.padiado)}
                onChange={(e) => set('padiado', e.target.checked)}
              />
              <div>
                <strong>Veículo Padiado?</strong>
                <span>Se ativo, entra automaticamente no status &apos;Aguardando Serviço&apos; ao fazer check-in.</span>
              </div>
            </label>
          </div>
        </div>
      </section>

      {error && <p style={{ color: '#dc2626', marginTop: 12, textAlign: 'center' }}>{error}</p>}

      <div className="cadastro-actions">
        <button type="button" className="cadastro-btn cadastro-btn--save" onClick={save}>
          Salvar Veículo
        </button>
      </div>
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

function IconUser() {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" fill="none" aria-hidden>
      <circle cx="12" cy="8" r="3.5" stroke="currentColor" strokeWidth="1.75" />
      <path d="M5 19c0-3.5 3-6 7-6s7 2.5 7 6" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
    </svg>
  )
}
