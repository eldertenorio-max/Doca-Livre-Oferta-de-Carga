import { useEffect, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { useData } from '../../context/DataContext'
import {
  darCreditosContaPublica,
  listarContasCreditoPublico,
  type ContaCreditoPublica,
} from '../../lib/rotaPublicoPresente'
import { ehSuperDiegoOuElder } from '../../lib/superUsers'
import '../../styles/cadastro.css'

const SITES = [
  { id: 'calculadora', label: 'Calculadora de rota', host: 'ofertadecarga.com.br' },
  { id: 'frota', label: 'Mapa da Frota', host: 'mapadafrota.com.br' },
  { id: 'logistica', label: 'Mapa da Logística', host: 'mapadalogistica.com.br' },
  { id: 'render', label: 'Oferta de Carga', host: 'no Render' },
] as const

type SiteId = (typeof SITES)[number]['id']

function formatarCpf(digitos: string) {
  const d = digitos.replace(/\D/g, '').slice(0, 11)
  if (d.length !== 11) return d || '—'
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`
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
          ? 'Só Diego e Elder podem dar créditos.'
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
          ? 'Só Diego e Elder podem dar créditos.'
          : r.erro || 'Não foi possível dar os créditos.',
      )
      return
    }
    setOk(
      `${n} crédito${n === 1 ? '' : 's'} para ${selecionada.email}. Saldo agora: ${r.saldo ?? '—'}.`,
    )
    setCreditos(10)
    void carregar(site, buscaAplicada)
  }

  return (
    <div className="cadastro-page">
      <h1 className="cadastro-page-title">Dar créditos</h1>
      <p className="financeiro-pix__sub">
        Escolha o site, ache a conta na lista ou pesquise por e-mail ou CPF, e informe quantos
        créditos ela recebe. O saldo é o mesmo da calculadora e dos mapas. Contas antigas, sem o
        site marcado, aparecem em todas as listas. A busca por CPF acha quem informou o CPF no
        cadastro.
      </p>

      <section className="form-card dar-creditos" style={{ marginTop: 16 }}>
        <div className="form-card__body" style={{ display: 'grid', gap: 14 }}>
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
            className="financeiro-pix__row"
            onSubmit={(e) => {
              e.preventDefault()
              setBuscaAplicada(busca.trim())
            }}
          >
            <label className="financeiro-pix__label" style={{ flex: 1 }}>
              Pesquisar por e-mail ou CPF
              <input
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                placeholder="pessoa@email.com ou CPF"
                autoComplete="off"
              />
            </label>
            <button type="submit" className="cadastro-btn cadastro-btn--ghost" disabled={carregando}>
              {carregando ? 'Buscando…' : 'Pesquisar'}
            </button>
          </form>

          {contas.length === 0 && !carregando ? (
            <p className="financeiro-pix__vazio">Nenhuma conta neste site com esse filtro.</p>
          ) : (
            <ul className="dar-creditos__lista">
              {contas.map((c) => (
                <li key={c.id}>
                  <button
                    type="button"
                    className={selecionada?.id === c.id ? 'is-on' : ''}
                    onClick={() => setSelecionada(c)}
                  >
                    <strong>{c.nome}</strong>
                    <span>{c.email}</span>
                    <span>CPF {formatarCpf(c.cpf)}</span>
                    <em>{c.saldo} crédito{c.saldo === 1 ? '' : 's'}</em>
                  </button>
                </li>
              ))}
            </ul>
          )}

          <label className="financeiro-pix__label" style={{ maxWidth: 220 }}>
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
          {erro ? <p className="financeiro-pix__erro">{erro}</p> : null}
          {ok ? <p className="financeiro-presente__ok">{ok}</p> : null}
        </div>
      </section>
    </div>
  )
}
