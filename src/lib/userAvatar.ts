import { isSupabaseConfigured, supabase } from './supabase'

function dataUrlFromFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(new Error('Falha ao ler imagem'))
    reader.readAsDataURL(file)
  })
}

function validUuid(value?: string | null) {
  return Boolean(
    value &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        value,
      ),
  )
}

function norm(v?: string | null) {
  return (v || '').trim().toLowerCase()
}

export type AvatarUserHints = {
  email?: string | null
  usuario?: string | null
}

type UsuarioAvatarRow = {
  id: string
  avatar_url?: string | null
  email?: string | null
  usuario?: string | null
}

/** Escolhe a melhor linha quando há duplicata local (u-diego) + UUID no banco. */
function pickMelhorUsuario(rows: UsuarioAvatarRow[]): UsuarioAvatarRow | null {
  if (!rows.length) return null
  const scored = rows.map((r) => {
    let score = 0
    if (validUuid(r.id)) score += 50
    if (typeof r.avatar_url === 'string' && r.avatar_url.trim()) score += 30
    return { r, score }
  })
  scored.sort((a, b) => b.score - a.score)
  return scored[0]?.r ?? null
}

async function queryUsuariosPorHints(hints?: AvatarUserHints): Promise<UsuarioAvatarRow[]> {
  if (!supabase) return []
  const email = norm(hints?.email)
  const usuario = (hints?.usuario || '').trim()
  const out: UsuarioAvatarRow[] = []
  const seen = new Set<string>()

  const pushRows = (data: unknown) => {
    for (const row of (data ?? []) as UsuarioAvatarRow[]) {
      if (!row?.id || seen.has(row.id)) continue
      seen.add(row.id)
      out.push(row)
    }
  }

  if (email.includes('@')) {
    const { data } = await supabase
      .from('usuarios')
      .select('id, avatar_url, email, usuario')
      .ilike('email', email)
    pushRows(data)
  }
  if (usuario) {
    const { data } = await supabase
      .from('usuarios')
      .select('id, avatar_url, email, usuario')
      .ilike('usuario', usuario)
    pushRows(data)
  }
  return out
}

/** Resolve o id real em `usuarios` (UUID do banco), mesmo se a sessão ainda tiver id local. */
async function resolveUsuarioDbId(
  userId: string,
  hints?: AvatarUserHints,
): Promise<string | null> {
  if (!supabase) return null

  if (validUuid(userId)) {
    const { data } = await supabase
      .from('usuarios')
      .select('id, avatar_url')
      .eq('id', userId)
      .maybeSingle()
    if (data?.id) return String(data.id)
  }

  // Conta local (ex.: u-diego): tenta leitura direta caso exista no banco
  if (userId && !validUuid(userId)) {
    const { data } = await supabase
      .from('usuarios')
      .select('id, avatar_url')
      .eq('id', userId)
      .maybeSingle()
    if (data?.id) return String(data.id)
  }

  const candidatos = await queryUsuariosPorHints(hints)
  return pickMelhorUsuario(candidatos)?.id ?? null
}

