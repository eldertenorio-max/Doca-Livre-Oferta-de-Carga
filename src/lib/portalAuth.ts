/**
 * Autenticação local do Oferta de Carga (contas em localStorage).
 * Envio de e-mail OTP: use `portalApi.ts` (Edge Function + Resend, como no WMS).
 * As funções OTP abaixo são fallback de desenvolvimento.
 */

import { isLocalSuperUser } from './superUsers'
import {
  DEFAULT_PERMISSAO_MINERVA,
  DEFAULT_PERMISSAO_TRANSPORTADOR,
  SUPER_PERMISSAO,
  type OfertaPermissao,
} from './portalModules'
import type { PerfilOperacional, UserRole } from '../types'

const USERS_KEY = 'doca-livre-oferta-users-v2'
const OTP_KEY = 'doca-livre-oferta-otp-v1'
const PERMS_KEY = 'doca-livre-oferta-perms-v1'

export type PortalAccount = {
  id: string
  usuario: string
  email: string
  password: string
  nome: string
  role: UserRole | 'super'
  transportador_id?: string | null
  empresa_org_id?: string | null
  nivel?: 'super' | 'gestor' | 'operador'
  /** PPT §9 — Administrador | Operador | Consulta */
  perfil_operacional?: PerfilOperacional
  ativo: boolean
  created_at: string
}

type OtpRecord = {
  email: string
  codigo: string
  finalidade: 'cadastro' | 'senha'
  expira_em: number
}

function uid() {
  return `u-${Math.random().toString(36).slice(2, 10)}`
}

/** Conta demo pronta para testar o Kanban do transportador. */
export const DEMO_TRANSPORTADOR = {
  id: 'u-santos',
  usuario: 'santos',
  email: 'santos@transportes.com',
  password: 'santos123',
  nome: 'Santos Transportes',
  transportador_id: 't1',
} as const

export function loadPortalAccounts(): PortalAccount[] {
  try {
    const raw = localStorage.getItem(USERS_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as PortalAccount[]
      let list = parsed.filter((u) => !isContaMinervaDemo(u))
      list = ensureDemoTransportador(list)
      savePortalAccounts(list)
      return list
    }
  } catch {
    /* ignore */
  }
  return seedAccounts()
}

function isContaMinervaDemo(u: PortalAccount) {
  const email = (u.email || '').toLowerCase()
  const usuario = (u.usuario || '').toLowerCase()
  return (
    u.id === 'u-minerva' ||
    email === 'minerva@docalivre.com' ||
    usuario === 'minerva'
  )
}

function demoTransportadorAccount(): PortalAccount {
  return {
    id: DEMO_TRANSPORTADOR.id,
    usuario: DEMO_TRANSPORTADOR.usuario,
    email: DEMO_TRANSPORTADOR.email,
    password: DEMO_TRANSPORTADOR.password,
    nome: DEMO_TRANSPORTADOR.nome,
    role: 'transportador',
    transportador_id: DEMO_TRANSPORTADOR.transportador_id,
    nivel: 'operador',
    ativo: true,
    created_at: new Date().toISOString(),
  }
}

/** Garante que a conta demo Santos exista e esteja ativa. */
function ensureDemoTransportador(list: PortalAccount[]): PortalAccount[] {
  const demo = demoTransportadorAccount()
  const idx = list.findIndex(
    (u) =>
      u.id === demo.id ||
      u.email.toLowerCase() === demo.email ||
      u.usuario.toLowerCase() === demo.usuario,
  )
  if (idx < 0) return [demo, ...list]
  const next = [...list]
  next[idx] = {
    ...next[idx],
    ...demo,
    created_at: next[idx].created_at || demo.created_at,
  }
  return next
}

function seedAccounts(): PortalAccount[] {
  const seed: PortalAccount[] = [
    demoTransportadorAccount(),
    {
      id: 'u-novaera',
      usuario: 'novaera',
      email: 'novaera@log.com',
      password: 'novaera123',
      nome: 'Log Nova Era',
      role: 'transportador',
      transportador_id: 't2',
      nivel: 'operador',
      ativo: true,
      created_at: new Date().toISOString(),
    },
  ]
  savePortalAccounts(seed)
  return seed
}

export function savePortalAccounts(list: PortalAccount[]) {
  localStorage.setItem(USERS_KEY, JSON.stringify(list))
}

export function loadPermissoesMap(): Record<string, OfertaPermissao> {
  try {
    const raw = localStorage.getItem(PERMS_KEY)
    if (raw) return JSON.parse(raw) as Record<string, OfertaPermissao>
  } catch {
    /* ignore */
  }
  return {}
}

export function savePermissoesMap(map: Record<string, OfertaPermissao>) {
  localStorage.setItem(PERMS_KEY, JSON.stringify(map))
}

