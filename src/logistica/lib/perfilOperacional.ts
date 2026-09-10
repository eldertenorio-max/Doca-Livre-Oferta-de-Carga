import type { Empresa } from '../types'
import { UFS_BR, UF_NOMES } from './geo'

function semAcento(s: string) {
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
}

export const TIPOS_CARGA = [
  'Carga fracionada',
  'Carga lotação',
  'Transporte refrigerado',
  'Cargas perigosas',
  'Granel',
  'E-commerce / last mile',
  'Transporte de veículos',
  'Transporte de máquinas',
  'Carga aérea',
  'Cabotagem',
  'Armazenagem',
  'Cross-docking',
  'Coleta e entrega',
] as const

export const MODAIS = ['Rodoviário', 'Aéreo', 'Marítimo', 'Ferroviário', 'Multimodal'] as const

export const EQUIPAMENTOS = [
  'Carreta',
  'Truck',
  'Bitrem',
  'Van / utilitário',
  'Empilhadeira',
  'Câmara fria',
  'Pallet / porta-pallet',
] as const

type Vocab = { label: string; chaves: string[] }

const CARGA_VOCAB: Vocab[] = [
  { label: 'Carga fracionada', chaves: ['fracionada', 'fracionado'] },
  { label: 'Carga lotação', chaves: ['lotacao', 'lotação'] },
  { label: 'Transporte refrigerado', chaves: ['refrigerad', 'cadeia fria', 'frigorific', 'camara fria'] },
  { label: 'Cargas perigosas', chaves: ['perigosa', 'perigoso', 'sussmaq', 'produtos perigosos'] },
  { label: 'Granel', chaves: ['granel'] },
  { label: 'E-commerce / last mile', chaves: ['ecommerce', 'e-commerce', 'last mile', 'ultima milha', 'encomenda'] },
  { label: 'Transporte de veículos', chaves: ['veiculos', 'cegonha', 'zero km'] },
  { label: 'Transporte de máquinas', chaves: ['maquinas', 'maquina pesada'] },
  { label: 'Carga aérea', chaves: ['carga aerea', 'aereo', 'teca'] },
  { label: 'Cabotagem', chaves: ['cabotagem', 'maritimo'] },
  { label: 'Armazenagem', chaves: ['armazenagem', 'armazem', 'centro de distribuicao', 'cd '] },
  { label: 'Cross-docking', chaves: ['cross-docking', 'cross docking', 'crossdock'] },
  { label: 'Coleta e entrega', chaves: ['coleta', 'entrega'] },
]

const MODAL_VOCAB: Vocab[] = [
  { label: 'Rodoviário', chaves: ['rodoviario', 'caminhao', 'carreta', 'truck'] },
  { label: 'Aéreo', chaves: ['aereo', 'aerea', 'teca', 'aeroporto'] },
  { label: 'Marítimo', chaves: ['maritimo', 'cabotagem', 'porto', 'terminal portuario'] },
  { label: 'Ferroviário', chaves: ['ferroviario', 'ferrovia'] },
  { label: 'Multimodal', chaves: ['multimodal'] },
]

const EQUIP_VOCAB: Vocab[] = [
  { label: 'Carreta', chaves: ['carreta'] },
  { label: 'Truck', chaves: ['truck'] },
  { label: 'Bitrem', chaves: ['bitrem'] },
  { label: 'Van / utilitário', chaves: ['van', 'utilitario', 'furgao'] },
  { label: 'Empilhadeira', chaves: ['empilhadeira', 'forklift'] },
  { label: 'Câmara fria', chaves: ['camara fria', 'bau refrigerado'] },
  { label: 'Pallet / porta-pallet', chaves: ['pallet', 'porta-pallet'] },
]

function unicos(lista: string[]) {
  const vistos = new Set<string>()
  const out: string[] = []
  for (const item of lista) {
    const k = semAcento(item)
    if (!k || vistos.has(k)) continue
    vistos.add(k)
    out.push(item)
  }
  return out
}

function textoBase(e: Empresa) {
  return semAcento(
    [
      e.categoria,
      e.subcategorias.join(' '),
      e.tags.join(' '),
      e.especialidades.join(' '),
      e.servicos.join(' '),
      e.servicos_intro,
      e.apresentacao,
      e.area_atuacao,
      e.cobertura ?? '',
    ].join(' '),
  )
}

function casarVocab(hay: string, vocab: Vocab[]) {
  return vocab.filter((v) => v.chaves.some((c) => hay.includes(semAcento(c)))).map((v) => v.label)
}

function ufsNoTexto(texto: string) {
  const hay = ` ${semAcento(texto).replace(/[^a-z0-9]+/g, ' ')} `
  const achadas: string[] = []
  for (const uf of UFS_BR) {
    const nome = semAcento(UF_NOMES[uf])
    if (hay.includes(` ${uf.toLowerCase()} `) || hay.includes(` ${nome} `)) achadas.push(uf)
  }
  return achadas
}

