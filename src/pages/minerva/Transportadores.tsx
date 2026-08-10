import { useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useData } from '../../context/DataContext'
import { CadastroStatsCards } from '../../components/cadastro/CadastroStatsCards'
import { CadastroPagination, usePaginatedList } from '../../components/cadastro/CadastroPagination'
import { TransportadorPainel } from '../../components/transportador/TransportadorPainel'
import { TransportadorasKanbanView } from '../../components/transportador/TransportadorasKanbanView'
import { TransportadorPerfilEditor } from '../../components/transportador/TransportadorPerfilEditor'
import { TransportadorPerfilSite } from '../../components/transportador/TransportadorPerfilSite'
import {
  EMPTY_PERFIL_PUBLICO,
  normalizePerfilPublico,
} from '../../lib/perfilPublicoTransportador'
import { VistaToggle } from '../../components/kanban/GridCargas'
import { CnpjInput } from '../../components/ui/CnpjInput'
import { formatCnpj } from '../../lib/cnpj'
import { formatPhoneBr } from '../../lib/phoneBr'
import { formatCurrency, formatDateTime } from '../../lib/businessRules'
import { labelDocumento, isAcceptedDocFile } from '../../lib/transportadorDocs'
import { urlDocumentoTransportador, origemCadastroDe, labelOrigemCadastro } from '../../lib/cadastroTransportador'
import { isAcceptedImageFile, fileToDataUrl } from '../../lib/veiculoFotos'
import { ImageCropModal } from '../../components/ui/ImageCropModal'
import { contaPortalPorTransportador } from '../../lib/portalAuth'
import {
  emailCredenciaisHref,
  mensagemCredenciaisTransportador,
  whatsappCredenciaisHref,
} from '../../lib/credenciaisTransportadorMsg'
import type { ClassificacaoTransportador, SituacaoTransportador, Transportador } from '../../types'
import '../../styles/cadastro.css'
import '../../styles/grid-cargas.css'

type FilterSit = 'todos' | SituacaoTransportador
type FilterOrigem = 'todos' | 'link' | 'painel'
type FichaTab = 'painel' | 'dados' | 'historico'

const emptyForm = (): Partial<Transportador> => ({
  razao_social: '',
  nome_fantasia: '',
  cnpj: '',
  inscricao_estadual: '',
  inscricao_municipal: '',
  rntrc: '',
  cidade: '',
  uf: 'SP',
  endereco: '',
  numero: '',
  bairro: '',
  complemento: '',
  cep: '',
  origem_cep: '',
  origem_cidade: '',
  origem_uf: 'SP',
  origem_endereco: '',
  origem_numero: '',
  origem_bairro: '',
  origem_complemento: '',
  origem_lat: null,
  origem_lng: null,
  raio_km: 50,
  origem_cadastro: 'painel',
  classificacao: 'bronze',
  pontuacao: 50,
  situacao: 'ativo',
  disponivel_mapa: true,
  telefone: '',
  email: '',
  contato_nome: '',
  contato_telefone: '',
  perfil_publico: { ...EMPTY_PERFIL_PUBLICO },
})

function abrirCredenciaisWhatsApp(t: Transportador) {
  const conta = contaPortalPorTransportador(t.id, t.email) ?? null
  const msg = mensagemCredenciaisTransportador(t, conta)
  window.open(whatsappCredenciaisHref(msg), '_blank', 'noopener,noreferrer')
}

function abrirCredenciaisEmail(t: Transportador) {
  const email = (t.email || '').trim()
  if (!email) {
    window.alert('Esta transportadora não tem e-mail cadastrado.')
    return
  }
  const conta = contaPortalPorTransportador(t.id, t.email) ?? null
  const msg = mensagemCredenciaisTransportador(t, conta)
  const nome = (t.nome_fantasia || t.razao_social || 'Transportadora').trim()
  const href = emailCredenciaisHref(email, msg, nome)
  if (!href) {
    window.alert('E-mail inválido no cadastro da transportadora.')
    return
  }
  window.location.href = href
}

function IconWhatsAppCredenciais() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden>
      <path
        fill="#25D366"
        d="M12.04 2C6.58 2 2.15 6.4 2.15 11.84c0 1.97.52 3.89 1.5 5.58L2 22l4.74-1.56a10 10 0 0 0 5.3 1.44h.01c5.46 0 9.89-4.4 9.89-9.84C21.94 6.4 17.5 2 12.04 2z"
      />
      <path
        fill="#fff"
        d="M17.47 14.38c-.27-.14-1.6-.79-1.85-.88-.25-.09-.43-.14-.61.14-.18.27-.7.88-.86 1.06-.16.18-.32.2-.59.07-.27-.14-1.14-.42-2.17-1.34-.8-.71-1.34-1.59-1.5-1.86-.16-.27-.02-.42.12-.55.12-.12.27-.32.41-.48.14-.16.18-.27.27-.45.09-.18.05-.34-.02-.48-.07-.14-.61-1.47-.84-2.01-.22-.53-.45-.46-.61-.47h-.52c-.18 0-.48.07-.73.34-.25.27-.96.94-.96 2.29s.98 2.65 1.12 2.83c.14.18 1.93 2.95 4.68 4.14.65.28 1.16.45 1.56.57.66.21 1.25.18 1.72.11.53-.08 1.6-.65 1.83-1.28.22-.63.22-1.17.16-1.28-.07-.11-.25-.18-.52-.32z"
      />
    </svg>
  )
}

function IconEmailCredenciais() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
      <rect x="3" y="5" width="18" height="14" rx="2" stroke="#2563eb" strokeWidth="1.8" />
      <path d="M4 7l8 6 8-6" stroke="#2563eb" strokeWidth="1.8" strokeLinejoin="round" />
    </svg>
  )
}