export function getPermissaoUsuario(account: PortalAccount): OfertaPermissao {
  if (account.role === 'super' || isLocalSuperUser(account.usuario) || isLocalSuperUser(account.email)) {
    return SUPER_PERMISSAO
  }
  const stored = loadPermissoesMap()[account.usuario]
  if (stored) return stored
  if (account.role === 'transportador') return DEFAULT_PERMISSAO_TRANSPORTADOR
  return DEFAULT_PERMISSAO_MINERVA
}

function saveOtp(rec: OtpRecord) {
  localStorage.setItem(OTP_KEY, JSON.stringify(rec))
}

function loadOtp(): OtpRecord | null {
  try {
    const raw = localStorage.getItem(OTP_KEY)
    if (!raw) return null
    return JSON.parse(raw) as OtpRecord
  } catch {
    return null
  }
}

function genCodigo() {
  return String(Math.floor(100000 + Math.random() * 900000))
}

export async function portalCadastroEnviarCodigo(email: string): Promise<
  { ok: true; mensagem?: string; debug_codigo?: string } | { ok: false; erro: string }
> {
  const e = email.trim().toLowerCase()
  if (!e || !e.includes('@')) return { ok: false, erro: 'Informe um e-mail válido.' }
  const users = loadPortalAccounts()
  if (users.some((u) => u.email.toLowerCase() === e)) {
    return { ok: false, erro: 'Este e-mail já está cadastrado.' }
  }
  const codigo = genCodigo()
  saveOtp({ email: e, codigo, finalidade: 'cadastro', expira_em: Date.now() + 15 * 60_000 })
  return {
    ok: true,
    mensagem: 'Código gerado. Use-o para confirmar o e-mail.',
    debug_codigo: codigo,
  }
}

export async function portalCadastroVerificarCodigo(
  email: string,
  codigo: string,
): Promise<{ ok: true; verify_token: string; mensagem?: string } | { ok: false; erro: string }> {
  const otp = loadOtp()
  const e = email.trim().toLowerCase()
  if (!otp || otp.email !== e || otp.finalidade !== 'cadastro') {
    return { ok: false, erro: 'Solicite um novo código.' }
  }
  if (Date.now() > otp.expira_em) return { ok: false, erro: 'Código expirado. Solicite outro.' }
  if (otp.codigo !== codigo.trim()) return { ok: false, erro: 'Código inválido.' }
  const verify_token = btoa(JSON.stringify({ e, exp: Date.now() + 30 * 60_000, p: 'cadastro' }))
  return { ok: true, verify_token, mensagem: 'E-mail confirmado. Defina usuário e senha.' }
}

export async function portalCadastroConcluir(input: {
  verifyToken: string
  usuario: string
  senha: string
  confirmarSenha: string
}): Promise<{ ok: true; mensagem?: string; usuario?: string } | { ok: false; erro: string }> {
  if (input.senha !== input.confirmarSenha) return { ok: false, erro: 'As senhas não coincidem.' }
  if (input.senha.length < 4) return { ok: false, erro: 'Senha deve ter ao menos 4 caracteres.' }
  if (input.usuario.trim().length < 2) return { ok: false, erro: 'Usuário inválido.' }

  let email = ''
  try {
    const payload = JSON.parse(atob(input.verifyToken)) as { e?: string; exp?: number; p?: string }
    if (!payload.e || payload.p !== 'cadastro') return { ok: false, erro: 'Token inválido.' }
    if ((payload.exp ?? 0) < Date.now()) return { ok: false, erro: 'Token expirado. Confirme o e-mail de novo.' }
    email = payload.e
  } catch {
    return { ok: false, erro: 'Token inválido.' }
  }

  const users = loadPortalAccounts()
  const usuario = input.usuario.trim()
  if (users.some((u) => u.usuario.toLowerCase() === usuario.toLowerCase())) {
    return { ok: false, erro: 'Este usuário já existe.' }
  }
  if (users.some((u) => u.email.toLowerCase() === email)) {
    return { ok: false, erro: 'Este e-mail já está cadastrado.' }
  }

  const isSuper = isLocalSuperUser(usuario) || isLocalSuperUser(email)
  const account: PortalAccount = {
    id: uid(),
    usuario,
    email,
    password: input.senha,
    nome: usuario,
    role: isSuper ? 'super' : 'minerva',
    nivel: isSuper ? 'super' : 'operador',
    ativo: true,
    created_at: new Date().toISOString(),
  }
  savePortalAccounts([...users, account])
  localStorage.removeItem(OTP_KEY)

  return {
    ok: true,
    usuario,
    mensagem: isSuper
      ? 'Super Usuário criado. Faça login.'
      : 'Cadastro realizado. Faça login. Um Super Usuário poderá ajustar suas permissões.',
  }
}

