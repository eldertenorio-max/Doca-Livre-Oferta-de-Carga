// Envia periodicamente ao Doca Livre Control Center o "retrato" dos usuários dos TRÊS sistemas que
// moram no banco do Oferta de Carga: Oferta de Carga, Mapa da Logística e Calculadora de Frete
// (Custo da Rota). Substitui o "plano B" do painel, que lia /rest/v1/usuarios e /rest/v1/mapa_usuarios
// com a chave pública (e recebia junto as colunas de senha).
//
// Ligado por start.mjs (import depois do servidor). Também funciona carregado sozinho, sem editar nada:
//   NODE_OPTIONS=--import=data:text/javascript,import('file:///app/cc-usuarios.mjs').catch(()=>{})
// Carregado duas vezes no mesmo processo, só a primeira carga agenda ciclos.
//
// Variáveis (sem DOCA_CC_URL ou sem nenhum segredo válido o módulo é um no-op total):
//   DOCA_CC_URL                       ex.: https://doca-livre-control-center.onrender.com/api
//   DOCA_CC_SYSTEM_SLUG + DOCA_CC_WEBHOOK_SECRET  as mesmas dos avisos de falha; os usuários do Oferta
//                                     só vão se DOCA_CC_SYSTEM_SLUG for "oferta-carga"
//   DOCA_CC_SECRET_MAPA_LOGISTICA     segredo do slug mapa-logistica (no painel: WEBHOOK_SECRET_MAPA_LOGISTICA)
//   DOCA_CC_SECRET_CALCULADORA_FRETE  segredo do slug calculadora-frete (no painel: WEBHOOK_SECRET_CALCULADORA_FRETE)
//   DOCA_CC_SNAPSHOT_MIN              (opcional) minutos entre ciclos; padrão 10, mínimo 2, 0 desliga
//   PGHOST/PGUSER/PGDATABASE/PGPASSWORD/PGPORT  as mesmas do app (abre o próprio pg.Pool, max 1)
// Cada slug só é enviado se o segredo DELE existir (mínimo 16 caracteres); cada um tem o seu segredo.
//
// De onde vem cada sistema (o mesmo que os adaptadores do painel liam, para não duplicar usuários):
//   oferta-carga       todas as linhas de `usuarios`                external_id = id
//   calculadora-frete  linhas de `usuarios` com role = 'super'      external_id = rota_super:{id}
//   mapa-logistica     todas as linhas de `mapa_usuarios`           external_id = mapa:{usuario em minúsculas}
// Nome, e-mail, usuário, papel e permissões são montados com as MESMAS regras dos adaptadores.
//
// Garantias: nunca lança erro para fora nem afeta o app; só SELECT (cada um em transação somente
// leitura), só as colunas necessárias (nunca senha_hash/senha), no máximo 2000 linhas por tabela; um
// ciclo por vez; envio sequencial; o log traz só contagens (nenhum dado de usuário, nenhum segredo).
//
// Status: "blocked" para conta inativa (usuarios.ativo = false); senão "offline". Nunca "online" (o
// painel não sobrescreve quem está online) nem "never" (nenhuma das tabelas guarda o último acesso).
//
// Chave de idempotência: snap:{slug}:{external_id}:{sha1(payload)[:12]}[-rN]:{AAAAMMDDHH} (hora UTC) e,
// para remoção, snap:{slug}:{external_id}:deleted[-rN]:{AAAAMMDDHH} (mesmo desenho do Faz um Freela).
import { createHash, createHmac } from 'node:crypto'

export const LIMITE_USUARIOS = 2000
export const CAMPOS_PERMITIDOS = [
  'external_id',
  'name',
  'email',
  'username',
  'role_code',
  'created_at',
  'created_by_name',
  'status',
  'permissions',
]

// Só as colunas usadas. senha_hash (usuarios) e senha (mapa_usuarios) nunca são lidas.
export const SQL_USUARIOS = `
select u.id::text as id, u.usuario, u.email, u.nome, u.role, u.nivel, u.perfil_operacional, u.ativo, u.created_at
from usuarios u
order by u.created_at desc, u.id desc
limit $1`