async function gravarAvatarNoBanco(
  userId: string,
  avatarUrl: string | null,
  hints?: AvatarUserHints,
): Promise<{ ok: true; dbId: string | null } | { ok: false; erro: string }> {
  if (!supabase) return { ok: true, dbId: null }

  let dbId = await resolveUsuarioDbId(userId, hints)
  let wroteUsuarios = false

  // Atualiza por id resolvido; se falhar (0 linhas), tenta todas as linhas do e-mail/login
  const idsParaGravar = new Set<string>()
  if (dbId) idsParaGravar.add(dbId)
  for (const row of await queryUsuariosPorHints(hints)) {
    idsParaGravar.add(row.id)
  }
  if (validUuid(userId)) idsParaGravar.add(userId)
  if (userId && !validUuid(userId)) idsParaGravar.add(userId)

  for (const id of idsParaGravar) {
    const { data, error } = await supabase
      .from('usuarios')
      .update({ avatar_url: avatarUrl })
      .eq('id', id)
      .select('id, avatar_url')
      .maybeSingle()
    if (error) {
      if (/avatar_url/i.test(error.message)) {
        return {
          ok: false,
          erro:
            'Coluna avatar_url ausente em usuarios. Rode supabase/usuario_avatar.sql no SQL Editor.',
        }
      }
      // tenta próximo id (RLS / linha inexistente)
      console.warn('[avatar] update usuarios', id, error.message)
      continue
    }
    if (data?.id) {
      wroteUsuarios = true
      dbId = String(data.id)
      const gravado =
        data.avatar_url == null ? null : String(data.avatar_url).trim() || null
      const esperado = avatarUrl == null ? null : avatarUrl.trim() || null
      // Confirma que o valor ficou no banco (evita “sucesso” com 0 efeito / RLS)
      if ((gravado || '') !== (esperado || '') && esperado && !gravado) {
        console.warn('[avatar] update retornou sem gravar avatar_url:', id)
        continue
      }
      break
    }
  }

  // Contas Auth / cadastro público (profiles.id = UUID)
  if (validUuid(userId) || (dbId && validUuid(dbId))) {
    const profileId = validUuid(userId) ? userId : dbId!
    const { error: pErr } = await supabase
      .from('profiles')
      .update({ avatar_url: avatarUrl })
      .eq('id', profileId)
    if (pErr && !/avatar_url|Could not find|schema cache/i.test(pErr.message)) {
      console.warn('[avatar] update profiles:', pErr.message)
    }
  }

  if (!wroteUsuarios) {
    return {
      ok: false,
      erro:
        'Não consegui gravar a foto na conta (usuarios). Confira login/e-mail no banco e a coluna avatar_url (SQL do portal).',
    }
  }

  return { ok: true, dbId }
}

/** Busca avatar remoto (usuarios → profiles) para hidratar a sessão em outro aparelho. */
export async function buscarAvatarUsuarioRemoto(
  userId: string,
  hints?: AvatarUserHints,
): Promise<string | null> {
  if (!isSupabaseConfigured || !supabase) return null

  // 1) Candidatos por e-mail/login (pega a linha que já tem foto, mesmo com id local distinto)
  const porHints = await queryUsuariosPorHints(hints)
  const comFoto = porHints.find(
    (r) => typeof r.avatar_url === 'string' && r.avatar_url.trim(),
  )
  if (comFoto?.avatar_url) return comFoto.avatar_url.trim()

  const dbId = await resolveUsuarioDbId(userId, hints)
  if (dbId) {
    const { data, error } = await supabase
      .from('usuarios')
      .select('avatar_url')
      .eq('id', dbId)
      .maybeSingle()
    if (!error) {
      const url = typeof data?.avatar_url === 'string' ? data.avatar_url.trim() : ''
      if (url) return url
    } else if (!/avatar_url|Could not find|schema cache/i.test(error.message)) {
      console.warn('[avatar] select usuarios:', error.message)
    }
  }

  // Tenta Storage (arquivo antigo sem URL no banco)
  const folders = new Set<string>()
  const folderOf = (id: string) =>
    validUuid(id) ? id : id.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 64)
  if (dbId) folders.add(folderOf(dbId))
  if (userId) folders.add(folderOf(userId))
  for (const folder of folders) {
    const { data: files } = await supabase.storage.from('veiculos-fotos').list(`avatars/${folder}`, {
      limit: 10,
    })
    const hit = (files ?? []).find((f) => /^avatar\.(jpe?g|png|webp)$/i.test(f.name || ''))
    if (hit?.name) {
      const { data: pub } = supabase.storage
        .from('veiculos-fotos')
        .getPublicUrl(`avatars/${folder}/${hit.name}`)
      if (pub?.publicUrl) {
        const url = `${pub.publicUrl}${pub.publicUrl.includes('?') ? '&' : '?'}v=${Date.now()}`
        // Regrava no banco para não depender só do Storage
        void gravarAvatarNoBanco(userId, url, hints)
        return url
      }
    }
  }

  const profileId = validUuid(userId) ? userId : dbId
  if (profileId && validUuid(profileId)) {
    const { data } = await supabase
      .from('profiles')
      .select('avatar_url')
      .eq('id', profileId)
      .maybeSingle()
    const url = typeof data?.avatar_url === 'string' ? data.avatar_url.trim() : ''
    if (url) return url
  }

  return null
}

