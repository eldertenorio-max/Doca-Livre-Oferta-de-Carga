export type UserRole = 'minerva' | 'transportador' | 'super'

export type ClassificacaoRota = 'A' | 'B' | 'C'
export type ClassificacaoTransportador = 'ouro' | 'prata' | 'bronze'
export type Prioridade = 'alta' | 'media' | 'baixa'
export type ModoPublicacao = 'leilao' | 'oferta'

export type StatusCargaMinerva =
  | 'nova_carga'
  | 'negociando'
  | 'propostas'
  | 'recusadas'
  | 'alocadas'

export type StatusCargaTransportador =
  | 'nova_carga'
  | 'propostas'
  | 'confirmadas'
  | 'alocadas'

export type StatusLance = 'ativo' | 'vencedor' | 'perdido' | 'recusado'

export interface Profile {
  id: string
  email: string
  nome: string
  usuario: string
  role: UserRole
  transportador_id?: string | null
  empresa_org_id?: string | null
  is_superuser?: boolean
  /** null = acesso total (super) */
  permissoes_modulos?: Record<string, 'visualizar' | 'editar'> | null
}

export interface AppUser {
  id: string
  email: string
  password: string
  nome: string
  role: UserRole
  transportador_id?: string
}

export type SituacaoTransportador = 'pendente' | 'ativo' | 'inativo' | 'recusado'

export type TipoDocumentoTransportador =
  | 'cartao_cnpj'
  | 'contrato_social'
  | 'rntrc'
  | 'comprovante_endereco'
  | 'doc_responsavel'
  | 'apolice_seguro'

export interface TransportadorDocumento {
  id: string
  transportador_id: string
  tipo: TipoDocumentoTransportador
  nome_arquivo: string
  /** data URL (local) ou URL do Storage */
  url: string
  storage_path?: string
  created_at: string
}

export interface Transportador {
  id: string
  razao_social: string
  nome_fantasia: string
  cnpj: string
  inscricao_estadual?: string
  inscricao_municipal?: string
  rntrc?: string
  cidade: string
  uf: string
  endereco?: string
  numero?: string
  bairro?: string
  complemento?: string
  cep?: string
  classificacao: ClassificacaoTransportador
  pontuacao: number
  situacao: SituacaoTransportador
  telefone?: string
  email?: string
  contato_nome?: string
  contato_telefone?: string
  motivo_recusa?: string
  created_at?: string
}

/** Roteiro de 5 fotos obrigatórias do veículo. */
export type FotoVeiculoSlot =
  | 'dianteira'
  | 'lateral_esquerda'
  | 'lateral_direita'
  | 'traseira_aberta'
  | 'interior'

export type FotosVeiculo = Partial<Record<FotoVeiculoSlot, string>>

export interface Veiculo {
  id: string
  placa: string
  transportador_id: string
  renavam?: string
  condutor?: string
  tipo: string
  marca?: string
  modelo?: string
  cor?: string
  ano_fabricacao?: string
  ano_modelo?: string
  uf_licenciamento?: string
  /** @deprecated use fotos.dianteira */
  foto_url?: string
  fotos?: FotosVeiculo
  tipo_carroceria?: string
  qtd_pallets?: number
  aclimatacao?: string
  capacidade_kg?: number
  cubagem_m3?: number
  eixos?: number
  usa_manobrista: boolean
  padiado: boolean
  situacao: 'ativo' | 'inativo'
  created_at: string
}


export interface GrupoTransportador {
  id: string
  descricao: string
  situacao: 'ativo' | 'inativo'
  observacao?: string
  transportador_ids: string[]
}

export interface Rota {
  id: string
  descricao: string
  origem: string
  destino: string
  classificacao: ClassificacaoRota
  frete_tabela: number
  km: number
  situacao: 'ativo' | 'inativo'
}

export interface Carga {
  id: string
  numero: string
  pedido: string
  ordem: string
  tipo_carga: string
  veiculo: string
  remetente: string
  remetente_cnpj: string
  origem: string
  destino: string
  destinatario: string
  destinatario_cnpj: string
  peso: number
  volumes: number
  num_entregas: number
  pallets: number
  valor_mercadorias: number
  frete_tabela: number
  frete_oferta: number | null
  margem_percentual: number | null
  data_carregamento: string
  previsao_entrega: string
  rota_id: string | null
  classificacao_rota: ClassificacaoRota | null
  status: StatusCargaMinerva
  prioridade: Prioridade | null
  modo_publicacao: ModoPublicacao | null
  prazo_leilao_minutos: number | null
  prazo_alocacao_minutos: number | null
  publicado_em: string | null
  expira_em: string | null
  alocacao_expira_em: string | null
  justificativa_motivo: string | null
  justificativa_obs: string | null
  grupo_ids: string[]
  grupos_notificados: string[]
  transportador_vencedor_id: string | null
  frete_fechado: number | null
  placa: string | null
  motorista: string | null
  visualizacoes: number
  recusas: number
  observacao?: string
  created_at: string
}

export interface Lance {
  id: string
  carga_id: string
  transportador_id: string
  valor: number
  status: StatusLance
  created_at: string
}

export interface InteracaoPontuacao {
  id: string
  transportador_id: string
  carga_id: string
  tipo: 'visualizada_sem_acao' | 'nao_visualizada' | 'recusada' | 'com_proposta' | 'frete_fechado'
  pontos: number
  created_at: string
}