export const SQL_MAPA_USUARIOS = `
select m.usuario, m.email, m.nome, m.papel, m.nivel_hierarquia, m.superior, m.empresa_slug, m.created_at, m.updated_at
from mapa_usuarios m
order by m.created_at desc, m.usuario desc
limit $1`

const CONSULTAS = { usuarios: SQL_USUARIOS, mapa_usuarios: SQL_MAPA_USUARIOS }

// ---------- Funções puras (exportadas para teste) ----------

/** Data -> ISO (o pg já entrega Date; texto também é aceito). Inválida ou vazia -> null. */
function iso(valor) {
  if (valor === null || valor === undefined || valor === '') return null
  const d = valor instanceof Date ? valor : new Date(String(valor))
  return Number.isNaN(d.getTime()) ? null : d.toISOString()
}

function permissao(code, porQuem, quando) {
  const p = { code, granted_by_name: porQuem }
  if (quando) p.granted_at = quando
  return p
}

/** Mesma regra de mapOfertaRole (oferta-carga.adapter.ts do painel). */
export function mapearPapelOferta(roleRaw, nivelRaw, perfilOpRaw) {
  const role = String(roleRaw ?? '').trim().toLowerCase()
  const nivel = String(nivelRaw ?? '').trim().toLowerCase()
  const perfilOp = String(perfilOpRaw ?? '').trim().toLowerCase()
  if (role === 'super' || role === 'super_usuario') return 'super'
  if (role === 'transportador' || role === 'transportadora') return 'transportador'
  if (role === 'gestor' || nivel === 'gestor') return 'gestor'
  if (role === 'operador' && perfilOp === 'operador') return 'operador'
  if (role === 'minerva' || role === 'embarcador') return 'embarcador'
  return 'operador'
}

/** Conta inativa (mesma conferência do adaptador: false ou 0). */
export function estaBloqueado(linha) {
  return Boolean(linha) && (linha.ativo === false || linha.ativo === 0)
}

/** Linha de `usuarios` -> payload do slug oferta-carga (regras do OfertaCargaAdapter.mapRows). */
export function payloadOferta(r) {
  if (!r || typeof r !== 'object') return null
  if (r.id === null || r.id === undefined || String(r.id) === '') return null
  const roleRaw = String(r.role || '')
  const nivelRaw = String(r.nivel || '')
  const perfilOpRaw = String(r.perfil_operacional || '')
  const criado = iso(r.created_at)
  const p = {
    external_id: String(r.id),
    name: String(r.nome || r.usuario || r.email || r.id),
    role_code: mapearPapelOferta(roleRaw, nivelRaw, perfilOpRaw),
  }
  if (r.email) p.email = String(r.email)
  if (r.usuario) p.username = String(r.usuario)
  if (criado) p.created_at = criado
  p.status = estaBloqueado(r) ? 'blocked' : 'offline'
  const perms = []
  const origem = 'Sistema Oferta de Carga'
  if (perfilOpRaw) perms.push(permissao(`perfil_operacional:${perfilOpRaw.toLowerCase()}`, origem, criado))
  if (nivelRaw) perms.push(permissao(`nivel:${nivelRaw.toLowerCase()}`, origem, criado))
  if (roleRaw) perms.push(permissao(`modulo:${roleRaw.toLowerCase()}`, origem, criado))
  if (perms.length) p.permissions = perms
  return p
}

/** Quem é administrador da Calculadora: role exatamente "super" (o painel lia usuarios?role=eq.super). */
export function ehSuperCalculadora(r) {
  return Boolean(r) && r.role === 'super'
}

/** Linha de `usuarios` -> payload do slug calculadora-frete, só para os "super" (senão null). */
export function payloadCalculadora(r) {
  if (!ehSuperCalculadora(r)) return null
  if (r.id === null || r.id === undefined || String(r.id) === '') return null
  const p = {
    external_id: `rota_super:${r.id}`,
    name: String(r.nome || r.usuario || r.email || r.id),
    role_code: 'super',
  }
  if (r.email) p.email = String(r.email)
  if (r.usuario) p.username = String(r.usuario)
  const criado = iso(r.created_at)
  if (criado) p.created_at = criado
  p.status = estaBloqueado(r) ? 'blocked' : 'offline'
  p.permissions = [{ code: 'calculadora:gestao_creditos', granted_by_name: 'Custo da Rota' }]
  return p
}

