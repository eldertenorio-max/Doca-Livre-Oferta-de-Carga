import { useEffect, useMemo, useState } from 'react'
import type { Empresa } from '../../types'
import { iniciaisEmpresa, urlsLogoEmpresa } from '../../lib/empresaVisual'
import { nomeMarca } from '../../lib/search'

type Props = {
  empresa: Empresa
  catalogo?: Empresa[]
  className?: string
}

export function LogoEmpresa({ empresa, catalogo = [], className = '' }: Props) {
  const [idx, setIdx] = useState(0)
  const urls = useMemo(() => urlsLogoEmpresa(empresa, catalogo), [empresa, catalogo])
  const src = urls[idx]
  const cls = className.trim()
  const urlsKey = urls.join('|')

  useEffect(() => {
    setIdx(0)
  }, [empresa.id, urlsKey])

  if (!src) {
    return (
      <div className={`${cls} is-logo-empty`.trim()} aria-hidden>
        {iniciaisEmpresa(nomeMarca(empresa))}
      </div>
    )
  }

  return (
    <img
      className={cls}
      src={src}
      alt=""
      decoding="async"
      referrerPolicy="no-referrer"
      onError={() => setIdx((n) => n + 1)}
    />
  )
}
