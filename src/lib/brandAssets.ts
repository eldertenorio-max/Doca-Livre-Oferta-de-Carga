import arquivoLogoClaro from '../assets/logo-doca-livre.png'
import arquivoLogoEscuro from '../assets/logo-doca-livre-escuro.png'

/**
 * Logos embutidas no bundle (Vite) — não dependem de /public no deploy.
 * Claro: moldura e "LIVRE" em azul-marinho, para fundo claro (padrão do sistema).
 * Escuro: moldura e "LIVRE" em branco, para fundo escuro.
 */
export const LOGO_DOCA_LIVRE_SRC = arquivoLogoClaro
export const LOGO_DOCA_LIVRE_ESCURO_SRC = arquivoLogoEscuro

export type TemaLogo = 'claro' | 'escuro'

/** Versão do logo para o fundo onde ele vai aparecer. */
export function logoDocaLivre(fundo: TemaLogo): string {
  return fundo === 'escuro' ? LOGO_DOCA_LIVRE_ESCURO_SRC : LOGO_DOCA_LIVRE_SRC
}
export const BRAND_COMPANY_NAME = 'DOCA LIVRE'
export const BRAND_PRODUCT_NAME = 'Oferta'
export const BRAND_PRODUCT_VARIANT = 'carga'
export const BRAND_PRODUCT_LABEL = 'Oferta de carga'

export const BRAND_FULL_TITLE = `${BRAND_COMPANY_NAME} ${BRAND_PRODUCT_LABEL}`

/** Perfil embarcador (internamente role `minerva`). */
export const BRAND_EMBARCADOR_LABEL = 'Doca Livre Oferta de Carga'
