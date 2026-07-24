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
import { isSupabaseConfigured, supabase } from './supabase'

const USERS_KEY = 'doca-livre-oferta-users-v2'
/** Chaves antigas — migra contas criadas antes da troca de versão. */
const USERS_KEY_LEGACY = [
  'doca-livre-oferta-users-v1',
  'doca-livre-portal-users-v1',
]
const OTP_KEY = 'doca-livre-oferta-otp-v1'
const PERMS_KEY = 'doca-livre-oferta-perms-v1'

/** Super Usuários padrão (sempre presentes no portal). */
export const SUPER_ACCOUNTS_SEED = [
  {
    id: 'u-diego',
    usuario: 'diego',
    email: 'diego@docalivre.com',
    password: 'diego123',
    nome: 'Diego Isidoro',
  },
  {
    id: 'u-elder',
    usuario: 'elder',
    email: 'elder@docalivre.com',
    password: 'elder123',
    nome: 'Elder',
  },
] as const

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

/** Contas demo prontas para testar o Kanban do transportador. */
export const DEMO_TRANSPORTADORES = [
  {
    id: 'u-santos',
    usuario: 'santos',
    email: 'santos@transportes.com',
    password: 'santos123',
    nome: 'Santos Transportes',
    transportador_id: 't1',
  },
  {
    id: 'u-novaera',
    usuario: 'novaera',
    email: 'novaera@log.com',
    password: 'novaera123',
    nome: 'Log Nova Era',
    transportador_id: 't2',
  },
] as const

/** @deprecated use DEMO_TRANSPORTADORES[0] */
export const DEMO_TRANSPORTADOR = DEMO_TRANSPORTADORES[0]

function readStoredAccounts(): PortalAccount[] | null {
  try {
    const raw = localStorage.getItem(USERS_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as PortalAccount[]
      if (Array.isArray(parsed)) return parsed
    }
    for (const key of USERS_KEY_LEGACY) {
      const legacy = localStorage.getItem(key)
      if (!legacy) continue
      const parsed = JSON.parse(legacy) as PortalAccount[]
      if (Array.isArray(parsed) && parsed.length > 0) {
        // Migra para a chave atual para não “sumir” conta criada (ex.: Elder)
        localStorage.setItem(USERS_KEY, legacy)
        return parsed
      }
    }
  } catch {
    /* ignore */
  }
  return null
}

function normalizePortalList(parsed: PortalAccount[]): PortalAccount[] {
  // Só Super + transportadores (demos / cadastro público). Sem equipe Minerva/embarcador.
  let list = parsed.filter((u) => u && !isContaEquipeMinerva(u))
  list = ensureSuperUsers(list)
  list = ensureDemoTransportadores(list)
  return list
}

export function loadPortalAccounts(): PortalAccount[] {
  const stored = readStoredAccounts()
  if (stored) {
    const list = normalizePortalList(stored)
    savePortalAccountsLocal(list)
    return list
  }
  return seedAccounts()
}

/** Contas de equipe embarcador (legado) — removidas do portal. */
function isContaEquipeMinerva(u: PortalAccount) {
  if (u.role === 'minerva') return true
  if (u.role === 'transportador' || u.role === 'super') return false
  if (isLocalSuperUser(u.usuario) || isLocalSuperUser(u.email)) return false
  const email = (u.email || '').toLowerCase()
  const usuario = (u.usuario || '').toLowerCase()
  return (
    u.id === 'u-minerva' ||
    email === 'minerva@docalivre.com' ||
    usuario === 'minerva'
  )
}

function demoTransportadorAccount(
  d: (typeof DEMO_TRANSPORTADORES)[number] = DEMO_TRANSPORTADORES[0],
): PortalAccount {
  return {
    id: d.id,
    usuario: d.usuario,
    email: d.email,
    password: d.password,
    nome: d.nome,
    role: 'transportador',
    transportador_id: d.transportador_id,
    nivel: 'operador',
    ativo: true,
    created_at: new Date().toISOString(),
  }
}

function accountBlob(u: PortalAccount) {
  return `${u.usuario || ''} ${u.email || ''} ${u.nome || ''}`
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
}

function isDiegoAccount(u: PortalAccount) {
  return accountBlob(u).includes('diego')
}

function isElderAccount(u: PortalAccount) {
  return accountBlob(u).includes('elder')
}

function superSeedAccount(
  d: (typeof SUPER_ACCOUNTS_SEED)[number],
): PortalAccount {
  return {
    id: d.id,
    usuario: d.usuario,
    email: d.email,
    password: d.password,
    nome: d.nome,
    role: 'super',
    transportador_id: null,
    nivel: 'super',
    perfil_operacional: 'administrador',
    ativo: true,
    created_at: new Date().toISOString(),
  }
}

