/**
 * Autenticação do Oferta de Carga — fonte da verdade: Supabase (`usuarios`).
 * Cache só em memória; sem localStorage de contas.
 * Envio de e-mail OTP: use `portalApi.ts` (Edge Function + Resend).
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
import {
  appStoreGet,
  appStoreGetCached,
  appStoreSet,
  migrateLocalKeyToAppStore,
} from './appStore'

const USERS_KEY_LEGACY = [
  'doca-livre-oferta-users-v2',
  'doca-livre-oferta-users-v1',
  'doca-livre-portal-users-v1',
]
const PERMS_STORE_KEY = 'permissoes_portal'
const PERMS_KEY_LEGACY = 'doca-livre-oferta-perms-v1'

/** Super Usuários padrão (sempre presentes no portal). */
export const SUPER_ACCOUNTS_SEED = [
  {
    id: 'u-diego',
    usuario: 'diego',
    email: 'diego@docalivre.com',
    password: 'Diegodi2026',
    nome: 'Diego Isidoro',
  },
  {
    id: 'u-elder',
    usuario: 'elder',
    email: 'elder.tenorio@docalivre.com.br',
    password: 'DocaLivre@2026',
    nome: 'Elder',
  },
] as const

/** Logins/e-mails antigos ainda aceitos no login (migração). */
const SUPER_LOGIN_ALIASES: Record<string, string[]> = {
  diego: [
    'diego',
    'diego@docalivre.com',
    'diego.isidoro',
    'diegoisidoro',
    'diego isidoro',
  ],
  elder: [
    'elder',
    'elder@docalivre.com',
    'elder.tenorio@docalivre.com.br',
    'elder.tenorio',
    'eldertenorio',
  ],
}

/** Senhas alternativas aceitas (capitalização / legado). */
const SUPER_PASSWORD_ALIASES: Record<string, string[]> = {
  'u-diego': ['Diegodi2026', 'diegodi2026', 'diego123'],
  'u-elder': ['DocaLivre@2026', 'Docalivre@2026', 'docalivre@2026', 'elder123'],
}

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

/** Cache em memória das contas (fonte: Supabase). */
let accountsCache: PortalAccount[] | null = null
/** OTP só em memória (dev fallback). */
let otpMemory: OtpRecord | null = null

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

function readLegacyAccountsOnce(): PortalAccount[] | null {
  try {
    for (const key of USERS_KEY_LEGACY) {
      const raw = localStorage.getItem(key)
      if (!raw) continue
      const parsed = JSON.parse(raw) as PortalAccount[]
      if (Array.isArray(parsed) && parsed.length > 0) return parsed
    }
  } catch {
    /* ignore */
  }
  return null
}

function clearLegacyAccountKeys() {
  for (const key of USERS_KEY_LEGACY) {
    try {
      localStorage.removeItem(key)
    } catch {
      /* ignore */
    }
  }
}

function normalizePortalList(parsed: PortalAccount[]): PortalAccount[] {
  // Só Super + transportadores (demos / cadastro público). Sem equipe Minerva/embarcador.
  let list = parsed.filter((u) => u && !isContaEquipeMinerva(u))
  list = sanitizePortalAccounts(list)
  list = ensureSuperUsers(list)
  list = ensureDemoTransportadores(list)
  list = sanitizePortalAccounts(list)
  return list
}

