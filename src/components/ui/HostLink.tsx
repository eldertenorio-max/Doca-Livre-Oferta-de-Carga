import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { hrefMapaFrota, hrefRota, hrefSistema } from '../../lib/siteOfertaDeCarga'

function AbsOrHash({
  href,
  to,
  className,
  children,
}: {
  href: string
  to: string
  className?: string
  children: ReactNode
}) {
  if (href.startsWith('http')) {
    return (
      <a className={className} href={href}>
        {children}
      </a>
    )
  }
  return (
    <Link className={className} to={to}>
      {children}
    </Link>
  )
}

export function LinkSistema({
  to,
  className,
  children,
}: {
  to: string
  className?: string
  children: ReactNode
}) {
  return (
    <AbsOrHash href={hrefSistema(to)} to={to} className={className}>
      {children}
    </AbsOrHash>
  )
}

export function LinkRota({ className, children }: { className?: string; children: ReactNode }) {
  const href = hrefRota()
  return (
    <AbsOrHash href={href} to="/rota" className={className}>
      {children}
    </AbsOrHash>
  )
}

export function LinkMapaFrota({ className, children }: { className?: string; children: ReactNode }) {
  const href = hrefMapaFrota()
  return (
    <AbsOrHash href={href} to="/mapa" className={className}>
      {children}
    </AbsOrHash>
  )
}