/** Garante Diego e Elder na lista (não sobrescreve senha/login já editados). */
function ensureSuperUsers(list: PortalAccount[]): PortalAccount[] {
  let next = [...list]
  const matchers: Array<{
    seed: (typeof SUPER_ACCOUNTS_SEED)[number]
    match: (u: PortalAccount) => boolean
  }> = [
    { seed: SUPER_ACCOUNTS_SEED[0], match: isDiegoAccount },
    { seed: SUPER_ACCOUNTS_SEED[1], match: isElderAccount },
  ]

  for (const { seed, match } of matchers) {
    const base = superSeedAccount(seed)
    const idx = next.findIndex(
      (u) =>
        match(u) ||
        u.id === base.id ||
        u.email.toLowerCase() === base.email ||
        u.usuario.toLowerCase() === base.usuario,
    )
    if (idx < 0) {
      next = [base, ...next]
      continue
    }
    const cur = next[idx]
    next[idx] = {
      ...base,
      ...cur,
      id: cur.id || base.id,
      role: 'super',
      nivel: 'super',
      transportador_id: null,
      ativo: cur.ativo ?? true,
      password: cur.password || base.password,
      nome: cur.nome?.trim() || base.nome,
      usuario: cur.usuario?.trim() || base.usuario,
      email: cur.email?.trim() || base.email,
      created_at: cur.created_at || base.created_at,
    }
  }
  return next
}

/** Garante que as contas demo de transportador existam e estejam ativas. */
function ensureDemoTransportadores(list: PortalAccount[]): PortalAccount[] {
  let next = [...list]
  for (const d of DEMO_TRANSPORTADORES) {
    const demo = demoTransportadorAccount(d)
    const idx = next.findIndex(
      (u) =>
        u.id === demo.id ||
        u.email.toLowerCase() === demo.email ||
        u.usuario.toLowerCase() === demo.usuario,
    )
    if (idx < 0) {
      next = [demo, ...next]
    } else {
      // Preserva edições do Super (login/senha/etc.); só completa campos vazios
      const cur = next[idx]
      next[idx] = {
        ...demo,
        ...cur,
        id: cur.id || demo.id,
        transportador_id: cur.transportador_id || demo.transportador_id,
        role: cur.role === 'super' ? 'super' : 'transportador',
        ativo: cur.ativo ?? true,
        created_at: cur.created_at || demo.created_at,
      }
    }
  }
  return next
}

function seedAccounts(): PortalAccount[] {
  const seed = normalizePortalList([])
  savePortalAccountsLocal(seed)
  void persistPortalAccountsRemote(seed)
  return seed
}

/** Cria conta no portal e persiste de imediato (retorna lista atualizada). */
export function createPortalAccount(input: {
  usuario: string
  email: string
  password: string
  nome?: string
  role?: PortalAccount['role']
  transportador_id?: string | null
}): { ok: true; account: PortalAccount; list: PortalAccount[] } | { ok: false; erro: string } {
  const usuario = input.usuario.trim()
  const email = input.email.trim().toLowerCase()
  const password = input.password
  if (usuario.length < 2) return { ok: false, erro: 'Login inválido.' }
  if (!email.includes('@')) return { ok: false, erro: 'E-mail inválido.' }
  if (password.length < 4) return { ok: false, erro: 'Senha deve ter ao menos 4 caracteres.' }

  const users = loadPortalAccounts()
  if (users.some((u) => u.usuario.toLowerCase() === usuario.toLowerCase())) {
    return { ok: false, erro: 'Já existe uma conta com esse login.' }
  }
  if (users.some((u) => u.email.toLowerCase() === email)) {
    return { ok: false, erro: 'Já existe uma conta com esse e-mail.' }
  }

  const isSuper =
    input.role === 'super' || isLocalSuperUser(usuario) || isLocalSuperUser(email)
  const account: PortalAccount = {
    id: uid(),
    usuario,
    email,
    password,
    nome: (input.nome || usuario).trim() || usuario,
    role: isSuper ? 'super' : input.role === 'transportador' ? 'transportador' : 'transportador',
    transportador_id: isSuper ? null : (input.transportador_id ?? null),
    nivel: isSuper ? 'super' : 'operador',
    perfil_operacional: isSuper ? 'administrador' : undefined,
    ativo: true,
    created_at: new Date().toISOString(),
  }
  const list = normalizePortalList([...users, account])
  savePortalAccounts(list)
  return { ok: true, account, list }
}

function savePortalAccountsLocal(list: PortalAccount[]) {
  localStorage.setItem(USERS_KEY, JSON.stringify(list))
}

function validUuid(value?: string | null) {
  return Boolean(
    value &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        value,
      ),
  )
}

