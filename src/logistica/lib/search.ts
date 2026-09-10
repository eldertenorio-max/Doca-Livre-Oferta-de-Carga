import type { CategoriaId, Empresa, NivelIntegracaoId, OrigemCadastro } from '../types'
import {
  CATEGORIAS,
  NIVEIS_INTEGRACAO,
  SUBCATEGORIAS_POR_CATEGORIA,
} from './categorias'
import { ORIGEM_META, REGIOES } from './painelStats'
import { textoOperacaoParaBusca } from './perfilOperacional'
import { UF_NOMES } from './geo'

export function semAcento(s: string) {
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
}

function tokensDaBusca(q: string): string[] {
  return semAcento(q)
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length >= 2)
}

const SINONIMOS: Record<string, string[]> = {
  peca: ['peca', 'pecas', 'pecas para empilhadeiras', 'peca para empilhadeira', 'reposicao'],
  pecas: ['peca', 'pecas', 'pecas para empilhadeiras', 'reposicao'],
  empilhadeira: ['empilhadeira', 'empilhadeiras', 'forklift', 'movimentacao'],
  empilhadeiras: ['empilhadeira', 'empilhadeiras', 'forklift'],
  aluga: ['aluga', 'aluguel', 'locacao', 'locacao de empilhadeiras', 'locadora'],
  aluguel: ['aluga', 'aluguel', 'locacao', 'locadora'],
  locacao: ['aluga', 'aluguel', 'locacao', 'locadora'],
  vende: ['vende', 'venda', 'venda de empilhadeiras', 'comercializacao'],
  venda: ['vende', 'venda', 'comercializacao'],
  manutencao: ['manutencao', 'assistencia', 'assistencia tecnica', 'oficina'],
  wms: ['wms', 'gestao de estoque', 'armazem'],
  tms: ['tms', 'gestao de transporte', 'frete'],
  frio: ['frio', 'frigorifico', 'refrigerado', 'cadeia fria', 'camara fria'],
  refrigerado: ['frio', 'frigorifico', 'refrigerado', 'cadeia fria'],
  fracionada: ['fracionada', 'fracionado', 'carga fracionada'],
  lotacao: ['lotacao', 'carga lotacao', 'fechada'],
  perigosa: ['perigosa', 'cargas perigosas', 'produtos perigosos'],
  granel: ['granel'],
  ecommerce: ['ecommerce', 'e-commerce', 'last mile', 'encomenda'],
  coleta: ['coleta', 'coleta e entrega'],
  carreta: ['carreta', 'cavalo mecanico'],
  bitrem: ['bitrem'],
  cabotagem: ['cabotagem', 'maritimo'],
  aereo: ['aereo', 'carga aerea'],
}

function textoEmpresa(e: Empresa, catalogo: Empresa[]): string {
  const nomeUf = UF_NOMES[e.uf as keyof typeof UF_NOMES] ?? e.uf
  return semAcento(
    [
      e.nome_fantasia,
      e.razao_social,
      e.cidade,
      e.uf,
      nomeUf,
      e.categoria,
      e.subcategorias.join(' '),
      e.tags.join(' '),
      e.especialidades.join(' '),
      e.servicos.join(' '),
      e.apresentacao,
      e.area_atuacao,
      e.cobertura ?? '',
      e.cnpj ?? '',
      textoOperacaoParaBusca(e, catalogo),
    ].join(' '),
  )
}

export type FiltrosMapa = {
  query: string
  categoria?: CategoriaId | null
  ufs?: string[]
  regioes?: string[]
  niveis?: NivelIntegracaoId[]
  origens?: OrigemCadastro[]
  funcoes?: string[]
  cidades?: string[]
}

function casaToken(hay: string, token: string) {
  if (hay.includes(token)) return true
  const alts = SINONIMOS[token]
  return alts ? alts.some((a) => hay.includes(a)) : false
}

