/**
 * Cadastro público de transportador — local + Supabase quando configurado.
 */

import { isSupabaseConfigured, supabase } from './supabase'
import { portalCriarUsuarioAuth } from './portalApi'
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
    /** Token do OTP — evita signUp (rate limit de e-mail do Auth) */
    verifyToken?: string
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

function traduzirErroAuth(msg: string): string {
  if (/security purposes|only request this after|rate limit|too many requests/i.test(msg)) {
    return 'Aguarde alguns segundos e clique em Enviar cadastro de novo (proteção do servidor de login).'
  }
  if (/already|registered|exists/i.test(msg)) {
    return 'Este e-mail já possui conta. Use outro e-mail ou faça login.'
  }
  return msg
}

async function sleep(ms: number) {
  await new Promise((r) => setTimeout(r, ms))
}

async function criarUsuarioAuthCadastro(
  input: CadastroTransportadorInput,
  email: string,
): Promise<{ ok: true; userId: string } | { ok: false; erro: string }> {
  const nome = input.acesso.nome.trim() || input.empresa.nome_fantasia.trim()
  const usuario = input.acesso.usuario.trim()

  if (input.acesso.verifyToken) {
    const viaEdge = await portalCriarUsuarioAuth({
      verifyToken: input.acesso.verifyToken,
      email,
      senha: input.acesso.senha,
      usuario,
      nome,
    })
    if (viaEdge.ok) return { ok: true, userId: viaEdge.user_id }
    if (!viaEdge.erro.startsWith('__FALLBACK__')) {
      return { ok: false, erro: traduzirErroAuth(viaEdge.erro) }
    }
  }

  if (!supabase) return { ok: false, erro: 'Supabase não configurado.' }

  const meta = { nome, usuario, role: 'transportador' as const }
  let authErr: { message: string } | null = null
  let userId: string | undefined

  for (let attempt = 0; attempt < 2; attempt++) {
    const { data: authData, error } = await supabase.auth.signUp({
      email,
      password: input.acesso.senha,
      options: { data: meta },
    })
    if (!error && authData.user?.id) {
      userId = authData.user.id
      authErr = null
      break
    }
    authErr = error
    if (error && /security purposes|after \d+ seconds/i.test(error.message) && attempt === 0) {
      await sleep(8000)
      continue
    }
    break
  }

  if (authErr) return { ok: false, erro: traduzirErroAuth(authErr.message) }
  if (!userId) return { ok: false, erro: 'Falha ao criar usuário no Supabase.' }
  return { ok: true, userId }
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
  const auth = await criarUsuarioAuthCadastro(input, email)
  if (!auth.ok) return { ok: false, erro: auth.erro }
  const userId = auth.userId

  // Sessão necessária para RLS nos inserts (admin createUser não loga o client)
  const { error: signInErr } = await supabase.auth.signInWithPassword({
    email,
    password: input.acesso.senha,
  })
  if (signInErr) {
    return { ok: false, erro: traduzirErroAuth(signInErr.message) }
  }

  const payloadEmpresa = {
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
    telefone: input.empresa.telefone ?? null,
    email: input.empresa.email || email,
    contato_nome: input.empresa.contato_nome ?? null,
    contato_telefone: input.empresa.contato_telefone ?? null,
    situacao: 'pendente' as const,
    motivo_recusa: null,
  }

  const { data: existente } = await supabase
    .from('transportadores')
    .select('*')
    .eq('cnpj', payloadEmpresa.cnpj)
    .maybeSingle()

  if (existente && existente.situacao !== 'recusado') {
    return {
      ok: false,
      erro: 'Este CNPJ já está cadastrado. Se o acesso estiver bloqueado, fale com o embarcador.',
    }
  }

  let tRow = existente
  if (existente?.situacao === 'recusado') {
    const { data: updated, error: upErr } = await supabase
      .from('transportadores')
      .update({
        ...payloadEmpresa,
        classificacao: existente.classificacao ?? 'bronze',
        pontuacao: existente.pontuacao ?? 50,
      })
      .eq('id', existente.id)
      .select('*')
      .single()
    if (upErr || !updated) {
      return { ok: false, erro: upErr?.message || 'Falha ao reenviar cadastro recusado.' }
    }
    tRow = updated
    await supabase.from('transportador_documentos').delete().eq('transportador_id', existente.id)
  } else {
    const { data: inserted, error: tErr } = await supabase
      .from('transportadores')
      .insert({
        ...payloadEmpresa,
        classificacao: 'bronze',
        pontuacao: 50,
      })
      .select('*')
      .single()

    if (tErr || !inserted) {
      return { ok: false, erro: tErr?.message || 'Falha ao salvar transportadora.' }
    }
    tRow = inserted
  }

  if (!tRow) {
    return { ok: false, erro: 'Falha ao salvar transportadora.' }
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

  // Conta portal local (mesmo fluxo do cadastro local)
  const now = new Date().toISOString()
  const users = loadPortalAccounts()
  if (!users.some((u) => u.email.toLowerCase() === email || u.usuario.toLowerCase() === input.acesso.usuario.trim().toLowerCase())) {
    savePortalAccounts([
      ...users,
      {
        id: uid('u'),
        usuario: input.acesso.usuario.trim(),
        email,
        password: input.acesso.senha,
        nome: input.acesso.nome.trim() || input.empresa.nome_fantasia.trim(),
        role: 'transportador',
        transportador_id: tRow.id,
        nivel: 'operador',
        ativo: false,
        created_at: now,
      },
    ])
  }

  const documentos: TransportadorDocumento[] = []

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

/** URL para abrir documento (assinada se houver path no Storage; senão usa url salva). */
export async function urlDocumentoTransportador(
  doc: Pick<TransportadorDocumento, 'url' | 'storage_path'>,
): Promise<string> {
  if (doc.url?.startsWith('data:')) return doc.url

  if (isSupabaseConfigured && supabase && doc.storage_path) {
    const { data, error } = await supabase.storage
      .from('documentos-transportadores')
      .createSignedUrl(doc.storage_path, 60 * 60)
    if (!error && data?.signedUrl) return data.signedUrl

    const { data: pub } = supabase.storage
      .from('documentos-transportadores')
      .getPublicUrl(doc.storage_path)
    if (pub?.publicUrl) return pub.publicUrl
  }

  return doc.url
}

export async function submeterCadastroTransportador(
  input: CadastroTransportadorInput,
): Promise<CadastroTransportadorResult> {
  if (isSupabaseConfigured) return cadastrarTransportadorRemoto(input)
  return cadastrarTransportadorLocal(input)
}

function mapTransportadorRow(row: Record<string, unknown>): Transportador {
  return {
    id: String(row.id),
    razao_social: String(row.razao_social ?? ''),
    nome_fantasia: String(row.nome_fantasia ?? ''),
    cnpj: String(row.cnpj ?? ''),
    inscricao_estadual: (row.inscricao_estadual as string | null) ?? undefined,
    inscricao_municipal: (row.inscricao_municipal as string | null) ?? undefined,
    rntrc: (row.rntrc as string | null) ?? undefined,
    cidade: String(row.cidade ?? ''),
    uf: String(row.uf ?? ''),
    endereco: (row.endereco as string | null) ?? undefined,
    numero: (row.numero as string | null) ?? undefined,
    bairro: (row.bairro as string | null) ?? undefined,
    complemento: (row.complemento as string | null) ?? undefined,
    cep: (row.cep as string | null) ?? undefined,
    classificacao: (row.classificacao as Transportador['classificacao']) || 'bronze',
    pontuacao: Number(row.pontuacao ?? 50),
    situacao: (row.situacao as Transportador['situacao']) || 'pendente',
    telefone: (row.telefone as string | null) ?? undefined,
    email: (row.email as string | null) ?? undefined,
    contato_nome: (row.contato_nome as string | null) ?? undefined,
    contato_telefone: (row.contato_telefone as string | null) ?? undefined,
    motivo_recusa: (row.motivo_recusa as string | null) ?? undefined,
    created_at: (row.created_at as string | null) ?? undefined,
  }
}

function mapDocumentoRow(row: Record<string, unknown>): TransportadorDocumento {
  return {
    id: String(row.id),
    transportador_id: String(row.transportador_id),
    tipo: row.tipo as TransportadorDocumento['tipo'],
    nome_arquivo: String(row.nome_arquivo ?? ''),
    url: String(row.url ?? ''),
    storage_path: (row.storage_path as string | null) ?? undefined,
    created_at: String(row.created_at ?? new Date().toISOString()),
  }
}

/** Carrega transportadoras + docs do Supabase (fonte da verdade para aprovação). */
export async function carregarTransportadoresDoSupabase(): Promise<{
  transportadores: Transportador[]
  documentos: TransportadorDocumento[]
} | null> {
  if (!isSupabaseConfigured || !supabase) return null

  const { data: rows, error } = await supabase
    .from('transportadores')
    .select('*')
    .order('created_at', { ascending: false })

  if (error) {
    console.warn('[cadastro] falha ao listar transportadores:', error.message)
    return null
  }

  const { data: docRows, error: docErr } = await supabase
    .from('transportador_documentos')
    .select('*')

  if (docErr) {
    console.warn('[cadastro] falha ao listar documentos:', docErr.message)
  }

  return {
    transportadores: (rows ?? []).map((r) => mapTransportadorRow(r as Record<string, unknown>)),
    documentos: (docRows ?? []).map((r) => mapDocumentoRow(r as Record<string, unknown>)),
  }
}
