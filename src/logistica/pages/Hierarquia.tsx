import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Building2, GitBranch, Search, Truck, Users, Warehouse } from 'lucide-react'
import { useAuth } from '../lib/AuthContext'
import { categoriaPorId } from '../lib/categorias'
import {
  PAPEIS_HIERARQUIA,
  SUPER_HIERARQUIA,
  contarHierarquia,
  labelPapelHierarquia,
  papelHierarquiaDaEmpresa,
} from '../lib/orgHierarchy'
import type { PapelHierarquia } from '../types'
import '../styles/hierarquia.css'

const ICONES: Record<PapelHierarquia, typeof Building2> = {
  operador_logistico: Warehouse,
  filial_operador: GitBranch,
  embarcador: Building2,
  unidade: Users,
  transportadora: Truck,
}

export function HierarquiaPage() {
  const navigate = useNavigate()
  const { empresas } = useAuth()
  const stats = useMemo(() => contarHierarquia(empresas), [empresas])
  const [papelAtivo, setPapelAtivo] = useState<PapelHierarquia | 'todos'>('todos')
  const [busca, setBusca] = useState('')

  const lista = useMemo(() => {
    const base =
      papelAtivo === 'todos'
        ? empresas
        : stats.totais.find((t) => t.id === papelAtivo)?.empresas ?? []
    const q = busca.trim().toLowerCase()
    const filtrada = q
      ? base.filter((e) => {
          const papel = labelPapelHierarquia(papelHierarquiaDaEmpresa(e)).toLowerCase()
          return (
            e.nome_fantasia.toLowerCase().includes(q) ||
            e.razao_social.toLowerCase().includes(q) ||
            e.cidade.toLowerCase().includes(q) ||
            e.uf.toLowerCase().includes(q) ||
            papel.includes(q)
          )
        })
      : base
    return [...filtrada].sort((a, b) => a.nome_fantasia.localeCompare(b.nome_fantasia, 'pt-BR'))
  }, [busca, empresas, papelAtivo, stats.totais])

  const destaques = [
    { ...stats.operadores, kpi: 'Operadores logísticos cadastrados' },
    { ...stats.transportadores, kpi: 'Transportadores cadastrados' },
    { ...stats.embarcadores, kpi: 'Embarcadores cadastrados' },
  ]

  return (
    <div className="hierarquia animate-fade-up">
      <header className="hierarquia__hero">
        <div>
          <p className="hierarquia__kicker">Doca Livre · Hierarquia</p>
          <h1>Hierarquia do mapa</h1>
          <p>
            Mesmas opções do Oferta de Carga: operador logístico, filial, embarcador, unidade e
            transportador. Superusuários Diego e Elder ficam acima de toda a árvore.
          </p>
        </div>
      </header>

      <section className="hierarquia__supers" aria-label="Superusuários">
        {SUPER_HIERARQUIA.map((s) => (
          <div key={s.nome} className="hierarquia__super">
            <span className="hierarquia__super-badge">Super</span>
            <strong>{s.nome}</strong>
            <span>Acesso total · acima da árvore</span>
          </div>
        ))}
      </section>

      <section className="hierarquia__kpis" aria-label="Totais da hierarquia">
        {destaques.map((bloco) => {
          const Icon = ICONES[bloco.id]
          return (
            <button
              key={bloco.id}
              type="button"
              className={`hierarquia__kpi${papelAtivo === bloco.id ? ' is-on' : ''}`}
              style={{ ['--kpi-cor' as string]: bloco.cor }}
              onClick={() => setPapelAtivo((atual) => (atual === bloco.id ? 'todos' : bloco.id))}
            >
              <span className="hierarquia__kpi-icon" style={{ background: bloco.corFundo, color: bloco.cor }}>
                <Icon size={18} strokeWidth={2.2} />
              </span>
              <span className="hierarquia__kpi-rotulo">{bloco.kpi}</span>
              <strong>{bloco.qtd}</strong>
              <span className="hierarquia__kpi-detalhe">
                {stats.total ? Math.round((bloco.qtd / stats.total) * 100) : 0}% do mapa
              </span>
            </button>
          )
        })}
      </section>

      <section className="hierarquia__secundarios">
        {stats.totais
          .filter((t) => t.id === 'filial_operador' || t.id === 'unidade')
          .map((bloco) => {
            const Icon = ICONES[bloco.id]
            return (
              <button
                key={bloco.id}
                type="button"
                className={`hierarquia__mini${papelAtivo === bloco.id ? ' is-on' : ''}`}
                onClick={() => setPapelAtivo((atual) => (atual === bloco.id ? 'todos' : bloco.id))}
              >
                <Icon size={16} strokeWidth={2.2} color={bloco.cor} />
                <span>{bloco.label}</span>
                <strong>{bloco.qtd}</strong>
              </button>
            )
          })}
        <p className="hierarquia__cadeia">
          Super → Operador logístico → Embarcador → Unidade → Transportador
        </p>
      </section>

      <section className="hierarquia__painel">
        <div className="hierarquia__filtros">
          <label className="hierarquia__busca">
            <Search size={16} strokeWidth={2.2} />
            <input
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar empresa, cidade ou papel"
            />
          </label>
          <div className="hierarquia__chips">
            <button
              type="button"
              className={`hierarquia__chip${papelAtivo === 'todos' ? ' is-on' : ''}`}
              onClick={() => setPapelAtivo('todos')}
            >
              Todos · {stats.total}
            </button>
            {PAPEIS_HIERARQUIA.map((p) => {
              const qtd = stats.totais.find((t) => t.id === p.id)?.qtd ?? 0
              return (
                <button
                  key={p.id}
                  type="button"
                  className={`hierarquia__chip${papelAtivo === p.id ? ' is-on' : ''}`}
                  style={papelAtivo === p.id ? { borderColor: p.cor, color: p.cor } : undefined}
                  onClick={() => setPapelAtivo(p.id)}
                >
                  {p.label} · {qtd}
                </button>
              )
            })}
          </div>
        </div>

        <p className="hierarquia__meta">
          {lista.length} {lista.length === 1 ? 'empresa' : 'empresas'}
          {papelAtivo !== 'todos' ? ` · ${labelPapelHierarquia(papelAtivo)}` : ''}
        </p>

        {lista.length === 0 ? (
          <p className="hierarquia__vazio">Nenhuma empresa neste papel.</p>
        ) : (
          <ul className="hierarquia__lista">
            {lista.map((e) => {
              const papel = papelHierarquiaDaEmpresa(e)
              const meta = PAPEIS_HIERARQUIA.find((p) => p.id === papel)!
              const cat = categoriaPorId(e.categoria)
              return (
                <li key={e.id}>
                  <button
                    type="button"
                    className="hierarquia__card"
                    style={{ borderLeftColor: meta.cor }}
                    onClick={() => navigate(`/embarcador/mapa-logistica/empresa/${e.slug}?from=hierarquia`)}
                  >
                    <span className="hierarquia__card-main">
                      <strong>{e.nome_fantasia}</strong>
                      <span>
                        {e.cidade}/{e.uf} · {cat.label}
                      </span>
                    </span>
                    <span className="hierarquia__badge" style={{ background: meta.corFundo, color: meta.cor }}>
                      {meta.label}
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </section>
    </div>
  )
}
