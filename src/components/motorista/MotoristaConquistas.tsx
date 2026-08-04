import { useMemo } from 'react'
import type { Carga, Motorista } from '../../types'
import {
  labelNivelMedalha,
  painelConquistasMotorista,
  type NivelMedalha,
} from '../../lib/motoristaConquistas'
import '../../styles/motorista-conquistas.css'

type Props = {
  motorista: Motorista
  cargas: Carga[]
  /** Compacto (lista) ou completo (modal/detalhe). */
  variant?: 'full' | 'compact' | 'badges'
  className?: string
}

function MedalhaVisual({ nivel, small }: { nivel: Exclude<NivelMedalha, null>; small?: boolean }) {
  return (
    <span
      className={`mot-medal mot-medal--${nivel}${small ? ' mot-medal--sm' : ''}`}
      title={labelNivelMedalha(nivel)}
      aria-label={`Medalha ${labelNivelMedalha(nivel)}`}
    >
      {nivel === 'ouro' ? '🥇' : nivel === 'prata' ? '🥈' : '🥉'}
    </span>
  )
}

/** Badges compactos para a tabela de motoristas. */
export function MotoristaMedalhasBadges({
  motorista,
  cargas,
  max = 4,
}: {
  motorista: Motorista
  cargas: Carga[]
  max?: number
}) {
  const painel = useMemo(() => painelConquistasMotorista(motorista, cargas), [motorista, cargas])
  if (painel.medalhas.length === 0) {
    return <span className="mot-badges__empty">—</span>
  }
  return (
    <span className="mot-badges" title={painel.resumo}>
      {painel.classificacaoGeral ? (
        <span className={`mot-classif mot-classif--${painel.classificacaoGeral}`}>
          {labelNivelMedalha(painel.classificacaoGeral)}
        </span>
      ) : null}
      {painel.medalhas.slice(0, max).map((m) => (
        <MedalhaVisual key={m.id} nivel={m.nivel} small />
      ))}
      {painel.medalhas.length > max ? (
        <span className="mot-badges__more">+{painel.medalhas.length - max}</span>
      ) : null}
    </span>
  )
}

