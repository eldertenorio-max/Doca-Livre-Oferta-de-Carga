import { BRAND_PRODUCT_LABEL } from '../lib/brandAssets'

type Props = {
  className?: string
  size?: 'sm' | 'md' | 'lg'
}

/** Marca do produto: "Oferta de carga" (duas linhas no mobile para não cortar). */
export function ProductMark({ className = '', size = 'md' }: Props) {
  return (
    <strong
      className={`product-mark product-mark--${size} ${className}`.trim()}
      aria-label={BRAND_PRODUCT_LABEL}
    >
      <span className="product-mark__line">Oferta de</span>
      <span className="product-mark__line">carga</span>
    </strong>
  )
}
