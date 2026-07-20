import { BRAND_PRODUCT_LABEL } from '../lib/brandAssets'

type Props = {
  className?: string
  size?: 'sm' | 'md' | 'lg'
}

/** Marca do produto: "Oferta de carga" em um único texto. */
export function ProductMark({ className = '', size = 'md' }: Props) {
  return (
    <strong
      className={`product-mark product-mark--${size} ${className}`.trim()}
      aria-label={BRAND_PRODUCT_LABEL}
    >
      {BRAND_PRODUCT_LABEL}
    </strong>
  )
}