/** Linha de `mapa_usuarios` -> payload do slug mapa-logistica (regras do MapaLogisticaAdapter.mapRows). */
export function payloadMapa(r) {
  if (!r || typeof r !== 'object') return null
  const usuario = String(r.usuario || '').trim()
  if (!usuario) return null
  const papelRaw = String(r.papel || r.nivel_hierarquia || 'empresa').toLowerCase()
  const roleCode = papelRaw === 'super' ? 'super' : 'empresa'
  const atualizado = iso(r.updated_at)
  const criado = iso(r.created_at) || atualizado
  const superior = r.superior ? String(r.superior) : null
  const p = {
    external_id: `mapa:${usuario.toLowerCase()}`,
    name: String(r.nome || usuario),
    role_code: roleCode,
    username: usuario,
  }
  if (r.email) p.email = String(r.email)
  if (criado) p.created_at = criado
  if (superior) p.created_by_name = superior
  p.status = 'offline' // a tabela não tem bloqueio nem último acesso
  p.permissions = [
    permissao(
      roleCode === 'super' ? 'mapa:administracao_global' : `mapa:empresa:${r.empresa_slug || 'padrao'}`,
      superior || 'Sistema Mapa da Logística',
      atualizado,
    ),
  ]
  return p
}

/** Os três sistemas: slug no painel, tabela de origem e montagem do payload. */
export const FONTES = [
  { slug: 'oferta-carga', tabela: 'usuarios', montar: payloadOferta },
  { slug: 'mapa-logistica', tabela: 'mapa_usuarios', montar: payloadMapa },
  { slug: 'calculadora-frete', tabela: 'usuarios', montar: payloadCalculadora },
]

/** JSON com as chaves de 1º nível em ordem alfabética (mesmo conteúdo => mesmo texto). */
export function canonizar(objeto) {
  const ordenado = {}
  for (const k of Object.keys(objeto).sort()) if (objeto[k] !== undefined) ordenado[k] = objeto[k]
  return JSON.stringify(ordenado)
}

/** 12 primeiros caracteres do sha1 do payload canônico. */
export function hashPayload(payload) {
  return createHash('sha1').update(canonizar(payload), 'utf8').digest('hex').slice(0, 12)
}

/** Balde de uma hora em UTC, formato AAAAMMDDHH (ex.: 2026111822). */
export function baldeHoraUtc(data = new Date()) {
  const dois = (n) => String(n).padStart(2, '0')
  return `${data.getUTCFullYear()}${dois(data.getUTCMonth() + 1)}${dois(data.getUTCDate())}${dois(data.getUTCHours())}`
}

/** snap:{slug}:{id}:{sha1(payload canônico)[:12]}[-rN]:{AAAAMMDDHH} */
export function chaveIdempotencia(slug, id, payload, balde = baldeHoraUtc(), revisita = 0) {
  return `snap:${slug}:${id}:${hashPayload(payload)}${revisita ? `-r${revisita}` : ''}:${balde}`
}

/** snap:{slug}:{id}:deleted[-rN]:{AAAAMMDDHH} */
export function chaveExclusao(slug, id, balde = baldeHoraUtc(), revisita = 0) {
  return `snap:${slug}:${id}:deleted${revisita ? `-r${revisita}` : ''}:${balde}`
}

/** HMAC-SHA256 (hex) de "{timestamp}.{corpo bruto}", como o Control Center confere. */
export function assinar(segredo, carimbo, bruto) {
  return createHmac('sha256', segredo).update(`${carimbo}.${bruto}`, 'utf8').digest('hex')
}

/** DOCA_CC_SNAPSHOT_MIN -> minutos: vazio/inválido = 10; 0 (ou negativo) = desligado (0); 0<n<2 = 2; no máximo 1 dia. */
export function lerIntervaloMin(valor) {
  const texto = String(valor ?? '').trim()
  const n = Number(texto)
  if (!texto || !Number.isFinite(n)) return 10
  if (n <= 0) return 0
  return Math.min(1440, Math.max(2, n))
}