export function portalLoginLocal(
  identificador: string,
  senha: string,
):
  | {
      ok: true
      account: PortalAccount
      isSuperuser: boolean
      permissoes: OfertaPermissao
    }
  | { ok: false; erro: string } {
  const id = identificador.trim().toLowerCase()
  const idAscii = id.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  const users = loadPortalAccounts()
  const account = users.find((u) => {
    const usuario = u.usuario.toLowerCase()
    const email = u.email.toLowerCase()
    const nome = (u.nome || '').toLowerCase()
    return (
      usuario === id ||
      email === id ||
      nome === id ||
      usuario.normalize('NFD').replace(/[\u0300-\u036f]/g, '') === idAscii ||
      nome.normalize('NFD').replace(/[\u0300-\u036f]/g, '') === idAscii
    )
  })
  if (!account || account.password !== senha) {
    return { ok: false, erro: 'Usuário ou senha incorretos.' }
  }
  if (!account.ativo) {
    return {
      ok: false,
      erro: 'Cadastro aguardando aprovação. Você poderá entrar após a liberação.',
    }
  }
  const isSuperuser =
    account.role === 'super' ||
    isLocalSuperUser(account.usuario) ||
    isLocalSuperUser(account.email)
  return {
    ok: true,
    account,
    isSuperuser,
    permissoes: getPermissaoUsuario(account),
  }
}

/** Libera login do transportador após aprovação (Doca Livre Oferta de Carga). */
export function setPortalAccountAtivoPorTransportador(
  transportadorId: string,
  ativo: boolean,
): void {
  const users = loadPortalAccounts()
  savePortalAccounts(
    users.map((u) => (u.transportador_id === transportadorId ? { ...u, ativo } : u)),
  )
}

/** Remove contas de portal vinculadas à transportadora. */
export function removePortalAccountsPorTransportador(transportadorId: string): void {
  const users = loadPortalAccounts()
  savePortalAccounts(users.filter((u) => u.transportador_id !== transportadorId))
}

export async function portalSenhaEnviarCodigo(identificador: string): Promise<
  | { ok: true; mensagem?: string; debug_codigo?: string; email_mascarado?: string }
  | { ok: false; erro: string }
> {
  const id = identificador.trim().toLowerCase()
  const users = loadPortalAccounts()
  const account = users.find(
    (u) => u.usuario.toLowerCase() === id || u.email.toLowerCase() === id,
  )
  if (!account) return { ok: false, erro: 'Conta não encontrada.' }
  const codigo = genCodigo()
  saveOtp({
    email: account.email.toLowerCase(),
    codigo,
    finalidade: 'senha',
    expira_em: Date.now() + 15 * 60_000,
  })
  const [name, domain] = account.email.split('@')
  const mask = `${name.slice(0, 2)}***@${domain}`
  return {
    ok: true,
    mensagem: 'Código gerado.',
    debug_codigo: codigo,
    email_mascarado: mask,
  }
}

export async function portalSenhaVerificarCodigo(
  identificador: string,
  codigo: string,
): Promise<{ ok: true; verify_token: string; usuario?: string } | { ok: false; erro: string }> {
  const id = identificador.trim().toLowerCase()
  const users = loadPortalAccounts()
  const account = users.find(
    (u) => u.usuario.toLowerCase() === id || u.email.toLowerCase() === id,
  )
  if (!account) return { ok: false, erro: 'Conta não encontrada.' }
  const otp = loadOtp()
  if (!otp || otp.email !== account.email.toLowerCase() || otp.finalidade !== 'senha') {
    return { ok: false, erro: 'Solicite um novo código.' }
  }
  if (Date.now() > otp.expira_em) return { ok: false, erro: 'Código expirado.' }
  if (otp.codigo !== codigo.trim()) return { ok: false, erro: 'Código inválido.' }
  const verify_token = btoa(
    JSON.stringify({
      e: account.email.toLowerCase(),
      u: account.usuario,
      exp: Date.now() + 30 * 60_000,
      p: 'senha',
    }),
  )
  return { ok: true, verify_token, usuario: account.usuario }
}

export async function portalSenhaRedefinir(input: {
  verifyToken: string
  senha: string
  confirmarSenha: string
}): Promise<{ ok: true; mensagem?: string; usuario?: string } | { ok: false; erro: string }> {
  if (input.senha !== input.confirmarSenha) return { ok: false, erro: 'As senhas não coincidem.' }
  if (input.senha.length < 4) return { ok: false, erro: 'Senha deve ter ao menos 4 caracteres.' }
  try {
    const payload = JSON.parse(atob(input.verifyToken)) as {
      e?: string
      u?: string
      exp?: number
      p?: string
    }
    if (payload.p !== 'senha' || (payload.exp ?? 0) < Date.now()) {
      return { ok: false, erro: 'Token inválido ou expirado.' }
    }
    const users = loadPortalAccounts()
    const idx = users.findIndex(
      (u) => u.email.toLowerCase() === payload.e || u.usuario === payload.u,
    )
    if (idx < 0) return { ok: false, erro: 'Conta não encontrada.' }
    users[idx] = { ...users[idx], password: input.senha }
    savePortalAccounts(users)
    localStorage.removeItem(OTP_KEY)
    return { ok: true, usuario: users[idx].usuario, mensagem: 'Senha atualizada. Faça login.' }
  } catch {
    return { ok: false, erro: 'Token inválido.' }
  }
}
