import { useCallback, useEffect, useState } from 'react'
import { roundMoney } from './businessRules'
import type {
  FaixaKmValor,
  FaixaPesoValor,
  TabelaFrete,
  TipoTabelaFrete,
} from '../types'

const STORAGE_KEY = 'doca-tabelas-frete-v1'
const EVT = 'doca-tabelas-frete'

export const TIPOS_TABELA_FRETE: { id: TipoTabelaFrete; label: string }[] = [
  { id: 'basica', label: 'Tabela básica' },
  { id: 'raio', label: 'Tabela por raio' },
  { id: 'peso', label: 'Tabela por peso' },
  { id: 'complementos', label: 'Complementos' },
]

export function labelTipoTabelaFrete(t: TipoTabelaFrete): string {
  return TIPOS_TABELA_FRETE.find((x) => x.id === t)?.label ?? t
}

export function newTabelaFreteId(): string {
  return `tf_${Math.random().toString(36).slice(2, 10)}`
}

export function newFaixaId(): string {
  return `fx_${Math.random().toString(36).slice(2, 8)}`
}

export function emptyFaixaKm(): FaixaKmValor {
  return { id: newFaixaId(), km_max: 0, valor: 0 }
}

export function emptyFaixaPeso(): FaixaPesoValor {
  return { id: newFaixaId(), peso_max: 0, valor: 0 }
}

export function emptyTabelaFrete(tipo: TipoTabelaFrete): TabelaFrete {
  return {
    id: newTabelaFreteId(),
    tipo,
    nome: '',
    codigo: '',
    perfil_veiculo: '',
    capacidade_kg: 0,
    faixa_peso: false,
    tipologia: '',
    ano_veiculo: undefined,
    situacao: 'ativo',
    updated_at: new Date().toISOString(),
    diaria: 0,
    qtd_diaria: 1,
    valor_saida: 0,
    pernoite: 0,
    valor_km: 0,
    franquia_km: 0,
    km_excedente: 0,
    valor_por_km: 'max_roteirizado',
    pagamento_por: 'planejado',
    diaria_dinamica: [],
    diaria_dinamica_peso: [],
    faixas_km: [],
    faixas_peso: [],
    valor_kg: 0,
    ajudante: 0,
    diesel: 0,
    chapa: 0,
    pedagio: 0,
    adicional_entrega: 0,
    descarga: 0,
    imposto: 0,
    incentivo: 0,
    adicional_escada: 0,
    adicional_cidade: 0,
    contar_cidade_origem: false,
    adicional_sobre_frete_base_pct: 0,
    saida_dinamica: [],
    adicional_por_km: [],
  }
}

function n(v: unknown): number {
  const x = Number(v)
  return Number.isFinite(x) ? x : 0
}

function faixaKmDaLista(list: FaixaKmValor[] | undefined, km: number): number {
  const faixas = [...(list ?? [])]
    .filter((f) => n(f.km_max) > 0 || n(f.valor) > 0)
    .sort((a, b) => n(a.km_max) - n(b.km_max))
  if (faixas.length === 0) return 0
  const hit = faixas.find((f) => km <= n(f.km_max)) ?? faixas[faixas.length - 1]
  return n(hit.valor)
}

function faixaPesoDaLista(list: FaixaPesoValor[] | undefined, peso: number): number {
  const faixas = [...(list ?? [])]
    .filter((f) => n(f.peso_max) > 0 || n(f.valor) > 0)
    .sort((a, b) => n(a.peso_max) - n(b.peso_max))
  if (faixas.length === 0) return 0
  const hit = faixas.find((f) => peso <= n(f.peso_max)) ?? faixas[faixas.length - 1]
  return n(hit.valor)
}

/** Frete tabela: diária + franquia de km + km excedente (e faixas, se houver). */
export function calcularFreteDaTabela(
  t: TabelaFrete,
  ctx: { km: number; peso: number },
): number {
  const km = Math.max(0, n(ctx.km))
  const peso = Math.max(0, n(ctx.peso))

  if (t.tipo === 'basica') {
    const qtd = Math.max(1, n(t.qtd_diaria) || 1)
    let diaria = n(t.diaria)
    const faixaKm = faixaKmDaLista(t.diaria_dinamica, km)
    if (faixaKm > 0) diaria = faixaKm
    const faixaPeso = faixaPesoDaLista(t.diaria_dinamica_peso, peso)
    if (faixaPeso > 0) diaria = faixaPeso
    const extraKm = Math.max(0, km - n(t.franquia_km))
    return roundMoney(
      diaria * qtd + n(t.valor_saida) + n(t.pernoite) + extraKm * n(t.km_excedente),
    )
  }

  if (t.tipo === 'raio') {
    return roundMoney(faixaKmDaLista(t.faixas_km, km))
  }

  if (t.tipo === 'peso') {
    return roundMoney(faixaPesoDaLista(t.faixas_peso, peso))
  }

  let v =
    n(t.valor_kg) * peso +
    n(t.ajudante) +
    n(t.diesel) +
    n(t.chapa) +
    n(t.pedagio) +
    n(t.adicional_entrega) +
    n(t.descarga) +
    n(t.imposto) +
    n(t.incentivo) +
    n(t.adicional_escada) +
    n(t.adicional_cidade)
  v += faixaKmDaLista(t.saida_dinamica, km)
  v += faixaKmDaLista(t.adicional_por_km, km)
  return roundMoney(v)
}

export function loadTabelasFrete(): TabelaFrete[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed.filter((x) => x && typeof x === 'object' && typeof x.id === 'string')
  } catch {
    return []
  }
}

function persistTabelasFrete(list: TabelaFrete[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(list))
  window.dispatchEvent(new Event(EVT))
}

export function salvarTabelaFreteStorage(t: TabelaFrete): TabelaFrete {
  const now = new Date().toISOString()
  const item: TabelaFrete = {
    ...t,
    id: t.id || newTabelaFreteId(),
    nome: (t.nome || '').trim(),
    codigo: (t.codigo || '').trim(),
    perfil_veiculo: (t.perfil_veiculo || '').trim(),
    updated_at: now,
    situacao: t.situacao === 'inativo' ? 'inativo' : 'ativo',
  }
  const prev = loadTabelasFrete()
  const idx = prev.findIndex((x) => x.id === item.id)
  const next = idx >= 0 ? prev.map((x) => (x.id === item.id ? item : x)) : [...prev, item]
  persistTabelasFrete(next)
  return item
}

export function excluirTabelaFreteStorage(id: string) {
  persistTabelasFrete(loadTabelasFrete().filter((x) => x.id !== id))
}

export function useTabelasFrete() {
  const [tabelas, setTabelas] = useState<TabelaFrete[]>(() => loadTabelasFrete())

  useEffect(() => {
    const refresh = () => setTabelas(loadTabelasFrete())
    window.addEventListener(EVT, refresh)
    window.addEventListener('storage', refresh)
    return () => {
      window.removeEventListener(EVT, refresh)
      window.removeEventListener('storage', refresh)
    }
  }, [])

  const salvarTabela = useCallback((t: TabelaFrete) => salvarTabelaFreteStorage(t), [])
  const excluirTabela = useCallback((id: string) => excluirTabelaFreteStorage(id), [])

  return { tabelas, salvarTabela, excluirTabela }
}
