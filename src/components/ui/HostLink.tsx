import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import {
  hrefMapaFrota,
  hrefMapaLogistica,
  hrefRota,
  hrefSistema,
  isSiteMapaFrota,
  isSiteMapaLogistica,
  isSiteOfertaDeCarga,
} from '../../lib/siteOfertaDeCarga'

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
    <AbsOrHash href={href} to={isSiteOfertaDeCarga() ? '/' : '/rota'} className={className}>
      {children}
    </AbsOrHash>
  )
}

export function LinkMapaFrota({ className, children }: { className?: string; children: ReactNode }) {
  const href = hrefMapaFrota()
  return (
    <AbsOrHash href={href} to={isSiteMapaFrota() ? '/' : '/mapa'} className={className}>
      {children}
    </AbsOrHash>
  )
}

export function LinkMapaLogistica({ className, children }: { className?: string; children: ReactNode }) {
  const href = hrefMapaLogistica()
  return (
    <AbsOrHash href={href} to={isSiteMapaLogistica() ? '/' : href} className={className}>
      {children}
    </AbsOrHash>
  )
}