export function loadPortalAccounts(): PortalAccount[] {
  if (accountsCache) return accountsCache
  const legacy = readLegacyAccountsOnce()
  if (legacy) {
    const list = normalizePortalList(legacy)
    accountsCache = list
    schedulePersistRemote(list)
    clearLegacyAccountKeys()
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

function normId(valor: string) {
  return (valor || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
}

function accountBlob(u: PortalAccount) {
  return `${u.usuario || ''} ${u.email || ''} ${u.nome || ''}`
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
}

/**
 * Conta canônica do Super Diego — NÃO pega outros supers/gmail com “diego” no nome.
 */
function isDiegoAccount(u: PortalAccount) {
  const usuario = normId(u.usuario)
  const email = normId(u.email)
  // E-mail de transportadora nunca é Diego
  if (email.includes('ultrafrio') || usuario.includes('ultrafrio') || accountBlob(u).includes('ultrafrio')) {
    return false
  }
  if (u.id === 'u-diego') return true
  if (email === 'diego@docalivre.com' || usuario === 'diego') return true
  if (SUPER_LOGIN_ALIASES.diego.includes(usuario) || SUPER_LOGIN_ALIASES.diego.includes(email)) {
    return true
  }
  return false
}

/**
 * Conta canônica do Super Elder — NÃO pega Ultrafrio (elder.tenorio@ultrafriolog…).
 */
function isElderAccount(u: PortalAccount) {
  const usuario = normId(u.usuario)
  const email = normId(u.email)
  // Transportadora Ultrafrio nunca é a conta Super Elder
  if (email.includes('ultrafrio') || usuario.includes('ultrafrio') || accountBlob(u).includes('ultrafrio')) {
    return false
  }
  if (u.id === 'u-elder') return true
  if (email === 'elder@docalivre.com' || email === 'elder.tenorio@docalivre.com.br') return true
  if (usuario === 'elder') return true
  if (SUPER_LOGIN_ALIASES.elder.includes(usuario) || SUPER_LOGIN_ALIASES.elder.includes(email)) {
    return true
  }
  // Super com e-mail elder*@docalivre.*
  if (
    u.role === 'super' &&
    (email.endsWith('@docalivre.com') || email.endsWith('@docalivre.com.br')) &&
    email.startsWith('elder')
  ) {
    return true
  }
  return false
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

function scoreContaSuper(u: PortalAccount, seed: (typeof SUPER_ACCOUNTS_SEED)[number]): number {
  let score = 0
  if (u.id === seed.id) score += 100
  if (normId(u.email) === normId(seed.email)) score += 40
  if (normId(u.usuario) === normId(seed.usuario)) score += 30
  if ((u.password || '').length >= 4) score += 20
  if (u.ativo) score += 10
  if (u.role === 'super') score += 15
  // Prefere senha já migrada (não legado)
  if (u.password && u.password !== 'elder123' && u.password !== 'diego123') score += 5
  if (normId(u.email).endsWith('@docalivre.com.br') || normId(u.email).endsWith('@docalivre.com')) {
    score += 8
  }
  return score
}

/** Une duplicatas de Super Diego/Elder em uma conta só. */
function dedupeSuperUsers(list: PortalAccount[]): PortalAccount[] {
  let next = [...list]
  const groups: Array<{
    seed: (typeof SUPER_ACCOUNTS_SEED)[number]
    match: (u: PortalAccount) => boolean
  }> = [
    { seed: SUPER_ACCOUNTS_SEED[0], match: isDiegoAccount },
    { seed: SUPER_ACCOUNTS_SEED[1], match: isElderAccount },
  ]

  for (const { seed, match } of groups) {
    const indices: number[] = []
    next.forEach((u, i) => {
      if (match(u) || u.id === seed.id) indices.push(i)
    })
    if (indices.length <= 1) continue

    const candidates = indices.map((i) => next[i])
    candidates.sort((a, b) => scoreContaSuper(b, seed) - scoreContaSuper(a, seed))
    const best = candidates[0]
    const merged: PortalAccount = {
      ...superSeedAccount(seed),
      ...best,
      id: best.id === seed.id || candidates.some((c) => c.id === seed.id) ? seed.id : best.id,
      role: best.role === 'transportador' ? 'transportador' : 'super',
      usuario: best.usuario?.trim() || seed.usuario,
      email: (best.email || seed.email).trim().toLowerCase(),
      password: best.password || seed.password,
      nome: best.nome?.trim() || seed.nome,
      ativo: true,
      nivel: best.role === 'transportador' ? best.nivel || 'operador' : 'super',
      transportador_id: best.role === 'transportador' ? best.transportador_id ?? null : null,
      created_at: best.created_at || new Date().toISOString(),
    }
    // Migra e-mail/senha legado na conta vencedora
    if (
      seed.id === 'u-elder' &&
      (normId(merged.email) === 'elder@docalivre.com' || !merged.password || merged.password === 'elder123')
    ) {
      if (normId(merged.email) === 'elder@docalivre.com') merged.email = seed.email
      if (!merged.password || merged.password === 'elder123') merged.password = seed.password
    }
    const drop = new Set(indices)
    next = next.filter((_, i) => !drop.has(i))
    next = [merged, ...next]
  }
  return next
}

/** Limpa campos e garante senha mínima nas contas ativas. */
function sanitizePortalAccounts(list: PortalAccount[]): PortalAccount[] {
  return list.map((u) => {
    const usuario = (u.usuario || '').trim() || (u.email || '').split('@')[0] || 'user'
    const email = (u.email || '').trim().toLowerCase()
    let password = u.password ?? ''
    // Conta ativa sem senha: gera senha inicial previsível a partir do login
    if (u.ativo && password.trim().length < 4) {
      const base = slugLogin(usuario) || 'doca'
      password = `${base}123`
    }
    // Super só Diego/Elder (Doca Livre). E-mail externo (ex.: Ultrafrio) nunca vira Super.
    let role = u.role
    const isCanonSuper = isDiegoAccount({ ...u, usuario, email }) || isElderAccount({ ...u, usuario, email })
    const emailDoca =
      email.endsWith('@docalivre.com') || email.endsWith('@docalivre.com.br')
    if (role === 'super' && !isCanonSuper && !emailDoca) {
      role = 'transportador'
    }
    if (email.includes('ultrafrio') || usuario.includes('ultrafrio')) {
      role = 'transportador'
    }
    return {
      ...u,
      usuario,
      email,
      password,
      nome: (u.nome || '').trim() || usuario,
      role,
      nivel: role === 'super' ? 'super' : u.nivel === 'super' ? 'operador' : u.nivel || 'operador',
      transportador_id: role === 'super' ? null : (u.transportador_id ?? null),
      ativo: u.ativo ?? true,
    }
  })
}

/** Garante Diego e Elder na lista (não sobrescreve senha/login já editados). */
function ensureSuperUsers(list: PortalAccount[]): PortalAccount[] {
  let next = dedupeSuperUsers(list)
  const matchers: Array<{
    seed: (typeof SUPER_ACCOUNTS_SEED)[number]
    match: (u: PortalAccount) => boolean
    legacyPasswords: string[]
    legacyEmails: string[]
  }> = [
    {
      seed: SUPER_ACCOUNTS_SEED[0],
      match: isDiegoAccount,
      legacyPasswords: ['diego123'],
      legacyEmails: [],
    },
    {
      seed: SUPER_ACCOUNTS_SEED[1],
      match: isElderAccount,
      legacyPasswords: ['elder123'],
      legacyEmails: ['elder@docalivre.com'],
    },
  ]

  for (const { seed, match, legacyPasswords, legacyEmails } of matchers) {
    const base = superSeedAccount(seed)
    const idx = next.findIndex(
      (u) =>
        match(u) ||
        u.id === base.id ||
        normId(u.email) === normId(base.email) ||
        normId(u.usuario) === normId(base.usuario) ||
        legacyEmails.includes(normId(u.email)),
    )
    if (idx < 0) {
      next = [base, ...next]
      continue
    }
    const cur = next[idx]
    const role = cur.role === 'transportador' ? 'transportador' : 'super'
    const emailAtual = (cur.email || '').trim().toLowerCase()
    const senhaAtual = cur.password || ''
    const migrarEmail = !emailAtual || legacyEmails.includes(emailAtual)
    const migrarSenha = !senhaAtual || legacyPasswords.includes(senhaAtual)
    next[idx] = {
      ...base,
      ...cur,
      id: cur.id === base.id || match(cur) ? base.id : cur.id || base.id,
      role,
      nivel: role === 'super' ? 'super' : cur.nivel === 'super' ? 'operador' : cur.nivel || 'operador',
      transportador_id: role === 'super' ? null : (cur.transportador_id ?? null),
      ativo: cur.ativo ?? true,
      password: migrarSenha ? base.password : senhaAtual,
      nome: cur.nome?.trim() || base.nome,
      usuario: cur.usuario?.trim() || base.usuario,
      email: migrarEmail ? base.email : emailAtual,
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
  accountsCache = seed
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

  // Perfil explícito do painel manda; heurística só quando role não veio
  const isSuper =
    input.role === 'transportador'
      ? false
      : input.role === 'super' || isLocalSuperUser(usuario) || isLocalSuperUser(email)
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

function savePortalAccountsMemory(list: PortalAccount[]) {
  accountsCache = list
}

/** Salva em memória e no Supabase (fonte da verdade). */
export function savePortalAccounts(list: PortalAccount[]) {
  const normalized = normalizePortalList(list)
  savePortalAccountsMemory(normalized)
  schedulePersistRemote(normalized)
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

function mergePassword(localPass: string, remotePass: string): string {
  const local = (localPass || '').trim()
  const remote = (remotePass || '').trim()
  // Banco manda: se remoto tem senha, usa remoto
  if (remote) return remote
  return local
}

function fromRemoteAccount(row: RemotePortalAccount, local?: PortalAccount): PortalAccount {
  return {
    id: row.id,
    usuario: row.usuario,
    email: row.email,
    password: mergePassword(local?.password || '', row.senha_hash || ''),
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
    void broadcastPortalAccountsChanged('upsert')
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
    .filter((row) => row.role === 'transportador' && row.transportador_id && row.ativo)
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

/** Une as contas do cache com as contas compartilhadas do Supabase (DB manda). */
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

    const remoteRows = ((data ?? []) as RemotePortalAccount[]).filter(
      (row) => row.role === 'super' || row.role === 'transportador',
    )

    // Se o banco já tem contas, ele é a fonte da verdade.
    // Não reincorpore contas que só existem no cache: outro Super pode tê-las
    // excluído e o cache antigo acabaria recriando-as no próximo persist.
    const merged: PortalAccount[] =
      remoteRows.length > 0
        ? remoteRows.map((row) => fromRemoteAccount(row))
        : [...local]

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
    accountsCache = normalized
    // Sincronização é somente leitura. Gravar aqui permitiria que um aparelho
    // com resposta/cache antigo recriasse uma conta excluída por outro Super.
    clearLegacyAccountKeys()
    return normalized
  } catch {
    return loadPortalAccounts()
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

/**
 * Sincroniza e vincula contas existentes às transportadoras.
 * Não cria contas automaticamente: isso fazia usuários excluídos reaparecerem.
 */
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
  const linked = vincularContasAosTransportadores(list, transportadores)
  const next = normalizePortalList(linked)
  const same =
    next.length === list.length &&
    next.every((a, i) => {
      const b = list[i]
      return (
        b &&
        a.id === b.id &&
        a.transportador_id === b.transportador_id &&
        a.usuario === b.usuario &&
        a.ativo === b.ativo
      )
    })
  if (same) return list
  savePortalAccounts(next)
  return next
}

/**
 * Associa contas de transportador sem empresa (ou com id inválido)
 * ao cadastro de transportadoras pelo e-mail / nome / login.
 */
export function vincularContasAosTransportadores(
  accounts: PortalAccount[],
  transportadores: Array<{
    id: string
    nome_fantasia?: string
    razao_social?: string
    email?: string
    cnpj?: string
  }>,
): PortalAccount[] {
  if (!transportadores.length) return accounts
  const existentes = new Set(transportadores.map((t) => t.id))

  return accounts.map((a) => {
    if (a.role !== 'transportador') return a
    if (a.transportador_id && existentes.has(a.transportador_id)) return a

    const email = normId(a.email)
    const nomeSlug = slugLogin(a.nome || '')
    const userSlug = slugLogin(a.usuario || '')
    const emailLocal = slugLogin((a.email || '').split('@')[0] || '')
    const emailDomain = slugLogin((a.email || '').split('@')[1] || '')

    const match = transportadores.find((t) => {
      const tEmail = normId(t.email || '')
      if (tEmail && email && tEmail === email) return true
      const tNome = slugLogin(t.nome_fantasia || '')
      const tRazao = slugLogin(t.razao_social || '')
      if (!tNome && !tRazao) return false
      if (nomeSlug && (nomeSlug === tNome || nomeSlug === tRazao)) return true
      if (userSlug && (userSlug === tNome || userSlug === tRazao)) return true
      // Domínio do e-mail contém o nome da empresa (ex.: @ultrafriolog… → ULTRAFRIO LOG)
      if (tNome.length >= 5 && (emailDomain.includes(tNome) || tNome.includes(emailDomain.replace(/com.*$/, '').slice(0, 10)))) {
        return true
      }
      if (tNome.length >= 5 && (emailLocal.includes(tNome) || nomeSlug.includes(tNome) || userSlug.includes(tNome))) {
        return true
      }
      return false
    })

    if (!match) return a
    return { ...a, transportador_id: match.id }
  })
}

export async function removePortalAccountRemote(
  account: PortalAccount,
): Promise<{ ok: true } | { ok: false; erro: string }> {
  if (!isSupabaseConfigured || !supabase) return { ok: true }

  try {
    // Busca pelo login/e-mail porque o id local pode não ser o UUID da tabela.
    const { data: rows, error: selectError } = await supabase
      .from('usuarios')
      .select('id')
      .or(`usuario.eq.${account.usuario},email.eq.${account.email}`)
    if (selectError) return { ok: false, erro: selectError.message }

    const ids = (rows ?? [])
      .map((row) => (row as { id?: string }).id)
      .filter((id): id is string => Boolean(id))
    if (ids.length > 0) {
      const { data: deleted, error: deleteError } = await supabase
        .from('usuarios')
        .delete()
        .in('id', ids)
        .select('id')
      if (deleteError) return { ok: false, erro: deleteError.message }
      if (!deleted?.length) {
        return {
          ok: false,
          erro: 'O banco não confirmou a exclusão (verifique a política RLS da tabela usuarios).',
        }
      }
    }

    // Um cadastro público em profiles não deve recriar a conta no próximo refresh.
    const { error: profileError } = await supabase
      .from('profiles')
      .update({ ativo: false })
      .eq('email', account.email.trim().toLowerCase())
    if (profileError) return { ok: false, erro: profileError.message }

    void broadcastPortalAccountsChanged('delete')
    return { ok: true }
  } catch {
    return { ok: false, erro: 'Não foi possível concluir a exclusão no servidor.' }
  }
}

const PORTAL_ACCOUNTS_CHANNEL = 'portal-usuarios-live'
const PORTAL_ACCOUNTS_BROADCAST = 'portal_accounts_changed'

let portalAccountsChannel: ReturnType<NonNullable<typeof supabase>['channel']> | null = null
let portalAccountsListeners = new Set<(list: PortalAccount[]) => void>()
let portalAccountsPollId: number | null = null
let portalAccountsClientId =
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `portal-${Math.random().toString(36).slice(2)}`

async function notifyPortalAccountsListeners() {
  if (portalAccountsListeners.size === 0) return
  const list = await syncPortalAccounts()
  for (const cb of portalAccountsListeners) {
    try {
      cb(list)
    } catch {
      /* ignore */
    }
  }
}

/** Avisa outros aparelhos (Supers) que a lista de contas mudou. */
export async function broadcastPortalAccountsChanged(
  reason: 'delete' | 'upsert' | 'sync' = 'sync',
) {
  if (!isSupabaseConfigured || !supabase) return
  const client = supabase
  const payload = {
    client_id: portalAccountsClientId,
    reason,
    at: Date.now(),
  }

  // Canal já inscrito (algum Super na tela Usuários)
  if (portalAccountsChannel) {
    try {
      await portalAccountsChannel.send({
        type: 'broadcast',
        event: PORTAL_ACCOUNTS_BROADCAST,
        payload,
      })
      return
    } catch {
      /* tenta canal efêmero abaixo */
    }
  }

  const ch = client.channel(`${PORTAL_ACCOUNTS_CHANNEL}-tx-${Date.now()}`)
  await new Promise<void>((resolve) => {
    const t = window.setTimeout(() => resolve(), 1500)
    ch.subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        window.clearTimeout(t)
        resolve()
      }
    })
  })
  try {
    await ch.send({
      type: 'broadcast',
      event: PORTAL_ACCOUNTS_BROADCAST,
      payload,
    })
  } catch {
    /* broadcast opcional */
  }
  void client.removeChannel(ch)
}

/**
 * Escuta exclusões/alterações em `usuarios` em tempo real e re-sincroniza a lista.
 * Retorna função para cancelar a inscrição.
 */
export function subscribePortalAccounts(
  onChange: (list: PortalAccount[]) => void,
): () => void {
  portalAccountsListeners.add(onChange)

  if (!isSupabaseConfigured || !supabase) {
    if (portalAccountsPollId == null) {
      portalAccountsPollId = window.setInterval(() => {
        const list = loadPortalAccounts()
        for (const cb of portalAccountsListeners) cb(list)
      }, 5_000)
    }
    onChange(loadPortalAccounts())
    return () => {
      portalAccountsListeners.delete(onChange)
      if (portalAccountsListeners.size === 0 && portalAccountsPollId != null) {
        window.clearInterval(portalAccountsPollId)
        portalAccountsPollId = null
      }
    }
  }

  const client = supabase

  if (!portalAccountsChannel) {
    portalAccountsChannel = client
      .channel(PORTAL_ACCOUNTS_CHANNEL, {
        config: { broadcast: { self: false } },
      })
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'usuarios' },
        () => {
          void notifyPortalAccountsListeners()
        },
      )
      .on('broadcast', { event: PORTAL_ACCOUNTS_BROADCAST }, ({ payload }) => {
        const p = payload as { client_id?: string } | null
        if (p?.client_id && p.client_id === portalAccountsClientId) return
        void notifyPortalAccountsListeners()
      })
      .subscribe()

    // Backup caso Realtime não esteja habilitado na tabela
    portalAccountsPollId = window.setInterval(() => {
      void notifyPortalAccountsListeners()
    }, 8_000)
  }

  void notifyPortalAccountsListeners()

  return () => {
    portalAccountsListeners.delete(onChange)
    if (portalAccountsListeners.size > 0) return
    if (portalAccountsPollId != null) {
      window.clearInterval(portalAccountsPollId)
      portalAccountsPollId = null
    }
    if (portalAccountsChannel) {
      void client.removeChannel(portalAccountsChannel)
      portalAccountsChannel = null
    }
  }
}

export function loadPermissoesMap(): Record<string, OfertaPermissao> {
  return appStoreGetCached<Record<string, OfertaPermissao>>(PERMS_STORE_KEY, {})
}

export function savePermissoesMap(map: Record<string, OfertaPermissao>) {
  void appStoreSet(PERMS_STORE_KEY, map)
}

export async function hydratePermissoesMap(): Promise<Record<string, OfertaPermissao>> {
  await migrateLocalKeyToAppStore(PERMS_KEY_LEGACY, PERMS_STORE_KEY, (raw) => {
    try {
      const parsed = JSON.parse(raw) as Record<string, OfertaPermissao>
      return parsed && typeof parsed === 'object' ? parsed : null
    } catch {
      return null
    }
  })
  return appStoreGet<Record<string, OfertaPermissao>>(PERMS_STORE_KEY, {})
}

export function getPermissaoUsuario(account: PortalAccount): OfertaPermissao {
  if (account.role === 'super') {
    return SUPER_PERMISSAO
  }
  const stored = loadPermissoesMap()[account.usuario]
  if (stored) return stored
  if (account.role === 'transportador') return DEFAULT_PERMISSAO_TRANSPORTADOR
  return DEFAULT_PERMISSAO_MINERVA
}

function saveOtp(rec: OtpRecord) {
  otpMemory = rec
}

function loadOtp(): OtpRecord | null {
  return otpMemory
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
  otpMemory = null

  return {
    ok: true,
    usuario: created.account.usuario,
    mensagem: 'Super Usuário criado. Faça login.',
  }
}

function seedForAccount(account: PortalAccount) {
  if (account.id === 'u-diego' || isDiegoAccount(account)) return SUPER_ACCOUNTS_SEED[0]
  if (account.id === 'u-elder' || isElderAccount(account)) return SUPER_ACCOUNTS_SEED[1]
  return null
}

function identificadoresDaConta(u: PortalAccount): string[] {
  const out = new Set<string>()
  const add = (v: string) => {
    const n = normId(v)
    if (n) out.add(n)
    const compact = n.replace(/\s+/g, '')
    if (compact) out.add(compact)
    const local = (n.split('@')[0] || '').trim()
    if (local) out.add(local)
  }
  add(u.usuario)
  add(u.email)
  add(u.nome || '')
  return Array.from(out)
}

/** Todas as contas que batem com o identificador digitado. */
function findAccountsByIdentificador(users: PortalAccount[], identificador: string): PortalAccount[] {
  const id = normId(identificador)
  const idCompact = id.replace(/\s+/g, '')
  const idLocal = (id.split('@')[0] || '').trim()
  const hits: PortalAccount[] = []
  const hitIds = new Set<string>()
  const exactHitIds = new Set<string>()

  const pushHit = (u: PortalAccount, exact: boolean) => {
    if (hitIds.has(u.id)) {
      if (exact) exactHitIds.add(u.id)
      return
    }
    hitIds.add(u.id)
    hits.push(u)
    if (exact) exactHitIds.add(u.id)
  }

  for (const u of users) {
    const emailN = normId(u.email)
    const userN = normId(u.usuario)
    const userCompact = userN.replace(/\s+/g, '')
    // Match exato de e-mail / login — prioridade absoluta
    if (emailN === id || userN === id || userCompact === idCompact) {
      pushHit(u, true)
      continue
    }
    const ids = identificadoresDaConta(u)
    if (ids.includes(id) || ids.includes(idCompact)) {
      pushHit(u, false)
      continue
    }
    // Só usa parte local do e-mail quando o usuário digitou e-mail completo
    if (id.includes('@') && idLocal && ids.includes(idLocal)) {
      pushHit(u, false)
    }
  }

  // Aliases dos Super: só se ninguém bateu de forma exata (evita Ultrafrio → Elder)
  const temMatchExato = exactHitIds.size > 0
  if (!temMatchExato) {
    for (const [who, aliases] of Object.entries(SUPER_LOGIN_ALIASES)) {
      const hit = aliases.some(
        (alias) => alias === id || alias === idCompact || alias === idLocal,
      )
      if (!hit) continue
      const match = who === 'diego' ? isDiegoAccount : isElderAccount
      const seedId = who === 'diego' ? 'u-diego' : 'u-elder'
      for (const u of users) {
        if (match(u) || u.id === seedId) pushHit(u, false)
      }
    }
  }

  // Ordena: e-mail/login exato >> transportador com match >> Super por alias
  hits.sort((a, b) => {
    const score = (u: PortalAccount) => {
      let s = 0
      if (normId(u.email) === id) s += 100
      if (normId(u.usuario) === id || normId(u.usuario).replace(/\s+/g, '') === idCompact) s += 90
      if (exactHitIds.has(u.id)) s += 40
      if (u.role === 'transportador') s += 15
      if (u.ativo) s += 10
      if ((u.password || '').length >= 4) s += 8
      // Super por alias perde para transportador com mesmo login parcial
      if (u.role === 'super' && !exactHitIds.has(u.id)) s -= 10
      return s
    }
    return score(b) - score(a)
  })

  return hits
}

function senhaConfere(account: PortalAccount, senha: string) {
  const tentativa = senha
  const salva = account.password || ''
  if (salva && salva === tentativa) return true
  // Comparação sem diferenciar maiúsculas (evita DocaLivre vs Docalivre)
  if (salva && salva.toLowerCase() === tentativa.toLowerCase()) return true

  const seed = seedForAccount(account)
  if (seed) {
    if (seed.password === tentativa) return true
    if (seed.password.toLowerCase() === tentativa.toLowerCase()) return true
    const aliases = SUPER_PASSWORD_ALIASES[seed.id] || []
    if (aliases.some((a) => a === tentativa || a.toLowerCase() === tentativa.toLowerCase())) {
      return true
    }
  }
  return false
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
  const users = loadPortalAccounts()
  const candidatos = findAccountsByIdentificador(users, identificador)
  // Tenta a senha em TODOS os candidatos (evita pegar duplicata errada primeiro)
  let account = candidatos.find((u) => senhaConfere(u, senha))
  if (!account) {
    return { ok: false, erro: 'Usuário ou senha incorretos.' }
  }

  // Se entrou com a senha do seed do Super, alinha e-mail/senha canônicos
  const seed = seedForAccount(account)
  if (seed && senhaConfere({ ...account, password: seed.password }, senha)) {
    const emailAtual = normId(account.email)
    const precisaEmail =
      seed.id === 'u-elder' &&
      (emailAtual === 'elder@docalivre.com' || !account.email.includes('@'))
    const precisaSenha =
      !account.password ||
      account.password === 'elder123' ||
      account.password.toLowerCase() !== seed.password.toLowerCase()
    if (precisaEmail || precisaSenha) {
      const next = users.map((u) =>
        u.id === account!.id
          ? {
              ...u,
              password: seed.password,
              email: precisaEmail ? seed.email : u.email,
              usuario: u.usuario?.trim() || seed.usuario,
              nome: u.nome?.trim() || seed.nome,
              ativo: true,
            }
          : u,
      )
      savePortalAccounts(next)
      account = next.find((u) => u.id === account!.id) ?? account
    }
  }

  if (!account.ativo) {
    return {
      ok: false,
      erro: 'Cadastro aguardando aprovação. Você poderá entrar após a liberação.',
    }
  }
  if (!account.password || account.password.length < 4) {
    return {
      ok: false,
      erro: 'Esta conta está sem senha. Peça ao Super Usuário para definir uma senha no painel.',
    }
  }
  // Fonte da verdade: role salva na Configuração do Portal
  const isSuperuser = account.role === 'super'
  if (!isSuperuser && account.role !== 'transportador') {
    return {
      ok: false,
      erro:
        'Conta de equipe desativada. Use Super Usuário (Diego/Elder) ou uma conta de transportador.',
    }
  }
  // Transportador precisa estar vinculado
  if (!isSuperuser && account.role === 'transportador' && !account.transportador_id) {
    return {
      ok: false,
      erro:
        'Conta de transportador sem empresa vinculada. Peça ao Super Usuário para associar a transportadora.',
    }
  }
  return {
    ok: true,
    account: {
      ...account,
      // Garante sessão alinhada ao perfil do portal (nunca promove por heurística)
      role: isSuperuser ? 'super' : 'transportador',
      nivel: isSuperuser ? 'super' : account.nivel === 'super' ? 'operador' : account.nivel || 'operador',
      transportador_id: isSuperuser ? null : (account.transportador_id ?? null),
    },
    isSuperuser,
    permissoes: getPermissaoUsuario({
      ...account,
      role: isSuperuser ? 'super' : 'transportador',
    }),
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

/**
 * Se a transportadora já está `ativo` no banco mas `usuarios.ativo` ficou false
 * (aprovação antiga / falha silenciosa), libera o login automaticamente.
 */
export async function healPortalLoginAtivo(identificador: string): Promise<void> {
  if (!isSupabaseConfigured || !supabase) return
  const users = loadPortalAccounts()
  const candidatos = findAccountsByIdentificador(users, identificador).filter(
    (u) => u.role === 'transportador' && !u.ativo,
  )
  if (candidatos.length === 0) return

  for (const account of candidatos) {
    let situacao: string | null = null
    let tid = account.transportador_id || null

    if (tid) {
      const { data } = await supabase
        .from('transportadores')
        .select('id, situacao')
        .eq('id', tid)
        .maybeSingle()
      situacao = (data as { situacao?: string } | null)?.situacao ?? null
    }

    if (situacao !== 'ativo' && account.email) {
      const { data } = await supabase
        .from('transportadores')
        .select('id, situacao')
        .ilike('email', account.email.trim())
        .maybeSingle()
      const row = data as { id?: string; situacao?: string } | null
      if (row?.situacao === 'ativo') {
        situacao = 'ativo'
        tid = row.id ?? tid
      }
    }

    if (situacao !== 'ativo') continue

    const patch = { ativo: true, updated_at: new Date().toISOString() }
    let upd = await supabase
      .from('usuarios')
      .update(patch)
      .ilike('email', account.email.trim())
      .select('id')
    if (upd.error && /updated_at/i.test(upd.error.message)) {
      upd = await supabase
        .from('usuarios')
        .update({ ativo: true })
        .ilike('email', account.email.trim())
        .select('id')
    }
    if (tid) {
      await supabase.from('usuarios').update({ ativo: true }).eq('transportador_id', tid)
      setPortalAccountAtivoPorTransportador(tid, true)
    } else {
      const next = loadPortalAccounts().map((u) =>
        u.id === account.id || normId(u.email) === normId(account.email)
          ? { ...u, ativo: true }
          : u,
      )
      savePortalAccounts(next)
    }
  }

  // Recarrega cache do banco (já com ativo=true)
  await syncPortalAccounts()
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
  const users = loadPortalAccounts()
  const account = findAccountsByIdentificador(users, identificador)[0]
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
  const users = loadPortalAccounts()
  const account = findAccountsByIdentificador(users, identificador)[0]
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
    otpMemory = null
    return { ok: true, usuario: users[idx].usuario, mensagem: 'Senha atualizada. Faça login.' }
  } catch {
    return { ok: false, erro: 'Token inválido.' }
  }
}
