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

/**
 * Contas excluídas por um Super. Guardadas por 7 dias para que um aparelho
 * com cache antigo (ou aba aberta há horas) não recrie a conta no banco.
 */
const TOMBSTONES_KEY = 'doca-livre-oferta-contas-excluidas-v1'
const TOMBSTONE_TTL_MS = 7 * 24 * 60 * 60_000

type Tombstone = { chave: string; at: number }

function loadTombstones(): Tombstone[] {
  try {
    const raw = localStorage.getItem(TOMBSTONES_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as Tombstone[]
    if (!Array.isArray(parsed)) return []
    const limite = Date.now() - TOMBSTONE_TTL_MS
    return parsed.filter((t) => t && typeof t.chave === 'string' && t.at > limite)
  } catch {
    return []
  }
}

function chavesDaConta(u: { usuario?: string; email?: string }): string[] {
  const out: string[] = []
  const usuario = (u.usuario || '').trim().toLowerCase()
  const email = (u.email || '').trim().toLowerCase()
  if (usuario) out.push(`login:${usuario}`)
  if (email) out.push(`email:${email}`)
  return out
}

function registrarExclusao(u: { usuario?: string; email?: string }) {
  const atuais = loadTombstones()
  const at = Date.now()
  for (const chave of chavesDaConta(u)) {
    if (!atuais.some((t) => t.chave === chave)) atuais.push({ chave, at })
  }
  try {
    localStorage.setItem(TOMBSTONES_KEY, JSON.stringify(atuais))
  } catch {
    /* ignore */
  }
}

/** Permite recriar conscientemente uma conta antes excluída. */
function limparExclusao(u: { usuario?: string; email?: string }) {
  const chaves = new Set(chavesDaConta(u))
  if (chaves.size === 0) return
  const next = loadTombstones().filter((t) => !chaves.has(t.chave))
  try {
    localStorage.setItem(TOMBSTONES_KEY, JSON.stringify(next))
  } catch {
    /* ignore */
  }
}

function foiExcluida(u: { usuario?: string; email?: string }): boolean {
  const chaves = chavesDaConta(u)
  if (chaves.length === 0) return false
  const set = new Set(loadTombstones().map((t) => t.chave))
  return chaves.some((c) => set.has(c))
}

/**
 * Conta de demonstração gerada automaticamente por versões antigas do app:
 * login/e-mail no padrão "empresa2@docalivre.com" (nome + número).
 * NÃO aplica a contas com senha definida (criação manual no painel).
 */
function isContaDemoGerada(u: {
  usuario?: string
  email?: string
  role?: string
  password?: string
  senha_hash?: string | null
}): boolean {
  if (u.role === 'super') return false
  const senha = (u.password || u.senha_hash || '').trim()
  // Conta com senha real = criação manual / demo canônica — nunca apagar como lixo
  if (senha.length >= 4) return false
  const email = (u.email || '').trim().toLowerCase()
  const usuario = (u.usuario || '').trim().toLowerCase()
  const padrao = /^[a-z]+\d+@docalivre\.com$/
  const padraoLogin = /^[a-z]+\d+$/
  return padrao.test(email) && padraoLogin.test(usuario)
}

function isDemoTransportadorCanonico(u: { id?: string; usuario?: string; email?: string }) {
  const email = (u.email || '').trim().toLowerCase()
  const usuario = (u.usuario || '').trim().toLowerCase()
  return DEMO_TRANSPORTADORES.some(
    (d) =>
      u.id === d.id ||
      email === d.email ||
      usuario === d.usuario,
  )
}

function uid() {
  return `u-${Math.random().toString(36).slice(2, 10)}`
}

/** IDs das transportadoras demo no Supabase (seed UUID). */
export const DEMO_TRANSPORTADOR_IDS = {
  santos: '11111111-1111-1111-1111-111111111111',
  novaera: '22222222-2222-2222-2222-222222222222',
} as const

/** Contas demo prontas para testar o Kanban do transportador. */
export const DEMO_TRANSPORTADORES = [
  {
    id: 'u-santos',
    usuario: 'santos',
    email: 'santos@transportes.com',
    password: 'santos123',
    nome: 'Santos Transportes',
    transportador_id: DEMO_TRANSPORTADOR_IDS.santos,
  },
  {
    id: 'u-novaera',
    usuario: 'novaera',
    email: 'novaera@log.com',
    password: 'novaera123',
    nome: 'Log Nova Era',
    transportador_id: DEMO_TRANSPORTADOR_IDS.novaera,
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
  let list = parsed.filter(
    (u) => u && !isContaEquipeMinerva(u) && !foiExcluida(u) && !isContaDemoGerada(u),
  )
  list = sanitizePortalAccounts(list)
  list = ensureSuperUsers(list)
  list = ensureDemoTransportadores(list)
  list = sanitizePortalAccounts(list)
  return list.filter((u) => !foiExcluida(u) && !isContaDemoGerada(u))
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

/** Limpa campos. Nunca inventa senha — isso sobrescrevia a senha real no banco. */
function sanitizePortalAccounts(list: PortalAccount[]): PortalAccount[] {
  return list.map((u) => {
    const usuario = (u.usuario || '').trim() || (u.email || '').split('@')[0] || 'user'
    const email = (u.email || '').trim().toLowerCase()
    const password = (u.password ?? '').trim()
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
      // Santos / Nova Era são contas canônicas de teste e devem existir.
      limparExclusao(demo)
      marcarContaNovaParaInsert(demo.id)
      next = [demo, ...next]
      continue
    }
    // Conta já existe: restaura/atualiza vínculo (troca t1/t2 legados pelo UUID do banco).
    const cur = next[idx]
    next[idx] = {
      ...cur,
      id: cur.id || demo.id,
      usuario: demo.usuario,
      email: demo.email,
      nome: demo.nome,
      transportador_id: demo.transportador_id,
      role: 'transportador',
      nivel: 'operador',
      password: demo.password,
      ativo: true,
      created_at: cur.created_at || demo.created_at,
    }
  }
  return next
}

function seedAccounts(): PortalAccount[] {
  const seed = normalizePortalList([])
  accountsCache = seed
  // Sem Supabase o seed é a própria base local; com banco, quem manda é o banco.
  if (!isSupabaseConfigured) void persistPortalAccountsRemote(seed)
  return seed
}

/** Cria conta no portal e grava no banco na hora (retorna lista atualizada). */
export async function createPortalAccount(input: {
  usuario: string
  email: string
  password: string
  nome?: string
  role?: PortalAccount['role']
  transportador_id?: string | null
}): Promise<
  { ok: true; account: PortalAccount; list: PortalAccount[] } | { ok: false; erro: string }
> {
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
  if (!isSuper && !input.transportador_id) {
    return {
      ok: false,
      erro: 'Selecione a transportadora antes de criar a conta.',
    }
  }
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
  limparExclusao(account)
  marcarContaNovaParaInsert(account.id)
  const list = normalizePortalList([...users, account])
  savePortalAccountsMemory(list)

  const remoto = await gravarContaPortalNoBanco(account)
  if (!remoto.ok) {
    savePortalAccountsMemory(users)
    return { ok: false, erro: remoto.erro ?? 'Não foi possível gravar a conta no banco.' }
  }
  return { ok: true, account: loadPortalAccounts().find((u) => normLogin(u.email) === email) ?? account, list: loadPortalAccounts() }
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

const TRANSPORTADOR_REF_PREFIX = 'transportador:'

function transportadorRefText(account: {
  role?: PortalAccount['role']
  transportador_id?: string | null
  empresa_org_id?: string | null
}) {
  if (
    account.role === 'transportador' &&
    account.transportador_id &&
    !validUuid(account.transportador_id)
  ) {
    return `${TRANSPORTADOR_REF_PREFIX}${account.transportador_id}`
  }
  return account.empresa_org_id ?? null
}

function transportadorIdFromRemote(
  row: { transportador_id?: string | null; empresa_org_id?: string | null },
  local?: PortalAccount,
) {
  if (row.transportador_id) return row.transportador_id
  if (row.empresa_org_id?.startsWith(TRANSPORTADOR_REF_PREFIX)) {
    return row.empresa_org_id.slice(TRANSPORTADOR_REF_PREFIX.length) || null
  }
  return local?.transportador_id ?? null
}

type RemoteUsuarioRow = {
  id: string
  usuario: string
  email: string
  ativo?: boolean
  senha_hash?: string | null
  transportador_id?: string | null
  empresa_org_id?: string | null
}

/** Evita sync imediato sobrescrever edição recém-gravada no painel. */
let portalSaveGraceUntil = 0

/** Senhas gravadas pelo painel — vencem sync/persist stale por alguns segundos. */
const senhasRecemGravadas = new Map<string, { senha: string; until: number }>()

function chaveSenhaConta(account: { id?: string; email?: string; usuario?: string }) {
  if (account.id && validUuid(account.id)) return `id:${account.id}`
  const email = normLogin(account.email)
  if (email) return `email:${email}`
  const usuario = normLogin(account.usuario)
  if (usuario) return `login:${usuario}`
  return ''
}

function marcarSenhaRecemGravada(account: PortalAccount, senha: string) {
  const until = Date.now() + 15_000
  const keys = [
    chaveSenhaConta(account),
    account.id ? `id:${account.id}` : '',
    normLogin(account.email) ? `email:${normLogin(account.email)}` : '',
    normLogin(account.usuario) ? `login:${normLogin(account.usuario)}` : '',
  ].filter(Boolean)
  for (const k of keys) senhasRecemGravadas.set(k, { senha, until })
  portalSaveGraceUntil = Math.max(portalSaveGraceUntil, until)
}

function senhaRecemGravadaPara(account: {
  id?: string
  email?: string
  usuario?: string
}): string | null {
  const now = Date.now()
  const keys = [
    chaveSenhaConta(account),
    account.id ? `id:${account.id}` : '',
    normLogin(account.email) ? `email:${normLogin(account.email)}` : '',
    normLogin(account.usuario) ? `login:${normLogin(account.usuario)}` : '',
  ].filter(Boolean)
  for (const k of keys) {
    const hit = senhasRecemGravadas.get(k)
    if (!hit) continue
    if (hit.until < now) {
      senhasRecemGravadas.delete(k)
      continue
    }
    return hit.senha
  }
  return null
}

function normLogin(val?: string | null) {
  return (val || '').trim().toLowerCase()
}

function findRemoteUsuarioRow(
  remote: RemoteUsuarioRow[],
  account: PortalAccount,
  prev?: { usuario?: string; email?: string },
): RemoteUsuarioRow | undefined {
  if (validUuid(account.id)) {
    const byId = remote.find((r) => r.id === account.id)
    if (byId) return byId
  }
  const prevU = normLogin(prev?.usuario)
  const prevE = normLogin(prev?.email)
  if (prevU) {
    const hit = remote.find((r) => normLogin(r.usuario) === prevU)
    if (hit) return hit
  }
  if (prevE) {
    const hit = remote.find((r) => normLogin(r.email) === prevE)
    if (hit) return hit
  }
  const curU = normLogin(account.usuario)
  const curE = normLogin(account.email)
  return remote.find(
    (r) => normLogin(r.usuario) === curU || normLogin(r.email) === curE,
  )
}

async function findRemoteUsuarioRowDb(
  account: PortalAccount,
  prev?: { usuario?: string; email?: string },
): Promise<RemoteUsuarioRow | null> {
  if (!supabase) return null
  if (validUuid(account.id)) {
    const { data } = await supabase
      .from('usuarios')
      .select('id, usuario, email, ativo, senha_hash, transportador_id, empresa_org_id')
      .eq('id', account.id)
      .maybeSingle()
    if (data?.id) return data as RemoteUsuarioRow
  }
  const tries = [
    prev?.email?.trim().toLowerCase(),
    prev?.usuario?.trim(),
    account.email.trim().toLowerCase(),
    account.usuario.trim(),
  ].filter(Boolean) as string[]
  for (const q of tries) {
    const col = q.includes('@') ? 'email' : 'usuario'
    const { data } = await supabase
      .from('usuarios')
      .select('id, usuario, email, ativo, senha_hash, transportador_id, empresa_org_id')
      .ilike(col, q)
      .maybeSingle()
    if (data?.id) return data as RemoteUsuarioRow
  }
  return null
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

function mergePassword(localPass: string, remotePass: string, account?: {
  id?: string
  email?: string
  usuario?: string
}): string {
  const recent = account ? senhaRecemGravadaPara(account) : null
  if (recent) return recent
  const local = (localPass || '').trim()
  const remote = (remotePass || '').trim()
  if (local && remote && local === remote) return local
  if (remote) return remote
  return local
}

function fromRemoteAccount(row: RemotePortalAccount, local?: PortalAccount): PortalAccount {
  return {
    id: row.id,
    usuario: row.usuario,
    email: row.email,
    password: mergePassword(local?.password || '', row.senha_hash || '', {
      id: row.id,
      email: row.email,
      usuario: row.usuario,
    }),
    nome: row.nome,
    role: row.role,
    nivel: row.nivel,
    perfil_operacional: row.perfil_operacional ?? undefined,
    transportador_id: transportadorIdFromRemote(row, local),
    empresa_org_id: row.empresa_org_id ?? local?.empresa_org_id ?? null,
    ativo: row.ativo,
    created_at: row.created_at,
  }
}

let ultimaListaEnviada = ''

/** Contas criadas nesta sessão (podem ser INSERIDAS no banco). */
const contasNovasDaSessao = new Set<string>()

/** Marque ao criar conta nova (painel / cadastro público) para permitir INSERT. */
export function marcarContaNovaParaInsert(id: string) {
  contasNovasDaSessao.add(id)
}

async function persistPortalAccountsRemote(list: PortalAccount[]) {
  if (!isSupabaseConfigured || !supabase) return
  const fp = JSON.stringify(
    list.map((a) => [a.usuario, a.email, a.password, a.nome, a.role, a.transportador_id, a.ativo]),
  )
  if (fp === ultimaListaEnviada) return
  try {
    const { data, error } = await supabase
      .from('usuarios')
      .select('id, usuario, email, ativo, senha_hash')
    if (error) {
      console.warn('[portalAuth] persist usuarios falhou:', error.message)
      return
    }

    const remote = (data ?? []) as Array<{
      id: string
      usuario: string
      email: string
      ativo: boolean
      senha_hash: string | null
    }>

    // Não rebaixar login de transportadora já aprovada por cache antigo de outro aparelho.
    const tidsBloqueioSuspeito = [
      ...new Set(
        list
          .filter(
            (a) =>
              a.role === 'transportador' &&
              !a.ativo &&
              validUuid(a.transportador_id),
          )
          .map((a) => a.transportador_id as string),
      ),
    ]
    const aprovados = new Set<string>()
    if (tidsBloqueioSuspeito.length > 0) {
      const { data: tRows } = await supabase
        .from('transportadores')
        .select('id, situacao')
        .in('id', tidsBloqueioSuspeito)
      for (const t of (tRows ?? []) as Array<{ id: string; situacao?: string }>) {
        if (t.situacao === 'ativo') aprovados.add(t.id)
      }
    }

    for (const account of list) {
      if (foiExcluida(account) || isContaDemoGerada(account)) continue
      let ativo = account.ativo
      if (
        !ativo &&
        account.role === 'transportador' &&
        account.transportador_id &&
        aprovados.has(account.transportador_id)
      ) {
        // Transportadora aprovada: cache antigo de outro aparelho não pode bloquear o login
        ativo = true
      }

      const localSenha = (account.password || '').trim()
      const rowBase = {
        usuario: account.usuario.trim(),
        email: account.email.trim().toLowerCase(),
        nome: account.nome || account.usuario,
        role: account.role === 'super' ? 'super' : 'transportador',
        nivel: account.role === 'super' ? 'super' : (account.nivel ?? 'operador'),
        perfil_operacional: account.perfil_operacional ?? null,
        transportador_id: validUuid(account.transportador_id)
          ? account.transportador_id
          : null,
        empresa_org_id: transportadorRefText(account),
        ativo,
        updated_at: new Date().toISOString(),
      }
      const found = findRemoteUsuarioRow(remote, account)
      if (found) {
        // Nunca apagar senha do banco com valor vazio do cache local.
        // Troca de senha (valor diferente) só via gravarContaPortalNoBanco —
        // o persist em lote de sync/ensureContas NÃO pode reverter senha nova.
        const patch: Record<string, unknown> = { ...rowBase }
        const remoteSenha = (found.senha_hash || '').trim()
        const recent = senhaRecemGravadaPara(account) || senhaRecemGravadaPara(found)
        if (recent && recent.length >= 4) {
          patch.senha_hash = recent
        } else if (localSenha.length >= 4 && !remoteSenha) {
          patch.senha_hash = localSenha
        } else if (localSenha.length >= 4 && remoteSenha === localSenha) {
          patch.senha_hash = localSenha
        }
        // else: remoto já tem senha diferente → não sobrescrever
        const { error: upErr } = await supabase
          .from('usuarios')
          .update(patch)
          .eq('id', found.id)
        if (upErr) {
          console.warn('[portalAuth] update usuario falhou:', upErr.message)
        }
        continue
      }
      // INSERT só para contas criadas nesta sessão (painel / cadastro público).
      // Conta que não está no banco = excluída por um Super; NÃO recriar
      // (era isso que fazia usuários excluídos "voltarem").
      if (contasNovasDaSessao.has(account.id)) {
        if (localSenha.length < 4) continue
        const { error: inErr } = await supabase
          .from('usuarios')
          .insert({ ...rowBase, senha_hash: localSenha })
        if (inErr) {
          console.warn('[portalAuth] insert usuario falhou:', inErr.message)
        }
      }
    }
    ultimaListaEnviada = fp
    void broadcastPortalAccountsChanged('upsert')
  } catch (e) {
    console.warn('[portalAuth] persist usuarios exception:', e)
  }
}

/**
 * Grava uma conta (login, e-mail, senha) imediatamente em `usuarios`.
 * Usado pelo painel ao Salvar — não depende do debounce de 900ms.
 */
export async function gravarContaPortalNoBanco(
  account: PortalAccount,
  prev?: { usuario?: string; email?: string },
): Promise<{ ok: boolean; erro?: string }> {
  if (!isSupabaseConfigured || !supabase) {
    return { ok: true }
  }
  const localSenha = (account.password || '').trim()
  if (localSenha.length < 4) {
    return { ok: false, erro: 'Senha deve ter ao menos 4 caracteres.' }
  }
  const email = account.email.trim().toLowerCase()
  const usuario = account.usuario.trim()
  const rowBase = {
    usuario,
    email,
    senha_hash: localSenha,
    nome: account.nome || usuario,
    role: account.role === 'super' ? 'super' : 'transportador',
    nivel: account.role === 'super' ? 'super' : (account.nivel ?? 'operador'),
    perfil_operacional: account.perfil_operacional ?? null,
    transportador_id: validUuid(account.transportador_id)
      ? account.transportador_id
      : null,
    empresa_org_id: transportadorRefText(account),
    ativo: account.ativo ?? true,
    updated_at: new Date().toISOString(),
  }

  try {
    const existente = await findRemoteUsuarioRowDb(account, prev)
    let dbRow: {
      id: string
      usuario?: string
      email?: string
      senha_hash?: string | null
      transportador_id?: string | null
      empresa_org_id?: string | null
    } | null = null

    if (existente?.id) {
      let { data, error } = await supabase
        .from('usuarios')
        .update(rowBase)
        .eq('id', existente.id)
        .select('id, usuario, email, senha_hash, transportador_id, empresa_org_id')
        .maybeSingle()
      // Produção antiga pode não ter updated_at — tenta de novo sem o campo
      if (error && /updated_at/i.test(error.message)) {
        const { updated_at: _ignored, ...semUpdated } = rowBase
        void _ignored
        const retry = await supabase
          .from('usuarios')
          .update(semUpdated)
          .eq('id', existente.id)
          .select('id, usuario, email, senha_hash, transportador_id, empresa_org_id')
          .maybeSingle()
        data = retry.data
        error = retry.error
      }
      if (error) return { ok: false, erro: error.message }
      if (!data?.id) {
        return { ok: false, erro: 'Não foi possível atualizar a conta no banco (registro não encontrado).' }
      }
      if ((data.senha_hash || '').trim() !== localSenha) {
        // Força só a senha se o update geral não gravou senha_hash
        const force = await supabase
          .from('usuarios')
          .update({ senha_hash: localSenha })
          .eq('id', data.id)
          .select('id, usuario, email, senha_hash, transportador_id, empresa_org_id')
          .maybeSingle()
        if (force.error) return { ok: false, erro: force.error.message }
        if ((force.data?.senha_hash || '').trim() !== localSenha) {
          return {
            ok: false,
            erro: 'O banco não confirmou a nova senha. Verifique a coluna senha_hash / RLS.',
          }
        }
        dbRow = force.data
      } else {
        dbRow = data
      }
    } else {
      marcarContaNovaParaInsert(account.id)
      const { data, error } = await supabase
        .from('usuarios')
        .insert(rowBase)
        .select('id, usuario, email, senha_hash, transportador_id, empresa_org_id')
        .maybeSingle()
      if (error) return { ok: false, erro: error.message }
      if (!data?.id) {
        return { ok: false, erro: 'Não foi possível criar a conta no banco.' }
      }
      dbRow = data
    }

    if (account.role === 'transportador' && account.transportador_id) {
      const vinculoConfirmado = transportadorIdFromRemote(dbRow ?? {})
      if (vinculoConfirmado !== account.transportador_id) {
        return {
          ok: false,
          erro: 'O banco não confirmou a transportadora vinculada. Selecione a empresa novamente.',
        }
      }
    }

    // Mantém cache alinhado (id uuid do banco + senha nova)
    const users = loadPortalAccounts()
    const idx = users.findIndex(
      (u) =>
        u.id === account.id ||
        (dbRow?.id && u.id === dbRow.id) ||
        (prev?.usuario && normLogin(u.usuario) === normLogin(prev.usuario)) ||
        (prev?.email && normLogin(u.email) === normLogin(prev.email)) ||
        normLogin(u.usuario) === normLogin(usuario) ||
        normLogin(u.email) === normLogin(email),
    )
    const salvo: PortalAccount = {
      ...(idx >= 0 ? users[idx] : account),
      ...account,
      usuario,
      email,
      password: localSenha,
      id: dbRow?.id ?? existente?.id ?? account.id,
    }
    const next =
      idx >= 0
        ? users.map((u, i) => (i === idx ? salvo : u))
        : [...users, salvo]

    // Cancela persist em lote stale (ex.: ensureContas com lista antiga) que
    // reverteria a senha recém-gravada.
    cancelScheduledPersistRemote()
    savePortalAccountsMemory(normalizePortalList(next))
    marcarSenhaRecemGravada(salvo, localSenha)

    ultimaListaEnviada = ''
    void broadcastPortalAccountsChanged('upsert')
    return { ok: true }
  } catch (e) {
    return {
      ok: false,
      erro: e instanceof Error ? e.message : 'Falha ao gravar no banco.',
    }
  }
}

/** Força envio imediato de todas as contas pendentes ao Supabase. */
export async function flushPortalAccountsRemote(
  list?: PortalAccount[],
): Promise<void> {
  if (pushTimer != null) {
    window.clearTimeout(pushTimer)
    pushTimer = null
  }
  const pending = list ?? pushPending ?? loadPortalAccounts()
  pushPending = null
  ultimaListaEnviada = ''
  await persistPortalAccountsRemote(pending)
}

/** Agrupa gravações remotas (a tabela é editada campo a campo pelo Super). */
let pushTimer: number | null = null
let pushPending: PortalAccount[] | null = null
let pushGeneration = 0

function cancelScheduledPersistRemote() {
  if (pushTimer != null) {
    window.clearTimeout(pushTimer)
    pushTimer = null
  }
  pushPending = null
  pushGeneration += 1
}

function schedulePersistRemote(list: PortalAccount[]) {
  if (!isSupabaseConfigured || !supabase) return
  pushPending = list
  if (pushTimer != null) window.clearTimeout(pushTimer)
  const gen = pushGeneration
  pushTimer = window.setTimeout(() => {
    pushTimer = null
    if (gen !== pushGeneration) return
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

    const remoteRowsAll = ((data ?? []) as RemotePortalAccount[]).filter(
      (row) => row.role === 'super' || row.role === 'transportador',
    )

    // Contas de demonstração geradas automaticamente por versões antigas do app
    // (padrão "empresa2@docalivre.com" SEM senha). Nunca apaga conta com senha.
    const lixoDemo = remoteRowsAll.filter((row) => isContaDemoGerada(row))
    // Conta excluída que reapareceu (aparelho com versão antiga do app): apaga de novo.
    const ressuscitadas = remoteRowsAll.filter((row) => foiExcluida(row))
    const paraRemover = [...new Set([...lixoDemo, ...ressuscitadas].map((r) => r.id))]
    if (paraRemover.length > 0) {
      await supabase.from('usuarios').delete().in('id', paraRemover)
    }

    const removidos = new Set(paraRemover)
    const remoteRows = remoteRowsAll.filter((row) => !removidos.has(row.id))

    const localPorChave = new Map<string, PortalAccount>()
    const localPorId = new Map<string, PortalAccount>()
    for (const u of local) {
      localPorId.set(u.id, u)
      if (u.usuario) localPorChave.set(`login:${u.usuario.toLowerCase()}`, u)
      if (u.email) localPorChave.set(`email:${u.email.toLowerCase()}`, u)
    }
    const merged: PortalAccount[] =
      remoteRows.length > 0
        ? remoteRows.map((row) =>
            fromRemoteAccount(
              row,
              localPorId.get(row.id) ??
                localPorChave.get(`login:${(row.usuario || '').toLowerCase()}`) ??
                localPorChave.get(`email:${(row.email || '').toLowerCase()}`),
            ),
          )
        : [...local]

    // Mantém contas locais ainda não no banco (nova conta / demos Santos·Nova Era).
    // Sem isso o sync apagava a conta recém-criada e as demos sumiam ao editar senha.
    if (remoteRows.length > 0) {
      for (const u of local) {
        if (foiExcluida(u) || isContaDemoGerada(u)) continue
        const jaTem = merged.some(
          (m) =>
            m.id === u.id ||
            normLogin(m.email) === normLogin(u.email) ||
            normLogin(m.usuario) === normLogin(u.usuario),
        )
        if (jaTem) continue
        const preservar =
          contasNovasDaSessao.has(u.id) || isDemoTransportadorCanonico(u)
        if (preservar) merged.push(u)
      }
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
    accountsCache = normalized
    // As credenciais mostradas no card "DEMO TRANSPORTADOR" precisam ser
    // exatamente as mesmas no banco, inclusive após edições/sync antigos.
    await repairDemoPortalAccountsRemote(normalized)
    // Se demos / contas novas faltam no banco, agenda insert (sem sobrescrever senhas).
    const precisaPersistirDemos = DEMO_TRANSPORTADORES.some((d) => {
      const hit = normalized.find(
        (u) =>
          u.id === d.id ||
          normLogin(u.email) === d.email ||
          normLogin(u.usuario) === d.usuario,
      )
      return Boolean(hit && contasNovasDaSessao.has(hit.id))
    })
    if (precisaPersistirDemos || [...contasNovasDaSessao].some((id) => normalized.some((u) => u.id === id))) {
      schedulePersistRemote(normalized)
    }
    clearLegacyAccountKeys()
    return normalized
  } catch {
    return loadPortalAccounts()
  }
}

async function repairDemoPortalAccountsRemote(accounts: PortalAccount[]) {
  if (!isSupabaseConfigured || !supabase) return
  for (const d of DEMO_TRANSPORTADORES) {
    const local = accounts.find(
      (u) =>
        u.id === d.id ||
        normLogin(u.email) === d.email ||
        normLogin(u.usuario) === d.usuario,
    )
    if (!local) continue
    const existente = await findRemoteUsuarioRowDb(local)
    const payload = {
      usuario: d.usuario,
      email: d.email,
      senha_hash: d.password,
      nome: d.nome,
      role: 'transportador',
      nivel: 'operador',
      transportador_id: d.transportador_id,
      ativo: true,
      updated_at: new Date().toISOString(),
    }
    if (existente?.id) {
      const precisa =
        normLogin(existente.usuario) !== d.usuario ||
        normLogin(existente.email) !== d.email ||
        (existente.senha_hash || '') !== d.password ||
        existente.transportador_id !== d.transportador_id ||
        !existente.ativo
      if (!precisa) continue
      let { error } = await supabase.from('usuarios').update(payload).eq('id', existente.id)
      if (error && /updated_at/i.test(error.message)) {
        const { updated_at: _ignored, ...semUpdated } = payload
        void _ignored
        const retry = await supabase.from('usuarios').update(semUpdated).eq('id', existente.id)
        error = retry.error
      }
      if (!error) contasNovasDaSessao.delete(local.id)
      continue
    }
    let { error } = await supabase.from('usuarios').insert(payload)
    if (error && /updated_at/i.test(error.message)) {
      const { updated_at: _ignored, ...semUpdated } = payload
      void _ignored
      const retry = await supabase.from('usuarios').insert(semUpdated)
      error = retry.error
    }
    if (!error) contasNovasDaSessao.delete(local.id)
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
  // Atualiza apenas o vínculo; nunca regrava senha a partir de snapshot antigo.
  for (const account of next) {
    const before = list.find(
      (u) =>
        u.id === account.id ||
        normLogin(u.email) === normLogin(account.email) ||
        normLogin(u.usuario) === normLogin(account.usuario),
    )
    if (
      account.role === 'transportador' &&
      account.transportador_id &&
      before?.transportador_id !== account.transportador_id
    ) {
      void persistPortalAccountLinkRemote(account)
    }
  }
  savePortalAccountsMemory(next)
  return next
}

async function persistPortalAccountLinkRemote(account: PortalAccount) {
  if (!isSupabaseConfigured || !supabase || !account.transportador_id) return
  try {
    const row = await findRemoteUsuarioRowDb(account)
    if (!row?.id) return
    const patch = {
      transportador_id: validUuid(account.transportador_id)
        ? account.transportador_id
        : null,
      empresa_org_id: transportadorRefText(account),
      updated_at: new Date().toISOString(),
    }
    let { error } = await supabase.from('usuarios').update(patch).eq('id', row.id)
    if (error && /updated_at/i.test(error.message)) {
      const { updated_at: _ignored, ...semUpdated } = patch
      void _ignored
      const retry = await supabase.from('usuarios').update(semUpdated).eq('id', row.id)
      error = retry.error
    }
    if (!error) void broadcastPortalAccountsChanged('upsert')
  } catch {
    /* o próximo sync tenta novamente */
  }
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
    // Mantém só se o id existir de verdade (t1/t2 locais não contam no banco)
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
  // Registra antes de tudo: mesmo se o banco falhar, nenhum aparelho recria a conta.
  registrarExclusao(account)
  if (accountsCache) {
    accountsCache = accountsCache.filter((u) => !foiExcluida(u))
  }
  if (!isSupabaseConfigured || !supabase) return { ok: true }

  try {
    const usuario = account.usuario.trim()
    const email = account.email.trim().toLowerCase()

    // Busca pelo login/e-mail (sem diferenciar maiúsculas) porque o id local
    // pode não ser o UUID da tabela e o e-mail pode estar salvo capitalizado.
    const filtros: string[] = []
    if (usuario) filtros.push(`usuario.ilike."${usuario.replace(/["%,]/g, '')}"`)
    if (email) filtros.push(`email.ilike."${email.replace(/["%,]/g, '')}"`)
    const { data: rows, error: selectError } = await supabase
      .from('usuarios')
      .select('id')
      .or(filtros.join(','))
    if (selectError) return { ok: false, erro: selectError.message }

    const ids = (rows ?? [])
      .map((row) => (row as { id?: string }).id)
      .filter((id): id is string => Boolean(id))
    if (account.id && validUuid(account.id) && !ids.includes(account.id)) {
      ids.push(account.id)
    }
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
    if (email) {
      const { error: profileError } = await supabase
        .from('profiles')
        .update({ ativo: false })
        .ilike('email', email)
      if (profileError) return { ok: false, erro: profileError.message }
    }

    void broadcastPortalAccountsChanged('delete')
    void notifyPortalAccountsListeners()
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
  if (Date.now() < portalSaveGraceUntil) {
    const list = loadPortalAccounts()
    for (const cb of portalAccountsListeners) {
      try {
        cb(list)
      } catch {
        /* ignore */
      }
    }
    return
  }
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
    }, 4_000)
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
  const created = await createPortalAccount({
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
  // Demo: o banco zera transportador_id (t1/t2 não são UUID) — restaura antes de validar
  if (!isSuperuser && account.role === 'transportador' && !account.transportador_id) {
    const demo = DEMO_TRANSPORTADORES.find(
      (d) =>
        account!.id === d.id ||
        normId(account!.email) === normId(d.email) ||
        normId(account!.usuario) === normId(d.usuario),
    )
    if (demo) {
      const next = users.map((u) =>
        u.id === account!.id ? { ...u, transportador_id: demo.transportador_id, ativo: true } : u,
      )
      savePortalAccounts(next)
      account = { ...account, transportador_id: demo.transportador_id, ativo: true }
    }
  }

  // O DataContext faz a última tentativa de vínculo usando a lista atualizada de
  // transportadoras. Não bloqueie aqui: isso impedia recuperar associações locais.
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

/** Grava a senha real de volta em `usuarios` e no cache (repara contas sem senha_hash). */
async function repararSenhaPortal(account: PortalAccount, senha: string) {
  const senhaLimpa = senha.trim()
  if (senhaLimpa.length < 4) return
  const users = loadPortalAccounts()
  const next = users.map((u) =>
    u.id === account.id ||
    normId(u.email) === normId(account.email) ||
    normId(u.usuario) === normId(account.usuario)
      ? { ...u, password: senhaLimpa }
      : u,
  )
  if (!users.some((u) => u.id === account.id || normId(u.email) === normId(account.email))) {
    marcarContaNovaParaInsert(account.id)
    next.push({ ...account, password: senhaLimpa })
  }
  savePortalAccounts(normalizePortalList(next))

  if (!isSupabaseConfigured || !supabase) return
  try {
    const email = account.email.trim().toLowerCase()
    const usuario = account.usuario.trim()
    const { data } = await supabase
      .from('usuarios')
      .select('id')
      .ilike('email', email)
      .limit(1)
    let row = (data ?? [])[0] as { id: string } | undefined
    if (!row) {
      const { data: byUser } = await supabase
        .from('usuarios')
        .select('id')
        .ilike('usuario', usuario)
        .limit(1)
      row = (byUser ?? [])[0] as { id: string } | undefined
    }
    if (row?.id) {
      await supabase
        .from('usuarios')
        .update({ senha_hash: senhaLimpa, updated_at: new Date().toISOString() })
        .eq('id', row.id)
    } else {
      marcarContaNovaParaInsert(account.id)
      await supabase.from('usuarios').insert({
        usuario,
        email,
        senha_hash: senhaLimpa,
        nome: account.nome || usuario,
        role: account.role === 'super' ? 'super' : 'transportador',
        nivel: account.role === 'super' ? 'super' : (account.nivel ?? 'operador'),
        perfil_operacional: account.perfil_operacional ?? null,
        transportador_id: validUuid(account.transportador_id)
          ? account.transportador_id
          : null,
        empresa_org_id: transportadorRefText(account),
        ativo: account.ativo ?? true,
      })
    }
  } catch {
    /* ignore */
  }
}

/**
 * Login do portal. Tenta a senha em `usuarios`; se falhar, valida no Supabase Auth
 * (conta criada no cadastro) e repara `senha_hash` — corrige o caso “funcionou e
 * depois de horas a senha parou de bater”.
 */
export async function portalLogin(
  identificador: string,
  senha: string,
): Promise<
  | {
      ok: true
      account: PortalAccount
      isSuperuser: boolean
      permissoes: OfertaPermissao
    }
  | { ok: false; erro: string }
> {
  const local = portalLoginLocal(identificador, senha)
  if (local.ok) return local

  if (!isSupabaseConfigured || !supabase) return local

  const candidatos = findAccountsByIdentificador(loadPortalAccounts(), identificador)
  const emails = [
    ...new Set(
      [
        ...candidatos.map((c) => c.email.trim().toLowerCase()),
        identificador.includes('@') ? identificador.trim().toLowerCase() : '',
      ].filter((e) => e.includes('@')),
    ),
  ]

  // Login só com usuário (sem @): busca e-mail no banco para validar no Auth
  if (emails.length === 0 && !identificador.includes('@')) {
    try {
      const { data } = await supabase
        .from('usuarios')
        .select('email')
        .ilike('usuario', identificador.trim())
        .limit(1)
      const emailDb = (data?.[0] as { email?: string } | undefined)?.email
      if (emailDb?.includes('@')) emails.push(emailDb.trim().toLowerCase())
    } catch {
      /* ignore */
    }
  }

  for (const email of emails) {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password: senha,
    })
    if (error || !data.user) continue

    const account =
      candidatos.find((c) => normId(c.email) === normId(email)) ||
      loadPortalAccounts().find((c) => normId(c.email) === normId(email)) ||
      ({
        id: data.user.id,
        usuario: (data.user.user_metadata?.usuario as string) || email.split('@')[0],
        email,
        password: senha,
        nome:
          (data.user.user_metadata?.nome as string) ||
          email.split('@')[0],
        role: 'transportador' as const,
        nivel: 'operador' as const,
        transportador_id: null,
        ativo: true,
        created_at: new Date().toISOString(),
      } satisfies PortalAccount)

    await repararSenhaPortal(account, senha)
    try {
      await supabase.auth.signOut()
    } catch {
      /* ignore */
    }

    const repaired = portalLoginLocal(identificador, senha)
    if (repaired.ok) return repaired
    // Conta Auth ok mas portal ainda inativo / sem vínculo
    if (!account.ativo) {
      return {
        ok: false,
        erro: 'Cadastro aguardando aprovação. Você poderá entrar após a liberação.',
      }
    }
    return repaired
  }

  return local
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
  const id = normId(identificador)
  if (!id) return

  const users = loadPortalAccounts()
  const locais = findAccountsByIdentificador(users, identificador).filter(
    (u) => u.role === 'transportador' && !u.ativo,
  )

  // Também busca direto no banco (cache local pode estar desatualizado / incompleto)
  const safe = id.replace(/[%_,()"]/g, '')
  const { data: remotosInativos } = await supabase
    .from('usuarios')
    .select('id, usuario, email, role, transportador_id, ativo')
    .eq('role', 'transportador')
    .eq('ativo', false)
    .or(`usuario.ilike."${safe}",email.ilike."${safe}"`)

  type Cand = {
    id: string
    email: string
    transportador_id: string | null
  }
  const byId = new Map<string, Cand>()
  for (const u of locais) {
    byId.set(u.id, {
      id: u.id,
      email: u.email,
      transportador_id: u.transportador_id ?? null,
    })
  }
  for (const row of (remotosInativos ?? []) as Cand[]) {
    byId.set(row.id, {
      id: row.id,
      email: row.email || '',
      transportador_id: row.transportador_id,
    })
  }
  // Match por login compacto (Empaztransportes) quando o filtro .or do PostgREST falha
  if (byId.size === 0) {
    const { data: allInativos } = await supabase
      .from('usuarios')
      .select('id, usuario, email, transportador_id, ativo')
      .eq('role', 'transportador')
      .eq('ativo', false)
    const idCompact = id.replace(/\s+/g, '')
    for (const row of (allInativos ?? []) as Array<{
      id: string
      usuario?: string
      email?: string
      transportador_id: string | null
    }>) {
      const userN = normId(row.usuario || '')
      const emailN = normId(row.email || '')
      if (
        userN === id ||
        userN.replace(/\s+/g, '') === idCompact ||
        emailN === id ||
        emailN.split('@')[0] === id
      ) {
        byId.set(row.id, {
          id: row.id,
          email: row.email || '',
          transportador_id: row.transportador_id,
        })
      }
    }
  }

  if (byId.size === 0) return

  for (const account of byId.values()) {
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
    let upd = await supabase.from('usuarios').update(patch).eq('id', account.id).select('id')
    if (upd.error && /updated_at/i.test(upd.error.message)) {
      upd = await supabase
        .from('usuarios')
        .update({ ativo: true })
        .eq('id', account.id)
        .select('id')
    }
    if (account.email) {
      await supabase
        .from('usuarios')
        .update({ ativo: true })
        .ilike('email', account.email.trim())
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