/** Lê as variáveis: endereço, intervalo e os slugs ligados (cada um com o seu segredo). */
export function lerConfiguracao(env = process.env) {
  const base = String(env.DOCA_CC_URL || '').trim().replace(/\/+$/, '')
  const slugAvisos = String(env.DOCA_CC_SYSTEM_SLUG || '').trim()
  const segredos = {
    'oferta-carga': slugAvisos === 'oferta-carga' ? env.DOCA_CC_WEBHOOK_SECRET : '',
    'mapa-logistica': env.DOCA_CC_SECRET_MAPA_LOGISTICA,
    'calculadora-frete': env.DOCA_CC_SECRET_CALCULADORA_FRETE,
  }
  const envios = []
  for (const f of FONTES) {
    const segredo = String(segredos[f.slug] || '').trim()
    if (segredo.length >= 16) envios.push({ slug: f.slug, segredo })
  }
  return { base, envios, intervaloMin: lerIntervaloMin(env.DOCA_CC_SNAPSHOT_MIN) }
}

// ---------- Fonte padrão: Postgres (só SELECT) ----------

function codigoDoErro(erro) {
  // Nunca a mensagem (pode ter dados do banco); só um código curto.
  const c = erro?.code || erro?.cause?.code || erro?.name
  return typeof c === 'string' ? c.slice(0, 40) : 'erro'
}

/**
 * Lê as tabelas pedidas do banco do app: { usuarios: [...], mapa_usuarios: [...] }. Cada SELECT roda
 * em transação somente leitura própria; se uma tabela falhar, ela vem como { erro } e as outras seguem.
 */
export async function consultarPg(tabelas, limite = LIMITE_USUARIOS) {
  const saida = {}
  let pool
  try {
    const { default: pg } = await import('pg')
    // Mesma configuração de SSL de migrar.mjs; o pg lê PGHOST/PGUSER/PGDATABASE/PGPASSWORD/PGPORT sozinho.
    pool = new pg.Pool({
      ssl: process.env.PGHOST && process.env.PGSSL !== 'off' ? { rejectUnauthorized: false } : undefined,
      max: 1,
      connectionTimeoutMillis: 10_000,
      idleTimeoutMillis: 5_000,
      statement_timeout: 20_000,
      query_timeout: 25_000,
      application_name: 'cc-usuarios',
      allowExitOnIdle: true,
    })
    pool.on('error', () => {}) // erro de cliente ocioso nunca pode virar exceção não tratada
    const cliente = await pool.connect()
    let quebrado = false
    try {
      for (const tabela of tabelas) {
        const sql = CONSULTAS[tabela]
        if (!sql) continue
        try {
          await cliente.query('begin read only')
          const { rows } = await cliente.query({ text: sql, values: [limite] })
          saida[tabela] = rows
        } catch (e) {
          saida[tabela] = { erro: codigoDoErro(e) }
        } finally {
          try {
            await cliente.query('rollback')
          } catch {
            quebrado = true
          }
        }
        if (quebrado) break
      }
    } finally {
      cliente.release(quebrado)
    }
  } finally {
    if (pool) await pool.end().catch(() => {})
  }
  return saida
}

// ---------- Estado e envio por slug ----------

const dormir = (ms) => new Promise((r) => setTimeout(r, ms))