export function MotoristaConquistasPanel({
  motorista,
  cargas,
  variant = 'full',
  className = '',
}: Props) {
  const painel = useMemo(() => painelConquistasMotorista(motorista, cargas), [motorista, cargas])

  if (variant === 'badges') {
    return (
      <div className={className}>
        <MotoristaMedalhasBadges motorista={motorista} cargas={cargas} />
      </div>
    )
  }

  if (variant === 'compact') {
    return (
      <div className={`mot-conq mot-conq--compact ${className}`.trim()}>
        <div className="mot-conq__compact-head">
          {painel.classificacaoGeral ? (
            <span className={`mot-classif mot-classif--${painel.classificacaoGeral}`}>
              Cliente {labelNivelMedalha(painel.classificacaoGeral)}
            </span>
          ) : (
            <span className="mot-classif mot-classif--none">Sem classificação</span>
          )}
          <span className="mot-conq__mini-stats">
            {painel.metricas.entregas} entrega(s) ·{' '}
            {painel.metricas.mediaAvaliacao > 0
              ? `${painel.metricas.mediaAvaliacao.toFixed(1).replace('.', ',')}★`
              : 'sem nota'}
          </span>
        </div>
        <div className="mot-conq__row-medals">
          {painel.medalhas.length === 0 ? (
            <span className="mot-badges__empty">Sem medalhas ainda</span>
          ) : (
            painel.medalhas.map((m) => (
              <span key={m.id} className="mot-conq__pill" title={m.titulo}>
                <MedalhaVisual nivel={m.nivel} small />
                <span>{m.titulo}</span>
              </span>
            ))
          )}
        </div>
      </div>
    )
  }

  return (
    <section className={`mot-conq ${className}`.trim()} aria-label="Conquistas do motorista">
      <header className="mot-conq__head">
        <div>
          <h3 className="mot-conq__title">🏅 Conquistas</h3>
          <p className="mot-conq__sub">{painel.resumo}</p>
        </div>
        {painel.classificacaoGeral ? (
          <span className={`mot-classif mot-classif--${painel.classificacaoGeral} mot-classif--lg`}>
            {labelNivelMedalha(painel.classificacaoGeral)}
          </span>
        ) : null}
      </header>

      <div className="mot-conq__stats">
        <div>
          <strong>{painel.metricas.entregas}</strong>
          <span>Entregas</span>
        </div>
        <div>
          <strong>
            {painel.metricas.mediaAvaliacao > 0
              ? painel.metricas.mediaAvaliacao.toFixed(1).replace('.', ',')
              : '—'}
          </strong>
          <span>Média ★</span>
        </div>
        <div>
          <strong>{painel.metricas.pontuais}</strong>
          <span>No prazo</span>
        </div>
        <div>
          <strong>
            {painel.metricas.faturamento > 0
              ? painel.metricas.faturamento.toLocaleString('pt-BR', {
                  style: 'currency',
                  currency: 'BRL',
                  maximumFractionDigits: 0,
                })
              : '—'}
          </strong>
          <span>Faturamento</span>
        </div>
      </div>

      <ul className="mot-conq__list">
        {painel.conquistas.map((c) => (
          <li
            key={c.def.id}
            className={`mot-conq__item${c.desbloqueada ? ' is-on' : ' is-off'}`}
          >
            <div className="mot-conq__item-top">
              <span className="mot-conq__ico" aria-hidden>
                {c.def.icone}
              </span>
              <div className="mot-conq__item-text">
                <strong>{c.def.titulo}</strong>
                <span>{c.def.descricao}</span>
              </div>
              {c.nivel ? (
                <MedalhaVisual nivel={c.nivel} />
              ) : (
                <span className="mot-medal mot-medal--locked" title="Bloqueada">
                  🔒
                </span>
              )}
            </div>
            <div className="mot-conq__meta">
              <span>{c.labelValor}</span>
              {c.proximaMeta != null ? (
                <span className="mot-conq__next">
                  Próx.:{' '}
                  {c.def.id === 'faturamento'
                    ? c.proximaMeta.toLocaleString('pt-BR', {
                        style: 'currency',
                        currency: 'BRL',
                        maximumFractionDigits: 0,
                      })
                    : c.def.id === 'avaliacao'
                      ? (c.proximaMeta / 10).toFixed(1).replace('.', ',')
                      : c.proximaMeta}
                </span>
              ) : (
                <span className="mot-conq__next mot-conq__next--max">Nível máximo</span>
              )}
            </div>
            <div
              className="mot-conq__bar"
              role="progressbar"
              aria-valuenow={Math.round(c.progresso * 100)}
              aria-valuemin={0}
              aria-valuemax={100}
            >
              <i
                style={{ width: `${Math.max(4, Math.round(c.progresso * 100))}%` }}
                className={c.nivel ? `is-${c.nivel}` : ''}
              />
            </div>
            <div className="mot-conq__tiers">
              <span className={c.valor >= c.def.metas.bronze ? 'is-hit' : ''}>
                🥉 {fmtMeta(c.def.id, c.def.metas.bronze)}
              </span>
              <span className={c.valor >= c.def.metas.prata ? 'is-hit' : ''}>
                🥈 {fmtMeta(c.def.id, c.def.metas.prata)}
              </span>
              <span className={c.valor >= c.def.metas.ouro ? 'is-hit' : ''}>
                🥇 {fmtMeta(c.def.id, c.def.metas.ouro)}
              </span>
            </div>
          </li>
        ))}
      </ul>
    </section>
  )
}

function fmtMeta(id: ConquistaIdOrString, n: number): string {
  if (id === 'faturamento') {
    if (n >= 1000) return `${Math.round(n / 1000)}k`
    return String(n)
  }
  if (id === 'avaliacao') return (n / 10).toFixed(1).replace('.', ',')
  return String(n)
}

type ConquistaIdOrString = string
