import { fmtMapsCoords } from './mapsCoords'
import {
  emptyClienteDistribuicao,
  newClienteDistribuicaoId,
} from './cargaDefaults'
import type { ClienteDistribuicao, SeqDistribuicao } from '../types'

export type ClienteDistForm = {
  id: string
  nome: string
  endereco: string
  cnpj: string
  pedido: string
  lat: number | null
  lng: number | null
  mapsStr: string
  cnpjInfo: string
  cnpjOk: boolean
  cnpjBuscando: boolean
}

export type CidadeDistForm = {
  id: string
  cidade: string
  lat: number | null
  lng: number | null
  mapsStr: string
}

export function emptyClienteDistForm(): ClienteDistForm {
  const vazio = emptyClienteDistribuicao()
  return {
    id: vazio.id,
    nome: '',
    endereco: '',
    cnpj: '',
    pedido: '',
    lat: null,
    lng: null,
    mapsStr: '',
    cnpjInfo: '',
    cnpjOk: false,
    cnpjBuscando: false,
  }
}

export function emptyCidadeDistForm(): CidadeDistForm {
  return {
    id: newClienteDistribuicaoId(),
    cidade: '',
    lat: null,
    lng: null,
    mapsStr: '',
  }
}

export function clientesParaForm(list: ClienteDistribuicao[]): ClienteDistForm[] {
  const rows = list
    .filter((c) => c.tipo !== 'cidade')
    .map((c) => ({
      id: c.id || newClienteDistribuicaoId(),
      nome: c.nome || '',
      endereco: c.endereco || '',
      cnpj: c.cnpj || '',
      pedido: c.pedido || '',
      lat: c.lat ?? null,
      lng: c.lng ?? null,
      mapsStr: fmtMapsCoords(c.lat, c.lng),
      cnpjInfo: '',
      cnpjOk: false,
      cnpjBuscando: false,
    }))
  return rows.length > 0 ? rows : [emptyClienteDistForm()]
}

export function cidadesParaForm(list: ClienteDistribuicao[]): CidadeDistForm[] {
  const rows = list
    .filter((c) => c.tipo === 'cidade')
    .map((c) => ({
      id: c.id || newClienteDistribuicaoId(),
      cidade: c.cidade || c.nome || c.endereco || '',
      lat: c.lat ?? null,
      lng: c.lng ?? null,
      mapsStr: fmtMapsCoords(c.lat, c.lng),
    }))
  return rows.length > 0 ? rows : [emptyCidadeDistForm()]
}

export function formParaClientes(rows: ClienteDistForm[]): ClienteDistribuicao[] {
  const out: ClienteDistribuicao[] = []
  for (const r of rows) {
    const nome = r.nome.trim() || r.endereco.trim()
    const endereco = r.endereco.trim()
    if (!nome && !endereco && !r.cnpj.trim()) continue
    out.push({
      id: r.id || newClienteDistribuicaoId(),
      nome: nome || endereco,
      endereco: endereco || undefined,
      cnpj: r.cnpj.trim() || undefined,
      lat: r.lat,
      lng: r.lng,
      pedido: r.pedido.trim() || undefined,
      tipo: 'cliente',
      qtd_entregas: 1,
      qtd_nfs: 1,
      peso: 0,
      valor: 0,
    })
  }
  return out
}

export function formParaCidades(rows: CidadeDistForm[]): ClienteDistribuicao[] {
  const out: ClienteDistribuicao[] = []
  for (const r of rows) {
    const cidade = r.cidade.trim()
    if (!cidade) continue
    out.push({
      id: r.id || newClienteDistribuicaoId(),
      nome: cidade,
      endereco: cidade,
      cidade,
      lat: r.lat,
      lng: r.lng,
      tipo: 'cidade',
      qtd_entregas: 1,
      qtd_nfs: 1,
      peso: 0,
      valor: 0,
    })
  }
  return out
}

export function seqInicial(
  seq: SeqDistribuicao | undefined,
  list: ClienteDistribuicao[],
): SeqDistribuicao {
  if (seq === 'cidades' || seq === 'clientes') return seq
  if (list.length > 0 && list.every((p) => p.tipo === 'cidade')) return 'cidades'
  return 'clientes'
}
