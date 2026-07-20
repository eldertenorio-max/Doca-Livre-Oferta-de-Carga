import { BRAND_PRODUCT_NAME, BRAND_PRODUCT_VARIANT } from '../lib/brandAssets'

type Props = {
  className?: string
  size?: 'sm' | 'md' | 'lg'
}

/** Mesmo padrão visual do WMS Plus: "Oferta" + pill "carga". */
export function ProductMark({ className = '', size = 'md' }: Props) {
  return (
    <strong
      className={`product-mark product-mark--${size} ${className}`.trim()}
      aria-label={`${BRAND_PRODUCT_NAME} de ${BRAND_PRODUCT_VARIANT}`}
    >
      <span className="product-mark__main">{BRAND_PRODUCT_NAME}</span>
      <span className="product-mark__pill">{BRAND_PRODUCT_VARIANT}</span>
    </strong>
  )
}