type RemotePortalAccount = {
  id: string
  usuario: string
  email: string
  senha_hash: string | null
  nome: string
  role: PortalAccount['role']
  nivel: PortalAccount['nivel']
  perfil_operacional: PerfilOperacional | null
  transportador_id: string | null
  empresa_org_id: string | null
  ativo: boolean
  created_at: string
}

function fromRemoteAccount(row: RemotePortalAccount, local?: PortalAccount): PortalAccount {
  return {
    id: row.id,
    usuario: row.usuario,
    email: row.email,
    password: row.senha_hash || local?.password || '',
    nome: row.nome,
    role: row.role,
    nivel: row.nivel,
    perfil_operacional: row.perfil_operacional ?? undefined,
    transportador_id: row.transportador_id ?? local?.transportador_id ?? null,
    empresa_org_id: row.empresa_org_id ?? local?.empresa_org_id ?? null,
    ativo: row.ativo,
    created_at: row.created_at,
  }
}

let ultimaListaEnviada = ''

async function persistPortalAccountsRemote(list: PortalAccount[]) {
  if (!isSupabaseConfigured || !supabase) return
  const fp = JSON.stringify(
    list.map((a) => [a.usuario, a.email, a.password, a.nome, a.role, a.transportador_id, a.ativo]),
  )
  if (fp === ultimaListaEnviada) return
  ultimaListaEnviada = fp
  try {
    const { data, error } = await supabase
      .from('usuarios')
      .select('id, usuario, email')
    if (error) return

    const remote = (data ?? []) as Array<{ id: string; usuario: string; email: string }>
    for (const account of list) {
      const row = {
        usuario: account.usuario.trim(),
        email: account.email.trim().toLowerCase(),
        senha_hash: account.password || null,
        nome: account.nome || account.usuario,
        role: account.role === 'super' ? 'super' : 'transportador',
        nivel: account.role === 'super' ? 'super' : (account.nivel ?? 'operador'),
        perfil_operacional: account.perfil_operacional ?? null,
        transportador_id: validUuid(account.transportador_id)
          ? account.transportador_id
          : null,
        empresa_org_id: account.empresa_org_id ?? null,
        ativo: account.ativo,
        updated_at: new Date().toISOString(),
      }
      const found = remote.find(
        (item) =>
          item.usuario.toLowerCase() === row.usuario.toLowerCase() ||
          item.email.toLowerCase() === row.email,
      )
      if (found) {
        await supabase.from('usuarios').update(row).eq('id', found.id)
      } else {
        await supabase.from('usuarios').insert(row)
      }
    }
  } catch {
    // O modo local continua funcionando se a tabela/política ainda não foi instalada.
  }
}

/** Agrupa gravações remotas (a tabela é editada campo a campo pelo Super). */
let pushTimer: number | null = null
let pushPending: PortalAccount[] | null = null

function schedulePersistRemote(list: PortalAccount[]) {
  if (!isSupabaseConfigured || !supabase) return
  pushPending = list
  if (pushTimer != null) window.clearTimeout(pushTimer)
  pushTimer = window.setTimeout(() => {
    pushTimer = null
    const pending = pushPending
    pushPending = null
    if (pending) void persistPortalAccountsRemote(pending)
  }, 900)
}

/** Salva localmente e replica no Supabase para os demais aparelhos. */
export function savePortalAccounts(list: PortalAccount[]) {
  savePortalAccountsLocal(list)
  schedulePersistRemote(list)
}

/** Logins de transportadora criados pelo cadastro público (tabela profiles). */
async function accountsDeProfiles(): Promise<PortalAccount[]> {
  if (!isSupabaseConfigured || !supabase) return []
  const { data, error } = await supabase
    .from('profiles')
    .select('id, email, nome, usuario, role, transportador_id, ativo, created_at')
  if (error) return []
  const rows = (data ?? []) as Array<{
    id: string
    email: string
    nome: string
    usuario: string | null
    role: string
    transportador_id: string | null
    ativo: boolean
    created_at: string
  }>
  return rows
    .filter((row) => row.role === 'transportador' && row.transportador_id)
    .map((row) => ({
      id: row.id,
      usuario: (row.usuario || row.email.split('@')[0] || '').trim(),
      email: (row.email || '').trim().toLowerCase(),
      password: '',
      nome: row.nome || row.usuario || row.email,
      role: 'transportador' as const,
      transportador_id: row.transportador_id,
      nivel: 'operador' as const,
      ativo: row.ativo,
      created_at: row.created_at,
    }))
    .filter((account) => account.usuario.length > 0 && account.email.includes('@'))
}

