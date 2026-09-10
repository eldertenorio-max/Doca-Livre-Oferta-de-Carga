import type { CategoriaId, NivelIntegracaoId } from '../types'

export const CATEGORIAS: {
  id: CategoriaId
  label: string
  emoji: string
  cor: string
  corFundo: string
  descricao: string
}[] = [
  {
    id: 'transportadoras',
    label: 'Transportadoras',
    emoji: '🚚',
    cor: '#1d4ed8',
    corFundo: '#dbeafe',
    descricao: 'Cargas, fracionado, lotação, refrigerado, last mile e multimodal.',
  },
  {
    id: 'operadores_logisticos',
    label: 'Operadores logísticos',
    emoji: '🏭',
    cor: '#7c3aed',
    corFundo: '#ede9fe',
    descricao: 'Operação integrada de frota, armazéns e gestão da cadeia.',
  },
  {
    id: 'armazenagem',
    label: 'Armazenagem e CDs',
    emoji: '📦',
    cor: '#b45309',
    corFundo: '#ffedd5',
    descricao: 'Galpões, condomínios, centros de distribuição e armazéns gerais.',
  },
  {
    id: 'empilhadeiras',
    label: 'Empilhadeiras e movimentação',
    emoji: '🏗️',
    cor: '#ea580c',
    corFundo: '#ffedd5',
    descricao: 'Venda, locação, manutenção e peças de equipamentos de pátio.',
  },
  {
    id: 'refrigeracao',
    label: 'Refrigeração e cadeia fria',
    emoji: '❄️',
    cor: '#0284c7',
    corFundo: '#e0f2fe',
    descricao: 'Câmaras frias, baús, monitoramento e armazenagem refrigerada.',
  },
  {
    id: 'tecnologia',
    label: 'Tecnologia logística',
    emoji: '💻',
    cor: '#4f46e5',
    corFundo: '#e0e7ff',
    descricao: 'WMS, TMS, rastreamento, roteirização e plataformas de frete.',
  },
  {
    id: 'frotas',
    label: 'Frotas e veículos',
    emoji: '🚛',
    cor: '#15803d',
    corFundo: '#dcfce7',
    descricao: 'Locação de caminhões, oficinas, pneus, peças e implementos.',
  },
  {
    id: 'embalagens',
    label: 'Embalagens e pallets',
    emoji: '📦',
    cor: '#a16207',
    corFundo: '#fef9c3',
    descricao: 'Pallets, caixas, stretch, racks e estruturas porta-pallets.',
  },
  {
    id: 'portos_comercio_exterior',
    label: 'Portos, aeroportos e comércio exterior',
    emoji: '⚓',
    cor: '#0f766e',
    corFundo: '#ccfbf1',
    descricao: 'Terminais, despacho aduaneiro, agentes de carga e cabotagem.',
  },
  {
    id: 'servicos_consultoria',
    label: 'Serviços e consultoria',
    emoji: '👷',
    cor: '#334155',
    corFundo: '#e2e8f0',
    descricao: 'Mão de obra, inventário, projetos de armazém e treinamentos.',
  },
  {
    id: 'logistica_reversa',
    label: 'Logística reversa',
    emoji: '♻️',
    cor: '#16a34a',
    corFundo: '#dcfce7',
    descricao: 'Coleta de embalagens, reciclagem, resíduos e recondicionamento.',
  },
]

