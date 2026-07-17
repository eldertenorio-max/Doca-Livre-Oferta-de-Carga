import { useMemo, useState, type FormEvent } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { useData } from '../context/DataContext'
import { LOGO_DOCA_LIVRE_SRC } from '../lib/brandAssets'
import { ProductMark } from '../components/ProductMark'
import { isSupabaseConfigured } from '../lib/supabase'
import {
  DOCUMENTOS_TRANSPORTADOR,
  fileToDataUrl,
  isAcceptedDocFile,
} from '../lib/transportadorDocs'
import type { TipoDocumentoTransportador } from '../types'
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

  const [docs, setDocs] = useState<DocState>({})
  const [acesso, setAcesso] = useState({
    usuario: '',
    email: '',
    senha: '',
    confirmarSenha: '',
    nome: '',
  })

  const docsOk = useMemo(() => {
    return DOCUMENTOS_TRANSPORTADOR.filter((d) => d.obrigatorio).every((d) => Boolean(docs[d.tipo]))
  }, [docs])

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
      setError('Preencha cidade e UF.')
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

  async function submit(e: FormEvent) {
    e.preventDefault()
    setError('')
    setInfo('')
    setLoading(true)
    const result = await registrarCadastroTransportador({
      empresa,
      acesso: {
        ...acesso,
        nome: acesso.nome.trim() || empresa.contato_nome.trim(),
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
                <div className="form-fields">
                  <Field label="Razão Social" required>
                    <input
                      value={empresa.razao_social}
                      onChange={(e) => setEmp('razao_social', e.target.value)}
                    />
                  </Field>
                  <Field label="Nome Fantasia" required>
                    <input
                      value={empresa.nome_fantasia}
                      onChange={(e) => setEmp('nome_fantasia', e.target.value)}
                    />
                  </Field>
                  <Field label="CNPJ" required>
                    <input
                      placeholder="00.000.000/0000-00"
                      value={empresa.cnpj}
                      onChange={(e) => setEmp('cnpj', e.target.value)}
                    />
                  </Field>
                  <Field label="RNTRC">
                    <input value={empresa.rntrc} onChange={(e) => setEmp('rntrc', e.target.value)} />
                  </Field>
                  <Field label="Inscrição Estadual">
                    <input
                      value={empresa.inscricao_estadual}
                      onChange={(e) => setEmp('inscricao_estadual', e.target.value)}
                    />
                  </Field>
                  <Field label="Inscrição Municipal">
                    <input
                      value={empresa.inscricao_municipal}
                      onChange={(e) => setEmp('inscricao_municipal', e.target.value)}
                    />
                  </Field>
                  <Field label="CEP">
                    <input value={empresa.cep} onChange={(e) => setEmp('cep', e.target.value)} />
                  </Field>
                  <Field label="Cidade" required>
                    <input
                      value={empresa.cidade}
                      onChange={(e) => setEmp('cidade', e.target.value)}
                    />
                  </Field>
                  <Field label="UF" required>
                    <select value={empresa.uf} onChange={(e) => setEmp('uf', e.target.value)}>
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
                    />
                  </Field>
                  <Field label="Número">
                    <input
                      value={empresa.numero}
                      onChange={(e) => setEmp('numero', e.target.value)}
                    />
                  </Field>
                  <Field label="Bairro">
                    <input
                      value={empresa.bairro}
                      onChange={(e) => setEmp('bairro', e.target.value)}
                    />
                  </Field>
                  <Field label="Complemento" className="form-field--span2">
                    <input
                      value={empresa.complemento}
                      onChange={(e) => setEmp('complemento', e.target.value)}
                    />
                  </Field>
                </div>
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
                    />
                  </Field>
                  <Field label="Telefone" required>
                    <input
                      value={empresa.telefone}
                      onChange={(e) => setEmp('telefone', e.target.value)}
                    />
                  </Field>
                  <Field label="Telefone do contato">
                    <input
                      value={empresa.contato_telefone}
                      onChange={(e) => setEmp('contato_telefone', e.target.value)}
                    />
                  </Field>
                  <Field label="E-mail da empresa">
                    <input
                      type="email"
                      value={empresa.email}
                      onChange={(e) => setEmp('email', e.target.value)}
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
                      placeholder={empresa.contato_nome || 'Seu nome'}
                    />
                  </Field>
                  <Field label="Usuário" required>
                    <input
                      value={acesso.usuario}
                      onChange={(e) => setAcc('usuario', e.target.value)}
                      autoComplete="username"
                    />
                  </Field>
                  <Field label="E-mail de login" required>
                    <input
                      type="email"
                      value={acesso.email}
                      onChange={(e) => setAcc('email', e.target.value)}
                      autoComplete="email"
                    />
                  </Field>
                  <Field label="Senha" required>
                    <input
                      type="password"
                      value={acesso.senha}
                      onChange={(e) => setAcc('senha', e.target.value)}
                      autoComplete="new-password"
                    />
                  </Field>
                  <Field label="Confirmar senha" required>
                    <input
                      type="password"
                      value={acesso.confirmarSenha}
                      onChange={(e) => setAcc('confirmarSenha', e.target.value)}
                      autoComplete="new-password"
                    />
                  </Field>
                </div>
              </div>
            </section>
            {error && <p className="portal-login__erro">{error}</p>}
            <div className="cadastro-publico__nav">
              <button type="button" className="cadastro-btn cadastro-btn--ghost" onClick={() => setStep(3)}>
                Voltar
              </button>
              <button type="submit" className="portal-login__submit" disabled={loading}>
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