/** Salva avatar do usuário (Storage + usuarios.avatar_url; profiles se UUID). */
export async function atualizarAvatarUsuarioRemoto(
  userId: string,
  file: File | null,
  hints?: AvatarUserHints,
): Promise<{ ok: true; avatar_url: string | null } | { ok: false; erro: string }> {
  const uid = (userId || '').trim()
  if (!uid) return { ok: false, erro: 'Usuário inválido.' }

  if (!file) {
    if (isSupabaseConfigured && supabase) {
      const dbId = (await resolveUsuarioDbId(uid, hints)) || uid
      const folders = new Set<string>()
      folders.add(validUuid(dbId) ? dbId : dbId.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 64))
      folders.add(validUuid(uid) ? uid : uid.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 64))
      const exts = ['jpg', 'jpeg', 'png', 'webp']
      for (const folder of folders) {
        await supabase.storage
          .from('veiculos-fotos')
          .remove(exts.map((ext) => `avatars/${folder}/avatar.${ext}`))
      }
      const gravou = await gravarAvatarNoBanco(uid, null, hints)
      if (!gravou.ok) return gravou
    }
    return { ok: true, avatar_url: null }
  }

  if (file.size > 4 * 1024 * 1024) {
    return { ok: false, erro: 'A imagem deve ter no máximo 4 MB.' }
  }

  const ext =
    file.type?.split('/')[1]?.replace('jpeg', 'jpg') ||
    (file.name.match(/\.(jpe?g|png|webp)$/i)?.[1] ?? 'jpg')

  if (!isSupabaseConfigured || !supabase) {
    try {
      return { ok: true, avatar_url: await dataUrlFromFile(file) }
    } catch {
      return { ok: false, erro: 'Não foi possível ler a imagem.' }
    }
  }

  const dbId = (await resolveUsuarioDbId(uid, hints)) || uid
  const folder = validUuid(dbId) ? dbId : dbId.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 64)
  const path = `avatars/${folder}/avatar.${ext}`

  const { error: upErr } = await supabase.storage
    .from('veiculos-fotos')
    .upload(path, file, { upsert: true, contentType: file.type || 'image/jpeg' })

  let avatarUrl: string | null = null
  if (!upErr) {
    const { data: pub } = supabase.storage.from('veiculos-fotos').getPublicUrl(path)
    avatarUrl = `${pub.publicUrl}${pub.publicUrl.includes('?') ? '&' : '?'}v=${Date.now()}`
  } else {
    // Fallback: data URL no banco ainda sincroniza entre aparelhos (imagens pequenas)
    try {
      const dataUrl = await dataUrlFromFile(file)
      if (dataUrl.length > 900_000) {
        return {
          ok: false,
          erro: `Falha no upload da foto: ${upErr.message}. Tente uma imagem menor.`,
        }
      }
      avatarUrl = dataUrl
      console.warn('[avatar] storage falhou, salvando data URL:', upErr.message)
    } catch {
      return {
        ok: false,
        erro: `Falha no upload da foto: ${upErr.message}`,
      }
    }
  }

  const gravou = await gravarAvatarNoBanco(uid, avatarUrl, hints)
  if (!gravou.ok) return gravou

  // Também grava em pasta do id de sessão (u-diego) se difere — recupera foto antiga
  if (gravou.dbId && gravou.dbId !== uid && !upErr) {
    const sessFolder = validUuid(uid)
      ? uid
      : uid.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 64)
    if (sessFolder !== folder) {
      await supabase.storage
        .from('veiculos-fotos')
        .upload(`avatars/${sessFolder}/avatar.${ext}`, file, {
          upsert: true,
          contentType: file.type || 'image/jpeg',
        })
    }
  }

  return { ok: true, avatar_url: avatarUrl }
}
