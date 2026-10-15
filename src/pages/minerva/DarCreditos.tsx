import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { Navigate } from 'react-router-dom'
import { useData } from '../../context/DataContext'
import {
  darCreditosContaPublica,
  listarContasCreditoPublico,
  type ContaCreditoPublica,
} from '../../lib/rotaPublicoPresente'
import { formatarCpf } from '../../lib/cpfCnpj'
import { ehSuperDiegoOuElder } from '../../lib/superUsers'
import '../../styles/cadastro.css'

const SITES = [
  { id: 'calculadora', label: 'Calculadora', host: 'custodarota.com.br' },
  { id: 'frota', label: 'Mapa da Frota', host: 'mapadafrota.com.br' },
  { id: 'logistica', label: 'Mapa da Logística', host: 'mapadalogistica.com.br' },
  { id: 'todos', label: 'Mostrar todos', host: 'todas as contas' },
] as const

type SiteId = (typeof SITES)[number]['id']

function rotuloSite(id: string) {
  if (id === 'calculadora') return 'Calculadora'
  if (id === 'frota') return 'Mapa da Frota'
  if (id === 'logistica') return 'Mapa da Logística'
  return 'Sem site'
}

function cpfNaLista(digitos: string) {
  const d = String(digitos || '').replace(/\D/g, '')
  if (d.length !== 11) return ''
  return formatarCpf(d)
}

function siteDaConta(id: string) {
  if (id === 'render') return 'calculadora'
  return id
}

type AvisoEnvio = {
  nome: string
  email: string
  creditos: number
  saldo: number | null
  emailEnviado: boolean
}

