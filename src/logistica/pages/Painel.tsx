import { useMemo, type CSSProperties, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Building2,
  Globe2,
  Link2,
  MapPinned,
  Phone,
  ShieldCheck,
  Truck,
  Warehouse,
} from 'lucide-react'
import { useAuth } from '../lib/AuthContext'
import { montarPainel, pct } from '../lib/painelStats'
import { DonutChart } from '../components/painel/DonutChart'
import { BarList } from '../components/painel/BarList'
import { ColumnChart } from '../components/painel/ColumnChart'
import '../styles/painel.css'

export function PainelPage() {
  const navigate = useNavigate()
  const { empresas } = useAuth()
  const stats = useMemo(() => montarPainel(empresas), [empresas])

  const donutCat = stats.porCat
    .filter((c) => c.qtd > 0)
    .map((c) => ({ id: c.id, label: c.label, qtd: c.qtd, cor: c.cor }))

  const donutOrigem = stats.porOrigem
    .filter((o) => o.qtd > 0)
    .map((o) => ({ id: o.id, label: o.label, qtd: o.qtd, cor: o.cor }))

  const totalNivel = stats.porNivel.reduce((s, n) => s + n.qtd, 0) + stats.semNivel

  return (
    <div className="painel animate-fade-up">
      <header className="painel__hero">
        <div>
          <p className="painel__kicker">Doca Livre · Mapa da Logística</p>
          <h1>Painel do mapa</h1>
          <p>
            Leitura do cadastro atual: quem está no mapa, por categoria, estado e nível de integração.
          </p>
        </div>
        <button type="button" className="painel__cta" onClick={() => navigate('/embarcador/mapa-logistica')}>
          Abrir o mapa
        </button>
      </header>

      <section className="painel__kpis">
        <Kpi
          rotulo="Empresas no mapa"
          valor={stats.total}
          detalhe="Cadastro local com dados públicos"
          cor="#f9db00"
          icon={<Building2 size={18} strokeWidth={2.2} />}
        />
        <Kpi
          rotulo="Transportadoras"
          valor={stats.transportadoras}
          detalhe={`${pct(stats.transportadoras, stats.total)}% do mapa`}
          cor="#1d4ed8"
          icon={<Truck size={18} strokeWidth={2.2} />}
          onClick={() => navigate('/embarcador/mapa-logistica?cat=transportadoras')}
        />
        <Kpi
          rotulo="Operadores logísticos"
          valor={stats.operadores}
          detalhe={`${pct(stats.operadores, stats.total)}% do mapa`}
          cor="#7c3aed"
          icon={<Warehouse size={18} strokeWidth={2.2} />}
          onClick={() => navigate('/embarcador/mapa-logistica?cat=operadores_logisticos')}
        />
        <Kpi
          rotulo="Estados e cidades"
          valor={stats.ufs}
          detalhe={`${stats.cidades} cidades · ${stats.ufs} UFs`}
          cor="#0f172a"
          icon={<MapPinned size={18} strokeWidth={2.2} />}
        />
      </section>

      <section className="painel__grid painel__grid--topo">
        <article className="dash-card dash-card--destaque">
          <header className="dash-card__head">
            <div>
              <span className="dash-tag">Mix</span>
              <h2>Empresas por categoria</h2>
              <p>Clique numa fatia ou na barra para filtrar o mapa.</p>
            </div>
          </header>
          <DonutChart
            series={donutCat}
            centro="empresas"
            onSelect={(id) => navigate(`/embarcador/mapa-logistica?cat=${id}`)}
          />
        </article>

        <article className="dash-card">
          <header className="dash-card__head">
            <div>
              <span className="dash-tag dash-tag--dark">Ranking</span>
              <h2>Volume por categoria</h2>
              <p>Quantas empresas cada tipo reúne no cadastro.</p>
            </div>
          </header>
          <BarList
            max={stats.maxCat}
            onSelect={(id) => navigate(`/embarcador/mapa-logistica?cat=${id}`)}
            items={stats.porCat.map((c) => ({
              id: c.id,
              label: c.label,
              qtd: c.qtd,
              cor: c.cor,
              emoji: c.emoji,
            }))}
          />
        </article>
      </section>

      <section className="painel__grid painel__grid--meio">
        <article className="dash-card">
          <header className="dash-card__head">
            <div>
              <span className="dash-tag">Geografia</span>
              <h2>Presença por estado</h2>
              <p>Onde as sedes cadastradas estão no Brasil.</p>
            </div>
            <strong className="dash-card__destaque">
              {stats.ufs}
              <span>UFs</span>
            </strong>
          </header>
          <ColumnChart
            max={stats.maxUf}
            items={stats.porUf.map((u) => ({ id: u.uf, label: u.uf, qtd: u.qtd }))}
          />
        </article>

        <article className="dash-card">
          <header className="dash-card__head">
            <div>
              <span className="dash-tag dash-tag--blue">Origem</span>
              <h2>De onde veio o cadastro</h2>
              <p>Fontes públicas, Oferta de Carga e exemplos locais.</p>
            </div>
          </header>
          <DonutChart series={donutOrigem} centro="origens" />
        </article>
      </section>

      <section className="painel__grid painel__grid--baixo">
        <article className="dash-card">
          <header className="dash-card__head">
            <div>
              <span className="dash-tag dash-tag--violet">Integração</span>
              <h2>Nível de integração</h2>
              <p>Como a operação da empresa se posiciona na cadeia.</p>
            </div>
          </header>
          <div className="dash-stack" aria-hidden>
            {stats.porNivel.map((n) => (
              <span
                key={n.id}
                className="dash-stack__seg"
                style={{
                  flexGrow: n.qtd || 0.15,
                  background: n.cor,
                  opacity: n.qtd ? 1 : 0.25,
                }}
                title={`${n.label}: ${n.qtd}`}
              />
            ))}
          </div>
          <ol className="dash-niveis">
            {stats.porNivel.map((n) => (
              <li key={n.id}>
                <span className="dash-swatch" style={{ background: n.cor }} />
                <div>
                  <strong>
                    {n.ordem}. {n.label}
                  </strong>
                  <p>{n.resumo}</p>
                </div>
                <b>
                  {n.qtd}
                  <em>{pct(n.qtd, totalNivel)}%</em>
                </b>
              </li>
            ))}
            {stats.semNivel > 0 ? (
              <li>
                <span className="dash-swatch" style={{ background: '#cbd5e1' }} />
                <div>
                  <strong>Sem classificação</strong>
                  <p>Empresa no mapa ainda sem nível de integração informado.</p>
                </div>
                <b>
                  {stats.semNivel}
                  <em>{pct(stats.semNivel, totalNivel)}%</em>
                </b>
              </li>
            ) : null}
          </ol>
        </article>

        <article className="dash-card">
          <header className="dash-card__head">
            <div>
              <span className="dash-tag">Região</span>
              <h2>Cobertura por região</h2>
              <p>Quantas empresas e quantos estados de cada macrorregião.</p>
            </div>
          </header>
          <ul className="dash-regioes">
            {stats.porRegiao.map((r) => (
              <li key={r.id}>
                <div className="dash-regioes__top">
                  <strong>{r.label}</strong>
                  <span>
                    {r.qtd} empresas · {r.ufsPresentes}/{r.ufs.length} UFs
                  </span>
                </div>
                <div className="dash-bars__track">
                  <span
                    className="dash-bars__fill dash-bars__fill--yellow"
                    style={{ width: `${Math.max(6, pct(r.qtd, stats.total))}%` }}
                  />
                </div>
              </li>
            ))}
          </ul>
        </article>
      </section>

      <section className="painel__grid painel__grid--rodape">
        <article className="dash-card">
          <header className="dash-card__head">
            <div>
              <span className="dash-tag dash-tag--dark">Cidades</span>
              <h2>Maiores concentrações</h2>
              <p>Cidades com mais sedes no cadastro.</p>
            </div>
          </header>
          <BarList
            max={stats.maxCidade}
            items={stats.porCidade.map((c) => ({
              id: c.label,
              label: c.label,
              qtd: c.qtd,
              cor: '#0f172a',
            }))}
          />
        </article>

        <article className="dash-card">
          <header className="dash-card__head">
            <div>
              <span className="dash-tag">Qualidade</span>
              <h2>Completude do cadastro</h2>
              <p>Quantas empresas já têm dados de contato e classificação.</p>
            </div>
          </header>
          <ul className="dash-qualidade">
            <Qualidade
              icon={<ShieldCheck size={18} />}
              label="Com CNPJ"
              qtd={stats.comCnpj}
              total={stats.total}
            />
            <Qualidade
              icon={<Globe2 size={18} />}
              label="Com site"
              qtd={stats.comSite}
              total={stats.total}
            />
            <Qualidade
              icon={<Phone size={18} />}
              label="Com telefone"
              qtd={stats.comTelefone}
              total={stats.total}
            />
            <Qualidade
              icon={<Link2 size={18} />}
              label="Com nível de integração"
              qtd={stats.comNivel}
              total={stats.total}
            />
          </ul>
        </article>
      </section>
    </div>
  )
}

