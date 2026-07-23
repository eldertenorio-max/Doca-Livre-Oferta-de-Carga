import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { Eye, EyeOff } from 'lucide-react'
import { Link, Navigate } from 'react-router-dom'
import { useData } from '../context/DataContext'
import { LOGO_DOCA_LIVRE_SRC } from '../lib/brandAssets'
import { ProductMark } from '../components/ProductMark'
import { isSupabaseConfigured } from '../lib/supabase'
import {
  portalEmailEnviarCodigo,
  portalEmailVerificarCodigo,
} from '../lib/portalApi'
import {
  DOCUMENTOS_TRANSPORTADOR,
  fileToDataUrl,
  isAcceptedDocFile,
  openLocalDocumento,
} from '../lib/transportadorDocs'
import type { TipoDocumentoTransportador } from '../types'
import { CnpjInput } from '../components/ui/CnpjInput'
import { cnpjDigits, formatCnpj, isValidCnpj } from '../lib/cnpj'
import { buscarDadosPorCnpj } from '../lib/cnpjLookup'
import {
  buscarEnderecoPorCep,
  enderecoProntoParaGeocode,
  formatCepBr,
  geocodificarEndereco,
} from '../lib/geocodeEndereco'
import { formatPhoneBr } from '../lib/phoneBr'
import '../styles/cadastro.css'
import '../styles/login.css'
import '../styles/shell.css'

type Step = 1 | 2 | 3 | 4 | 'ok'

type DocState = Partial<
  Record<TipoDocumentoTransportador, { nome_arquivo: string; data_url: string; file?: File }>
>

const UFS = [
  'AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO',
]

function formatCep(raw: string): string {
  return formatCepBr(raw)
}

function onlyDigits(raw: string, max: number): string {
  return raw.replace(/\D/g, '').slice(0, max)
}

const emptyOrigem = () => ({
  cep: '',
  cidade: '',
  uf: 'SP',
  endereco: '',
  numero: '',
  bairro: '',
  complemento: '',
  lat: null as number | null,
  lng: null as number | null,
})