export function aplicarFiltros(empresas: Empresa[], f: FiltrosMapa): Empresa[] {
  let lista = empresas
  if (f.categoria) lista = lista.filter((e) => e.categoria === f.categoria)
  if (f.ufs?.length) lista = lista.filter((e) => f.ufs!.includes(e.uf))
  if (f.regioes?.length) {
    const ufs = new Set<string>(
      f.regioes.flatMap((id) => [...(REGIOES.find((r) => r.id === id)?.ufs ?? [])]),
    )
    lista = lista.filter((e) => ufs.has(e.uf))
  }
  if (f.niveis?.length) {
    lista = lista.filter((e) => e.nivel_integracao && f.niveis!.includes(e.nivel_integracao))
  }
  if (f.origens?.length) lista = lista.filter((e) => f.origens!.includes(e.origem))
  if (f.cidades?.length) {
    lista = lista.filter((e) =>
      f.cidades!.some((c) => {
        const alvo = semAcento(c)
        return semAcento(e.cidade) === alvo || semAcento(`${e.cidade} ${e.uf}`) === alvo
      }),
    )
  }

  const tokens = [
    ...tokensDaBusca(f.query),
    ...(f.funcoes ?? []).flatMap((fn) => tokensDaBusca(fn)),
  ]
  if (tokens.length === 0) return lista

  return lista.filter((e) => {
    const hay = textoEmpresa(e, empresas)
    return tokens.every((t) => casaToken(hay, t))
  })
}

/**
 * Busca por nome, função, categoria e serviço.
 * Ex.: "empilhadeira" lista quem vende, aluga ou presta serviço no equipamento.
 * Ex.: "peça empilhadeira" exige os dois sentidos (peças + empilhadeira).
 */
export function filtrarEmpresas(
  empresas: Empresa[],
  query: string,
  categoriaId?: string | null,
): Empresa[] {
  return aplicarFiltros(empresas, { query, categoria: (categoriaId as CategoriaId) ?? null })
}

export function toggleItem<T>(lista: T[], valor: T): T[] {
  return lista.includes(valor) ? lista.filter((x) => x !== valor) : [...lista, valor]
}

export function nomeMarca(e: Empresa) {
  const n = e.nome_fantasia
  const sep = n.indexOf(' — ')
  return sep >= 0 ? n.slice(0, sep) : n
}

export function empresasPorNome(empresas: Empresa[], termo: string): Empresa[] {
  const q = semAcento(termo).trim()
  if (q.length < 2) return []
  return empresas
    .filter((e) => {
      const nome = semAcento(e.nome_fantasia)
      const razao = semAcento(e.razao_social)
      return nome.includes(q) || razao.includes(q)
    })
    .sort((a, b) => {
      const aMatriz = a.hierarquia_superior ? 1 : 0
      const bMatriz = b.hierarquia_superior ? 1 : 0
      if (aMatriz !== bMatriz) return aMatriz - bMatriz
      return a.cidade.localeCompare(b.cidade, 'pt-BR') || a.nome_fantasia.localeCompare(b.nome_fantasia, 'pt-BR')
    })
}