function Kpi({
  rotulo,
  valor,
  detalhe,
  cor,
  icon,
  onClick,
}: {
  rotulo: string
  valor: number
  detalhe: string
  cor: string
  icon: ReactNode
  onClick?: () => void
}) {
  const estilo = { '--kpi-accent': cor } as CSSProperties
  if (onClick) {
    return (
      <button type="button" className="kpi kpi--btn" style={estilo} onClick={onClick}>
        <span className="kpi__icon" aria-hidden>
          {icon}
        </span>
        <span className="kpi__rotulo">{rotulo}</span>
        <strong>{valor}</strong>
        <em>{detalhe}</em>
      </button>
    )
  }
  return (
    <article className="kpi" style={estilo}>
      <span className="kpi__icon" aria-hidden>
        {icon}
      </span>
      <span className="kpi__rotulo">{rotulo}</span>
      <strong>{valor}</strong>
      <em>{detalhe}</em>
    </article>
  )
}

function Qualidade({
  icon,
  label,
  qtd,
  total,
}: {
  icon: ReactNode
  label: string
  qtd: number
  total: number
}) {
  const p = pct(qtd, total)
  return (
    <li>
      <span className="dash-qualidade__ico" aria-hidden>
        {icon}
      </span>
      <div className="dash-qualidade__body">
        <div className="dash-regioes__top">
          <strong>{label}</strong>
          <span>
            {qtd} · {p}%
          </span>
        </div>
        <div className="dash-bars__track">
          <span className="dash-bars__fill dash-bars__fill--yellow" style={{ width: `${Math.max(4, p)}%` }} />
        </div>
      </div>
    </li>
  )
}
