export type CategoriaId =
  | 'transportadoras'
  | 'operadores_logisticos'
  | 'armazenagem'
  | 'empilhadeiras'
  | 'refrigeracao'
  | 'tecnologia'
  | 'frotas'
  | 'embalagens'
  | 'portos_comercio_exterior'
  | 'servicos_consultoria'
  | 'logistica_reversa'

/** Nível de integração da operação — nomes em português, sem siglas. */
export type NivelIntegracaoId =
  | 'transporte_proprio'
  | 'transporte_e_armazenagem'
  | 'operacao_integrada'
  | 'gestao_estrategica'
  | 'rede_com_tecnologia'

export type OrigemCadastro = 'oferta_carga' | 'publico' | 'exemplo' | 'cadastro'

export type NivelHierarquia = 'super' | 'gestor' | 'operador'

/** Papel na árvore do Doca Livre (Oferta de Carga). */
export type PapelHierarquia =
  | 'operador_logistico'
  | 'filial_operador'
  | 'embarcador'
  | 'unidade'
  | 'transportadora'

export interface Empresa {
  id: string
  slug: string
  razao_social: string
  nome_fantasia: string
  cnpj?: string
  telefone?: string
  email?: string
  site_url?: string
  logo_url?: string
  cidade: string
  uf: string
  endereco: string
  numero?: string
  bairro?: string
  cep?: string
  lat: number
  lng: number
  categoria: CategoriaId
  /** Subtipos comerciais (empilhadeira, peças, fracionada, etc.). */
  subcategorias: string[]
  tags: string[]
  nivel_integracao?: NivelIntegracaoId
  especialidades: string[]
  apresentacao: string
  servicos_intro: string
  servicos: string[]
  area_atuacao: string
  referencias?: string
  cobertura?: string
  origem: OrigemCadastro
  fontes?: { titulo: string; url: string }[]
  hierarquia_nivel?: NivelHierarquia
  hierarquia_superior?: string | null
  /** Papel na hierarquia Doca Livre: operador, embarcador, unidade ou transportadora. */
  papel_hierarquia?: PapelHierarquia
  responsavel_nome?: string
  /** Estados em que coleta ou entrega, além da sede. */
  ufs_atendidas?: string[]
  /** Tipos de carga ou operação (fracionada, lotação, refrigerada…). */
  tipos_carga?: string[]
  /** Modais: rodoviário, aéreo, marítimo, ferroviário, multimodal. */
  modais?: string[]
  /** Frota e equipamentos usados na operação. */
  equipamentos?: string[]
  /** Horário de coleta / atendimento. */
  horario?: string
  /** Ano de fundação, só se a empresa informar. */
  ano_fundacao?: number
  porte?: 'mei' | 'pequena' | 'media' | 'grande'
  /** Ex.: cerca de 80 veículos. */
  frota_resumo?: string
  /** Ex.: 12 docas · 8.000 m². */
  estrutura_resumo?: string
  certificacoes?: string[]
  /** RNTRC só entra se a empresa preencher. Não inventar. */
  rntrc?: string
  instagram_url?: string
  linkedin_url?: string
  whatsapp?: string
  rastreamento?: boolean
  seguro_carga?: boolean
  coleta_domiciliar?: boolean
  publico_alvo?: 'b2b' | 'b2c' | 'ambos'
}
