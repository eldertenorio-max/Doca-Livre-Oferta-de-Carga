/**
 * Cadastro público de transportador — local + Supabase quando configurado.
 */

import { isSupabaseConfigured, supabase } from './supabase'
import {
  loadPortalAccounts,
  savePortalAccounts,
  type PortalAccount,
} from './portalAuth'
import { DOCUMENTOS_TRANSPORTADOR, TIPOS_DOC_OBRIGATORIOS } from './transportadorDocs'
import type {
  Transportador,
  TransportadorDocumento,
  TipoDocumentoTransportador,
} from '../types'

export type CadastroTransportadorInput = {
  empresa: {
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
    telefone?: string
    email?: string
    contato_nome?: string
    contato_telefone?: string
  }
  acesso: {
    usuario: string
    email: string
    senha: string
    confirmarSenha: string
    nome: string
  }
  /** Arquivos por tipo (data URL já lido no front) */
  documentos: Array<{
    tipo: TipoDocumentoTransportador
    nome_arquivo: string
    data_url: string
    file?: File
  }>
}

function uid(prefix: string) {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`
}

export function validarCadastroTransportador(
  input: CadastroTransportadorInput,
): string | null {
  const e = input.empresa
  if (!e.razao_social.trim() || !e.nome_fantasia.trim() || !e.cnpj.trim()) {
    return 'Preencha Razão Social, Nome Fantasia e CNPJ.'
  }
  if (!e.cidade.trim() || !e.uf.trim()) return 'Preencha cidade e UF.'
  if (!e.contato_nome?.trim() || !e.telefone?.trim()) {
    return 'Preencha nome do responsável e telefone.'
  }

  for (const tipo of TIPOS_DOC_OBRIGATORIOS) {
    if (!input.documentos.some((d) => d.tipo === tipo && d.data_url)) {
      const label = DOCUMENTOS_TRANSPORTADOR.find((x) => x.tipo === tipo)?.label ?? tipo
      return `Anexo obrigatório faltando: ${label}.`
    }
  }

  const a = input.acesso
  if (a.usuario.trim().length < 2) return 'Usuário inválido.'
  if (!a.email.includes('@')) return 'E-mail de acesso inválido.'
  if (a.senha.length < 4) return 'Senha deve ter ao menos 4 caracteres.'
  if (a.senha !== a.confirmarSenha) return 'As senhas não coincidem.'

  const users = loadPortalAccounts()
  if (users.some((u) => u.usuario.toLowerCase() === a.usuario.trim().toLowerCase())) {
    return 'Este usuário já existe.'
  }
  if (users.some((u) => u.email.toLowerCase() === a.email.trim().toLowerCase())) {
    return 'Este e-mail já está cadastrado.'
  }

  return null
}

export type CadastroTransportadorResult =
  | {
      ok: true
      modo: 'local' | 'supabase'
      transportador: Transportador
      documentos: TransportadorDocumento[]
      mensagem: string
    }
  | { ok: false; erro: string }

/** Persistência local (demo). No mesmo navegador o embarcador vê o pendente. */
export function cadastrarTransportadorLocal(
  input: CadastroTransportadorInput,
): CadastroTransportadorResult {
  const erro = validarCadastroTransportador(input)
  if (erro) return { ok: false, erro }

  const tid = uid('t')
  const now = new Date().toISOString()
  const transportador: Transportador = {
    id: tid,
    razao_social: input.empresa.razao_social.trim(),
    nome_fantasia: input.empresa.nome_fantasia.trim(),
    cnpj: input.empresa.cnpj.trim(),
    inscricao_estadual: input.empresa.inscricao_estadual,
    inscricao_municipal: input.empresa.inscricao_municipal,
    rntrc: input.empresa.rntrc,
    cidade: input.empresa.cidade.trim(),
    uf: input.empresa.uf.trim().toUpperCase(),
    endereco: input.empresa.endereco,
    numero: input.empresa.numero,
    bairro: input.empresa.bairro,
    complemento: input.empresa.complemento,
    cep: input.empresa.cep,
    classificacao: 'bronze',
    pontuacao: 50,
    situacao: 'pendente',
    telefone: input.empresa.telefone,
    email: input.empresa.email || input.acesso.email.trim(),
    contato_nome: input.empresa.contato_nome,
    contato_telefone: input.empresa.contato_telefone,
    created_at: now,
  }

  const documentos: TransportadorDocumento[] = input.documentos.map((d) => ({
    id: uid('doc'),
    transportador_id: tid,
    tipo: d.tipo,
    nome_arquivo: d.nome_arquivo,
    url: d.data_url,
    created_at: now,
  }))

  const account: PortalAccount = {
    id: uid('u'),
    usuario: input.acesso.usuario.trim(),
    email: input.acesso.email.trim().toLowerCase(),
    password: input.acesso.senha,
    nome: input.acesso.nome.trim() || input.empresa.nome_fantasia.trim(),
    role: 'transportador',
    transportador_id: tid,
    nivel: 'operador',
    ativo: false,
    created_at: now,
  }
  savePortalAccounts([...loadPortalAccounts(), account])

  return {
    ok: true,
    modo: 'local',
    transportador,
    documentos,
    mensagem:
      'Cadastro enviado. Aguarde aprovação para acessar o sistema. (Modo local: só aparece neste navegador até subir Supabase + Render.)',
  }
}

export async function cadastrarTransportadorRemoto(
  input: CadastroTransportadorInput,
): Promise<CadastroTransportadorResult> {
  if (!isSupabaseConfigured || !supabase) {
    return cadastrarTransportadorLocal(input)
  }

  const erro = validarCadastroTransportador(input)
  if (erro) return { ok: false, erro }

  const email = input.acesso.email.trim().toLowerCase()
  const { data: authData, error: authErr } = await supabase.auth.signUp({
    email,
    password: input.acesso.senha,
    options: {
      data: {
        nome: input.acesso.nome.trim() || input.empresa.nome_fantasia.trim(),
        usuario: input.acesso.usuario.trim(),
        role: 'transportador',
      },
    },
  })
  if (authErr) return { ok: false, erro: authErr.message }
  const userId = authData.user?.id
  if (!userId) return { ok: false, erro: 'Falha ao criar usuário no Supabase.' }

  const { data: tRow, error: tErr } = await supabase
    .from('transportadores')
    .insert({
      razao_social: input.empresa.razao_social.trim(),
      nome_fantasia: input.empresa.nome_fantasia.trim(),
      cnpj: input.empresa.cnpj.trim(),
      inscricao_estadual: input.empresa.inscricao_estadual ?? null,
      inscricao_municipal: input.empresa.inscricao_municipal ?? null,
      rntrc: input.empresa.rntrc ?? null,
      cidade: input.empresa.cidade.trim(),
      uf: input.empresa.uf.trim().toUpperCase().slice(0, 2),
      endereco: input.empresa.endereco ?? null,
      numero: input.empresa.numero ?? null,
      bairro: input.empresa.bairro ?? null,
      complemento: input.empresa.complemento ?? null,
      cep: input.empresa.cep ?? null,
      classificacao: 'bronze',
      pontuacao: 50,
      situacao: 'pendente',
      telefone: input.empresa.telefone ?? null,
      email: input.empresa.email || email,
      contato_nome: input.empresa.contato_nome ?? null,
      contato_telefone: input.empresa.contato_telefone ?? null,
    })
    .select('*')
    .single()

  if (tErr || !tRow) {
    return { ok: false, erro: tErr?.message || 'Falha ao salvar transportadora.' }
  }

  await supabase
    .from('profiles')
    .update({
      role: 'transportador',
      transportador_id: tRow.id,
      nome: input.acesso.nome.trim() || input.empresa.nome_fantasia.trim(),
      usuario: input.acesso.usuario.trim(),
      ativo: false,
    })
    .eq('id', userId)

  const documentos: TransportadorDocumento[] = []
  const now = new Date().toISOString()

  for (const d of input.documentos) {
    const path = `${tRow.id}/${d.tipo}-${Date.now()}-${d.nome_arquivo.replace(/[^\w.\-]+/g, '_')}`
    const blob = d.file ?? (await (await fetch(d.data_url)).blob())
    const { error: upErr } = await supabase.storage
      .from('documentos-transportadores')
      .upload(path, blob, { upsert: true })
    if (upErr) {
      return { ok: false, erro: `Falha no upload de ${d.nome_arquivo}: ${upErr.message}` }
    }
    const { data: pub } = supabase.storage.from('documentos-transportadores').getPublicUrl(path)
    const { data: docRow, error: docErr } = await supabase
      .from('transportador_documentos')
      .insert({
        transportador_id: tRow.id,
        tipo: d.tipo,
        nome_arquivo: d.nome_arquivo,
        storage_path: path,
        url: pub.publicUrl,
      })
      .select('*')
      .single()
    if (docErr) return { ok: false, erro: docErr.message }
    documentos.push({
      id: docRow.id,
      transportador_id: tRow.id,
      tipo: d.tipo,
      nome_arquivo: d.nome_arquivo,
      url: docRow.url ?? pub.publicUrl,
      storage_path: path,
      created_at: docRow.created_at ?? now,
    })
  }

  const transportador: Transportador = {
    id: tRow.id,
    razao_social: tRow.razao_social,
    nome_fantasia: tRow.nome_fantasia,
    cnpj: tRow.cnpj,
    inscricao_estadual: tRow.inscricao_estadual ?? undefined,
    inscricao_municipal: tRow.inscricao_municipal ?? undefined,
    rntrc: tRow.rntrc ?? undefined,
    cidade: tRow.cidade,
    uf: tRow.uf,
    endereco: tRow.endereco ?? undefined,
    numero: tRow.numero ?? undefined,
    bairro: tRow.bairro ?? undefined,
    complemento: tRow.complemento ?? undefined,
    cep: tRow.cep ?? undefined,
    classificacao: tRow.classificacao,
    pontuacao: tRow.pontuacao,
    situacao: 'pendente',
    telefone: tRow.telefone ?? undefined,
    email: tRow.email ?? undefined,
    contato_nome: tRow.contato_nome ?? undefined,
    contato_telefone: tRow.contato_telefone ?? undefined,
    created_at: tRow.created_at,
  }

  return {
    ok: true,
    modo: 'supabase',
    transportador,
    documentos,
    mensagem: 'Cadastro enviado. Aguarde aprovação para acessar o sistema.',
  }
}

export async function submeterCadastroTransportador(
  input: CadastroTransportadorInput,
): Promise<CadastroTransportadorResult> {
  if (isSupabaseConfigured) return cadastrarTransportadorRemoto(input)
  return cadastrarTransportadorLocal(input)
}