export type OperacaoPerfil = {
  ufs: string[]
  tiposCarga: string[]
  modais: string[]
  equipamentos: string[]
  horario?: string
}

/** Junta o que a empresa cadastrou com o que já dá para ler do perfil. */
export function operacaoDaEmpresa(e: Empresa, catalogo: Empresa[] = []): OperacaoPerfil {
  const hay = textoBase(e)
  const inferidosCarga = casarVocab(hay, CARGA_VOCAB)
  const inferidosModais = casarVocab(hay, MODAL_VOCAB)
  const inferidosEquip = casarVocab(hay, EQUIP_VOCAB)

  if (e.categoria === 'transportadoras' || e.categoria === 'frotas') inferidosModais.push('Rodoviário')
  if (e.categoria === 'portos_comercio_exterior') inferidosModais.push('Marítimo')
  if (e.categoria === 'empilhadeiras') inferidosEquip.push('Empilhadeira')
  if (e.categoria === 'refrigeracao') {
    inferidosCarga.push('Transporte refrigerado')
    inferidosEquip.push('Câmara fria')
  }
  if (e.categoria === 'armazenagem' || e.categoria === 'operadores_logisticos') inferidosCarga.push('Armazenagem')
  if (e.categoria === 'embalagens') inferidosEquip.push('Pallet / porta-pallet')

  const ufsRede: string[] = []
  if (!e.hierarquia_superior) {
    for (const outra of catalogo) {
      if (outra.id === e.id || outra.hierarquia_superior === e.id) ufsRede.push(outra.uf)
    }
  }

  return {
    ufs: unicos([
      e.uf,
      ...(e.ufs_atendidas ?? []),
      ...ufsNoTexto(`${e.area_atuacao} ${e.cobertura ?? ''}`),
      ...ufsRede,
    ]),
    tiposCarga: unicos([...(e.tipos_carga ?? []), ...inferidosCarga]),
    modais: unicos([...(e.modais ?? []), ...inferidosModais]),
    equipamentos: unicos([...(e.equipamentos ?? []), ...inferidosEquip]),
    horario: e.horario,
  }
}

export const PORTES = [
  { id: 'mei', label: 'MEI / micro' },
  { id: 'pequena', label: 'Pequena' },
  { id: 'media', label: 'Média' },
  { id: 'grande', label: 'Grande' },
] as const

export const PUBLICOS = [
  { id: 'b2b', label: 'Empresas (B2B)' },
  { id: 'b2c', label: 'Consumidor final (B2C)' },
  { id: 'ambos', label: 'Empresas e consumidor' },
] as const

export const CERTIFICACOES = [
  'ISO 9001',
  'ISO 14001',
  'SASSMAQ',
  'OEA',
  'ANVISA',
  'Rastreamento em tempo real',
] as const

export function unidadesDaRede(e: Empresa, catalogo: Empresa[]) {
  const matrizId = e.hierarquia_superior || e.id
  return catalogo
    .filter((x) => x.id === matrizId || x.hierarquia_superior === matrizId)
    .sort((a, b) => {
      const aMatriz = a.hierarquia_superior ? 1 : 0
      const bMatriz = b.hierarquia_superior ? 1 : 0
      if (aMatriz !== bMatriz) return aMatriz - bMatriz
      return a.cidade.localeCompare(b.cidade, 'pt-BR') || a.nome_fantasia.localeCompare(b.nome_fantasia, 'pt-BR')
    })
}

export function textoOperacaoParaBusca(e: Empresa, catalogo: Empresa[]) {
  const op = operacaoDaEmpresa(e, catalogo)
  const nomesUf = op.ufs.map((uf) => UF_NOMES[uf as keyof typeof UF_NOMES] ?? uf)
  return [
    e.endereco,
    e.bairro ?? '',
    e.cep ?? '',
    e.servicos_intro,
    e.referencias ?? '',
    e.horario ?? '',
    e.frota_resumo ?? '',
    e.estrutura_resumo ?? '',
    e.rntrc ?? '',
    (e.certificacoes ?? []).join(' '),
    e.ano_fundacao ? String(e.ano_fundacao) : '',
    op.ufs.join(' '),
    nomesUf.join(' '),
    op.tiposCarga.join(' '),
    op.modais.join(' '),
    op.equipamentos.join(' '),
    e.rastreamento ? 'rastreamento rastreador' : '',
    e.seguro_carga ? 'seguro de carga' : '',
    e.coleta_domiciliar ? 'coleta domiciliar' : '',
  ]
    .filter(Boolean)
    .join(' ')
}
