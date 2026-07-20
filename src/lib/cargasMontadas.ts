import type { Carga, ClassificacaoRota } from '../types'

const KEY = 'doca-livre-cargas-montadas-v1'
const PANEL_SIZE_KEY = 'doca-livre-publish-panel-size'

export type PanelSize = 'normal' | 'medio' | 'largo'

export type CargaMontadaDados = {
  nome: string
  pedido: string
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
  classificacao_rota: ClassificacaoRota | null
  rota_id: string | null
  observacao?: string
}

export type CargaMontada = {
  id: string
  nome: string
  created_at: string
  dados: CargaMontadaDados
}

export function loadPanelSize(): PanelSize {
  try {
    const v = localStorage.getItem(PANEL_SIZE_KEY)
    if (v === 'normal' || v === 'medio' || v === 'largo') return v
  } catch {
    /* ignore */
  }
  return 'medio'
}

export function savePanelSize(size: PanelSize) {
  try {
    localStorage.setItem(PANEL_SIZE_KEY, size)
  } catch {
    /* ignore */
  }
}

export function panelSizeClass(size: PanelSize): string {
  if (size === 'largo') return 'w-[min(920px,72vw)]'
  if (size === 'medio') return 'w-[min(640px,55vw)]'
  return 'w-[min(440px,92vw)]'
}

export function loadCargasMontadas(): CargaMontada[] {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as CargaMontada[]
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function saveAll(list: CargaMontada[]) {
  localStorage.setItem(KEY, JSON.stringify(list.slice(0, 40)))
}

export function snapshotCargaMontada(carga: Carga, nome?: string): CargaMontadaDados {
  const label =
    nome?.trim() ||
    `${carga.origem || 'Origem'} → ${carga.destino || 'Destino'} · ${carga.tipo_carga || 'Carga'}`
  return {
    nome: label,
    pedido: carga.pedido,
    tipo_carga: carga.tipo_carga,
    veiculo: carga.veiculo,
    remetente: carga.remetente,
    remetente_cnpj: carga.remetente_cnpj,
    origem: carga.origem,
    destino: carga.destino,
    destinatario: carga.destinatario,
    destinatario_cnpj: carga.destinatario_cnpj,
    peso: carga.peso,
    volumes: carga.volumes,
    num_entregas: carga.num_entregas,
    pallets: carga.pallets,
    valor_mercadorias: carga.valor_mercadorias,
    frete_tabela: carga.frete_tabela,
    classificacao_rota: carga.classificacao_rota,
    rota_id: carga.rota_id,
    observacao: carga.observacao,
  }
}

export function guardarCargaMontada(carga: Carga, nome?: string): CargaMontada {
  const dados = snapshotCargaMontada(carga, nome)
  const item: CargaMontada = {
    id: `cm-${Math.random().toString(36).slice(2, 10)}`,
    nome: dados.nome,
    created_at: new Date().toISOString(),
    dados,
  }
  const list = [item, ...loadCargasMontadas().filter((x) => x.nome !== item.nome)]
  saveAll(list)
  return item
}

export function excluirCargaMontada(id: string) {
  saveAll(loadCargasMontadas().filter((x) => x.id !== id))
}

/** Campos seguros para aplicar num rascunho (não sobrescreve id/numero/status). */
export function patchFromCargaMontada(m: CargaMontada): Partial<Carga> {
  const d = m.dados
  return {
    pedido: d.pedido,
    tipo_carga: d.tipo_carga,
    veiculo: d.veiculo,
    remetente: d.remetente,
    remetente_cnpj: d.remetente_cnpj,
    origem: d.origem,
    destino: d.destino,
    destinatario: d.destinatario,
    destinatario_cnpj: d.destinatario_cnpj,
    peso: d.peso,
    volumes: d.volumes,
    num_entregas: d.num_entregas,
    pallets: d.pallets,
    valor_mercadorias: d.valor_mercadorias,
    frete_tabela: d.frete_tabela,
    classificacao_rota: d.classificacao_rota,
    rota_id: d.rota_id,
    observacao: d.observacao,
  }
}