export function TransportadoresPage() {
  const {
    transportadores,
    veiculos,
    motoristas,
    salvarTransportador,
    atualizarLogoTransportador,
    excluirTransportador,
    vinculosTransportador,
    documentosDoTransportador,
    excluirDocumentoTransportador,
    substituirDocumentoTransportador,
    aprovarTransportador,
    recusarTransportador,
    historicoDoTransportador,
    lances,
    cargas,
    grupos,
    rankingTransportadores,
    refreshTransportadores,
  } = useData()
  const [mode, setMode] = useState<'lista' | 'form' | 'revisao' | 'ficha'>('lista')
  const [vista, setVista] = useState<'quadro' | 'grid'>(() => {
    try {
      return sessionStorage.getItem('doca-livre-transportadoras-vista') === 'quadro'
        ? 'quadro'
        : 'grid'
    } catch {
      return 'grid'
    }
  })
  const [editingId, setEditingId] = useState<string | null>(null)
  const [revisaoId, setRevisaoId] = useState<string | null>(null)
  const [fichaId, setFichaId] = useState<string | null>(null)
  const [fichaTab, setFichaTab] = useState<FichaTab>('painel')
  const [form, setForm] = useState<Partial<Transportador>>(emptyForm)
  const [search, setSearch] = useState('')
  const [filtro, setFiltro] = useState<FilterSit>('todos')
  const [filtroOrigem, setFiltroOrigem] = useState<FilterOrigem>('todos')
  const [searchParams] = useSearchParams()
  const [error, setError] = useState('')
  const [motivoRecusa, setMotivoRecusa] = useState('')
  const [busy, setBusy] = useState(false)
  const [linkCopiado, setLinkCopiado] = useState(false)
  const replaceInputRef = useRef<HTMLInputElement>(null)
  const [replaceDocId, setReplaceDocId] = useState<string | null>(null)
  /** Logo/foto do perfil no formulário (arquivo novo + preview). */
  const [logoFile, setLogoFile] = useState<File | null>(null)
  const [logoPreview, setLogoPreview] = useState<string | null>(null)
  const [logoRemovida, setLogoRemovida] = useState(false)
  const logoInputRef = useRef<HTMLInputElement>(null)
  /** Arquivo original escolhido — abre o recorte antes de aplicar. */
  const [logoParaAjustar, setLogoParaAjustar] = useState<File | null>(null)
  const [previewPerfil, setPreviewPerfil] = useState(false)

  useEffect(() => {
    void refreshTransportadores()
  }, [refreshTransportadores])

  // Sininho → /embarcador/transportadores?filtro=pendentes
  useEffect(() => {
    const f = searchParams.get('filtro')
    if (f === 'pendentes' || f === 'ativos' || f === 'recusados' || f === 'inativos' || f === 'todos') {
      setFiltro(f)
      setMode('lista')
    }
  }, [searchParams])

  const linkCadastroPublico =
    typeof window !== 'undefined'
      ? `${window.location.origin}${window.location.pathname}#/cadastro-transportador`
      : 'https://doca-livre-oferta-de-carga.onrender.com/#/cadastro-transportador'

  const filtered = useMemo(() => {
    let list = transportadores
    if (filtro !== 'todos') list = list.filter((t) => t.situacao === filtro)
    if (filtroOrigem !== 'todos') {
      list = list.filter((t) => origemCadastroDe(t) === filtroOrigem)
    }
    const q = search.trim().toLowerCase()
    if (!q) return list
    return list.filter(
      (t) =>
        t.nome_fantasia.toLowerCase().includes(q) ||
        t.razao_social.toLowerCase().includes(q) ||
        t.cnpj.includes(q) ||
        t.cidade.toLowerCase().includes(q),
    )
  }, [transportadores, search, filtro, filtroOrigem])

  const {
    pageItems: transportadoresPagina,
    page,
    setPage,
    totalPages,
    total: totalFiltrados,
    from,
    to,
  } = usePaginatedList(filtered)

  const pendentesCount = transportadores.filter((t) => t.situacao === 'pendente').length
  const linkCount = transportadores.filter((t) => origemCadastroDe(t) === 'link').length
  const painelCount = transportadores.filter((t) => origemCadastroDe(t) === 'painel').length
  const statsCadastro = useMemo(() => {
    const total = transportadores.length
    const ativos = transportadores.filter((t) => t.situacao === 'ativo').length
    const inativos = transportadores.filter((t) => t.situacao === 'inativo').length
    return { total, ativos, inativos }
  }, [transportadores])

  const veiculosPorTransportador = useMemo(() => {
    const map: Record<string, number> = {}
    for (const v of veiculos ?? []) {
      if (!v.transportador_id) continue
      map[v.transportador_id] = (map[v.transportador_id] ?? 0) + 1
    }
    return map
  }, [veiculos])

  const motoristasPorTransportador = useMemo(() => {
    const map: Record<string, number> = {}
    for (const m of motoristas ?? []) {
      if (!m.transportador_id) continue
      map[m.transportador_id] = (map[m.transportador_id] ?? 0) + 1
    }
    return map
  }, [motoristas])

  const tituloKanban = useMemo(() => {
    const cidades = new Set(
      filtered
        .map((t) => (t.origem_cidade || t.cidade || '').trim())
        .filter(Boolean),
    )
    if (cidades.size === 1) return `Transportadoras em ${[...cidades][0]}`
    if (filtro === 'ativo') return 'Transportadoras ativas'
    return 'Transportadoras'
  }, [filtered, filtro])

  const revisao = revisaoId ? transportadores.find((t) => t.id === revisaoId) : null
  const docsRevisao = revisaoId ? documentosDoTransportador(revisaoId) : []

  function openNew() {
    setEditingId(null)
    setForm(emptyForm())
    setError('')
    setLogoFile(null)
    setLogoPreview(null)
    setLogoRemovida(false)
    setMode('form')
  }

  function openEdit(t: Transportador) {
    setEditingId(t.id)
    setForm({
      ...t,
      cnpj: formatCnpj(t.cnpj || ''),
      perfil_publico: normalizePerfilPublico(t.perfil_publico),
    })
    setError('')
    setLogoFile(null)
    setLogoPreview(t.logo_url ?? null)
    setLogoRemovida(false)
    setMode('form')
  }

  function openRevisao(t: Transportador) {
    setRevisaoId(t.id)
    setMotivoRecusa(t.motivo_recusa ?? '')
    setError('')
    setMode('revisao')
  }

  function openFicha(t: Transportador) {
    setFichaId(t.id)
    setFichaTab('painel')
    setMode('ficha')
  }

  async function confirmarExclusao(t: Transportador) {
    const v = vinculosTransportador(t.id)
    const linhas = [
      `Excluir a transportadora "${t.nome_fantasia}"?`,
      '',
      'Itens vinculados que também serão removidos:',
      '',
      v.placas.length
        ? `Placas (${v.placas.length}): ${v.placas.join(', ')}`
        : 'Placas: nenhuma',
      v.motoristas.length
        ? `Motoristas (${v.motoristas.length}): ${v.motoristas.join(', ')}`
        : 'Motoristas: nenhum',
      v.documentos > 0 ? `Documentos: ${v.documentos}` : 'Documentos: nenhum',
      v.grupos.length
        ? `Grupos: ${v.grupos.join(', ')}`
        : 'Grupos: nenhum',
      v.lances > 0 ? `Lances/propostas: ${v.lances}` : 'Lances/propostas: nenhum',
      v.cargasVencedor.length
        ? `Cargas como vencedor: ${v.cargasVencedor.join(', ')}`
        : null,
      '',
      'Esta ação não pode ser desfeita.',
    ].filter((x) => x !== null)

    if (!window.confirm(linhas.join('\n'))) return
    const res = await excluirTransportador(t.id)
    if (!res.ok) {
      window.alert(res.error ?? 'Falha ao excluir')
      return
    }
    if (res.error) window.alert(res.error)
  }

  const ficha = fichaId ? transportadores.find((t) => t.id === fichaId) : null
  const fichaHist = fichaId ? historicoDoTransportador(fichaId) : []
  const fichaLances = fichaId ? lances.filter((l) => l.transportador_id === fichaId) : []
  const fichaFretes = fichaId
    ? cargas.filter((c) => c.transportador_vencedor_id === fichaId)
    : []
  const fichaGrupos = fichaId
    ? grupos.filter((g) => g.transportador_ids.includes(fichaId))
    : []
  const ranking = rankingTransportadores()

  function set<K extends keyof Transportador>(key: K, value: Transportador[K]) {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  async function save() {
    if (!form.razao_social?.trim() || !form.nome_fantasia?.trim() || !form.cnpj?.trim()) {
      setError('Preencha Razão Social, Nome Fantasia e CNPJ.')
      return
    }
    const id = editingId ?? `t-${Math.random().toString(36).slice(2, 8)}`
    const t: Transportador = {
      id,
      razao_social: form.razao_social!.trim(),
      nome_fantasia: form.nome_fantasia!.trim(),
      cnpj: formatCnpj(form.cnpj ?? ''),
      inscricao_estadual: form.inscricao_estadual,
      inscricao_municipal: form.inscricao_municipal,
      rntrc: form.rntrc,
      cidade: form.cidade ?? '',
      uf: (form.uf ?? 'SP').toUpperCase(),
      endereco: form.endereco,
      numero: form.numero,
      bairro: form.bairro,
      complemento: form.complemento,
      cep: form.cep,
      origem_cep: form.origem_cep,
      origem_cidade: form.origem_cidade,
      origem_uf: form.origem_uf,
      origem_endereco: form.origem_endereco,
      origem_numero: form.origem_numero,
      origem_bairro: form.origem_bairro,
      origem_complemento: form.origem_complemento,
      origem_lat: form.origem_lat ?? null,
      origem_lng: form.origem_lng ?? null,
      raio_km: form.raio_km != null ? Number(form.raio_km) : undefined,
      origem_cadastro: editingId ? (form.origem_cadastro ?? 'painel') : 'painel',
      disponivel_mapa: form.disponivel_mapa !== false,
      classificacao: (form.classificacao as ClassificacaoTransportador) ?? 'bronze',
      pontuacao: Number(form.pontuacao) || 0,
      situacao: (form.situacao as SituacaoTransportador) ?? 'ativo',
      telefone: form.telefone,
      email: form.email,
      contato_nome: form.contato_nome,
      contato_telefone: form.contato_telefone,
      logo_url: logoRemovida ? undefined : (logoPreview ?? form.logo_url),
      perfil_publico: normalizePerfilPublico(form.perfil_publico),
      created_at: form.created_at ?? new Date().toISOString(),
    }
    salvarTransportador(t)

    // Persiste a logo/foto (Storage + banco) — vira o avatar no login.
    if (logoFile || logoRemovida) {
      setBusy(true)
      const res = await atualizarLogoTransportador(id, logoRemovida ? null : logoFile)
      setBusy(false)
      if (!res.ok) {
        setError(res.error ?? 'Dados salvos, mas a logo não pôde ser enviada.')
        return
      }
    }

    setLogoFile(null)
    setLogoRemovida(false)
    setMode('lista')
  }

  async function handleAprovar() {
    if (!revisaoId) return
    setBusy(true)
    setError('')
    const res = await aprovarTransportador(revisaoId)
    setBusy(false)
    if (!res.ok) {
      setError(res.error ?? 'Falha ao aprovar.')
      return
    }
    const aindaPendentes = transportadores.some(
      (t) => t.id !== revisaoId && t.situacao === 'pendente',
    )
    setFiltro(aindaPendentes ? 'pendente' : 'todos')
    setMode('lista')
    setRevisaoId(null)
    void refreshTransportadores()
  }

  async function handleRecusar() {
    if (!revisaoId) return
    if (!motivoRecusa.trim()) {
      setError('Informe o motivo da recusa. Ele será enviado por e-mail ao transportador.')
      return
    }
    setBusy(true)
    setError('')
    const res = await recusarTransportador(revisaoId, motivoRecusa.trim())
    setBusy(false)
    if (!res.ok) {
      setError(res.error ?? 'Falha ao recusar.')
      return
    }
    const aindaPendentes = transportadores.some(
      (t) => t.id !== revisaoId && t.situacao === 'pendente',
    )
    setFiltro(aindaPendentes ? 'pendente' : 'todos')
    setMode('lista')
    setRevisaoId(null)
    setMotivoRecusa('')
    window.alert(res.mensagem || 'Cadastro recusado e e-mail enviado.')
  }

  if (mode === 'ficha' && ficha) {
    const pos = ranking.findIndex((t) => t.id === ficha.id) + 1
    const tabs: { id: FichaTab; label: string }[] = [
      { id: 'painel', label: 'Painel' },
      { id: 'dados', label: 'Dados' },
      { id: 'historico', label: 'Histórico' },
    ]
    return (
      <div className="cadastro-page animate-fade-up">
        <button type="button" className="cadastro-back" onClick={() => setMode('lista')}>
          ← Voltar para Lista
        </button>
        <h1 className="cadastro-page-title" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {ficha.logo_url ? (
            <img
              src={ficha.logo_url}
              alt=""
              style={{
                width: 44,
                height: 44,
                borderRadius: '50%',
                objectFit: 'cover',
                border: '2px solid #f9db00',
                flexShrink: 0,
              }}
            />
          ) : null}
          <span>
            {ficha.nome_fantasia}
            <span style={{ marginLeft: 12, fontSize: '0.85rem', fontWeight: 600, color: '#1a1d21' }}>
              {ficha.classificacao} · {ficha.pontuacao} pts
              {pos > 0 ? ` · ${pos}º` : ''}
            </span>
          </span>
        </h1>

        <div className="cadastro-filtros" style={{ marginBottom: 16 }}>
          {tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              className={`cadastro-btn ${fichaTab === tab.id ? 'cadastro-btn--primary' : 'cadastro-btn--ghost'}`}
              onClick={() => setFichaTab(tab.id)}
            >
              {tab.label}
            </button>
          ))}
          <button
            type="button"
            className="cadastro-btn cadastro-btn--ghost"
            onClick={() => openEdit(ficha)}
          >
            Editar cadastro
          </button>
          <button
            type="button"
            className="cadastro-btn cadastro-btn--ghost"
            onClick={() => setPreviewPerfil(true)}
          >
            Ver perfil público
          </button>
        </div>

        {previewPerfil ? (
          <TransportadorPerfilSite
            transportador={ficha}
            veiculosCount={veiculosPorTransportador[ficha.id] ?? 0}
            motoristasCount={motoristasPorTransportador[ficha.id] ?? 0}
            onClose={() => setPreviewPerfil(false)}
          />
        ) : null}

        {fichaTab === 'painel' && (
          <TransportadorPainel transportadorId={ficha.id} compact />
        )}

        {fichaTab === 'dados' && (
          <div className="grid gap-4 lg:grid-cols-2">
            <section className="form-card form-card--blue">
              <header className="form-card__head">
                <h2 className="form-card__title">Empresa</h2>
              </header>
              <div className="form-card__body">
                <dl className="revisao-dl">
                  <div>
                    <dt>Razão social</dt>
                    <dd>{ficha.razao_social}</dd>
                  </div>
                  <div>
                    <dt>CNPJ</dt>
                    <dd>{ficha.cnpj}</dd>
                  </div>
                  <div>
                    <dt>RNTRC</dt>
                    <dd>{ficha.rntrc || '—'}</dd>
                  </div>
                  <div>
                    <dt>Endereço (CNPJ)</dt>
                    <dd>
                      {[ficha.endereco, ficha.numero, ficha.bairro, ficha.cidade, ficha.uf]
                        .filter(Boolean)
                        .join(', ') || '—'}
                    </dd>
                  </div>
                  <div>
                    <dt>Origem (residência)</dt>
                    <dd>
                      {[
                        ficha.origem_endereco,
                        ficha.origem_numero,
                        ficha.origem_bairro,
                        ficha.origem_cidade,
                        ficha.origem_uf,
                        ficha.origem_cep,
                      ]
                        .filter(Boolean)
                        .join(', ') || '—'}
                      {ficha.origem_lat != null && ficha.origem_lng != null ? (
                        <>
                          <br />
                          <a
                            href={`https://www.openstreetmap.org/?mlat=${ficha.origem_lat}&mlon=${ficha.origem_lng}#map=16/${ficha.origem_lat}/${ficha.origem_lng}`}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            {ficha.origem_lat.toFixed(5)}, {ficha.origem_lng.toFixed(5)}
                          </a>
                        </>
                      ) : null}
                      {ficha.raio_km != null ? (
                        <>
                          <br />
                          Raio de pesquisa: {ficha.raio_km} km
                        </>
                      ) : null}
                    </dd>
                  </div>
                  <div>
                    <dt>Contato</dt>
                    <dd>
                      {ficha.contato_nome || '—'} · {ficha.telefone || '—'}
                      {ficha.email ? ` · ${ficha.email}` : ''}
                    </dd>
                  </div>
                  <div>
                    <dt>Situação</dt>
                    <dd>
                      <span className={`badge-situacao badge-situacao--${ficha.situacao}`}>
                        {ficha.situacao}
                      </span>
                    </dd>
                  </div>
                  <div>
                    <dt>Origem do cadastro</dt>
                    <dd>
                      <span
                        className={`badge-origem badge-origem--${origemCadastroDe(ficha)}`}
                      >
                        {labelOrigemCadastro(origemCadastroDe(ficha))}
                      </span>
                    </dd>
                  </div>
                </dl>
              </div>
            </section>
            <section className="form-card form-card--green">
              <header className="form-card__head">
                <h2 className="form-card__title">Vínculos</h2>
              </header>
              <div className="form-card__body text-sm space-y-3">
                <p>
                  <strong>Grupos:</strong>{' '}
                  {fichaGrupos.length === 0
                    ? 'Nenhum'
                    : fichaGrupos.map((g) => g.descricao).join(', ')}
                </p>
                <p>
                  <strong>Propostas:</strong> {fichaLances.length}
                </p>
                <p>
                  <strong>Fretes ganhos:</strong> {fichaFretes.length}
                  {fichaFretes.length > 0
                    ? ` · ${formatCurrency(
                        fichaFretes.reduce((s, c) => s + (c.frete_fechado ?? 0), 0),
                      )}`
                    : ''}
                </p>
                <p>
                  <strong>Veículos / motoristas:</strong>{' '}
                  {vinculosTransportador(ficha.id).placas.length} /{' '}
                  {vinculosTransportador(ficha.id).motoristas.length}
                </p>
              </div>
            </section>
          </div>
        )}

        {fichaTab === 'historico' && (
          <section className="form-card form-card--orange">
            <header className="form-card__head">
              <h2 className="form-card__title">Histórico</h2>
            </header>
            <div className="form-card__body">
              <ul className="space-y-1 text-sm">
                {fichaHist.slice(0, 80).map((h) => (
                  <li key={h.id} className="border-b border-ink/5 py-1.5">
                    <strong>{h.titulo}</strong>
                    {h.detalhe ? (
                      <span className="ml-2 text-xs text-ink-muted">{h.detalhe}</span>
                    ) : null}
                    <span className="ml-2 text-[11px] text-ink-muted">
                      {formatDateTime(h.created_at)}
                    </span>
                  </li>
                ))}
                {fichaHist.length === 0 && (
                  <li className="text-ink-muted">Sem eventos ainda.</li>
                )}
              </ul>
            </div>
          </section>
        )}
      </div>
    )
  }

  if (mode === 'revisao' && revisao) {
    return (
      <div className="cadastro-page animate-fade-up">
        <button type="button" className="cadastro-back" onClick={() => setMode('lista')}>
          ← Voltar para Lista
        </button>
        <h1 className="cadastro-page-title">
          <IconBuilding />
          Revisar cadastro — {revisao.nome_fantasia}
        </h1>

        <div className="cadastro-grid" style={{ gap: 16 }}>
          <section className="form-card form-card--blue">
            <header className="form-card__head">
              <h2 className="form-card__title">Dados enviados</h2>
            </header>
            <div className="form-card__body">
              <dl className="revisao-dl">
                <div>
                  <dt>Razão social</dt>
                  <dd>{revisao.razao_social}</dd>
                </div>
                <div>
                  <dt>CNPJ</dt>
                  <dd>{revisao.cnpj}</dd>
                </div>
                <div>
                  <dt>RNTRC</dt>
                  <dd>{revisao.rntrc || '—'}</dd>
                </div>
                <div>
                  <dt>Origem do cadastro</dt>
                  <dd>
                    <span
                      className={`badge-origem badge-origem--${origemCadastroDe(revisao)}`}
                    >
                      {labelOrigemCadastro(origemCadastroDe(revisao))}
                    </span>
                  </dd>
                </div>
                <div>
                  <dt>Endereço (CNPJ)</dt>
                  <dd>
                    {[revisao.endereco, revisao.numero, revisao.bairro, revisao.cidade, revisao.uf]
                      .filter(Boolean)
                      .join(', ') || '—'}
                  </dd>
                </div>
                <div>
                  <dt>Origem (residência)</dt>
                  <dd>
                    {[
                      revisao.origem_endereco,
                      revisao.origem_numero,
                      revisao.origem_bairro,
                      revisao.origem_cidade,
                      revisao.origem_uf,
                      revisao.origem_cep,
                    ]
                      .filter(Boolean)
                      .join(', ') || '—'}
                    {revisao.origem_lat != null && revisao.origem_lng != null ? (
                      <>
                        <br />
                        <a
                          href={`https://www.openstreetmap.org/?mlat=${revisao.origem_lat}&mlon=${revisao.origem_lng}#map=16/${revisao.origem_lat}/${revisao.origem_lng}`}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          {revisao.origem_lat.toFixed(5)}, {revisao.origem_lng.toFixed(5)}
                        </a>
                      </>
                    ) : null}
                    {revisao.raio_km != null ? (
                      <>
                        <br />
                        Raio de pesquisa: {revisao.raio_km} km
                      </>
                    ) : null}
                  </dd>
                </div>
                <div>
                  <dt>Contato</dt>
                  <dd>
                    {revisao.contato_nome || '—'} · {revisao.telefone || '—'}
                    {revisao.email ? ` · ${revisao.email}` : ''}
                  </dd>
                </div>
                <div>
                  <dt>Situação</dt>
                  <dd>
                    <span className={`badge-situacao badge-situacao--${revisao.situacao}`}>
                      {revisao.situacao}
                    </span>
                  </dd>
                </div>
              </dl>
            </div>
          </section>

          <section className="form-card form-card--green">
            <header className="form-card__head">
              <h2 className="form-card__title">Documentos anexados</h2>
            </header>
            <div className="form-card__body">
              <input
                ref={replaceInputRef}
                type="file"
                accept=".pdf,.jpg,.jpeg,.png,.webp,application/pdf,image/*"
                style={{ display: 'none' }}
                onChange={async (e) => {
                  const file = e.target.files?.[0]
                  e.target.value = ''
                  if (!file || !replaceDocId) return
                  if (!isAcceptedDocFile(file)) {
                    setError('Use PDF ou imagem (JPG, PNG, WEBP).')
                    return
                  }
                  setBusy(true)
                  setError('')
                  const res = await substituirDocumentoTransportador(replaceDocId, file)
                  setBusy(false)
                  setReplaceDocId(null)
                  if (!res.ok) setError(res.error || 'Falha ao substituir documento.')
                }}
              />
              {docsRevisao.length === 0 ? (
                <p className="cadastro-empty">Nenhum documento anexado.</p>
              ) : (
                <ul className="doc-review-list">
                  {docsRevisao.map((d) => (
                    <li key={d.id}>
                      <strong>{labelDocumento(d.tipo)}</strong>
                      <span>{d.nome_arquivo}</span>
                      <div className="doc-review-actions">
                        <button
                          type="button"
                          className="cadastro-link"
                          disabled={busy}
                          onClick={async () => {
                            try {
                              const href = await urlDocumentoTransportador(d)
                              if (!href) {
                                setError('Documento sem arquivo disponível.')
                                return
                              }
                              window.open(href, '_blank', 'noopener,noreferrer')
                            } catch (err) {
                              setError(
                                err instanceof Error
                                  ? err.message
                                  : 'Não foi possível abrir o documento. Verifique o bucket no Supabase.',
                              )
                            }
                          }}
                        >
                          Abrir
                        </button>
                        <button
                          type="button"
                          className="cadastro-link"
                          disabled={busy}
                          onClick={() => {
                            setError('')
                            setReplaceDocId(d.id)
                            replaceInputRef.current?.click()
                          }}
                        >
                          Substituir
                        </button>
                        <button
                          type="button"
                          className="cadastro-link cadastro-link--danger"
                          disabled={busy}
                          onClick={async () => {
                            if (
                              !window.confirm(
                                `Excluir o documento "${labelDocumento(d.tipo)}"? Esta ação não pode ser desfeita.`,
                              )
                            ) {
                              return
                            }
                            setBusy(true)
                            setError('')
                            const res = await excluirDocumentoTransportador(d.id)
                            setBusy(false)
                            if (!res.ok) setError(res.error || 'Falha ao excluir documento.')
                          }}
                        >
                          Excluir
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </section>
        </div>

        {revisao.situacao === 'pendente' && (
          <section className="form-card form-card--orange" style={{ marginTop: 16 }}>
            <header className="form-card__head">
              <h2 className="form-card__title">Decisão</h2>
            </header>
            <div className="form-card__body">
              <div className="form-field">
                <label>Motivo da recusa (obrigatório — enviado por e-mail)</label>
                <input
                  value={motivoRecusa}
                  onChange={(e) => setMotivoRecusa(e.target.value)}
                  placeholder="Explique o que precisa ser corrigido..."
                />
                <p className="form-field-hint" style={{ marginTop: 6, fontSize: 12, color: '#1a1d21' }}>
                  O transportador recebe este motivo no e-mail do cadastro
                  {revisao.email ? ` (${revisao.email})` : ''} para poder se cadastrar de novo.
                </p>
              </div>
              {error && <p style={{ color: '#dc2626', marginTop: 10 }}>{error}</p>}
              <div className="cadastro-actions" style={{ gap: 12 }}>
                <button
                  type="button"
                  className="cadastro-btn cadastro-btn--ghost"
                  disabled={busy}
                  onClick={handleRecusar}
                  style={{ color: '#dc2626' }}
                >
                  Recusar
                </button>
                <button
                  type="button"
                  className="cadastro-btn cadastro-btn--save"
                  disabled={busy}
                  onClick={handleAprovar}
                >
                  {busy ? 'Salvando…' : 'Aprovar e liberar login'}
                </button>
              </div>
            </div>
          </section>
        )}

        {revisao.situacao !== 'pendente' && (
          <div className="cadastro-actions">
            <button type="button" className="cadastro-btn cadastro-btn--ghost" onClick={() => openEdit(revisao)}>
              Editar cadastro
            </button>
          </div>
        )}
      </div>
    )
  }

  if (mode === 'lista') {
    return (
      <div className="cadastro-page animate-fade-up">
        <h1 className="cadastro-page-title">
          <IconBuilding />
          Cadastro de Transportadora
        </h1>

        <CadastroStatsCards
          total={statsCadastro.total}
          ativos={statsCadastro.ativos}
          inativos={statsCadastro.inativos}
        />

        <div className="cadastro-toolbar">
          <input
            className="cadastro-search"
            placeholder="Pesquisar transportadora..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <VistaToggle
            value={vista}
            onChange={(v) => {
              setVista(v)
              try {
                sessionStorage.setItem('doca-livre-transportadoras-vista', v)
              } catch {
                /* ignore */
              }
            }}
          />
          <button type="button" className="cadastro-btn cadastro-btn--primary" onClick={openNew}>
            + Nova Transportadora
          </button>
        </div>

        <div className="cadastro-link-publico">
          <div>
            <strong>Link para transportadores se cadastrarem</strong>
            <p>{linkCadastroPublico}</p>
          </div>
          <button
            type="button"
            className="cadastro-btn cadastro-btn--ghost"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(linkCadastroPublico)
                setLinkCopiado(true)
                window.setTimeout(() => setLinkCopiado(false), 2000)
              } catch {
                setError('Não foi possível copiar o link.')
              }
            }}
          >
            {linkCopiado ? 'Copiado!' : 'Copiar link'}
          </button>
        </div>

        <div
          className="cadastro-filtros cadastro-filtros--linha"
          aria-label="Filtros de situação e origem do cadastro"
        >
          {(
            [
              ['todos', 'Todos'],
              ['pendente', `Pendentes${pendentesCount ? ` (${pendentesCount})` : ''}`],
              ['ativo', 'Ativos'],
              ['recusado', 'Recusados'],
              ['inativo', 'Inativos'],
            ] as const
          ).map(([id, label]) => (
            <button
              key={`sit-${id}`}
              type="button"
              className={`cadastro-btn ${filtro === id ? 'cadastro-btn--primary' : 'cadastro-btn--ghost'}`}
              onClick={() => setFiltro(id)}
            >
              {label}
            </button>
          ))}
          <span className="cadastro-filtros__sep" aria-hidden />
          {(
            [
              ['todos', 'Cadastro: todos'],
              ['link', `Link público${linkCount ? ` (${linkCount})` : ''}`],
              ['painel', `Painel${painelCount ? ` (${painelCount})` : ''}`],
            ] as const
          ).map(([id, label]) => (
            <button
              key={`ori-${id}`}
              type="button"
              className={`cadastro-btn ${filtroOrigem === id ? 'cadastro-btn--primary' : 'cadastro-btn--ghost'}`}
              onClick={() => setFiltroOrigem(id)}
            >
              {label}
            </button>
          ))}
        </div>

        {vista === 'quadro' ? (
          <TransportadorasKanbanView
            transportadores={filtered}
            veiculosPorTransportador={veiculosPorTransportador}
            motoristasPorTransportador={motoristasPorTransportador}
            tituloCidade={tituloKanban}
          />
        ) : (
          <div className="cadastro-table-wrap">
            {filtered.length === 0 ? (
              <p className="cadastro-empty">Nenhuma transportadora encontrada.</p>
            ) : (
              <>
              <table className="cadastro-table">
                <thead>
                  <tr>
                    <th>Nome</th>
                    <th>CNPJ</th>
                    <th>Cidade</th>
                    <th>Classificação</th>
                    <th>Cadastro</th>
                    <th>Situação</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {transportadoresPagina.map((t) => {
                    const origem = origemCadastroDe(t)
                    return (
                      <tr key={t.id}>
                        <td>
                          <div className="cadastro-table__nome">
                            {t.logo_url ? (
                              <img
                                className="cadastro-table__logo"
                                src={t.logo_url}
                                alt=""
                              />
                            ) : (
                              <span className="cadastro-table__logo cadastro-table__logo--empty" aria-hidden>
                                {(t.nome_fantasia || t.razao_social || '?')
                                  .trim()
                                  .charAt(0)
                                  .toUpperCase()}
                              </span>
                            )}
                            <div className="cadastro-table__nome-text">
                              <strong>{t.nome_fantasia}</strong>
                              <div>{t.razao_social}</div>
                            </div>
                          </div>
                        </td>
                        <td>{t.cnpj}</td>
                        <td>
                          {t.cidade}/{t.uf}
                        </td>
                        <td>{t.classificacao}</td>
                        <td>
                          <span className={`badge-origem badge-origem--${origem}`}>
                            {labelOrigemCadastro(origem)}
                          </span>
                        </td>
                        <td>
                          <span className={`badge-situacao badge-situacao--${t.situacao}`}>
                            {t.situacao}
                          </span>
                        </td>
                        <td className="cadastro-table__acoes">
                          <div className="cadastro-table__acoes-list">
                          <button
                            type="button"
                            className="cadastro-link cadastro-link--credencial cadastro-link--credencial-wa"
                            title="Enviar usuário e senha pelo WhatsApp"
                            aria-label="Enviar credenciais pelo WhatsApp"
                            onClick={() => abrirCredenciaisWhatsApp(t)}
                          >
                            <IconWhatsAppCredenciais />
                          </button>
                          <button
                            type="button"
                            className="cadastro-link cadastro-link--credencial"
                            title={
                              t.email?.trim()
                                ? `Enviar usuário e senha por e-mail (${t.email.trim()})`
                                : 'Transportadora sem e-mail cadastrado'
                            }
                            aria-label="Enviar credenciais por e-mail"
                            onClick={() => abrirCredenciaisEmail(t)}
                          >
                            <IconEmailCredenciais />
                          </button>
                          {(t.situacao === 'pendente' || t.situacao === 'recusado') && (
                            <button
                              type="button"
                              className="cadastro-link"
                              onClick={() => openRevisao(t)}
                            >
                              Revisar
                            </button>
                          )}
                          <button
                            type="button"
                            className="cadastro-link"
                            onClick={() => openFicha(t)}
                          >
                            Painel
                          </button>
                          <button
                            type="button"
                            className="cadastro-link"
                            onClick={() => openEdit(t)}
                          >
                            Editar
                          </button>
                          <button
                            type="button"
                            className="cadastro-link"
                            style={{ color: '#b91c1c' }}
                            onClick={() => confirmarExclusao(t)}
                          >
                            Excluir
                          </button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
              <CadastroPagination
                page={page}
                totalPages={totalPages}
                total={totalFiltrados}
                from={from}
                to={to}
                onPageChange={setPage}
              />
              </>
            )}
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="cadastro-page animate-fade-up">
      <button type="button" className="cadastro-back" onClick={() => setMode('lista')}>
        ← Voltar para Lista
      </button>
      <h1 className="cadastro-page-title">
        <IconBuilding />
        {editingId ? 'Editar Transportadora' : 'Cadastro de Transportadora'}
      </h1>

      <section className="form-card form-card--blue" style={{ marginBottom: 16 }}>
        <header className="form-card__head">
          <h2 className="form-card__title">Logo / foto de perfil</h2>
        </header>
        <div className="form-card__body">
          <input
            ref={logoInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp"
            hidden
            onChange={(e) => {
              const file = e.target.files?.[0]
              e.target.value = ''
              if (!file) return
              if (!isAcceptedImageFile(file)) {
                setError('Use JPG, PNG ou WEBP para a logo/foto.')
                return
              }
              if (file.size > 4 * 1024 * 1024) {
                setError('A imagem deve ter no máximo 4 MB.')
                return
              }
              setError('')
              setLogoParaAjustar(file)
            }}
          />
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
            <div
              style={{
                width: 84,
                height: 84,
                borderRadius: '50%',
                overflow: 'hidden',
                border: '2px solid #f9db00',
                background: '#eef1f4',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}
            >
              {logoPreview ? (
                <img
                  src={logoPreview}
                  alt=""
                  style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                />
              ) : (
                <span style={{ fontSize: 12, color: '#1a1d21' }}>Sem foto</span>
              )}
            </div>
            <div style={{ flex: 1, minWidth: 220 }}>
              <p style={{ margin: '0 0 8px', fontSize: 13, color: '#1a1d21' }}>
                A imagem enviada aqui vira o avatar do transportador quando ele fizer login.
                Use a logo da empresa ou uma foto do responsável (JPG, PNG ou WEBP, até 4 MB).
                Ela aparece no login do sistema, no perfil e no mapa da frota.
              </p>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                <button
                  type="button"
                  className="cadastro-btn cadastro-btn--ghost"
                  disabled={busy}
                  onClick={() => logoInputRef.current?.click()}
                >
                  {logoPreview ? 'Trocar imagem' : 'Escolher imagem'}
                </button>
                {logoPreview && (
                  <button
                    type="button"
                    className="cadastro-btn cadastro-btn--ghost"
                    style={{ color: '#b91c1c' }}
                    disabled={busy}
                    onClick={() => {
                      setLogoFile(null)
                      setLogoPreview(null)
                      setLogoRemovida(true)
                    }}
                  >
                    Remover
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      </section>

      <div className="cadastro-grid" style={{ gap: 16 }}>
        <section className="form-card form-card--blue">
          <header className="form-card__head">
            <IconBuilding />
            <h2 className="form-card__title">Dados da Empresa</h2>
          </header>
          <div className="form-card__body">
            <div className="form-fields">
              <Field label="Razão Social" required>
                <input value={form.razao_social ?? ''} onChange={(e) => set('razao_social', e.target.value)} />
              </Field>
              <Field label="Nome Fantasia" required>
                <input value={form.nome_fantasia ?? ''} onChange={(e) => set('nome_fantasia', e.target.value)} />
              </Field>
              <Field label="CNPJ" required>
                <CnpjInput
                  value={form.cnpj ?? ''}
                  onChange={(v) => set('cnpj', formatCnpj(v))}
                />
              </Field>
              <Field label="RNTRC">
                <input value={form.rntrc ?? ''} onChange={(e) => set('rntrc', e.target.value)} />
              </Field>
              <Field label="Inscrição Estadual">
                <input value={form.inscricao_estadual ?? ''} onChange={(e) => set('inscricao_estadual', e.target.value)} />
              </Field>
              <Field label="Inscrição Municipal">
                <input value={form.inscricao_municipal ?? ''} onChange={(e) => set('inscricao_municipal', e.target.value)} />
              </Field>
              <Field label="Classificação">
                <select
                  value={form.classificacao ?? 'bronze'}
                  onChange={(e) => set('classificacao', e.target.value as ClassificacaoTransportador)}
                >
                  <option value="ouro">Ouro</option>
                  <option value="prata">Prata</option>
                  <option value="bronze">Bronze</option>
                </select>
              </Field>
              <Field label="Situação">
                <select
                  value={form.situacao ?? 'ativo'}
                  onChange={(e) => set('situacao', e.target.value as SituacaoTransportador)}
                >
                  <option value="pendente">Pendente</option>
                  <option value="ativo">Ativo</option>
                  <option value="inativo">Inativo</option>
                  <option value="recusado">Recusado</option>
                </select>
              </Field>
              <Field label="Pontuação">
                <input
                  type="number"
                  value={form.pontuacao ?? 0}
                  onChange={(e) => set('pontuacao', Number(e.target.value))}
                />
              </Field>
            </div>
          </div>
        </section>

        <section className="form-card form-card--green">
          <header className="form-card__head">
            <IconPin />
            <h2 className="form-card__title">Endereço</h2>
          </header>
          <div className="form-card__body">
            <div className="form-fields">
              <Field label="CEP">
                <input value={form.cep ?? ''} onChange={(e) => set('cep', e.target.value)} />
              </Field>
              <Field label="Cidade" required>
                <input value={form.cidade ?? ''} onChange={(e) => set('cidade', e.target.value)} />
              </Field>
              <Field label="UF" required>
                <input maxLength={2} value={form.uf ?? ''} onChange={(e) => set('uf', e.target.value.toUpperCase())} />
              </Field>
              <Field label="Endereço" className="form-field--span2">
                <input value={form.endereco ?? ''} onChange={(e) => set('endereco', e.target.value)} />
              </Field>
              <Field label="Número">
                <input value={form.numero ?? ''} onChange={(e) => set('numero', e.target.value)} />
              </Field>
              <Field label="Bairro">
                <input value={form.bairro ?? ''} onChange={(e) => set('bairro', e.target.value)} />
              </Field>
              <Field label="Complemento" className="form-field--span2">
                <input value={form.complemento ?? ''} onChange={(e) => set('complemento', e.target.value)} />
              </Field>
            </div>
          </div>
        </section>

        <section className="form-card form-card--orange">
          <header className="form-card__head">
            <h2 className="form-card__title">Origem (residência)</h2>
          </header>
          <div className="form-card__body">
            <p className="form-field-hint" style={{ marginBottom: 12, fontSize: 12, color: '#1a1d21' }}>
              Onde o transportador mora — distinto do endereço do CNPJ.
            </p>
            <div className="form-fields">
              <Field label="CEP">
                <input
                  value={form.origem_cep ?? ''}
                  onChange={(e) => set('origem_cep', e.target.value)}
                />
              </Field>
              <Field label="Cidade">
                <input
                  value={form.origem_cidade ?? ''}
                  onChange={(e) => set('origem_cidade', e.target.value)}
                />
              </Field>
              <Field label="UF">
                <input
                  maxLength={2}
                  value={form.origem_uf ?? ''}
                  onChange={(e) => set('origem_uf', e.target.value.toUpperCase())}
                />
              </Field>
              <Field label="Rua" className="form-field--span2">
                <input
                  value={form.origem_endereco ?? ''}
                  onChange={(e) => set('origem_endereco', e.target.value)}
                />
              </Field>
              <Field label="Número">
                <input
                  value={form.origem_numero ?? ''}
                  onChange={(e) => set('origem_numero', e.target.value)}
                />
              </Field>
              <Field label="Bairro">
                <input
                  value={form.origem_bairro ?? ''}
                  onChange={(e) => set('origem_bairro', e.target.value)}
                />
              </Field>
              <Field label="Latitude">
                <input
                  type="number"
                  step="any"
                  value={form.origem_lat ?? ''}
                  onChange={(e) =>
                    set('origem_lat', e.target.value === '' ? null : Number(e.target.value))
                  }
                />
              </Field>
              <Field label="Longitude">
                <input
                  type="number"
                  step="any"
                  value={form.origem_lng ?? ''}
                  onChange={(e) =>
                    set('origem_lng', e.target.value === '' ? null : Number(e.target.value))
                  }
                />
              </Field>
              <Field label="Raio de pesquisa (km)" className="form-field--span2">
                <input
                  type="number"
                  min={10}
                  max={500}
                  step={5}
                  value={form.raio_km ?? 50}
                  onChange={(e) => set('raio_km', Number(e.target.value))}
                />
              </Field>
            </div>
          </div>
        </section>

        <section className="form-card form-card--orange">
          <header className="form-card__head">
            <IconPhone />
            <h2 className="form-card__title">Contato</h2>
          </header>
          <div className="form-card__body">
            <div className="form-fields">
              <Field label="Telefone">
                <input
                  type="tel"
                  inputMode="tel"
                  autoComplete="tel"
                  placeholder="(00) 00000-0000"
                  value={form.telefone ?? ''}
                  onChange={(e) => set('telefone', formatPhoneBr(e.target.value))}
                />
              </Field>
              <Field label="E-mail">
                <input type="email" value={form.email ?? ''} onChange={(e) => set('email', e.target.value)} />
              </Field>
              <Field label="Nome do Contato">
                <input value={form.contato_nome ?? ''} onChange={(e) => set('contato_nome', e.target.value)} />
              </Field>
              <Field label="Celular / WhatsApp">
                <input
                  type="tel"
                  inputMode="tel"
                  autoComplete="tel-national"
                  placeholder="(00) 00000-0000"
                  value={form.contato_telefone ?? ''}
                  onChange={(e) => set('contato_telefone', formatPhoneBr(e.target.value))}
                />
              </Field>
            </div>
          </div>
        </section>

        <section className="form-card">
          <header className="form-card__head">
            <IconBuilding />
            <h2 className="form-card__title">Perfil público (site)</h2>
          </header>
          <div className="form-card__body">
            <p className="form-hint" style={{ marginBottom: 12 }}>
              Página da transportadora no estilo site — apresentação, serviços e referências.
              O transportador também edita isso em Configurações.
            </p>
            <TransportadorPerfilEditor
              value={normalizePerfilPublico(form.perfil_publico)}
              onChange={(next) => set('perfil_publico', next)}
              empresa={form as Transportador}
            />
            <div style={{ marginTop: 12 }}>
              <button
                type="button"
                className="cadastro-btn cadastro-btn--ghost"
                onClick={() => setPreviewPerfil(true)}
              >
                Ver página do perfil
              </button>
            </div>
          </div>
        </section>
      </div>

      {error && <p style={{ color: '#dc2626', marginTop: 12, textAlign: 'center' }}>{error}</p>}

      <div className="cadastro-actions">
        <button
          type="button"
          className="cadastro-btn cadastro-btn--save"
          disabled={busy}
          onClick={() => void save()}
        >
          {busy ? 'Salvando…' : 'Salvar Transportadora'}
        </button>
      </div>

      {previewPerfil ? (
        <TransportadorPerfilSite
          transportador={{
            id: editingId ?? 'preview',
            razao_social: form.razao_social ?? '',
            nome_fantasia: form.nome_fantasia ?? '',
            cnpj: form.cnpj ?? '',
            inscricao_estadual: form.inscricao_estadual,
            cidade: form.cidade ?? '',
            uf: form.uf ?? 'SP',
            endereco: form.endereco,
            numero: form.numero,
            bairro: form.bairro,
            complemento: form.complemento,
            cep: form.cep,
            origem_cep: form.origem_cep,
            origem_cidade: form.origem_cidade,
            origem_uf: form.origem_uf,
            origem_endereco: form.origem_endereco,
            origem_numero: form.origem_numero,
            origem_bairro: form.origem_bairro,
            origem_complemento: form.origem_complemento,
            origem_lat: form.origem_lat ?? null,
            origem_lng: form.origem_lng ?? null,
            raio_km: form.raio_km,
            telefone: form.telefone,
            email: form.email,
            contato_nome: form.contato_nome,
            contato_telefone: form.contato_telefone,
            rntrc: form.rntrc,
            logo_url: logoRemovida ? undefined : (logoPreview ?? form.logo_url),
            classificacao: (form.classificacao as ClassificacaoTransportador) ?? 'bronze',
            pontuacao: Number(form.pontuacao) || 0,
            situacao: (form.situacao as SituacaoTransportador) ?? 'ativo',
            perfil_publico: normalizePerfilPublico(form.perfil_publico),
          }}
          onClose={() => setPreviewPerfil(false)}
        />
      ) : null}

      <ImageCropModal
        open={Boolean(logoParaAjustar)}
        file={logoParaAjustar}
        shape="circle"
        title="Ajustar logo / foto"
        onCancel={() => setLogoParaAjustar(null)}
        onConfirm={(file) => {
          setLogoParaAjustar(null)
          setLogoFile(file)
          setLogoRemovida(false)
          void fileToDataUrl(file).then(setLogoPreview)
        }}
      />
    </div>
  )
}

function Field({
  label,
  required,
  children,
  className = '',
}: {
  label: string
  required?: boolean
  children: React.ReactNode
  className?: string
}) {
  return (
    <div className={`form-field ${className}`.trim()}>
      <label>
        {label}
        {required && <span className="req">*</span>}
      </label>
      {children}
    </div>
  )
}

function IconBuilding() {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" fill="none" aria-hidden>
      <path d="M4 20V6l8-3 8 3v14M9 20v-6h6v6" stroke="currentColor" strokeWidth="1.75" strokeLinejoin="round" />
    </svg>
  )
}

function IconPin() {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" fill="none" aria-hidden>
      <path d="M12 21s7-5.5 7-11a7 7 0 1 0-14 0c0 5.5 7 11 7 11z" stroke="currentColor" strokeWidth="1.75" />
      <circle cx="12" cy="10" r="2.5" stroke="currentColor" strokeWidth="1.75" />
    </svg>
  )
}

function IconPhone() {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" fill="none" aria-hidden>
      <path
        d="M6.5 3.5h3l1.5 4-2 1.5a12 12 0 0 0 5.5 5.5l1.5-2 4 1.5v3A2 2 0 0 1 18 19 14 14 0 0 1 5 6a2 2 0 0 1 1.5-2.5z"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinejoin="round"
      />
    </svg>
  )
}
