import type { Empresa } from '../types'
import { LOGO_DOCA_LIVRE_SRC } from './brandAssets'

export const EMPRESA_DOCA_LIVRE_SLUG = 'doca-livre'

/** Perfil da plataforma — sem CNPJ inventado e fora do catálogo do mapa. */
export const EMPRESA_DOCA_LIVRE: Empresa = {
  id: 'doca-livre',
  slug: EMPRESA_DOCA_LIVRE_SLUG,
  razao_social: 'Doca Livre',
  nome_fantasia: 'Doca Livre',
  email: 'diego@docalivre.com',
  site_url: 'https://mapadalogistica.com.br',
  logo_url: LOGO_DOCA_LIVRE_SRC,
  cidade: 'São Paulo',
  uf: 'SP',
  endereco: 'Rede nacional',
  lat: -23.5505,
  lng: -46.6333,
  categoria: 'tecnologia',
  subcategorias: ['plataforma', 'mapa logístico'],
  tags: ['doca livre', 'rede'],
  especialidades: ['Mapa da Logística', 'Feed da rede', 'Cadastro de empresas'],
  apresentacao:
    'A Doca Livre reúne a rede de logística: mapa, cadastro de empresas e o feed de divulgações da operação.',
  servicos_intro: 'Plataforma da rede para publicar serviços, capacidade e parcerias.',
  servicos: ['Mapa da Logística', 'Feed notícias', 'Perfil das empresas', 'Hierarquia da rede'],
  area_atuacao: 'Brasil',
  origem: 'publico',
  papel_hierarquia: 'operador_logistico',
}

export function ehPerfilDocaLivre(empresa: Pick<Empresa, 'id' | 'slug'>) {
  return empresa.slug === EMPRESA_DOCA_LIVRE_SLUG || empresa.id === EMPRESA_DOCA_LIVRE.id
}
