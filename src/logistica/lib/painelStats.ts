import { EMPRESAS } from '../data/empresas'
import { CATEGORIAS, NIVEIS_INTEGRACAO } from './categorias'
import type { CategoriaId, Empresa, OrigemCadastro } from '../types'

export const REGIOES = [
  { id: 'N', label: 'Norte', ufs: ['AC', 'AP', 'AM', 'PA', 'RO', 'RR', 'TO'] },
  { id: 'NE', label: 'Nordeste', ufs: ['AL', 'BA', 'CE', 'MA', 'PB', 'PE', 'PI', 'RN', 'SE'] },
  { id: 'CO', label: 'Centro-Oeste', ufs: ['DF', 'GO', 'MT', 'MS'] },
  { id: 'SE', label: 'Sudeste', ufs: ['ES', 'MG', 'RJ', 'SP'] },
  { id: 'S', label: 'Sul', ufs: ['PR', 'RS', 'SC'] },
] as const

export const ORIGEM_META: Record<
  OrigemCadastro,
  { label: string; cor: string }
> = {
  publico: { label: 'Dados públicos', cor: '#1d4ed8' },
  oferta_carga: { label: 'Oferta de Carga', cor: '#ca8a04' },
  exemplo: { label: 'Cadastro local', cor: '#64748b' },
  cadastro: { label: 'Cadastro da empresa', cor: '#16a34a' },
}

export const NIVEL_CORES = ['#64748b', '#0284c7', '#7c3aed', '#ea580c', '#ca8a04'] as const

export function montarPainel(empresas: Empresa[] = EMPRESAS) {
  const porCat = CATEGORIAS.map((c) => ({
    ...c,
    qtd: empresas.filter((e) => e.categoria === c.id).length,
  }))

  const porNivel = NIVEIS_INTEGRACAO.map((n, i) => ({
    ...n,
    qtd: empresas.filter((e) => e.nivel_integracao === n.id).length,
    cor: NIVEL_CORES[i] ?? '#64748b',
  }))
  const semNivel = empresas.filter((e) => !e.nivel_integracao).length

  const ufs = new Map<string, number>()
  const cidades = new Map<string, number>()
  for (const e of empresas) {
    ufs.set(e.uf, (ufs.get(e.uf) || 0) + 1)
    const chave = `${e.cidade}/${e.uf}`
    cidades.set(chave, (cidades.get(chave) || 0) + 1)
  }
  const porUf = [...ufs.entries()]
    .map(([uf, qtd]) => ({ uf, qtd }))
    .sort((a, b) => b.qtd - a.qtd)
  const porCidade = [...cidades.entries()]
    .map(([label, qtd]) => ({ label, qtd }))
    .sort((a, b) => b.qtd - a.qtd)
    .slice(0, 8)

  const porOrigem = (Object.keys(ORIGEM_META) as OrigemCadastro[]).map((id) => ({
    id,
    ...ORIGEM_META[id],
    qtd: empresas.filter((e) => e.origem === id).length,
  }))

  const porRegiao = REGIOES.map((r) => ({
    ...r,
    qtd: empresas.filter((e) => (r.ufs as readonly string[]).includes(e.uf)).length,
    ufsPresentes: r.ufs.filter((uf) => (ufs.get(uf) || 0) > 0).length,
  }))

  const comCnpj = empresas.filter((e) => Boolean(e.cnpj)).length
  const comSite = empresas.filter((e) => Boolean(e.site_url)).length
  const comTelefone = empresas.filter((e) => Boolean(e.telefone)).length
  const comNivel = empresas.filter((e) => Boolean(e.nivel_integracao)).length

  const maxCat = Math.max(1, ...porCat.map((c) => c.qtd))
  const maxUf = Math.max(1, ...porUf.map((u) => u.qtd))
  const maxCidade = Math.max(1, ...porCidade.map((c) => c.qtd), 1)

  return {
    total: empresas.length,
    transportadoras: empresas.filter((e) => e.categoria === 'transportadoras').length,
    operadores: empresas.filter((e) => e.categoria === 'operadores_logisticos').length,
    cidades: cidades.size,
    ufs: porUf.length,
    porCat,
    porNivel,
    semNivel,
    porUf,
    porCidade,
    porOrigem,
    porRegiao,
    comCnpj,
    comSite,
    comTelefone,
    comNivel,
    maxCat,
    maxUf,
    maxCidade,
  }
}

export function pct(parte: number, total: number) {
  if (total <= 0) return 0
  return Math.round((parte / total) * 100)
}

export function catValida(id: string | null): id is CategoriaId {
  return CATEGORIAS.some((c) => c.id === id)
}
