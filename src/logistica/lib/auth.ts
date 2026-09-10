import type { Empresa, NivelHierarquia } from '../types'
import { EMPRESAS } from '../data/empresas'
import { loadEmpresasCadastro, saveEmpresaCadastro } from './cadastroStore'
import { buscarUsuarioRemoto, salvarUsuarioRemoto, tabelaAindaNaoExiste } from './supabaseSync'

const USERS_KEY = 'mapa-logistica-usuarios-v1'
const SESSION_KEY = 'mapa-logistica-sessao-v1'

export type PapelUsuario = 'super' | 'empresa'

export type ContaUsuario = {
  usuario: string
  email: string
  senha: string
  nome: string
  papel: PapelUsuario
  nivelHierarquia: NivelHierarquia
  superior: string | null
  empresaId?: string
  empresaSlug?: string
}

export type Sessao = Omit<ContaUsuario, 'senha'> & { isSuper: boolean }

export const SUPER_USUARIOS: ContaUsuario[] = [
  {
    usuario: 'Diego',
    email: 'diego@docalivre.com',
    senha: 'diego123',
    nome: 'Diego',
    papel: 'super',
    nivelHierarquia: 'super',
    superior: null,
  },
  {
    usuario: 'Elder',
    email: 'elder@docalivre.com',
    senha: 'Elder123',
    nome: 'Elder',
    papel: 'super',
    nivelHierarquia: 'super',
    superior: null,
  },
]

/** Conta de empresa do mapa, para configurar a interface como a operação vê. */
export const USUARIOS_EMPRESA: ContaUsuario[] = [
  {
    usuario: 'Braspress',
    email: 'braspress@docalivre.com',
    senha: 'braspress123',
    nome: 'Braspress',
    papel: 'empresa',
    nivelHierarquia: 'operador',
    superior: 'Diego',
    empresaId: 'tr-braspress',
    empresaSlug: 'braspress',
  },
]

function loadJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return fallback
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

function saveJson(key: string, value: unknown) {
  localStorage.setItem(key, JSON.stringify(value))
}

function normalizar(s: string) {
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase()
}

export function isSuperUsuario(login: string) {
  const n = normalizar(login)
  return SUPER_USUARIOS.some(
    (u) => normalizar(u.usuario) === n || normalizar(u.email) === n || normalizar(u.email.split('@')[0]) === n,
  )
}

export function loadUsuarios(): ContaUsuario[] {
  const extras = loadJson<ContaUsuario[]>(USERS_KEY, [])
  return [...SUPER_USUARIOS, ...USUARIOS_EMPRESA, ...(Array.isArray(extras) ? extras : [])]
}

export function saveUsuario(conta: ContaUsuario) {
  const extras = loadJson<ContaUsuario[]>(USERS_KEY, []).filter(
    (u) => normalizar(u.usuario) !== normalizar(conta.usuario) && normalizar(u.email) !== normalizar(conta.email),
  )
  extras.push(conta)
  saveJson(USERS_KEY, extras)
}

function semSenha(conta: ContaUsuario): Sessao {
  return {
    usuario: conta.usuario,
    email: conta.email,
    nome: conta.nome,
    papel: conta.papel,
    nivelHierarquia: conta.nivelHierarquia,
    superior: conta.superior,
    empresaId: conta.empresaId,
    empresaSlug: conta.empresaSlug,
    isSuper: conta.papel === 'super' || isSuperUsuario(conta.usuario),
  }
}

export function loadSessao(): Sessao | null {
  return loadJson<Sessao | null>(SESSION_KEY, null)
}

export function saveSessao(sessao: Sessao | null) {
  if (!sessao) localStorage.removeItem(SESSION_KEY)
  else saveJson(SESSION_KEY, sessao)
}

function acharConta(login: string) {
  const n = normalizar(login)
  return loadUsuarios().find(
    (u) =>
      normalizar(u.usuario) === n ||
      normalizar(u.email) === n ||
      normalizar(u.email.split('@')[0] || '') === n,
  )
}

export async function autenticar(
  login: string,
  senha: string,
): Promise<{ ok: true; sessao: Sessao } | { ok: false; erro: string }> {
  const remoto = await buscarUsuarioRemoto(login)
  const conta = remoto ?? acharConta(login)
  if (!conta) return { ok: false, erro: 'Usuário não encontrado.' }
  if (conta.senha !== senha) return { ok: false, erro: 'Senha incorreta.' }
  const sessao = semSenha(conta)
  saveSessao(sessao)
  if (!remoto && conta.papel === 'super') {
    void salvarUsuarioRemoto(conta).catch(() => undefined)
  }
  return { ok: true, sessao }
}

export async function registrarEmpresa(params: {
  empresa: Empresa
  usuario: string
  email: string
  senha: string
  nome: string
  nivelHierarquia: NivelHierarquia
  superior: string
}) {
  const remotoUsuario = await buscarUsuarioRemoto(params.usuario)
  const remotoEmail = await buscarUsuarioRemoto(params.email)
  const loginLivre = !acharConta(params.usuario) && !acharConta(params.email) && !remotoUsuario && !remotoEmail
  if (!loginLivre) throw new Error('Já existe uma conta com esse usuário ou e-mail.')
  if (isSuperUsuario(params.usuario) || isSuperUsuario(params.email)) {
    throw new Error('Esse nome é reservado aos superusuários.')
  }

  await saveEmpresaCadastro(params.empresa)
  const conta: ContaUsuario = {
    usuario: params.usuario,
    email: params.email,
    senha: params.senha,
    nome: params.nome,
    papel: 'empresa',
    nivelHierarquia: params.nivelHierarquia,
    superior: params.superior,
    empresaId: params.empresa.id,
    empresaSlug: params.empresa.slug,
  }
  saveUsuario(conta)
  try {
    await salvarUsuarioRemoto(conta)
  } catch (err) {
    if (!tabelaAindaNaoExiste(err)) {
      throw new Error(err instanceof Error ? err.message : 'Não foi possível gravar o acesso no Supabase.')
    }
  }
  const sessao = semSenha(conta)
  saveSessao(sessao)
  return sessao
}

export function empresaDaSessao(sessao: Sessao | null): Empresa | undefined {
  if (!sessao?.empresaId && !sessao?.empresaSlug) return undefined
  return (
    loadEmpresasCadastro().find((e) => e.id === sessao.empresaId || e.slug === sessao.empresaSlug) ??
    EMPRESAS.find((e) => e.id === sessao.empresaId || e.slug === sessao.empresaSlug)
  )
}