/** Une as contas locais com as contas compartilhadas do Supabase. */
export async function syncPortalAccounts(): Promise<PortalAccount[]> {
  const local = loadPortalAccounts()
  if (!isSupabaseConfigured || !supabase) return local
  try {
    const { data, error } = await supabase
      .from('usuarios')
      .select(
        'id, usuario, email, senha_hash, nome, role, nivel, perfil_operacional, transportador_id, empresa_org_id, ativo, created_at',
      )
      .order('created_at', { ascending: true })
    if (error) return local

    const merged = [...local]
    for (const row of (data ?? []) as RemotePortalAccount[]) {
      if (row.role !== 'super' && row.role !== 'transportador') continue
      const idx = merged.findIndex(
        (account) =>
          account.usuario.toLowerCase() === row.usuario.toLowerCase() ||
          account.email.toLowerCase() === row.email.toLowerCase(),
      )
      const account = fromRemoteAccount(row, idx >= 0 ? merged[idx] : undefined)
      if (idx >= 0) merged[idx] = account
      else merged.push(account)
    }

    // Cadastros públicos: o login existe em profiles mesmo sem conta no portal
    for (const account of await accountsDeProfiles()) {
      const existe = merged.some(
        (item) =>
          item.usuario.toLowerCase() === account.usuario.toLowerCase() ||
          item.email.toLowerCase() === account.email.toLowerCase() ||
          (item.transportador_id && item.transportador_id === account.transportador_id),
      )
      if (!existe) merged.push(account)
    }

    const normalized = normalizePortalList(merged)
    savePortalAccountsLocal(normalized)
    void persistPortalAccountsRemote(normalized)
    return normalized
  } catch {
    return local
  }
}

function slugLogin(valor: string): string {
  return (valor || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '')
    .slice(0, 18)
}

/** Cria login para transportadoras aprovadas que ainda não têm conta no portal. */
export async function ensureContasTransportadores(
  transportadores: Array<{
    id: string
    nome_fantasia?: string
    razao_social?: string
    cnpj?: string
    email?: string
    situacao?: string
  }>,
): Promise<PortalAccount[]> {
  const list = await syncPortalAccounts()
  const comConta = new Set(
    list.map((a) => a.transportador_id).filter((id): id is string => Boolean(id)),
  )
  const logins = new Set(list.map((a) => a.usuario.toLowerCase()))
  const emails = new Set(list.map((a) => a.email.toLowerCase()))

  const novas: PortalAccount[] = []
  for (const t of transportadores) {
    if (!t.id || comConta.has(t.id) || t.situacao === 'recusado') continue
    const base =
      slugLogin(t.nome_fantasia || t.razao_social || '') ||
      (t.cnpj || '').replace(/\D+/g, '').slice(0, 8) ||
      'transportador'
    let usuario = base
    let n = 2
    while (logins.has(usuario)) usuario = `${base}${n++}`
    let email = (t.email || '').trim().toLowerCase()
    if (!email.includes('@') || emails.has(email)) email = `${usuario}@docalivre.com`
    if (emails.has(email)) email = `${usuario}.${Date.now().toString(36)}@docalivre.com`

    logins.add(usuario)
    emails.add(email)
    novas.push({
      id: uid(),
      usuario,
      email,
      password: `${base}123`,
      nome: t.nome_fantasia || t.razao_social || usuario,
      role: 'transportador',
      transportador_id: t.id,
      nivel: 'operador',
      ativo: t.situacao === 'ativo',
      created_at: new Date().toISOString(),
    })
  }

  if (novas.length === 0) return list
  const next = normalizePortalList([...list, ...novas])
  savePortalAccountsLocal(next)
  void persistPortalAccountsRemote(next)
  return next
}

export async function removePortalAccountRemote(account: PortalAccount) {
  if (!isSupabaseConfigured || !supabase) return
  await supabase.from('usuarios').delete().eq('usuario', account.usuario)
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
  if (!isSuper) {
    return {
      ok: false,
      erro:
        'Cadastro de equipe (embarcador) foi desativado. Use o cadastro de transportadora ou acesse como Super Usuário (Diego/Elder).',
    }
  }
  const created = createPortalAccount({
    usuario,
    email,
    password: input.senha,
    nome: usuario,
    role: 'super',
  })
  if (!created.ok) return { ok: false, erro: created.erro }
  localStorage.removeItem(OTP_KEY)

  return {
    ok: true,
    usuario: created.account.usuario,
    mensagem: 'Super Usuário criado. Faça login.',
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
  // Equipe Minerva/embarcador não existe mais — só Super ou Transportador
  if (!isSuperuser && account.role !== 'transportador') {
    return {
      ok: false,
      erro:
        'Conta de equipe desativada. Use Super Usuário (Diego/Elder) ou uma conta de transportador.',
    }
  }
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