export function slugify(nome: string) {
  return semAcento(nome)
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

export type TipoSugestao =
  | 'funcao'
  | 'categoria'
  | 'empresa'
  | 'lugar'
  | 'uf'
  | 'regiao'
  | 'nivel'
  | 'origem'

export type SugestaoBusca = {
  texto: string
  tipo: TipoSugestao
  detalhe?: string
  valor?: string
}

const FRASES_CURADAS: SugestaoBusca[] = [
  { texto: 'empilhadeira', tipo: 'funcao', detalhe: 'Venda, locação ou serviço' },
  { texto: 'peça empilhadeira', tipo: 'funcao', detalhe: 'Só peças' },
  { texto: 'locação de empilhadeiras', tipo: 'funcao' },
  { texto: 'venda de empilhadeiras', tipo: 'funcao' },
  { texto: 'manutenção de empilhadeiras', tipo: 'funcao' },
  { texto: 'carga fracionada', tipo: 'funcao' },
  { texto: 'carga lotação', tipo: 'funcao' },
  { texto: 'cargas perigosas', tipo: 'funcao' },
  { texto: 'granel', tipo: 'funcao' },
  { texto: 'last mile', tipo: 'funcao' },
  { texto: 'e-commerce', tipo: 'funcao' },
  { texto: 'coleta e entrega', tipo: 'funcao' },
  { texto: 'cadeia fria', tipo: 'funcao' },
  { texto: 'transporte refrigerado', tipo: 'funcao' },
  { texto: 'carga aérea', tipo: 'funcao' },
  { texto: 'cabotagem', tipo: 'funcao' },
  { texto: 'carreta', tipo: 'funcao' },
  { texto: 'operador logístico', tipo: 'funcao' },
  { texto: 'armazenagem', tipo: 'funcao' },
  { texto: 'WMS', tipo: 'funcao' },
  { texto: 'TMS', tipo: 'funcao' },
  { texto: 'pallets', tipo: 'funcao' },
  { texto: 'logística reversa', tipo: 'funcao' },
  { texto: 'porto', tipo: 'funcao' },
  { texto: 'consultoria', tipo: 'funcao' },
]

const LABEL_TIPO: Record<TipoSugestao, string> = {
  funcao: 'Função',
  categoria: 'Categoria',
  empresa: 'Empresa',
  lugar: 'Cidade',
  uf: 'Estado',
  regiao: 'Região',
  nivel: 'Integração',
  origem: 'Origem',
}

export function labelTipoSugestao(tipo: TipoSugestao) {
  return LABEL_TIPO[tipo]
}

export function frasesSugestaoRapida() {
  return FRASES_CURADAS
}

function catalogoSugestoes(empresas: Empresa[]): SugestaoBusca[] {
  const lista: SugestaoBusca[] = [...FRASES_CURADAS]

  for (const c of CATEGORIAS) {
    lista.push({ texto: c.label, tipo: 'categoria', valor: c.id, detalhe: c.descricao })
  }
  for (const n of NIVEIS_INTEGRACAO) {
    lista.push({ texto: n.label, tipo: 'nivel', valor: n.id, detalhe: n.resumo })
  }
  for (const r of REGIOES) {
    lista.push({ texto: r.label, tipo: 'regiao', valor: r.id, detalhe: r.ufs.join(', ') })
  }
  for (const [id, meta] of Object.entries(ORIGEM_META)) {
    lista.push({ texto: meta.label, tipo: 'origem', valor: id })
  }
  for (const subs of Object.values(SUBCATEGORIAS_POR_CATEGORIA)) {
    for (const s of subs) lista.push({ texto: s, tipo: 'funcao' })
  }
  for (const t of ['Carga fracionada', 'Carga lotação', 'Cargas perigosas', 'Granel', 'E-commerce / last mile', 'Carga aérea', 'Cabotagem', 'Carreta', 'Empilhadeira']) {
    lista.push({ texto: t, tipo: 'funcao' })
  }
  const ufs = new Set<string>()
  for (const e of empresas) {
    ufs.add(e.uf)
    lista.push({
      texto: e.nome_fantasia,
      tipo: 'empresa',
      detalhe: `${e.cidade}/${e.uf}`,
      valor: e.id,
    })
    if (e.razao_social && semAcento(e.razao_social) !== semAcento(e.nome_fantasia)) {
      lista.push({
        texto: e.razao_social,
        tipo: 'empresa',
        detalhe: `${e.nome_fantasia} · ${e.cidade}/${e.uf}`,
        valor: e.id,
      })
    }
    lista.push({ texto: e.cidade, tipo: 'lugar', detalhe: e.uf, valor: e.cidade })
    lista.push({ texto: `${e.cidade} ${e.uf}`, tipo: 'lugar', valor: e.cidade })
  }
  for (const uf of [...ufs].sort()) {
    lista.push({ texto: uf, tipo: 'uf', valor: uf, detalhe: 'Estado' })
    const nome = UF_NOMES[uf as keyof typeof UF_NOMES]
    if (nome) lista.push({ texto: nome, tipo: 'uf', valor: uf, detalhe: uf })
  }

  const vistos = new Set<string>()
  const unicos: SugestaoBusca[] = []
  for (const item of lista) {
    const key =
      item.tipo === 'empresa'
        ? `${item.tipo}:${item.valor}:${semAcento(item.texto)}`
        : `${item.tipo}:${semAcento(item.valor ?? item.texto)}`
    if (!key || vistos.has(key)) continue
    vistos.add(key)
    unicos.push(item)
  }
  return unicos
}

function pontuaSugestao(item: SugestaoBusca, q: string): number {
  const t = semAcento(item.texto)
  if (t === q) return 400
  if (t.startsWith(q)) return 300
  const palavras = t.split(/\s+/)
  if (palavras.some((p) => p.startsWith(q))) return 200
  if (t.includes(q)) return 100
  return 0
}

const PESO_TIPO: Record<TipoSugestao, number> = {
  funcao: 30,
  categoria: 22,
  nivel: 16,
  uf: 14,
  regiao: 12,
  origem: 10,
  empresa: 10,
  lugar: 8,
}

/** Sugestões clicáveis. Com o campo vazio, mostra atalhos para selecionar. */
export function sugerirBusca(query: string, empresas: Empresa[], limite = 8): SugestaoBusca[] {
  const q = semAcento(query).trim()
  if (!q) return FRASES_CURADAS.slice(0, limite)

  const porNome = empresasPorNome(empresas, query)
  const grupo: SugestaoBusca[] =
    porNome.length > 0
      ? [
          {
            texto: query.trim(),
            tipo: 'empresa',
            detalhe:
              porNome.length === 1
                ? '1 empresa — escolha na lista'
                : `${porNome.length} empresas — escolha na lista`,
          },
        ]
      : []
  const empresasSug: SugestaoBusca[] = porNome.slice(0, 12).map((e) => ({
    texto: e.nome_fantasia,
    tipo: 'empresa',
    detalhe: `${e.cidade}/${e.uf}`,
    valor: e.id,
  }))

  const outros = catalogoSugestoes(empresas)
    .map((item) => ({ item, pontos: pontuaSugestao(item, q) + PESO_TIPO[item.tipo] }))
    .filter((x) => x.pontos >= 100 && x.item.tipo !== 'empresa')
    .sort((a, b) => b.pontos - a.pontos || a.item.texto.localeCompare(b.item.texto, 'pt-BR'))
    .map((x) => x.item)

  return [...grupo, ...empresasSug, ...outros].slice(0, Math.max(limite, grupo.length + empresasSug.length))
}

export function ufsDoCadastro(empresas: Empresa[]) {
  const map = new Map<string, number>()
  for (const e of empresas) map.set(e.uf, (map.get(e.uf) || 0) + 1)
  return [...map.entries()]
    .map(([uf, qtd]) => ({ uf, qtd }))
    .sort((a, b) => b.qtd - a.qtd || a.uf.localeCompare(b.uf))
}

export function cidadesDoCadastro(empresas: Empresa[], limite?: number) {
  const map = new Map<string, { cidade: string; uf: string; qtd: number }>()
  for (const e of empresas) {
    const key = `${e.cidade}|${e.uf}`
    const atual = map.get(key)
    if (atual) atual.qtd += 1
    else map.set(key, { cidade: e.cidade, uf: e.uf, qtd: 1 })
  }
  const lista = [...map.values()].sort((a, b) => b.qtd - a.qtd)
  return limite != null ? lista.slice(0, limite) : lista
}

export function funcoesDoFiltro(categoria: CategoriaId | null) {
  if (categoria) return SUBCATEGORIAS_POR_CATEGORIA[categoria]
  return FRASES_CURADAS.map((f) => f.texto)
}

export function todasFuncoesFiltro() {
  const set = new Set<string>(FRASES_CURADAS.map((f) => f.texto))
  for (const subs of Object.values(SUBCATEGORIAS_POR_CATEGORIA)) {
    for (const s of subs) set.add(s)
  }
  return [...set]
}