export function CadastroTransportadorPage() {
  const { user, registrarCadastroTransportador } = useData()
  const [step, setStep] = useState<Step>(1)
  const [error, setError] = useState('')
  const [info, setInfo] = useState('')
  const [loading, setLoading] = useState(false)

  const [empresa, setEmpresa] = useState({
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
    telefone: '',
    email: '',
    contato_nome: '',
    contato_telefone: '',
  })

  const [origem, setOrigem] = useState(emptyOrigem)
  const [origemInfo, setOrigemInfo] = useState('')
  const [origemBuscandoCep, setOrigemBuscandoCep] = useState(false)
  const [origemGeocoding, setOrigemGeocoding] = useState(false)
  const ultimoCepOrigem = useRef('')

  const [docs, setDocs] = useState<DocState>({})
  const [acesso, setAcesso] = useState({
    usuario: '',
    email: '',
    senha: '',
    confirmarSenha: '',
    nome: '',
  })
  const [emailCodigo, setEmailCodigo] = useState('')
  const [emailConfirmado, setEmailConfirmado] = useState(false)
  const [verifyToken, setVerifyToken] = useState('')
  const [debugCodigo, setDebugCodigo] = useState('')
  const [otpInfo, setOtpInfo] = useState('')
  const [showSenha, setShowSenha] = useState(false)
  const [showConfirmarSenha, setShowConfirmarSenha] = useState(false)
  const [cnpjBuscando, setCnpjBuscando] = useState(false)
  const [cnpjInfo, setCnpjInfo] = useState('')
  const ultimoCnpjBuscado = useRef('')

  const docsOk = useMemo(() => {
    return DOCUMENTOS_TRANSPORTADOR.filter((d) => d.obrigatorio).every((d) => Boolean(docs[d.tipo]))
  }, [docs])

  // Ao completar CNPJ válido, puxa dados da Receita (BrasilAPI)
  useEffect(() => {
    const digits = cnpjDigits(empresa.cnpj)
    if (digits.length !== 14 || !isValidCnpj(digits)) {
      setCnpjBuscando(false)
      return
    }
    if (ultimoCnpjBuscado.current === digits) return

    let cancelled = false
    const timer = window.setTimeout(() => {
      void (async () => {
        setCnpjBuscando(true)
        setCnpjInfo('Consultando CNPJ na Receita…')
        setError('')
        const res = await buscarDadosPorCnpj(digits)
        if (cancelled) return
        setCnpjBuscando(false)
        if (!res.ok) {
          setCnpjInfo(res.erro)
          return
        }
        ultimoCnpjBuscado.current = digits
        const d = res.dados
        setEmpresa((prev) => ({
          ...prev,
          cnpj: d.cnpj || prev.cnpj,
          razao_social: d.razao_social || prev.razao_social,
          nome_fantasia: d.nome_fantasia || prev.nome_fantasia,
          cep: d.cep || prev.cep,
          cidade: d.cidade || prev.cidade,
          uf: d.uf || prev.uf,
          endereco: d.endereco || prev.endereco,
          numero: d.numero || prev.numero,
          bairro: d.bairro || prev.bairro,
          complemento: d.complemento || prev.complemento,
          telefone: d.telefone || prev.telefone,
          email: d.email || prev.email,
        }))
        setCnpjInfo('Dados da empresa preenchidos automaticamente. Confira antes de continuar.')
      })()
    }, 400)

    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [empresa.cnpj])

  // CEP da origem → preenche rua/cidade (ViaCEP)
  useEffect(() => {
    const cep = origem.cep.replace(/\D/g, '')
    if (cep.length !== 8) {
      setOrigemBuscandoCep(false)
      return
    }
    if (ultimoCepOrigem.current === cep) return

    let cancelled = false
    const timer = window.setTimeout(() => {
      void (async () => {
        setOrigemBuscandoCep(true)
        setOrigemInfo('Consultando CEP…')
        const res = await buscarEnderecoPorCep(cep)
        if (cancelled) return
        setOrigemBuscandoCep(false)
        if (!res.ok) {
          setOrigemInfo(res.erro)
          return
        }
        ultimoCepOrigem.current = cep
        setOrigem((prev) => ({
          ...prev,
          ...res.dados,
          cep: res.dados.cep || prev.cep,
          lat: null,
          lng: null,
        }))
        setOrigemInfo('Endereço preenchido pelo CEP. Confira e aguarde as coordenadas.')
      })()
    }, 350)

    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [origem.cep])

  // Geocode quando CEP completo ou cidade+rua (+número se tiver)
  useEffect(() => {
    if (!enderecoProntoParaGeocode(origem)) {
      setOrigemGeocoding(false)
      return
    }
    // Evita re-geocode se já tem coords e nada mudou de forma parcial — limpa coords ao editar
    let cancelled = false
    const timer = window.setTimeout(() => {
      void (async () => {
        setOrigemGeocoding(true)
        setOrigemInfo((prev) =>
          prev.includes('coordenadas') ? prev : 'Localizando coordenadas no mapa…',
        )
        const res = await geocodificarEndereco(origem)
        if (cancelled) return
        setOrigemGeocoding(false)
        if (!res.ok) {
          setOrigem((prev) => ({ ...prev, lat: null, lng: null }))
          setOrigemInfo(res.erro)
          return
        }
        setOrigem((prev) => ({
          ...prev,
          lat: res.coords.lat,
          lng: res.coords.lng,
        }))
        setOrigemInfo(
          `Coordenadas encontradas: ${res.coords.lat.toFixed(5)}, ${res.coords.lng.toFixed(5)}`,
        )
      })()
    }, 700)

    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- geocode pelos campos de endereço
  }, [
    origem.cep,
    origem.cidade,
    origem.uf,
    origem.endereco,
    origem.numero,
    origem.bairro,
  ])

  if (user) {
    return (
      <Navigate
        to={user.role === 'transportador' ? '/transportador' : '/minerva'}
        replace
      />
    )
  }

  function setEmp<K extends keyof typeof empresa>(key: K, value: (typeof empresa)[K]) {
    setEmpresa((prev) => ({ ...prev, [key]: value }))
  }

  function setOri<K extends keyof typeof origem>(key: K, value: (typeof origem)[K]) {
    setOrigem((prev) => {
      const next = { ...prev, [key]: value }
      if (key !== 'lat' && key !== 'lng') {
        next.lat = null
        next.lng = null
      }
      return next
    })
    if (key === 'cep') {
      const digits = String(value).replace(/\D/g, '')
      if (digits !== ultimoCepOrigem.current) ultimoCepOrigem.current = ''
    }
  }

  function setAcc<K extends keyof typeof acesso>(key: K, value: (typeof acesso)[K]) {
    setAcesso((prev) => ({ ...prev, [key]: value }))
  }

  async function onPickDoc(tipo: TipoDocumentoTransportador, file: File | null) {
    setError('')
    if (!file) {
      setDocs((prev) => {
        const next = { ...prev }
        delete next[tipo]
        return next
      })
      return
    }
    if (!isAcceptedDocFile(file)) {
      setError('Use PDF, JPG ou PNG (máx. recomendado 8 MB).')
      return
    }
    if (file.size > 8 * 1024 * 1024) {
      setError('Arquivo muito grande (máx. 8 MB).')
      return
    }
    const data_url = await fileToDataUrl(file)
    setDocs((prev) => ({
      ...prev,
      [tipo]: { nome_arquivo: file.name, data_url, file },
    }))
  }

  function nextFromEmpresa(e: FormEvent) {
    e.preventDefault()
    setError('')
    if (!empresa.razao_social.trim() || !empresa.nome_fantasia.trim() || !empresa.cnpj.trim()) {
      setError('Preencha Razão Social, Nome Fantasia e CNPJ.')
      return
    }
    if (!empresa.cidade.trim() || !empresa.uf.trim()) {
      setError('Preencha cidade e UF da empresa.')
      return
    }
    if (!origem.cidade.trim() || !origem.uf.trim()) {
      setError('Preencha cidade e UF da sua origem (onde você mora).')
      return
    }
    if (!origem.endereco.trim() && origem.cep.replace(/\D/g, '').length < 8) {
      setError('Na origem, informe o CEP ou a rua.')
      return
    }
    if (origemGeocoding || origemBuscandoCep) {
      setError('Aguarde a consulta do CEP/coordenadas da origem.')
      return
    }
    if (origem.lat == null || origem.lng == null) {
      setError('Não encontramos as coordenadas da origem. Confira o endereço ou o CEP.')
      return
    }
    setStep(2)
  }

  function nextFromContato(e: FormEvent) {
    e.preventDefault()
    setError('')
    if (!empresa.contato_nome.trim() || !empresa.telefone.trim()) {
      setError('Preencha nome do responsável e telefone.')
      return
    }
    setStep(3)
  }

  function nextFromDocs(e: FormEvent) {
    e.preventDefault()
    setError('')
    if (!docsOk) {
      setError('Anexe todos os documentos obrigatórios.')
      return
    }
    setStep(4)
  }

  async function enviarCodigoEmail() {
    setError('')
    setOtpInfo('')
    setDebugCodigo('')
    if (!acesso.email.trim().includes('@')) {
      setError('Informe um e-mail válido para receber o código.')
      return
    }
    setLoading(true)
    const res = await portalEmailEnviarCodigo(acesso.email.trim())
    setLoading(false)
    if (!res.ok) {
      setError(res.erro)
      return
    }
    setEmailConfirmado(false)
    setVerifyToken('')
    setOtpInfo(res.mensagem || 'Código enviado para o e-mail.')
    setDebugCodigo(res.debug_codigo || '')
  }

  async function confirmarCodigoEmail() {
    setError('')
    setOtpInfo('')
    setLoading(true)
    const res = await portalEmailVerificarCodigo(acesso.email.trim(), emailCodigo.trim())
    setLoading(false)
    if (!res.ok) {
      setError(res.erro)
      return
    }
    setEmailConfirmado(true)
    setVerifyToken(res.verify_token || '')
    setDebugCodigo('')
    setOtpInfo('E-mail confirmado. Defina a senha e envie o cadastro.')
  }

  async function submit(e: FormEvent) {
    e.preventDefault()
    setError('')
    setInfo('')
    setOtpInfo('')
    if (!emailConfirmado) {
      setError('Confirme o e-mail com o código recebido antes de enviar o cadastro.')
      return
    }
    if (acesso.senha.length < 4) {
      setError('Senha deve ter ao menos 4 caracteres.')
      return
    }
    if (acesso.senha !== acesso.confirmarSenha) {
      setError('As senhas não coincidem.')
      return
    }
    setLoading(true)
    const result = await registrarCadastroTransportador({
      empresa,
      origem: {
        cep: origem.cep,
        cidade: origem.cidade,
        uf: origem.uf,
        endereco: origem.endereco,
        numero: origem.numero,
        bairro: origem.bairro,
        complemento: origem.complemento,
        lat: origem.lat,
        lng: origem.lng,
      },
      acesso: {
        ...acesso,
        nome: acesso.nome.trim() || empresa.contato_nome.trim(),
        verifyToken: verifyToken || undefined,
      },
      documentos: DOCUMENTOS_TRANSPORTADOR.flatMap((d) => {
        const item = docs[d.tipo]
        if (!item) return []
        return [
          {
            tipo: d.tipo,
            nome_arquivo: item.nome_arquivo,
            data_url: item.data_url,
            file: item.file,
          },
        ]
      }),
    })
    setLoading(false)
    if (!result.ok) {
      setError(result.error ?? 'Falha no cadastro.')
      return
    }
    setInfo(result.mensagem ?? 'Cadastro enviado.')
    setStep('ok')
  }

  return (
    <div className="portal-login cadastro-publico">
      <div className="portal-login__card cadastro-publico__card">
        <div className="portal-login__brand">
          <img src={LOGO_DOCA_LIVRE_SRC} alt="Doca Livre" className="portal-login__logo" />
          <ProductMark size="md" />
        </div>

        <h1 className="portal-login__title">Cadastro de transportador</h1>
        <p className="portal-login__subtitle">
          Preencha os dados da empresa, anexe os documentos e crie seu acesso. Após o envio,
          aguarde a aprovação.
        </p>

        {!isSupabaseConfigured && step !== 'ok' && (
          <p className="cadastro-publico__aviso">
            Modo local: o cadastro fica neste navegador. Para o link funcionar entre pessoas,
            publique no Render com Supabase.
          </p>
        )}

        {step !== 'ok' && (
          <ol className="cadastro-steps" aria-label="Etapas">
            {[
              [1, 'Empresa'],
              [2, 'Contato'],
              [3, 'Documentos'],
              [4, 'Acesso'],
            ].map(([n, label]) => (
              <li
                key={n}
                className={
                  step === n
                    ? 'cadastro-steps__item cadastro-steps__item--active'
                    : typeof step === 'number' && step > Number(n)
                      ? 'cadastro-steps__item cadastro-steps__item--done'
                      : 'cadastro-steps__item'
                }
              >
                <span>{n}</span>
                {label}
              </li>
            ))}
          </ol>
        )}

        {step === 1 && (
          <form className="portal-login__form" onSubmit={nextFromEmpresa}>
            <section className="form-card form-card--blue">
              <header className="form-card__head">
                <h2 className="form-card__title">Dados da empresa</h2>
              </header>
              <div className="form-card__body">
                <p className="cadastro-publico__hint">
                  Endereço abaixo é o da empresa (CNPJ). Sua residência fica em &quot;Cadastre sua
                  origem&quot;.
                </p>
                <div className="form-fields">
                  <Field label="Razão Social" required>
                    <input
                      value={empresa.razao_social}
                      onChange={(e) => setEmp('razao_social', e.target.value)}
                      placeholder="Ex.: Santos Transportes Ltda"
                      autoComplete="organization"
                    />
                  </Field>
                  <Field label="Nome Fantasia" required>
                    <input
                      value={empresa.nome_fantasia}
                      onChange={(e) => setEmp('nome_fantasia', e.target.value)}
                      placeholder="Ex.: Santos Transportes"
                      autoComplete="organization"
                    />
                  </Field>
                  <Field label="CNPJ" required>
                    <CnpjInput
                      value={empresa.cnpj}
                      onChange={(v) => {
                        const next = formatCnpj(v)
                        if (cnpjDigits(next) !== ultimoCnpjBuscado.current) {
                          ultimoCnpjBuscado.current = ''
                          setCnpjInfo('')
                        }
                        setEmp('cnpj', next)
                      }}
                      placeholder="00.000.000/0000-00"
                      disabled={cnpjBuscando}
                    />
                    {(cnpjBuscando || cnpjInfo) && (
                      <p
                        style={{
                          marginTop: 6,
                          fontSize: 12,
                          color: cnpjBuscando
                            ? '#64748b'
                            : cnpjInfo.includes('preenchidos')
                              ? '#047857'
                              : '#b45309',
                        }}
                      >
                        {cnpjBuscando ? 'Consultando CNPJ na Receita…' : cnpjInfo}
                      </p>
                    )}
                  </Field>
                  <Field label="RNTRC">
                    <input
                      value={empresa.rntrc}
                      onChange={(e) => setEmp('rntrc', onlyDigits(e.target.value, 14))}
                      placeholder="Registro ANTT (somente números)"
                      inputMode="numeric"
                    />
                  </Field>
                  <Field label="Inscrição Estadual">
                    <input
                      value={empresa.inscricao_estadual}
                      onChange={(e) => setEmp('inscricao_estadual', e.target.value)}
                      placeholder="Ex.: 10.20.0.3 ou Isento"
                    />
                  </Field>
                  <Field label="Inscrição Municipal">
                    <input
                      value={empresa.inscricao_municipal}
                      onChange={(e) => setEmp('inscricao_municipal', e.target.value)}
                      placeholder="Número da IM (se houver)"
                    />
                  </Field>
                  <Field label="CEP">
                    <input
                      value={empresa.cep}
                      onChange={(e) => setEmp('cep', formatCep(e.target.value))}
                      placeholder="00000-000"
                      inputMode="numeric"
                      autoComplete="postal-code"
                    />
                  </Field>
                  <Field label="Cidade" required>
                    <input
                      value={empresa.cidade}
                      onChange={(e) => setEmp('cidade', e.target.value)}
                      placeholder="Ex.: São Paulo"
                      autoComplete="address-level2"
                    />
                  </Field>
                  <Field label="UF" required>
                    <select
                      value={empresa.uf}
                      onChange={(e) => setEmp('uf', e.target.value)}
                      aria-label="UF — selecione o estado"
                    >
                      {UFS.map((uf) => (
                        <option key={uf} value={uf}>
                          {uf}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Endereço" className="form-field--span2">
                    <input
                      value={empresa.endereco}
                      onChange={(e) => setEmp('endereco', e.target.value)}
                      placeholder="Rua, avenida ou rodovia"
                      autoComplete="street-address"
                    />
                  </Field>
                  <Field label="Número">
                    <input
                      value={empresa.numero}
                      onChange={(e) => setEmp('numero', e.target.value)}
                      placeholder="Nº ou S/N"
                    />
                  </Field>
                  <Field label="Bairro">
                    <input
                      value={empresa.bairro}
                      onChange={(e) => setEmp('bairro', e.target.value)}
                      placeholder="Ex.: Centro"
                    />
                  </Field>
                  <Field label="Complemento" className="form-field--span2">
                    <input
                      value={empresa.complemento}
                      onChange={(e) => setEmp('complemento', e.target.value)}
                      placeholder="Sala, galpão, bloco (opcional)"
                    />
                  </Field>
                </div>
              </div>
            </section>

            <section className="form-card form-card--orange" style={{ marginTop: 16 }}>
              <header className="form-card__head">
                <h2 className="form-card__title">Cadastre sua origem</h2>
              </header>
              <div className="form-card__body">
                <p className="cadastro-publico__hint">
                  Endereço onde você realmente mora (residência) — não use o endereço do CNPJ.
                  Informe o CEP ou cidade, rua e número; as coordenadas são preenchidas
                  automaticamente.
                </p>
                <div className="form-fields">
                  <Field label="CEP da origem">
                    <input
                      value={origem.cep}
                      onChange={(e) => setOri('cep', formatCep(e.target.value))}
                      placeholder="00000-000"
                      inputMode="numeric"
                      autoComplete="postal-code"
                    />
                  </Field>
                  <Field label="Cidade" required>
                    <input
                      value={origem.cidade}
                      onChange={(e) => setOri('cidade', e.target.value)}
                      placeholder="Ex.: Santos"
                      autoComplete="address-level2"
                    />
                  </Field>
                  <Field label="UF" required>
                    <select
                      value={origem.uf}
                      onChange={(e) => setOri('uf', e.target.value)}
                      aria-label="UF da origem"
                    >
                      {UFS.map((uf) => (
                        <option key={uf} value={uf}>
                          {uf}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Rua / logradouro" className="form-field--span2" required>
                    <input
                      value={origem.endereco}
                      onChange={(e) => setOri('endereco', e.target.value)}
                      placeholder="Rua onde você mora"
                      autoComplete="street-address"
                    />
                  </Field>
                  <Field label="Número">
                    <input
                      value={origem.numero}
                      onChange={(e) => setOri('numero', e.target.value)}
                      placeholder="Nº ou S/N"
                    />
                  </Field>
                  <Field label="Bairro">
                    <input
                      value={origem.bairro}
                      onChange={(e) => setOri('bairro', e.target.value)}
                      placeholder="Ex.: Centro"
                    />
                  </Field>
                  <Field label="Complemento" className="form-field--span2">
                    <input
                      value={origem.complemento}
                      onChange={(e) => setOri('complemento', e.target.value)}
                      placeholder="Apto, bloco (opcional)"
                    />
                  </Field>
                  <Field label="Latitude" className="form-field--span2">
                    <input
                      value={origem.lat != null ? String(origem.lat) : ''}
                      readOnly
                      placeholder={origemGeocoding ? 'Buscando…' : 'Automático'}
                    />
                  </Field>
                  <Field label="Longitude" className="form-field--span2">
                    <input
                      value={origem.lng != null ? String(origem.lng) : ''}
                      readOnly
                      placeholder={origemGeocoding ? 'Buscando…' : 'Automático'}
                    />
                  </Field>
                </div>
                {(origemBuscandoCep || origemGeocoding || origemInfo) && (
                  <p
                    style={{
                      marginTop: 10,
                      fontSize: 12,
                      color:
                        origem.lat != null
                          ? '#047857'
                          : origemBuscandoCep || origemGeocoding
                            ? '#64748b'
                            : '#b45309',
                    }}
                  >
                    {origemBuscandoCep
                      ? 'Consultando CEP…'
                      : origemGeocoding
                        ? 'Localizando coordenadas…'
                        : origemInfo}
                  </p>
                )}
                {origem.lat != null && origem.lng != null && (
                  <p style={{ marginTop: 8, fontSize: 12 }}>
                    <a
                      href={`https://www.openstreetmap.org/?mlat=${origem.lat}&mlon=${origem.lng}#map=16/${origem.lat}/${origem.lng}`}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Ver no mapa
                    </a>
                  </p>
                )}
              </div>
            </section>

            {error && <p className="portal-login__erro">{error}</p>}
            <button type="submit" className="portal-login__submit">
              Continuar
            </button>
          </form>
        )}

        {step === 2 && (
          <form className="portal-login__form" onSubmit={nextFromContato}>
            <section className="form-card form-card--orange">
              <header className="form-card__head">
                <h2 className="form-card__title">Contato</h2>
              </header>
              <div className="form-card__body">
                <div className="form-fields">
                  <Field label="Nome do responsável" required>
                    <input
                      value={empresa.contato_nome}
                      onChange={(e) => setEmp('contato_nome', e.target.value)}
                      autoComplete="name"
                    />
                  </Field>
                  <Field label="Telefone" required>
                    <input
                      type="tel"
                      value={empresa.telefone}
                      onChange={(e) => setEmp('telefone', formatPhoneBr(e.target.value))}
                      placeholder="(00) 00000-0000"
                      inputMode="tel"
                      autoComplete="tel"
                    />
                  </Field>
                  <Field label="Telefone do contato">
                    <input
                      type="tel"
                      value={empresa.contato_telefone}
                      onChange={(e) => setEmp('contato_telefone', formatPhoneBr(e.target.value))}
                      placeholder="(00) 00000-0000"
                      inputMode="tel"
                      autoComplete="tel-national"
                    />
                  </Field>
                  <Field label="E-mail da empresa">
                    <input
                      type="email"
                      value={empresa.email}
                      onChange={(e) => setEmp('email', e.target.value)}
                      placeholder="contato@suaempresa.com.br"
                      autoComplete="email"
                    />
                  </Field>
                </div>
              </div>
            </section>
            {error && <p className="portal-login__erro">{error}</p>}
            <div className="cadastro-publico__nav">
              <button type="button" className="cadastro-btn cadastro-btn--ghost" onClick={() => setStep(1)}>
                Voltar
              </button>
              <button type="submit" className="portal-login__submit">
                Continuar
              </button>
            </div>
          </form>
        )}

        {step === 3 && (
          <form className="portal-login__form" onSubmit={nextFromDocs}>
            <section className="form-card form-card--green">
              <header className="form-card__head">
                <h2 className="form-card__title">Documentos</h2>
              </header>
              <div className="form-card__body">
                <p className="cadastro-publico__hint">
                  Anexe PDF, JPG ou PNG. Itens com * são obrigatórios.
                </p>
                <div className="doc-upload-list">
                  {DOCUMENTOS_TRANSPORTADOR.map((d) => {
                    const item = docs[d.tipo]
                    return (
                      <div key={d.tipo} className="doc-upload-row">
                        <div>
                          <strong>
                            {d.label}
                            {d.obrigatorio ? <span className="req"> *</span> : null}
                          </strong>
                          {d.hint && <span>{d.hint}</span>}
                          {item && (
                            <em className="doc-upload-row__file">{item.nome_arquivo}</em>
                          )}
                        </div>
                        <div className="doc-upload-row__actions">
                          {item && (
                            <>
                              <button
                                type="button"
                                className="cadastro-btn cadastro-btn--ghost doc-upload-row__btn"
                                onClick={() => {
                                  void openLocalDocumento({
                                    file: item.file,
                                    data_url: item.data_url,
                                  }).catch((err) => {
                                    setError(
                                      err instanceof Error
                                        ? err.message
                                        : 'Não foi possível abrir o documento.',
                                    )
                                  })
                                }}
                              >
                                Visualizar
                              </button>
                              <button
                                type="button"
                                className="cadastro-btn cadastro-btn--ghost doc-upload-row__btn doc-upload-row__btn--danger"
                                onClick={() => void onPickDoc(d.tipo, null)}
                              >
                                Excluir
                              </button>
                            </>
                          )}
                          <label className="cadastro-btn cadastro-btn--ghost doc-upload-row__btn">
                            {item ? 'Trocar' : 'Anexar'}
                            <input
                              type="file"
                              accept=".pdf,.jpg,.jpeg,.png,.webp,application/pdf,image/*"
                              hidden
                              onChange={(e) => onPickDoc(d.tipo, e.target.files?.[0] ?? null)}
                            />
                          </label>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            </section>
            {error && <p className="portal-login__erro">{error}</p>}
            <div className="cadastro-publico__nav">
              <button type="button" className="cadastro-btn cadastro-btn--ghost" onClick={() => setStep(2)}>
                Voltar
              </button>
              <button type="submit" className="portal-login__submit">
                Continuar
              </button>
            </div>
          </form>
        )}

        {step === 4 && (
          <form className="portal-login__form" onSubmit={submit}>
            <section className="form-card form-card--purple">
              <header className="form-card__head">
                <h2 className="form-card__title">Acesso ao sistema</h2>
              </header>
              <div className="form-card__body">
                <div className="form-fields form-fields--photo">
                  <Field label="Nome completo">
                    <input
                      value={acesso.nome}
                      onChange={(e) => setAcc('nome', e.target.value)}
                      placeholder={empresa.contato_nome || undefined}
                      autoComplete="name"
                    />
                  </Field>
                  <Field label="Usuário" required>
                    <input
                      value={acesso.usuario}
                      onChange={(e) => setAcc('usuario', e.target.value)}
                      placeholder="Ex.: santos.transportes"
                      autoComplete="username"
                    />
                  </Field>
                  <Field label="E-mail de login" required>
                    <input
                      type="email"
                      value={acesso.email}
                      onChange={(e) => {
                        setEmailConfirmado(false)
                        setAcc('email', e.target.value)
                      }}
                      placeholder="login@suaempresa.com.br"
                      autoComplete="email"
                      disabled={emailConfirmado}
                    />
                  </Field>

                  {!emailConfirmado ? (
                    <>
                      <div className="cadastro-publico__nav" style={{ marginTop: 0 }}>
                        <button
                          type="button"
                          className="portal-login__submit"
                          disabled={loading}
                          onClick={() => void enviarCodigoEmail()}
                        >
                          {loading ? 'Enviando…' : 'Enviar código por e-mail'}
                        </button>
                      </div>
                      <Field label="Código recebido">
                        <input
                          value={emailCodigo}
                          onChange={(e) => setEmailCodigo(e.target.value)}
                          inputMode="numeric"
                          maxLength={6}
                          placeholder="6 dígitos"
                        />
                      </Field>
                      {debugCodigo && (
                        <p className="portal-login__info">
                          Debug — código: <strong>{debugCodigo}</strong>
                        </p>
                      )}
                      {otpInfo && <p className="portal-login__info">{otpInfo}</p>}
                      <button
                        type="button"
                        className="cadastro-btn cadastro-btn--ghost"
                        disabled={loading}
                        onClick={() => void confirmarCodigoEmail()}
                      >
                        Confirmar e-mail
                      </button>
                    </>
                  ) : (
                    <>
                      <p className="portal-login__info">E-mail confirmado ✓ {acesso.email}</p>
                      <Field label="Senha" required>
                        <div className="form-field__password-wrap">
                          <input
                            type={showSenha ? 'text' : 'password'}
                            value={acesso.senha}
                            onChange={(e) => setAcc('senha', e.target.value)}
                            placeholder="Mínimo 6 caracteres"
                            autoComplete="new-password"
                            className="form-field__input--password"
                          />
                          <button
                            type="button"
                            className="form-field__password-toggle"
                            onClick={() => setShowSenha((v) => !v)}
                            aria-label={showSenha ? 'Ocultar senha' : 'Mostrar senha'}
                            title={showSenha ? 'Ocultar senha' : 'Mostrar senha'}
                          >
                            {showSenha ? (
                              <EyeOff size={18} strokeWidth={1.75} />
                            ) : (
                              <Eye size={18} strokeWidth={1.75} />
                            )}
                          </button>
                        </div>
                      </Field>
                      <Field label="Confirmar senha" required>
                        <div className="form-field__password-wrap">
                          <input
                            type={showConfirmarSenha ? 'text' : 'password'}
                            value={acesso.confirmarSenha}
                            onChange={(e) => setAcc('confirmarSenha', e.target.value)}
                            placeholder="Repita a senha"
                            autoComplete="new-password"
                            className="form-field__input--password"
                          />
                          <button
                            type="button"
                            className="form-field__password-toggle"
                            onClick={() => setShowConfirmarSenha((v) => !v)}
                            aria-label={
                              showConfirmarSenha ? 'Ocultar confirmação' : 'Mostrar confirmação'
                            }
                            title={
                              showConfirmarSenha ? 'Ocultar confirmação' : 'Mostrar confirmação'
                            }
                          >
                            {showConfirmarSenha ? (
                              <EyeOff size={18} strokeWidth={1.75} />
                            ) : (
                              <Eye size={18} strokeWidth={1.75} />
                            )}
                          </button>
                        </div>
                      </Field>
                    </>
                  )}
                </div>
              </div>
            </section>
            {error && <p className="portal-login__erro">{error}</p>}
            {otpInfo && emailConfirmado && <p className="portal-login__info">{otpInfo}</p>}
            <div className="cadastro-publico__nav">
              <button type="button" className="cadastro-btn cadastro-btn--ghost" onClick={() => setStep(3)}>
                Voltar
              </button>
              <button
                type="submit"
                className="portal-login__submit"
                disabled={loading || !emailConfirmado}
              >
                {loading ? 'Enviando…' : 'Enviar cadastro'}
              </button>
            </div>
          </form>
        )}

        {step === 'ok' && (
          <div className="cadastro-publico__ok">
            <p className="portal-login__ok">{info}</p>
            <p className="portal-login__hint">
              Cadastro enviado. Aguarde aprovação para acessar o sistema.
            </p>
            <Link to="/login" className="portal-login__submit" style={{ display: 'block', textAlign: 'center', textDecoration: 'none' }}>
              Ir para o login
            </Link>
          </div>
        )}

        {step !== 'ok' && (
          <div className="portal-login__links">
            <Link to="/login" className="portal-login__link">
              Já tenho conta — entrar
            </Link>
          </div>
        )}
      </div>
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
