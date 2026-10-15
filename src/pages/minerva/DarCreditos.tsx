import { useEffect, useState } from 'react'
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
  { id: 'todos', label: 'Mostrar todos', host: 'calculadora, frota e logística' },
  { id: 'calculadora', label: 'Calculadora de rota', host: 'ofertadecarga.com.br' },
  { id: 'frota', label: 'Mapa da Frota', host: 'mapadafrota.com.br' },
  { id: 'logistica', label: 'Mapa da Logística', host: 'mapadalogistica.com.br' },
] as const

type SiteId = (typeof SITES)[number]['id']

function rotuloSite(id: string) {
  if (id === 'calculadora') return 'Calculadora'
  if (id === 'frota') return 'Mapa da Frota'
  if (id === 'logistica') return 'Mapa da Logística'
  return 'Sem site'
}

function cpfNaLista(digitos: string) {
  const d = digitos.replace(/\D/g, '')
  if (d.length !== 11) return ''
  return formatarCpf(d)
}

export function DarCreditosPage() {
  const { user } = useData()
  const [site, setSite] = useState<SiteId>('calculadora')
  const [busca, setBusca] = useState('')
  const [buscaAplicada, setBuscaAplicada] = useState('')
  const [contas, setContas] = useState<ContaCreditoPublica[]>([])
  const [selecionada, setSelecionada] = useState<ContaCreditoPublica | null>(null)
  const [creditos, setCreditos] = useState(10)
  const [carregando, setCarregando] = useState(false)
  const [enviando, setEnviando] = useState(false)
  const [erro, setErro] = useState('')
  const [ok, setOk] = useState('')

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
      setErro(
        r.erro === 'somente_super'
          ? 'Só um Super Usuário pode dar créditos.'
          : r.erro || 'Não foi possível listar as contas.',
      )
      return
    }
    setContas(r.contas)
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
    setOk('')
    const r = await darCreditosContaPublica({
      userId: selecionada.id,
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
    const avisoEmail = r.emailEnviado
      ? 'O e-mail de parabéns foi enviado.'
      : 'Os créditos entraram, mas o e-mail não saiu agora.'
    setOk(
      `${n} crédito${n === 1 ? '' : 's'} para ${selecionada.email}. Saldo agora: ${r.saldo ?? '—'}. ${avisoEmail} Na próxima vez que ela abrir o site, o aviso aparece no meio da tela.`,
    )
    setCreditos(10)
    void carregar(site, buscaAplicada)
  }

  const siteAtual = SITES.find((s) => s.id === site) ?? SITES[1]
  const mostrandoTodos = site === 'todos'

  return (
    <div className="cadastro-page">
      <h1 className="cadastro-page-title">Dar créditos</h1>
      <p className="financeiro-pix__sub">
        Escolha o site para ver só quem criou a conta nele. Em Mostrar todos entram todas as
        contas, inclusive as antigas sem site marcado. O CPF vem do cadastro. O saldo é o mesmo
        na calculadora e nos mapas.
      </p>

      <section className="form-card dar-creditos" style={{ marginTop: 16 }}>
        <div className="form-card__body" style={{ display: 'grid', gap: 14 }}>
          <div className="dar-creditos__filtros">
            <label className="financeiro-pix__label">
              Site
              <select value={site} onChange={(e) => setSite(e.target.value as SiteId)}>
                {SITES.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.label} — {s.host}
                  </option>
                ))}
              </select>
            </label>

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
              : `${contas.length} pessoa${contas.length === 1 ? '' : 's'} · ${siteAtual.label}`}
          </p>

          {contas.length === 0 && !carregando ? (
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
                {contas.map((c) => {
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
          {ok ? <p className="financeiro-presente__ok">{ok}</p> : null}
        </div>
      </section>
    </div>
  )
}
