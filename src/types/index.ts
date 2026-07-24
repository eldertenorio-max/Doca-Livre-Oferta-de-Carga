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
  | 'canceladas'
  | 'suspensas'

export type StatusCargaTransportador =
  | 'nova_carga'
  | 'propostas'
  | 'confirmadas'
  | 'alocadas'

export type StatusLance = 'ativo' | 'vencedor' | 'perdido' | 'recusado' | 'cancelado'

/** Perfil operacional PPT §9 (embarcador) */
export type PerfilOperacional = 'administrador' | 'operador' | 'consulta'

export interface Profile {
  id: string
  email: string
  nome: string
  usuario: string
  role: UserRole
  transportador_id?: string | null
  empresa_org_id?: string | null
  is_superuser?: boolean
  perfil_operacional?: PerfilOperacional | null
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
  /** Residência real do transportador (não o endereço do CNPJ). */
  origem_cep?: string
  origem_cidade?: string
  origem_uf?: string
  origem_endereco?: string
  origem_numero?: string
  origem_bairro?: string
  origem_complemento?: string
  origem_lat?: number | null
  origem_lng?: number | null
  /** Distância máxima (km) entre a origem e o local de carregamento. */
  raio_km?: number
  /**
   * Como o cadastro entrou no sistema:
   * - `link` = formulário público (#/cadastro-transportador)
   * - `painel` = criado/editado pelo embarcador no painel
   */
  origem_cadastro?: 'link' | 'painel'
  /**
   * Se true, motoristas/veículos desta transportadora aparecem no Mapa da Frota
   * como disponíveis para carregar.
   */
  disponivel_mapa?: boolean
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
  /** null = veículo de motorista autônomo (sem transportadora) */
  transportador_id: string | null
  renavam?: string
  condutor?: string
  tipo: string
  marca?: string
  modelo?: string
  cor?: string
  ano_fabricacao?: string
  ano_modelo?: string
  uf_licenciamento?: string
  foto_url?: string
  fotos?: FotosVeiculo
  tipo_carroceria?: string
  qtd_pallets?: number
  aclimatacao?: string
  capacidade_kg?: number
  cubagem_m3?: number
  eixos?: number
  /** Frete mínimo que este veículo/categoria aceita (R$). */
  frete_minimo: number
  usa_manobrista: boolean
  padiado: boolean
  situacao: 'ativo' | 'inativo'
  created_at: string
}

export interface Motorista {
  id: string
  /** null quando autonomo = true */
  transportador_id: string | null
  /** Veículo (placa) vinculado à composição */
  veiculo_id: string | null
  /** Sem transportadora: motorista + placa autônomos */
  autonomo: boolean
  nome: string
  cpf?: string
  cnh?: string
  categoria_cnh?: string
  validade_cnh?: string
  telefone?: string
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
  /** Limites opcionais de lance (R$) */
  frete_minimo: number | null
  frete_maximo: number | null
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
  /** Pausa (suspensa): ms restantes da janela de oferta */
  pausado_em: string | null
  tempo_restante_ms: number | null
  justificativa_motivo: string | null
  justificativa_obs: string | null
  grupo_ids: string[]
  grupos_notificados: string[]
  transportador_vencedor_id: string | null
  frete_fechado: number | null
  placa: string | null
  motorista: string | null
  veiculo_id: string | null
  motorista_id: string | null
  criado_por?: string | null
  publicado_por?: string | null
  visualizacoes: number
  recusas: number
  observacao?: string
  motivo_cancelamento?: string | null
  created_at: string
  updated_at?: string
}

export interface Lance {
  id: string
  carga_id: string
  transportador_id: string
  valor: number
  status: StatusLance
  created_at: string
  updated_at?: string
}

export interface HistoricoProposta {
  id: string
  lance_id: string
  carga_id: string
  transportador_id: string
  valor_anterior: number | null
  valor_novo: number
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

export type TipoHistorico =
  | 'carga_criada'
  | 'carga_excluida'
  | 'carga_publicada'
  | 'carga_cancelada'
  | 'carga_suspensa'
  | 'carga_retomada'
  | 'carga_republicada'
  | 'negociacao_reaberta'
  | 'lance_enviado'
  | 'lance_aceito'
  | 'lance_rejeitado'
  | 'contra_proposta'
  | 'aguardar_ofertas'
  | 'negociacao_finalizada'
  | 'frete_recusado'
  | 'carga_alocada'
  | 'grupos_notificados'
  | 'integracao_fretes'
  | 'pontuacao'
  | 'alocacao_expirada'
  | 'transportador_excluido'

export interface HistoricoEvento {
  id: string
  tipo: TipoHistorico
  carga_id?: string | null
  transportador_id?: string | null
  titulo: string
  detalhe?: string
  created_at: string
  /** Auditoria */
  ator_id?: string | null
  ator_nome?: string | null
  ip?: string | null
  user_agent?: string | null
  before?: Record<string, unknown> | null
  after?: Record<string, unknown> | null
}

export interface NotificacaoInApp {
  id: string
  user_id?: string | null
  role?: UserRole | 'todos' | null
  transportador_id?: string | null
  titulo: string
  mensagem: string
  carga_id?: string | null
  lida: boolean
  created_at: string
  updated_at?: string
}

/** Chat da carga (embarcador ↔ transportador) */
export interface ChatMensagem {
  id: string
  carga_id: string
  autor_id: string
  autor_nome: string
  autor_role: UserRole | 'super'
  texto: string
  created_at: string
}

export type StatusIntegracaoFrete = 'pendente' | 'enviado' | 'erro' | 'simulado'

export interface IntegracaoFrete {
  id: string
  carga_id: string
  payload: Record<string, unknown>
  status: StatusIntegracaoFrete
  tentativa_em: string
  resposta?: string
}