/** Memória de um slug: quem já foi visto, chaves usadas na hora e remoções pendentes. */
function criarEstadoDoSlug(slug) {
  const conhecidos = new Set() // ids vistos na última leitura completa
  const pendentesExclusao = new Map() // id -> revisita (-rN) do user.deleted ainda não entregue
  const estado = new Map() // id -> { hash, revisita } do último payload
  const usadas = new Set() // chaves já usadas NO BALDE (hora) ATUAL
  let baldeDasUsadas = null

  function zerarUsadasSeBaldeMudou(balde) {
    if (baldeDasUsadas !== balde) {
      usadas.clear()
      baldeDasUsadas = balde
    }
  }

  /** Chave estável dentro da hora; se o payload VOLTA a um estado anterior na mesma hora, ganha -r1, -r2... */
  function chaveDoUsuario(payload, balde) {
    zerarUsadasSeBaldeMudou(balde)
    const id = payload.external_id
    const hash = hashPayload(payload)
    const anterior = estado.get(id)
    if (anterior && anterior.hash === hash) {
      const chave = chaveIdempotencia(slug, id, payload, balde, anterior.revisita)
      usadas.add(chave)
      return chave
    }
    let revisita = 0
    while (usadas.has(chaveIdempotencia(slug, id, payload, balde, revisita))) revisita++
    const chave = chaveIdempotencia(slug, id, payload, balde, revisita)
    usadas.add(chave)
    estado.set(id, { hash, revisita })
    return chave
  }

  function revisitaDaExclusao(id, balde) {
    zerarUsadasSeBaldeMudou(balde)
    let revisita = 0
    while (usadas.has(chaveExclusao(slug, id, balde, revisita))) revisita++
    usadas.add(chaveExclusao(slug, id, balde, revisita))
    return revisita
  }

  /** Linhas -> itens a enviar (user.updated de cada um + user.deleted de quem sumiu). */
  function preparar(linhas, montar, truncada, balde) {
    const itens = []
    const vistos = new Set()
    for (const linha of linhas) {
      let payload = null
      try {
        payload = montar(linha)
      } catch {
        payload = null
      }
      if (!payload || vistos.has(payload.external_id)) continue
      vistos.add(payload.external_id)
      itens.push({ tipo: 'user.updated', payload, chave: chaveDoUsuario(payload, balde) })
    }
    // Lista cheia (truncada no limite) ou vazia não prova exclusão: nesses casos ninguém é apagado.
    const vaziaSuspeita = vistos.size === 0 && conhecidos.size > 0
    for (const id of vistos) pendentesExclusao.delete(id)
    if (!truncada && !vaziaSuspeita) {
      for (const id of [...conhecidos]) {
        if (vistos.has(id)) continue
        conhecidos.delete(id)
        estado.delete(id)
        pendentesExclusao.set(id, revisitaDaExclusao(id, balde))
      }
    }
    for (const id of vistos) conhecidos.add(id)
    // Remoção não entregue é repetida a cada ciclo: mesma chave dentro da hora; nova na hora seguinte.
    for (const [id, revisita] of pendentesExclusao) {
      const chave = chaveExclusao(slug, id, balde, revisita)
      usadas.add(chave)
      itens.push({ tipo: 'user.deleted', payload: { external_id: id }, chave })
    }
    return { itens, total: vistos.size }
  }

  return { preparar, entregueExclusao: (id) => pendentesExclusao.delete(id) }
}

/**
 * Cria o enviador. `opcoes.envios` = [{ slug, segredo }] (só os ligados); `opcoes.consultar(tabelas,
 * limite)` devolve { tabela: linhas } (injetável nos testes). Nada acontece até chamar `iniciar()`
 * (ou `executarCiclo()` à mão).
 */