function AvisoCreditoEnviado({ aviso, onClose }: { aviso: AvisoEnvio; onClose: () => void }) {
  const n = aviso.creditos
  const label = `${n} crédito${n === 1 ? '' : 's'}`

  useEffect(() => {
    function noTeclado(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', noTeclado)
    return () => window.removeEventListener('keydown', noTeclado)
  }, [onClose])

  return createPortal(
    <div className="dar-creditos-modal" role="presentation" onClick={onClose}>
      <div
        className="dar-creditos-modal__card"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="dar-creditos-aviso-titulo"
        onClick={(e) => e.stopPropagation()}
      >
        <p className="dar-creditos-modal__kicker">Créditos enviados</p>
        <h2 id="dar-creditos-aviso-titulo">Pronto</h2>
        <p>
          <strong>{aviso.nome}</strong> acabou de receber <strong>{label}</strong>.
        </p>
        <p className="dar-creditos-modal__detalhe">{aviso.email}</p>
        <p className="dar-creditos-modal__detalhe">
          Saldo agora: {aviso.saldo ?? '—'} crédito{aviso.saldo === 1 ? '' : 's'}.
        </p>
        <p className="dar-creditos-modal__detalhe">
          {aviso.emailEnviado
            ? 'O e-mail de parabéns foi enviado. No site, a mensagem abre no meio da tela.'
            : 'Os créditos entraram. O e-mail não saiu agora. No site, a mensagem ainda abre no meio da tela.'}
        </p>
        <button type="button" className="cadastro-btn cadastro-btn--primary" onClick={onClose}>
          Fechar
        </button>
      </div>
    </div>,
    document.body,
  )
}

export function DarCreditosPage() {
  const { user } = useData()
  const [site, setSite] = useState<SiteId>('calculadora')
  const [busca, setBusca] = useState('')
  const [buscaAplicada, setBuscaAplicada] = useState('')
  const [contas, setContas] = useState<ContaCreditoPublica[]>([])
  const [semSite, setSemSite] = useState(0)
  const [selecionada, setSelecionada] = useState<ContaCreditoPublica | null>(null)
  const [creditos, setCreditos] = useState(10)
  const [carregando, setCarregando] = useState(false)
  const [enviando, setEnviando] = useState(false)
  const [erro, setErro] = useState('')
  const [aviso, setAviso] = useState<AvisoEnvio | null>(null)

  const adminEmail = user?.email || ''
  const adminUsuario = user?.usuario || ''

  async function carregar(siteId: SiteId, termo: string) {
    setCarregando(true)
    setErro('')
    const r = await listarContasCreditoPublico({
      site: siteId,
      busca: termo.trim(),
      adminEmail,
      adminUsuario,
    })
    setCarregando(false)
    if (!r.ok) {
      setContas([])
      setSemSite(0)
      setErro(
        r.erro === 'somente_super'
          ? 'Só um Super Usuário pode dar créditos.'
          : r.erro || 'Não foi possível listar as contas.',
      )
      return
    }
    setContas(r.contas)
    setSemSite(r.semSite)
    setSelecionada((atual) => r.contas.find((c) => c.id === atual?.id) || null)
  }

  useEffect(() => {
    void carregar(site, buscaAplicada)
    // Recarrega ao trocar o site ou a pesquisa confirmada.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [site, buscaAplicada, adminEmail, adminUsuario])

  if (!ehSuperDiegoOuElder(user)) {
    return <Navigate to="/embarcador" replace />
  }

  async function dar() {
    if (!selecionada) {
      setErro('Selecione uma pessoa da lista.')
      return
    }
    const n = Math.floor(Number(creditos))
    if (!Number.isFinite(n) || n < 1 || n > 10000) {
      setErro('Informe de 1 a 10.000 créditos.')
      return
    }
    setEnviando(true)
    setErro('')
    const pessoa = selecionada
    const r = await darCreditosContaPublica({
      userId: pessoa.id,
      creditos: n,
      adminEmail,
      adminUsuario,
    })
    setEnviando(false)
    if (!r.ok) {
      setErro(
        r.erro === 'somente_super'
          ? 'Só um Super Usuário pode dar créditos.'
          : r.erro || 'Não foi possível dar os créditos.',
      )
      return
    }
    setAviso({
      nome: pessoa.nome,
      email: pessoa.email,
      creditos: n,
      saldo: r.saldo ?? null,
      emailEnviado: Boolean(r.emailEnviado),
    })
    setCreditos(10)
    void carregar(site, buscaAplicada)
  }

  const siteAtual = SITES.find((s) => s.id === site) ?? SITES[0]
  const mostrandoTodos = site === 'todos'
  const lista = mostrandoTodos
    ? contas
    : contas.filter((c) => siteDaConta(c.site) === site)
  const antigas =
    mostrandoTodos ? 0 : semSite || contas.filter((c) => !siteDaConta(c.site)).length

  return (
    <div className="cadastro-page">
      <h1 className="cadastro-page-title">Dar créditos</h1>
      <p className="financeiro-pix__sub">
        Escolha a página para ver só quem criou a conta nela. Mostrar todos junta calculadora,
        mapas e as contas antigas que ainda não têm site. O CPF é obrigatório no cadastro novo.
        Conta antiga mostra “Não informado” até a pessoa abrir o site e salvar o CPF.
      </p>

      <section className="form-card dar-creditos" style={{ marginTop: 16 }}>
        <div className="form-card__body" style={{ display: 'grid', gap: 14 }}>
          <div className="dar-creditos__sites" role="tablist" aria-label="Página">
            {SITES.map((s) => (
              <button
                key={s.id}
                type="button"
                role="tab"
                aria-selected={site === s.id}
                className={site === s.id ? 'is-on' : ''}
                onClick={() => setSite(s.id)}
              >
                <strong>{s.label}</strong>
                <span>{s.host}</span>
              </button>
            ))}
          </div>

          <div className="dar-creditos__filtros">
            <form
              className="dar-creditos__busca"
              onSubmit={(e) => {
                e.preventDefault()
                setBuscaAplicada(busca.trim())
              }}
            >
              <label className="financeiro-pix__label">
                Pesquisar por nome, e-mail ou CPF
                <input
                  value={busca}
                  onChange={(e) => setBusca(e.target.value)}
                  placeholder="Nome, e-mail ou CPF"
                  autoComplete="off"
                />
              </label>
              <button type="submit" className="cadastro-btn cadastro-btn--ghost" disabled={carregando}>
                {carregando ? 'Buscando…' : 'Pesquisar'}
              </button>
            </form>
          </div>

          <p className="dar-creditos__resumo">
            {carregando
              ? 'Carregando contas…'
              : `${lista.length} pessoa${lista.length === 1 ? '' : 's'} · ${siteAtual.label}`}
          </p>

          {!carregando && antigas > 0 ? (
            <p className="dar-creditos__antigas">
              {antigas} conta{antigas === 1 ? '' : 's'} antiga{antigas === 1 ? '' : 's'} ainda sem a
              página marcada. Elas ficam em Mostrar todos. Quando a pessoa abrir o site, entra na
              lista dessa página.
              <button type="button" onClick={() => setSite('todos')}>
                Mostrar todos
              </button>
            </p>
          ) : null}

          {lista.length === 0 && !carregando ? (
            <p className="financeiro-pix__vazio">
              {mostrandoTodos
                ? 'Nenhuma conta com esse filtro.'
                : `Nenhuma conta da ${siteAtual.label}. Use Mostrar todos para ver as outras.`}
            </p>
          ) : (
            <div className={`dar-creditos__tabela${mostrandoTodos ? ' is-todos' : ''}`}>
              <div className="dar-creditos__head" aria-hidden>
                <span>Nome</span>
                <span>E-mail</span>
                <span>CPF</span>
                {mostrandoTodos ? <span>Site</span> : null}
                <span>Créditos</span>
              </div>
              <ul className="dar-creditos__lista">
                {lista.map((c) => {
                  const cpf = cpfNaLista(c.cpf)
                  return (
                    <li key={c.id}>
                      <button
                        type="button"
                        className={selecionada?.id === c.id ? 'is-on' : ''}
                        onClick={() => setSelecionada(c)}
                      >
                        <strong>{c.nome}</strong>
                        <span>{c.email}</span>
                        <span className={cpf ? '' : 'is-vazio'}>{cpf || 'Não informado'}</span>
                        {mostrandoTodos ? <span>{rotuloSite(c.site)}</span> : null}
                        <em>
                          {c.saldo} crédito{c.saldo === 1 ? '' : 's'}
                        </em>
                      </button>
                    </li>
                  )
                })}
              </ul>
            </div>
          )}

          <div className="dar-creditos__acao">
            <p>
              {selecionada ? (
                <>
                  Créditos para <strong>{selecionada.nome}</strong>
                  <span>
                    {selecionada.email}
                    {cpfNaLista(selecionada.cpf) ? ` · ${cpfNaLista(selecionada.cpf)}` : ' · CPF não informado'}
                  </span>
                </>
              ) : (
                'Selecione uma pessoa da lista.'
              )}
            </p>
            <label className="financeiro-pix__label">
              Créditos para adicionar
              <input
                type="number"
                min={1}
                max={10000}
                value={creditos}
                onChange={(e) => setCreditos(Number(e.target.value))}
              />
            </label>
            <button
              type="button"
              className="cadastro-btn cadastro-btn--primary"
              disabled={enviando || !selecionada}
              onClick={() => void dar()}
            >
              {enviando
                ? 'Salvando…'
                : `Dar ${Math.max(1, Math.floor(Number(creditos) || 0))} créditos`}
            </button>
          </div>
          {erro ? <p className="financeiro-pix__erro">{erro}</p> : null}
        </div>
      </section>
      {aviso ? <AvisoCreditoEnviado aviso={aviso} onClose={() => setAviso(null)} /> : null}
    </div>
  )
}