export const SUBCATEGORIAS_POR_CATEGORIA: Record<CategoriaId, string[]> = {
  transportadoras: [
    'Transportadoras de cargas',
    'Carga fracionada',
    'Carga lotação',
    'Entregas rápidas',
    'Transporte rodoviário',
    'Transporte refrigerado',
    'Cargas perigosas',
    'Transporte de veículos',
    'Transporte de máquinas',
    'Transporte multimodal',
    'Courier / last mile',
  ],
  operadores_logisticos: [
    'Operação integrada',
    'Gestão estratégica da cadeia',
    'Centros de distribuição',
    'Armazenagem',
    'Cross-docking',
    'Fulfillment',
    'Gestão de estoque',
    'Picking e packing',
    'Distribuição',
  ],
  armazenagem: [
    'Galpões logísticos',
    'Condomínios logísticos',
    'Self storage empresarial',
    'Armazéns gerais',
    'Silos',
    'Terminais de carga',
    'Depósitos',
    'Centros de distribuição',
    'Armazenagem frigorificada',
  ],
  empilhadeiras: [
    'Empilhadeiras',
    'Venda de empilhadeiras',
    'Locação de empilhadeiras',
    'Manutenção de empilhadeiras',
    'Peças para empilhadeiras',
    'Assistência técnica',
    'Paleteiras',
    'Transpaleteiras',
    'Rebocadores elétricos',
    'Plataformas elevatórias',
    'Movimentação interna',
  ],
  refrigeracao: [
    'Refrigeração industrial',
    'Refrigeração para transportes',
    'Baús refrigerados',
    'Câmaras frias',
    'Túneis de congelamento',
    'Equipamentos de congelamento',
    'Manutenção frigorífica',
    'Monitoramento de temperatura',
    'Armazenagem refrigerada',
    'Transporte refrigerado',
    'Cadeia fria',
  ],
  tecnologia: [
    'WMS',
    'TMS',
    'Gestão de transporte',
    'Gestão de estoque',
    'Rastreamento de veículos',
    'Telemetria',
    'Roteirização',
    'Automação de armazéns',
    'RFID',
    'IoT para logística',
    'Gestão de frota',
    'Plataformas de frete',
  ],
  frotas: [
    'Locação de caminhões',
    'Locação de veículos comerciais',
    'Gestão de frotas',
    'Rastreamento veicular',
    'Oficinas de caminhões',
    'Pneus para caminhões',
    'Peças para caminhões',
    'Abastecimento de frotas',
    'Lavagem de frota',
    'Implementos rodoviários',
  ],
  embalagens: [
    'Pallets',
    'Caixas de papelão',
    'Embalagens industriais',
    'Stretch film',
    'Fitas e lacres',
    'Etiquetas',
    'Containers',
    'Racks',
    'Contentores',
    'Porta-pallets',
    'Estantes industriais',
  ],
  portos_comercio_exterior: [
    'Operadores portuários',
    'Terminais portuários',
    'Terminais aeroportuários',
    'Despacho aduaneiro',
    'Agentes de carga',
    'Transporte ferroviário',
    'Transporte hidroviário',
    'Cabotagem',
    'Importação e exportação',
  ],
  servicos_consultoria: [
    'Mão de obra logística',
    'Inventário',
    'Consultoria logística',
    'Consultoria em cadeia de suprimentos',
    'Auditoria logística',
    'Projetos de armazenagem',
    'Engenharia logística',
    'Treinamento de empilhadeira',
    'Segurança patrimonial',
    'Gestão de documentos fiscais',
  ],
  logistica_reversa: [
    'Logística reversa',
    'Coleta de embalagens',
    'Reciclagem industrial',
    'Gestão de resíduos',
    'Descarte de produtos',
    'Recuperação de pallets',
    'Recondicionamento',
    'Destinação de resíduos',
  ],
}

export function categoriaPorId(id: CategoriaId) {
  return CATEGORIAS.find((c) => c.id === id)!
}

export const NIVEIS_INTEGRACAO: {
  id: NivelIntegracaoId
  ordem: number
  label: string
  resumo: string
}[] = [
  {
    id: 'transporte_proprio',
    ordem: 1,
    label: 'Transporte próprio',
    resumo: 'A empresa cuida só do transporte básico com frota própria.',
  },
  {
    id: 'transporte_e_armazenagem',
    ordem: 2,
    label: 'Transporte e armazenagem',
    resumo: 'Junta o transporte com armazenagem padrão, sem operar a cadeia inteira.',
  },
  {
    id: 'operacao_integrada',
    ordem: 3,
    label: 'Operação integrada',
    resumo: 'Opera frota, armazéns e a gestão completa do dia a dia logístico do cliente.',
  },
  {
    id: 'gestao_estrategica',
    ordem: 4,
    label: 'Gestão estratégica da cadeia',
    resumo: 'Coordena outros operadores e desenha a estratégia de ponta a ponta.',
  },
  {
    id: 'rede_com_tecnologia',
    ordem: 5,
    label: 'Rede logística com tecnologia',
    resumo: 'Redes amplas, com sistemas, dados e tecnologia no centro da operação.',
  },
]

export function nivelPorId(id?: NivelIntegracaoId) {
  if (!id) return null
  return NIVEIS_INTEGRACAO.find((n) => n.id === id) ?? null
}