export function criarRetratoUsuarios(opcoes = {}) {
  const base = String(opcoes.base || '').trim().replace(/\/+$/, '')
  const intervaloMin = opcoes.intervaloMin === undefined ? 10 : Number(opcoes.intervaloMin)
  const envios = (opcoes.envios || [])
    .map((e) => ({ slug: String(e?.slug || '').trim(), segredo: String(e?.segredo || '').trim() }))
    .filter((e) => e.segredo.length >= 16 && FONTES.some((f) => f.slug === e.slug))
  const ativo = Boolean(base && envios.length && intervaloMin > 0)
  const consultar = opcoes.consultar || consultarPg
  const obterBalde = opcoes.balde || baldeHoraUtc // injetável nos testes (hora fixa)
  const limite = opcoes.limite || LIMITE_USUARIOS
  const intervaloMs = opcoes.intervaloMs ?? intervaloMin * 60_000
  const primeiroAtrasoMs = opcoes.primeiroAtrasoMs ?? (() => 45_000 + Math.floor(Math.random() * 15_000))
  const pausaMs = opcoes.pausaMs ?? 100
  const timeoutPrimeiraMs = opcoes.timeoutPrimeiraMs ?? 70_000
  const timeoutDemaisMs = opcoes.timeoutDemaisMs ?? 15_000
  const falhasMax = opcoes.falhasMax ?? 3
  const log = opcoes.log || {
    info: (m) => console.log(`[cc-usuarios] ${m}`),
    erro: (m) => console.error(`[cc-usuarios] ${m}`),
  }

  const remetentes = envios.map((e) => {
    const fonte = FONTES.find((f) => f.slug === e.slug)
    return { ...e, fonte, estado: criarEstadoDoSlug(e.slug) }
  })
  const tabelas = [...new Set(remetentes.map((r) => r.fonte.tabela))]

  let executando = false
  let iniciado = false
  let parado = false
  let timer = null

  /** Uma tentativa de envio. Nunca lança; devolve { ok, novo, motivo, rede }. */
  async function enviar(remetente, item, limiteMs) {
    try {
      const corpo = {
        event_type: item.tipo,
        idempotency_key: item.chave,
        occurred_at: new Date().toISOString(),
        system_slug: remetente.slug,
        payload: item.payload,
      }
      const bruto = JSON.stringify(corpo)
      const carimbo = String(Math.floor(Date.now() / 1000)) // a cada tentativa: nova assinatura
      const resposta = await fetch(`${base}/webhooks/${encodeURIComponent(remetente.slug)}`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-doca-timestamp': carimbo,
          'x-doca-signature': assinar(remetente.segredo, carimbo, bruto),
          'x-doca-idempotency-key': item.chave,
        },
        body: bruto,
        signal: AbortSignal.timeout(limiteMs),
      })
      const resp = await resposta.text().catch(() => '')
      if (!resposta.ok) return { ok: false, motivo: `HTTP ${resposta.status}`, rede: false }
      let novo = false
      try {
        novo = JSON.parse(resp).duplicate === false
      } catch {
        /* resposta sem JSON: só não conta como "novo" */
      }
      return { ok: true, novo }
    } catch (e) {
      const nome = e?.name
      const tempo = nome === 'TimeoutError' || nome === 'AbortError'
      return { ok: false, motivo: tempo ? 'tempo esgotado' : 'sem conexão', rede: true }
    }
  }

  /** Um ciclo: lê as tabelas uma vez e envia o retrato de cada slug ligado, um slug depois do outro. */
  async function executarCiclo() {
    if (!ativo) return { ignorado: true, motivo: 'desligado' }
    if (executando) return { ignorado: true, motivo: 'em-andamento' }
    executando = true
    const r = { slugs: {}, erro: null, painelInacessivel: false }
    try {
      let dados
      try {
        dados = await consultar(tabelas, limite)
      } catch (e) {
        r.erro = 'consulta'
        log.erro(`Retrato de usuários: não foi possível ler os usuários (${codigoDoErro(e)})`)
        return r
      }
      if (!dados || typeof dados !== 'object') {
        r.erro = 'consulta'
        return r
      }

      // Um só balde (hora UTC) para o ciclo inteiro, mesmo que ele atravesse a virada da hora.
      let balde
      try {
        balde = String(obterBalde())
      } catch {
        balde = baldeHoraUtc()
      }

      let algumaOk = false // o painel respondeu neste ciclo (plano gratuito: a 1ª resposta demora)
      for (const rem of remetentes) {
        const s = { total: 0, enviados: 0, novos: 0, excluidos: 0, falhas: 0, interrompido: false, truncada: false, erro: null }
        r.slugs[rem.slug] = s
        if (r.painelInacessivel) {
          s.erro = 'pulado'
          continue
        }
        const linhas = dados[rem.fonte.tabela]
        if (!Array.isArray(linhas)) {
          s.erro = 'consulta'
          log.erro(`${rem.slug}: não foi possível ler ${rem.fonte.tabela} (${String(linhas?.erro || 'erro').slice(0, 40)})`)
          continue
        }
        s.truncada = linhas.length >= limite
        const { itens, total } = rem.estado.preparar(linhas, rem.fonte.montar, s.truncada, balde)
        s.total = total

        let seguidas = 0
        let falhasDeRede = 0
        let ultimoMotivo = ''
        for (let i = 0; i < itens.length; i++) {
          if (i > 0 && pausaMs > 0) await dormir(pausaMs)
          const item = itens[i]
          const res = await enviar(rem, item, algumaOk ? timeoutDemaisMs : timeoutPrimeiraMs)
          if (res.ok) {
            seguidas = 0
            falhasDeRede = 0
            algumaOk = true
            if (item.tipo === 'user.deleted') {
              rem.estado.entregueExclusao(item.payload.external_id)
              s.excluidos++
            } else {
              s.enviados++
              if (res.novo) s.novos++
            }
          } else {
            s.falhas++
            seguidas++
            if (res.rede) falhasDeRede++
            ultimoMotivo = res.motivo
            if (seguidas >= falhasMax) {
              s.interrompido = true
              // Sem nenhuma resposta do painel e só falhas de rede: ele está fora do ar para todos os
              // slugs; não insiste nos outros (cada tentativa pode esperar até 70 s).
              if (!algumaOk && falhasDeRede >= falhasMax) r.painelInacessivel = true
              break
            }
          }
        }

        const partes = [`${s.enviados} enviados`]
        if (s.novos) partes.push(`${s.novos} novos`)
        if (s.excluidos) partes.push(`${s.excluidos} removidos`)
        if (s.truncada) partes.push('lista no limite: remoções ignoradas')
        if (s.interrompido) {
          log.erro(`${rem.slug}: interrompido após ${falhasMax} falhas seguidas (${ultimoMotivo}): ${partes.join(', ')}`)
        } else if (s.falhas) {
          log.erro(`${rem.slug}: ${partes.join(', ')}, ${s.falhas} falhas (${ultimoMotivo})`)
        } else {
          log.info(`${rem.slug}: ${partes.join(', ')}`)
        }
      }
      if (r.painelInacessivel) log.erro('Control Center inacessível: ciclo encerrado; nova tentativa no próximo ciclo')
    } catch (e) {
      r.erro = 'interno'
      try {
        log.erro(`Retrato de usuários: erro inesperado (${codigoDoErro(e)})`)
      } catch {
        /* nunca propagar */
      }
    } finally {
      executando = false
    }
    return r
  }

  function agendar(ms) {
    if (parado) return
    timer = setTimeout(async () => {
      try {
        await executarCiclo()
      } catch {
        /* nunca propagar */
      }
      agendar(intervaloMs) // o próximo só é marcado quando este termina: nunca há dois ciclos juntos
    }, ms)
    timer.unref?.() // não impede o processo de encerrar
  }

  function iniciar() {
    if (!ativo || iniciado) return
    iniciado = true
    parado = false
    try {
      log.info(`ligado para ${envios.map((e) => e.slug).join(', ')} (a cada ${Math.round(intervaloMs / 60_000)} min)`)
    } catch {
      /* log nunca atrapalha */
    }
    agendar(typeof primeiroAtrasoMs === 'function' ? primeiroAtrasoMs() : primeiroAtrasoMs)
  }

  function parar() {
    parado = true
    iniciado = false
    if (timer) clearTimeout(timer)
    timer = null
  }

  return {
    ativo,
    slugs: envios.map((e) => e.slug),
    tabelas,
    executarCiclo,
    iniciar,
    parar,
    estado: () => ({ ativo, iniciado, executando }),
  }
}

// ---------- Auto-início ao importar (start.mjs ou --import) ----------

const MARCA = Symbol.for('doca-livre.oferta.cc-usuarios')

export const retrato = criarRetratoUsuarios(lerConfiguracao(process.env))
export const retratoAtivo = retrato.ativo

try {
  // Uma só instância agenda ciclos por processo (ex.: start.mjs E NODE_OPTIONS ao mesmo tempo).
  if (retrato.ativo && !globalThis[MARCA]) {
    globalThis[MARCA] = true
    retrato.iniciar()
  }
} catch {
  /* iniciar nunca pode atrapalhar o app */
}
