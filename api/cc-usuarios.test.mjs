// Testes do retrato de usuários (Oferta, Mapa e Calculadora) enviado ao Control Center.
// Rodar: node --test cc-usuarios.test.mjs   (não vai para a imagem: o Dockerfile copia só os listados)
// Não toca em banco real: a fonte dos usuários é uma função falsa injetada.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import http from 'node:http'
import fs from 'node:fs'
import { createHmac } from 'node:crypto'
import { spawn } from 'node:child_process'
import { fileURLToPath, pathToFileURL } from 'node:url'
import path from 'node:path'

const aqui = path.dirname(fileURLToPath(import.meta.url))
const ARQUIVO = path.join(aqui, 'cc-usuarios.mjs')
const SEGREDOS = {
  'oferta-carga': 'segredo-oferta-com-mais-de-16-caracteres',
  'mapa-logistica': 'segredo-mapa-com-mais-de-16-caracteres',
  'calculadora-frete': 'segredo-calculadora-com-mais-de-16-caracteres',
}
const VARS = [
  'DOCA_CC_URL',
  'DOCA_CC_SYSTEM_SLUG',
  'DOCA_CC_WEBHOOK_SECRET',
  'DOCA_CC_SECRET_MAPA_LOGISTICA',
  'DOCA_CC_SECRET_CALCULADORA_FRETE',
  'DOCA_CC_SNAPSHOT_MIN',
]
for (const k of VARS) delete process.env[k]
const mod = await import(pathToFileURL(ARQUIVO).href) // sem variáveis: desligado

const BALDE = '2026111810' // hora fixa nos testes: sem instabilidade na virada da hora
const TODOS = Object.keys(SEGREDOS).map((slug) => ({ slug, segredo: SEGREDOS[slug] }))

// ---------- Referência: lógica dos adaptadores do painel (plano B), transcrita de
// apps/api/src/integrations/adapters/{oferta-carga,mapa-logistica,calculadora-frete}.adapter.ts ----------

function mapOfertaRole(roleRaw, nivelRaw, perfilOpRaw) {
  const role = roleRaw.trim().toLowerCase()
  const nivel = nivelRaw.trim().toLowerCase()
  const perfilOp = perfilOpRaw.trim().toLowerCase()
  if (role === 'super' || role === 'super_usuario') return 'super'
  if (role === 'transportador' || role === 'transportadora') return 'transportador'
  if (role === 'gestor' || nivel === 'gestor') return 'gestor'
  if (role === 'operador' && perfilOp === 'operador') return 'operador'
  if (role === 'minerva' || role === 'embarcador') return 'embarcador'
  return 'operador'
}
function planoBOferta(rows) {
  return rows.map((r) => {
    const roleRaw = String(r.role || '')
    const nivelRaw = String(r.nivel || '')
    const perfilOpRaw = String(r.perfil_operacional || '')
    const roleCode = mapOfertaRole(roleRaw, nivelRaw, perfilOpRaw)
    const ativo = r.ativo !== false && r.ativo !== 0
    const lastLogin = r.last_sign_in_at
      ? new Date(String(r.last_sign_in_at)).toISOString()
      : r.updated_at
        ? new Date(String(r.updated_at)).toISOString()
        : null
    const createdAt = r.created_at ? new Date(String(r.created_at)).toISOString() : null
    const permissions = []
    if (perfilOpRaw) permissions.push({ code: `perfil_operacional:${perfilOpRaw.toLowerCase()}`, granted_by_name: 'Sistema Oferta de Carga', granted_at: createdAt })
    if (nivelRaw) permissions.push({ code: `nivel:${nivelRaw.toLowerCase()}`, granted_by_name: 'Sistema Oferta de Carga', granted_at: createdAt })
    if (roleRaw) permissions.push({ code: `modulo:${roleRaw.toLowerCase()}`, granted_by_name: 'Sistema Oferta de Carga', granted_at: createdAt })
    return {
      external_id: String(r.id),
      name: String(r.nome || r.usuario || r.email || r.id),
      email: r.email ? String(r.email) : undefined,
      username: r.usuario ? String(r.usuario) : undefined,
      role_code: roleCode,
      status: !ativo ? 'blocked' : lastLogin ? 'offline' : 'never',
      created_at: createdAt,
      permissions,
    }
  })
}
function planoBMapa(rows) {
  return rows.map((r) => {
    const usuario = String(r.usuario || '').trim()
    const papelRaw = String(r.papel || r.nivel_hierarquia || 'empresa').toLowerCase()
    const roleCode = papelRaw === 'super' ? 'super' : 'empresa'
    const updatedAt = r.updated_at ? new Date(String(r.updated_at)).toISOString() : null
    return {
      external_id: `mapa:${usuario.toLowerCase()}`,
      name: String(r.nome || usuario),
      email: r.email ? String(r.email) : undefined,
      username: usuario,
      role_code: roleCode,
      created_by_name: r.superior ? String(r.superior) : null,
      permissions: [
        {
          code: roleCode === 'super' ? 'mapa:administracao_global' : `mapa:empresa:${r.empresa_slug || 'padrao'}`,
          granted_by_name: r.superior ? String(r.superior) : 'Sistema Mapa da Logística',
          granted_at: updatedAt,
        },
      ],
    }
  })
}
// O plano B da Calculadora pedia /rest/v1/usuarios?role=eq.super&select=*
function planoBCalculadoraRest(todas) {
  return todas
    .filter((r) => r.role === 'super')
    .map((r) => ({
      external_id: `rota_super:${r.id}`,
      name: String(r.nome || r.usuario || r.email),
      email: r.email ? String(r.email) : undefined,
      username: r.usuario ? String(r.usuario) : undefined,
      role_code: 'super',
      status: 'offline',
      permissions: [{ code: 'calculadora:gestao_creditos', granted_by_name: 'Custo da Rota' }],
    }))
}

// ---------- Dados de exemplo ----------

// Linha como o pg entrega (datas como Date); `sensiveis` simula colunas que NUNCA podem sair.
const SENSIVEIS = {
  senha_hash: 'SENHA-PURA-123',
  senha: 'OUTRA-SENHA-456',
  cpf: '12345678901',
  telefone: '11999990000',
  token: 'tok-secreto-789',
  auth_user_id: 'auth-uuid-sensivel',
  avatar_url: 'https://exemplo/avatar.png',
  transportador_id: 'tid-1',
}
const usuario = (id, extra = {}) => ({
  id,
  usuario: `login${id}`,
  email: `pessoa${id}@exemplo.com`,
  nome: `Pessoa ${id}`,
  role: 'minerva',
  nivel: 'operador',
  perfil_operacional: null,
  ativo: true,
  created_at: new Date('2026-03-04T05:06:07.123Z'),
  ...extra,
})
const mapaUsuario = (u, extra = {}) => ({
  usuario: u,
  email: `${u.toLowerCase()}@mapa.com`,
  nome: `Empresa ${u}`,
  papel: 'empresa',
  nivel_hierarquia: 'operador',
  superior: 'Diego',
  empresa_slug: 'braspress',
  created_at: new Date('2026-02-01T00:00:00.000Z'),
  updated_at: new Date('2026-10-10T10:10:10.500Z'),
  ...extra,
})

/** Mesmas linhas no formato do PostgREST (JSON: datas como texto ISO com microssegundos). */
const comoRest = (linhas) =>
  linhas.map((l) => Object.fromEntries(Object.entries(l).map(([k, v]) => [k, v instanceof Date ? v.toISOString().replace('Z', '456+00:00') : v])))

const USUARIOS = [
  usuario('u-super', { role: 'super', nivel: 'super', nome: 'Super Um' }),
  usuario('u-super-inativo', { role: 'super', ativo: false, nome: null }),
  usuario('u-transp', { role: 'transportador', nivel: null, perfil_operacional: 'administrador', nome: '' }),
  usuario('u-gestor', { role: 'minerva', nivel: 'gestor', perfil_operacional: 'consulta' }),
  usuario('u-inativo', { ativo: false }),
  usuario('u-sem-nome', { nome: null, usuario: null, email: 'so-email@exemplo.com' }),
  usuario('u-maiusc', { role: 'Super ' }), // não é "super" exato: fica fora da Calculadora (eq.super)
]
const MAPA = [
  mapaUsuario('Braspress'),
  mapaUsuario(' Diego ', { papel: 'super', nivel_hierarquia: 'super', superior: null, nome: null, email: null }),
  mapaUsuario('SemPapel', { papel: null, nivel_hierarquia: 'Super' }),
  mapaUsuario('SemSlug', { empresa_slug: null }),
]

// ---------- CC falso ----------

async function novoCC(cfg = {}) {
  const config = { status: 201, atrasoMs: 0, ...cfg }
  const recebidos = []
  const vistas = new Set()
  const srv = http.createServer((req, res) => {
    const partes = []
    req.on('data', (p) => partes.push(p))
    req.on('end', async () => {
      const bruto = Buffer.concat(partes).toString('utf8')
      let corpo = null
      try {
        corpo = JSON.parse(bruto)
      } catch {
        /* o teste vê */
      }
      const n = recebidos.length
      recebidos.push({ url: req.url, headers: req.headers, bruto, corpo, t: Date.now() })
      const atraso = typeof config.atrasoMs === 'function' ? config.atrasoMs(n, corpo, req) : config.atrasoMs
      if (atraso) await new Promise((r) => setTimeout(r, atraso))
      const codigo = typeof config.status === 'function' ? config.status(n, corpo, req) : config.status
      const chave = req.headers['x-doca-idempotency-key']
      const duplicado = codigo < 300 && vistas.has(chave)
      if (codigo < 300) vistas.add(chave)
      res.writeHead(codigo, { 'content-type': 'application/json' })
      res.end(JSON.stringify({ ok: codigo < 300, duplicate: duplicado }))
    })
  })
  await new Promise((r) => srv.listen(0, '127.0.0.1', r))
  return {
    recebidos,
    porta: srv.address().port,
    doSlug: (slug) => recebidos.filter((x) => x.url === `/api/webhooks/${slug}`),
    fechar: () =>
      new Promise((r) => {
        srv.closeAllConnections?.()
        srv.close(r)
      }),
  }
}

function criar(cc, dados, extra = {}) {
  const logs = []
  const chamadas = []
  const consultar =
    typeof dados === 'function'
      ? dados
      : async (tabelas, limite) => {
          chamadas.push({ tabelas: [...tabelas], limite })
          const d = typeof dados.get === 'function' ? dados.get() : dados
          return Object.fromEntries(tabelas.map((t) => [t, d[t]]))
        }
  const r = mod.criarRetratoUsuarios({
    base: `http://127.0.0.1:${cc.porta}/api`,
    envios: TODOS,
    consultar,
    balde: () => BALDE,
    pausaMs: 2,
    timeoutPrimeiraMs: 2000,
    timeoutDemaisMs: 2000,
    log: { info: (m) => logs.push(m), erro: (m) => logs.push(m) },
    ...extra,
  })
  return { r, logs, chamadas }
}

const assinaturaConfere = (rec, slug) => {
  const ts = rec.headers['x-doca-timestamp']
  const esperada = createHmac('sha256', SEGREDOS[slug]).update(`${ts}.${rec.bruto}`, 'utf8').digest('hex')
  return esperada === rec.headers['x-doca-signature'] && Math.abs(Date.now() / 1000 - Number(ts)) < 60
}

// ---------- Paridade com o plano B (o que evita usuários duplicados no painel) ----------

test('oferta-carga: external_id, nome, e-mail, usuário, papel e permissões IGUAIS aos do adaptador do painel', () => {
  const ref = planoBOferta(comoRest(USUARIOS))
  const meus = USUARIOS.map(mod.payloadOferta)
  assert.equal(meus.length, ref.length)
  for (let i = 0; i < ref.length; i++) {
    const a = meus[i]
    const b = ref[i]
    for (const k of ['external_id', 'name', 'email', 'username', 'role_code', 'created_at']) assert.equal(a[k], b[k] ?? undefined, `${k} de ${b.external_id}`)
    // permissões: mesmos códigos, origem e data (o adaptador mandava granted_at null quando não havia data)
    assert.deepEqual(
      (a.permissions || []).map((p) => ({ ...p, granted_at: p.granted_at ?? null })),
      b.permissions,
    )
    // status: o adaptador dizia "offline" para todo ativo (updated_at nunca é nulo) e "blocked" para inativo
    assert.equal(a.status, USUARIOS[i].ativo === false ? 'blocked' : 'offline')
  }
})

test('oferta-carga: papel segue mapOfertaRole do painel em todas as combinações', () => {
  const roles = ['super', 'SUPER', 'super_usuario', 'transportador', 'transportadora', 'gestor', 'operador', 'minerva', 'embarcador', '', 'x', ' Super ']
  const niveis = ['', 'gestor', 'operador', 'super', ' GESTOR ']
  const perfis = ['', 'operador', 'administrador', 'consulta', 'OPERADOR']
  for (const r of roles) for (const n of niveis) for (const p of perfis) assert.equal(mod.mapearPapelOferta(r, n, p), mapOfertaRole(r, n, p), `${r}|${n}|${p}`)
})

test('mapa-logistica: external_id mapa:{usuario}, nome, e-mail, usuário, papel, criador e permissão IGUAIS aos do adaptador', () => {
  const ref = planoBMapa(comoRest(MAPA))
  const meus = MAPA.map(mod.payloadMapa)
  for (let i = 0; i < ref.length; i++) {
    const a = meus[i]
    const b = ref[i]
    for (const k of ['external_id', 'name', 'email', 'username', 'role_code']) assert.equal(a[k], b[k] ?? undefined, `${k} de ${b.external_id}`)
    assert.equal(a.created_by_name ?? null, b.created_by_name)
    assert.deepEqual(a.permissions, b.permissions)
    assert.equal(a.status, 'offline')
  }
  assert.equal(meus[1].external_id, 'mapa:diego') // espaços e maiúsculas tratados como no painel
  assert.equal(meus[2].role_code, 'super') // papel vazio: vale nivel_hierarquia
  assert.equal(meus[3].permissions[0].code, 'mapa:empresa:padrao')
  // data de criação: a verdadeira (o plano B usava updated_at por falta de coluna)
  assert.equal(meus[0].created_at, '2026-02-01T00:00:00.000Z')
})

test('calculadora-frete: só role exatamente "super" (como usuarios?role=eq.super), com os mesmos campos do adaptador', () => {
  const ref = planoBCalculadoraRest(comoRest(USUARIOS))
  const meus = USUARIOS.map(mod.payloadCalculadora).filter(Boolean)
  assert.deepEqual(meus.map((p) => p.external_id), ['rota_super:u-super', 'rota_super:u-super-inativo'])
  assert.equal(meus.length, ref.length)
  for (let i = 0; i < ref.length; i++) {
    for (const k of ['external_id', 'name', 'email', 'username', 'role_code']) assert.equal(meus[i][k], ref[i][k], k)
    assert.deepEqual(meus[i].permissions, ref[i].permissions)
  }
  // a mesma pessoa aparece no Oferta (id puro) e na Calculadora (rota_super:id): sistemas diferentes no painel
  assert.equal(mod.payloadOferta(USUARIOS[0]).external_id, 'u-super')
  // inativo: o plano B dizia "offline"; a regra do retrato manda "blocked"
  assert.equal(meus[1].status, 'blocked')
  assert.equal(meus[0].status, 'offline')
})

// ---------- Segurança dos campos ----------

test('campos sensíveis NUNCA entram no payload, mesmo que a linha os traga', () => {
  const montados = [
    ...USUARIOS.map((u) => mod.payloadOferta({ ...u, ...SENSIVEIS })),
    ...USUARIOS.map((u) => mod.payloadCalculadora({ ...u, ...SENSIVEIS })).filter(Boolean),
    ...MAPA.map((m) => mod.payloadMapa({ ...m, ...SENSIVEIS })),
  ]
  for (const p of montados) {
    for (const k of Object.keys(p)) assert.ok(mod.CAMPOS_PERMITIDOS.includes(k), `campo inesperado: ${k}`)
    const texto = JSON.stringify(p)
    for (const v of Object.values(SENSIVEIS)) assert.ok(!texto.includes(v), `vazou ${v}`)
    for (const perm of p.permissions || []) assert.deepEqual(Object.keys(perm).filter((k) => !['code', 'granted_by_name', 'granted_at'].includes(k)), [])
  }
})

test('as consultas são só SELECT de colunas nomeadas: sem senha, sem *, sem escrita', () => {
  for (const sql of [mod.SQL_USUARIOS, mod.SQL_MAPA_USUARIOS]) {
    const s = sql.toLowerCase()
    assert.match(s.trim(), /^select /)
    assert.ok(!s.includes('*'))
    assert.ok(!/senha|password|hash|token|cpf|telefone|auth_user_id|avatar/.test(s), sql)
    assert.ok(!/\b(insert|update|delete|alter|drop|grant|truncate|create)\b/.test(s), sql)
    assert.equal((s.match(/;/g) || []).length, 0)
    assert.match(s, /limit \$1/)
  }
})

// ---------- Funções auxiliares ----------

test('chave de idempotência: snap:{slug}:{external_id}:sha1[:12][-rN]:AAAAMMDDHH e remoção snap:...:deleted', () => {
  const p = mod.payloadMapa(MAPA[0])
  assert.match(mod.chaveIdempotencia('mapa-logistica', p.external_id, p, BALDE), /^snap:mapa-logistica:mapa:braspress:[0-9a-f]{12}:2026111810$/)
  assert.match(mod.chaveIdempotencia('calculadora-frete', 'rota_super:u1', p, BALDE, 2), /^snap:calculadora-frete:rota_super:u1:[0-9a-f]{12}-r2:2026111810$/)
  assert.equal(mod.chaveExclusao('oferta-carga', 'u1', BALDE), 'snap:oferta-carga:u1:deleted:2026111810')
  assert.equal(mod.chaveExclusao('oferta-carga', 'u1', BALDE, 1), 'snap:oferta-carga:u1:deleted-r1:2026111810')
  assert.equal(mod.baldeHoraUtc(new Date('2026-01-02T03:59:59Z')), '2026010203')
  assert.equal(mod.hashPayload({ b: 1, a: 2 }), mod.hashPayload({ a: 2, b: 1 }))
  // bloquear muda o hash (o desbloqueio vira outro evento)
  assert.notEqual(mod.hashPayload(mod.payloadOferta(usuario('x'))), mod.hashPayload(mod.payloadOferta(usuario('x', { ativo: false }))))
})

test('intervalo: padrão 10, mínimo 2, máximo 1 dia, 0 desliga', () => {
  assert.equal(mod.lerIntervaloMin(undefined), 10)
  assert.equal(mod.lerIntervaloMin(''), 10)
  assert.equal(mod.lerIntervaloMin('abc'), 10)
  assert.equal(mod.lerIntervaloMin('1'), 2)
  assert.equal(mod.lerIntervaloMin('15'), 15)
  assert.equal(mod.lerIntervaloMin('99999'), 1440)
  assert.equal(mod.lerIntervaloMin('0'), 0)
  assert.equal(mod.lerIntervaloMin('-5'), 0)
})

test('configuração: cada slug só liga com o segredo DELE; sem segredo o slug fica desligado', () => {
  const base = { DOCA_CC_URL: 'https://cc.exemplo/api/' }
  const slugs = (env) => mod.lerConfiguracao(env).envios.map((e) => e.slug)
  // produção hoje: só as variáveis dos avisos -> só oferta-carga
  assert.deepEqual(slugs({ ...base, DOCA_CC_SYSTEM_SLUG: 'oferta-carga', DOCA_CC_WEBHOOK_SECRET: SEGREDOS['oferta-carga'] }), ['oferta-carga'])
  // os três
  const tres = {
    ...base,
    DOCA_CC_SYSTEM_SLUG: 'oferta-carga',
    DOCA_CC_WEBHOOK_SECRET: SEGREDOS['oferta-carga'],
    DOCA_CC_SECRET_MAPA_LOGISTICA: SEGREDOS['mapa-logistica'],
    DOCA_CC_SECRET_CALCULADORA_FRETE: SEGREDOS['calculadora-frete'],
  }
  const cfg = mod.lerConfiguracao(tres)
  assert.deepEqual(cfg.envios.map((e) => e.slug), ['oferta-carga', 'mapa-logistica', 'calculadora-frete'])
  assert.equal(cfg.envios[1].segredo, SEGREDOS['mapa-logistica'])
  assert.equal(cfg.envios[2].segredo, SEGREDOS['calculadora-frete'])
  assert.equal(cfg.base, 'https://cc.exemplo/api')
  // só o da Calculadora
  assert.deepEqual(slugs({ ...base, DOCA_CC_SECRET_CALCULADORA_FRETE: SEGREDOS['calculadora-frete'] }), ['calculadora-frete'])
  // segredo curto não vale
  assert.deepEqual(slugs({ ...base, DOCA_CC_SECRET_MAPA_LOGISTICA: 'curto' }), [])
  // o segredo dos avisos só serve ao Oferta se o slug dos avisos for oferta-carga
  assert.deepEqual(slugs({ ...base, DOCA_CC_SYSTEM_SLUG: 'outro', DOCA_CC_WEBHOOK_SECRET: SEGREDOS['oferta-carga'] }), [])
  // 0 desliga tudo; sem URL também
  assert.equal(mod.criarRetratoUsuarios({ ...mod.lerConfiguracao({ ...tres, DOCA_CC_SNAPSHOT_MIN: '0' }) }).ativo, false)
  assert.equal(mod.criarRetratoUsuarios({ ...mod.lerConfiguracao({ ...tres, DOCA_CC_URL: '' }) }).ativo, false)
  assert.equal(mod.criarRetratoUsuarios({ ...mod.lerConfiguracao(tres) }).ativo, true)
})

// ---------- Ciclo completo contra um CC falso ----------

test('envia user.updated assinado (HMAC com o segredo de CADA slug) no formato do Control Center', async () => {
  const cc = await novoCC()
  try {
    const { r, chamadas } = criar(cc, { usuarios: USUARIOS, mapa_usuarios: MAPA })
    const res = await r.executarCiclo()
    assert.deepEqual(chamadas[0].tabelas.sort(), ['mapa_usuarios', 'usuarios']) // cada tabela lida uma vez
    assert.equal(chamadas.length, 1)
    assert.equal(res.slugs['oferta-carga'].enviados, USUARIOS.length)
    assert.equal(res.slugs['mapa-logistica'].enviados, MAPA.length)
    assert.equal(res.slugs['calculadora-frete'].enviados, 2)
    assert.equal(cc.recebidos.length, USUARIOS.length + MAPA.length + 2)
    for (const slug of Object.keys(SEGREDOS)) {
      for (const rec of cc.doSlug(slug)) {
        assert.ok(assinaturaConfere(rec, slug), `assinatura de ${slug}`)
        assert.equal(rec.headers['content-type'], 'application/json')
        assert.equal(rec.headers['x-doca-idempotency-key'], rec.corpo.idempotency_key)
        assert.deepEqual(Object.keys(rec.corpo).sort(), ['event_type', 'idempotency_key', 'occurred_at', 'payload', 'system_slug'])
        assert.equal(rec.corpo.event_type, 'user.updated')
        assert.equal(rec.corpo.system_slug, slug)
        assert.ok(!Number.isNaN(Date.parse(rec.corpo.occurred_at)))
        assert.ok(rec.corpo.idempotency_key.startsWith(`snap:${slug}:${rec.corpo.payload.external_id}:`))
        assert.ok(rec.corpo.idempotency_key.endsWith(`:${BALDE}`))
      }
    }
    // assinatura com o segredo de OUTRO slug não confere (segredos não se misturam)
    const umMapa = cc.doSlug('mapa-logistica')[0]
    const ts = umMapa.headers['x-doca-timestamp']
    assert.notEqual(createHmac('sha256', SEGREDOS['oferta-carga']).update(`${ts}.${umMapa.bruto}`).digest('hex'), umMapa.headers['x-doca-signature'])
  } finally {
    await cc.fechar()
  }
})

test('o que sai do sistema não contém nenhum campo sensível (corpo bruto inteiro, os 3 slugs)', async () => {
  const cc = await novoCC()
  try {
    const { r } = criar(cc, {
      usuarios: USUARIOS.map((u) => ({ ...u, ...SENSIVEIS })),
      mapa_usuarios: MAPA.map((m) => ({ ...m, ...SENSIVEIS })),
    })
    await r.executarCiclo()
    assert.ok(cc.recebidos.length > 0)
    for (const rec of cc.recebidos) {
      for (const v of Object.values(SENSIVEIS)) assert.ok(!rec.bruto.includes(v), `vazou ${v}`)
      assert.ok(!/senha|cpf|telefone|token|password/i.test(rec.bruto), rec.bruto)
      for (const k of Object.keys(rec.corpo.payload)) assert.ok(mod.CAMPOS_PERMITIDOS.includes(k), k)
    }
  } finally {
    await cc.fechar()
  }
})

test('bloqueio: inativo vai "blocked" (Oferta e Calculadora); ativo vai "offline"; nunca "online" nem "never"', async () => {
  const cc = await novoCC()
  try {
    const { r } = criar(cc, { usuarios: USUARIOS, mapa_usuarios: MAPA })
    await r.executarCiclo()
    const status = (slug, id) => cc.doSlug(slug).find((x) => x.corpo.payload.external_id === id).corpo.payload.status
    assert.equal(status('oferta-carga', 'u-inativo'), 'blocked')
    assert.equal(status('oferta-carga', 'u-super-inativo'), 'blocked')
    assert.equal(status('oferta-carga', 'u-super'), 'offline')
    assert.equal(status('calculadora-frete', 'rota_super:u-super-inativo'), 'blocked')
    assert.equal(status('calculadora-frete', 'rota_super:u-super'), 'offline')
    for (const rec of cc.recebidos) assert.ok(['blocked', 'offline'].includes(rec.corpo.payload.status))
  } finally {
    await cc.fechar()
  }
})

test('desbloqueio gera chave diferente do bloqueio e volta a "offline"', async () => {
  const cc = await novoCC()
  try {
    let lista = [usuario('a', { ativo: false })]
    const { r } = criar(cc, { get: () => ({ usuarios: lista, mapa_usuarios: [] }) }, { envios: [TODOS[0]] })
    await r.executarCiclo()
    lista = [usuario('a')]
    await r.executarCiclo()
    const [b, d] = cc.recebidos
    assert.equal(b.corpo.payload.status, 'blocked')
    assert.equal(d.corpo.payload.status, 'offline')
    assert.notEqual(b.corpo.idempotency_key, d.corpo.idempotency_key)
  } finally {
    await cc.fechar()
  }
})

test('remoção: quem sumiu recebe user.deleted no slug certo; super rebaixado sai só da Calculadora', async () => {
  const cc = await novoCC()
  try {
    let dados = { usuarios: USUARIOS, mapa_usuarios: MAPA }
    const { r } = criar(cc, { get: () => dados })
    await r.executarCiclo()
    const antes = cc.recebidos.length
    dados = {
      usuarios: USUARIOS.filter((u) => u.id !== 'u-gestor').map((u) => (u.id === 'u-super' ? { ...u, role: 'minerva' } : u)),
      mapa_usuarios: MAPA.filter((m) => m.usuario !== 'SemSlug'),
    }
    const res = await r.executarCiclo()
    const novos = cc.recebidos.slice(antes)
    const exclusoes = novos.filter((x) => x.corpo.event_type === 'user.deleted').map((x) => `${x.corpo.system_slug}|${x.corpo.payload.external_id}|${x.corpo.idempotency_key}`)
    assert.deepEqual(exclusoes.sort(), [
      `calculadora-frete|rota_super:u-super|snap:calculadora-frete:rota_super:u-super:deleted:${BALDE}`,
      `mapa-logistica|mapa:semslug|snap:mapa-logistica:mapa:semslug:deleted:${BALDE}`,
      `oferta-carga|u-gestor|snap:oferta-carga:u-gestor:deleted:${BALDE}`,
    ])
    for (const x of novos.filter((y) => y.corpo.event_type === 'user.deleted')) assert.deepEqual(Object.keys(x.corpo.payload), ['external_id'])
    // u-super continua no Oferta (com o papel novo)
    const superOferta = novos.find((x) => x.corpo.system_slug === 'oferta-carga' && x.corpo.payload.external_id === 'u-super')
    assert.equal(superOferta.corpo.payload.role_code, 'embarcador')
    assert.equal(res.slugs['calculadora-frete'].excluidos, 1)
    // terceiro ciclo igual: a remoção não se repete
    const n = cc.recebidos.length
    await r.executarCiclo()
    assert.equal(cc.recebidos.slice(n).filter((x) => x.corpo.event_type === 'user.deleted').length, 0)
  } finally {
    await cc.fechar()
  }
})

test('remoção que falhou é repetida no ciclo seguinte; lista vazia ou no limite não apaga ninguém', async () => {
  let falhar = false
  const cc = await novoCC({ status: (n, corpo) => (falhar && corpo?.event_type === 'user.deleted' ? 500 : 201) })
  try {
    let dados = { usuarios: [usuario('a'), usuario('b')], mapa_usuarios: [] }
    const { r } = criar(cc, { get: () => dados }, { envios: [TODOS[0]], limite: 3 })
    await r.executarCiclo()
    dados = { usuarios: [usuario('a')], mapa_usuarios: [] }
    falhar = true
    await r.executarCiclo()
    falhar = false
    const n = cc.recebidos.length
    await r.executarCiclo()
    const repetida = cc.recebidos.slice(n).filter((x) => x.corpo.event_type === 'user.deleted')
    assert.equal(repetida.length, 1)
    assert.equal(repetida[0].corpo.idempotency_key, `snap:oferta-carga:b:deleted:${BALDE}`)
    // vazia: ninguém apagado
    dados = { usuarios: [], mapa_usuarios: [] }
    const m = cc.recebidos.length
    await r.executarCiclo()
    assert.equal(cc.recebidos.slice(m).length, 0)
    // no limite (3 linhas com limite 3): ninguém apagado
    dados = { usuarios: [usuario('x'), usuario('y'), usuario('z')], mapa_usuarios: [] }
    await r.executarCiclo()
    const k = cc.recebidos.length
    dados = { usuarios: [usuario('x'), usuario('y'), usuario('w')], mapa_usuarios: [] }
    const res = await r.executarCiclo()
    assert.equal(res.slugs['oferta-carga'].truncada, true)
    assert.equal(cc.recebidos.slice(k).filter((x) => x.corpo.event_type === 'user.deleted').length, 0)
  } finally {
    await cc.fechar()
  }
})

test('idempotência: mesma chave quando nada muda; outra quando muda; -r1 ao voltar ao estado antigo na mesma hora; nova na hora seguinte', async () => {
  const cc = await novoCC()
  try {
    let lista = [usuario('a')]
    let balde = BALDE
    const { r } = criar(cc, { get: () => ({ usuarios: lista, mapa_usuarios: [] }) }, { envios: [TODOS[0]], balde: () => balde })
    await r.executarCiclo()
    await r.executarCiclo()
    lista = [usuario('a', { nome: 'Outro Nome' })]
    await r.executarCiclo()
    lista = [usuario('a')]
    await r.executarCiclo()
    balde = '2026111811'
    await r.executarCiclo()
    const k = cc.recebidos.map((x) => x.corpo.idempotency_key)
    assert.equal(k[0], k[1])
    assert.notEqual(k[2], k[0])
    assert.equal(k[3], k[0].replace(`:${BALDE}`, `-r1:${BALDE}`))
    assert.equal(k[4], k[3].replace(`:${BALDE}`, ':2026111811')) // hora nova: chave nova
    // o CC falso devolveu duplicate=true para a repetida
    assert.equal(cc.recebidos.length, 5)
  } finally {
    await cc.fechar()
  }
})

test('slug sem segredo não é enviado nem lido: só Mapa ligado lê só mapa_usuarios', async () => {
  const cc = await novoCC()
  try {
    const { r, chamadas } = criar(cc, { usuarios: USUARIOS, mapa_usuarios: MAPA }, { envios: [{ slug: 'mapa-logistica', segredo: SEGREDOS['mapa-logistica'] }] })
    await r.executarCiclo()
    assert.deepEqual(chamadas[0].tabelas, ['mapa_usuarios'])
    assert.ok(cc.recebidos.length > 0)
    assert.ok(cc.recebidos.every((x) => x.url === '/api/webhooks/mapa-logistica'))
    // segredo curto ou slug desconhecido: ignorados
    const r2 = mod.criarRetratoUsuarios({ base: 'http://x/api', envios: [{ slug: 'mapa-logistica', segredo: 'curto' }, { slug: 'wms', segredo: SEGREDOS['mapa-logistica'] }] })
    assert.equal(r2.ativo, false)
    assert.deepEqual(await r2.executarCiclo(), { ignorado: true, motivo: 'desligado' })
  } finally {
    await cc.fechar()
  }
})

test('Control Center devolvendo erro HTTP num slug: interrompe esse slug após 3 falhas e segue para os outros', async () => {
  const cc = await novoCC({ status: (n, corpo, req) => (req.url.endsWith('/mapa-logistica') ? 401 : 201) })
  try {
    const { r, logs } = criar(cc, { usuarios: USUARIOS, mapa_usuarios: MAPA })
    const res = await r.executarCiclo()
    assert.equal(res.slugs['mapa-logistica'].interrompido, true)
    assert.equal(cc.doSlug('mapa-logistica').length, 3)
    assert.equal(res.slugs['calculadora-frete'].enviados, 2)
    assert.equal(res.slugs['oferta-carga'].enviados, USUARIOS.length)
    assert.ok(logs.some((l) => l.includes('mapa-logistica: interrompido após 3 falhas seguidas (HTTP 401)')))
  } finally {
    await cc.fechar()
  }
})

test('Control Center fora do ar: nada é lançado, para após 3 falhas e não tenta os outros slugs; log sem dados', async () => {
  const cc = await novoCC()
  const porta = cc.porta
  await cc.fechar() // porta fechada
  const logs = []
  const r = mod.criarRetratoUsuarios({
    base: `http://127.0.0.1:${porta}/api`,
    envios: TODOS,
    consultar: async (t) => Object.fromEntries(t.map((x) => [x, x === 'usuarios' ? USUARIOS.map((u) => ({ ...u, ...SENSIVEIS })) : MAPA])),
    balde: () => BALDE,
    pausaMs: 1,
    timeoutPrimeiraMs: 1000,
    timeoutDemaisMs: 1000,
    log: { info: (m) => logs.push(m), erro: (m) => logs.push(m) },
  })
  const res = await r.executarCiclo()
  assert.equal(res.painelInacessivel, true)
  assert.equal(res.slugs['oferta-carga'].falhas, 3)
  assert.equal(res.slugs['mapa-logistica'].erro, 'pulado')
  assert.equal(res.slugs['calculadora-frete'].erro, 'pulado')
  const texto = logs.join('\n')
  for (const v of [...Object.values(SENSIVEIS), 'pessoa', 'Pessoa', 'login', 'segredo']) assert.ok(!texto.includes(v), v)
  // o próximo ciclo tenta de novo (não fica travado)
  const res2 = await r.executarCiclo()
  assert.equal(res2.slugs['oferta-carga'].falhas, 3)
})

test('Control Center lento: respeita o limite de tempo (1ª requisição espera mais; as seguintes, menos)', async () => {
  // 1ª resposta demora 300 ms (painel acordando); depois, uma lenta de 400 ms com limite de 150 ms.
  const cc = await novoCC({ atrasoMs: (n) => (n === 0 ? 300 : n === 2 ? 400 : 0) })
  try {
    const { r } = criar(cc, { usuarios: USUARIOS.slice(0, 4), mapa_usuarios: [] }, { envios: [TODOS[0]], timeoutPrimeiraMs: 1000, timeoutDemaisMs: 150 })
    const t0 = Date.now()
    const res = await r.executarCiclo()
    const s = res.slugs['oferta-carga']
    assert.equal(s.enviados, 3) // a 1ª (300 ms < 1000 ms) passou; a 3ª estourou 150 ms
    assert.equal(s.falhas, 1)
    assert.equal(s.interrompido, false)
    assert.ok(Date.now() - t0 < 3000)
  } finally {
    await cc.fechar()
  }
})

test('falha ao ler o banco: nada é lançado nem enviado; o erro (que pode ter dados) não vai ao log', async () => {
  const cc = await novoCC()
  try {
    const { r, logs } = criar(cc, async () => {
      const e = new Error('relation "usuarios" ... SENHA-PURA-123')
      e.code = '42P01'
      throw e
    })
    const res = await r.executarCiclo()
    assert.equal(res.erro, 'consulta')
    assert.equal(cc.recebidos.length, 0)
    assert.ok(logs.join('\n').includes('42P01'))
    assert.ok(!logs.join('\n').includes('SENHA'))
    // uma tabela com erro não impede as outras
    const { r: r2 } = criar(cc, async (t) => Object.fromEntries(t.map((x) => [x, x === 'mapa_usuarios' ? { erro: '42P01' } : USUARIOS])))
    const res2 = await r2.executarCiclo()
    assert.equal(res2.slugs['mapa-logistica'].erro, 'consulta')
    assert.equal(res2.slugs['oferta-carga'].enviados, USUARIOS.length)
    assert.equal(res2.slugs['calculadora-frete'].enviados, 2)
  } finally {
    await cc.fechar()
  }
})

test('linhas estranhas na fonte não derrubam o ciclo', async () => {
  const cc = await novoCC()
  try {
    const { r } = criar(cc, {
      usuarios: [null, 7, 'x', {}, { id: '' }, usuario('ok'), { id: 'y', created_at: 'data-invalida', ativo: 0 }],
      mapa_usuarios: [null, {}, { usuario: '   ' }, mapaUsuario('Ok')],
    })
    const res = await r.executarCiclo()
    assert.equal(res.erro, null)
    assert.equal(res.slugs['oferta-carga'].enviados, 2)
    assert.equal(res.slugs['mapa-logistica'].enviados, 1)
    const y = cc.doSlug('oferta-carga').find((x) => x.corpo.payload.external_id === 'y').corpo.payload
    assert.equal(y.status, 'blocked')
    assert.equal(y.created_at, undefined)
  } finally {
    await cc.fechar()
  }
})

test('ciclo único: chamadas simultâneas não se sobrepõem', async () => {
  const cc = await novoCC({ atrasoMs: 30 })
  try {
    const { r } = criar(cc, { usuarios: USUARIOS.slice(0, 2), mapa_usuarios: [] }, { envios: [TODOS[0]] })
    const [a, b] = await Promise.all([r.executarCiclo(), r.executarCiclo()])
    assert.deepEqual(b, { ignorado: true, motivo: 'em-andamento' })
    assert.equal(a.slugs['oferta-carga'].enviados, 2)
  } finally {
    await cc.fechar()
  }
})

test('agendamento: ciclos seguem um após o outro e parar() cancela', async () => {
  const cc = await novoCC()
  try {
    let ciclos = 0
    const { r } = criar(
      cc,
      async (t) => {
        ciclos++
        return Object.fromEntries(t.map((x) => [x, []]))
      },
      { primeiroAtrasoMs: 10, intervaloMs: 30 },
    )
    r.iniciar()
    r.iniciar() // repetido: sem efeito
    await new Promise((res) => setTimeout(res, 200))
    r.parar()
    const n = ciclos
    assert.ok(n >= 3, `ciclos: ${n}`)
    await new Promise((res) => setTimeout(res, 100))
    assert.equal(ciclos, n)
  } finally {
    await cc.fechar()
  }
})

// ---------- Carga do módulo como no contêiner ----------

function rodarFilho(args, env, ms = 20_000) {
  return new Promise((resolve) => {
    const t0 = Date.now()
    const ambiente = { ...process.env }
    for (const k of VARS) delete ambiente[k]
    Object.assign(ambiente, env)
    const filho = spawn(process.execPath, args, { env: ambiente, stdio: ['ignore', 'pipe', 'pipe'] })
    let out = ''
    let err = ''
    filho.stdout.on('data', (d) => (out += d))
    filho.stderr.on('data', (d) => (err += d))
    const limite = setTimeout(() => filho.kill(), ms)
    filho.on('exit', (codigo) => {
      clearTimeout(limite)
      resolve({ codigo, out, err, ms: Date.now() - t0 })
    })
  })
}

const ENV_TRES = {
  DOCA_CC_URL: 'http://127.0.0.1:9/api',
  DOCA_CC_SYSTEM_SLUG: 'oferta-carga',
  DOCA_CC_WEBHOOK_SECRET: SEGREDOS['oferta-carga'],
  DOCA_CC_SECRET_MAPA_LOGISTICA: SEGREDOS['mapa-logistica'],
  DOCA_CC_SECRET_CALCULADORA_FRETE: SEGREDOS['calculadora-frete'],
}

test('sem variáveis: no-op total (nada agendado, nada consultado, nada no log)', async () => {
  const codigo = `const m = await import(${JSON.stringify(pathToFileURL(ARQUIVO).href)}); console.log(JSON.stringify({ ...m.retrato.estado(), slugs: m.retrato.slugs }))`
  const r = await rodarFilho(['--input-type=module', '-e', codigo], {})
  assert.equal(r.codigo, 0, r.err)
  assert.deepEqual(JSON.parse(r.out.trim()), { ativo: false, iniciado: false, executando: false, slugs: [] })
  assert.equal(r.err, '')
})

test('com as variáveis: auto-inicia ao importar, só uma vez por processo, e não segura o processo', async () => {
  const url = pathToFileURL(ARQUIVO).href
  const codigo = `const a = await import(${JSON.stringify(url)}); const b = await import(${JSON.stringify(url + '?segunda')}); console.log(JSON.stringify({ a: a.retrato.estado(), b: b.retrato.estado(), slugs: a.retrato.slugs }))`
  const r = await rodarFilho(['--input-type=module', '-e', codigo], ENV_TRES)
  assert.equal(r.codigo, 0, r.err)
  const linhaJson = r.out.trim().split('\n').pop()
  const saida = JSON.parse(linhaJson)
  assert.equal(saida.a.iniciado, true)
  assert.equal(saida.b.iniciado, false) // segunda carga não agenda outro ciclo
  assert.deepEqual(saida.slugs, ['oferta-carga', 'mapa-logistica', 'calculadora-frete'])
  assert.ok(r.out.includes('[cc-usuarios] ligado para oferta-carga, mapa-logistica, calculadora-frete (a cada 10 min)'))
  for (const s of Object.values(SEGREDOS)) assert.ok(!r.out.includes(s) && !r.err.includes(s))
  assert.ok(r.ms < 10_000, `processo demorou ${r.ms} ms para encerrar`)
})

test('carregado por NODE_OPTIONS --import=data:... (como no Freela): inofensivo e não impede o app de encerrar', async () => {
  // aspas simples: o Node trata aspas duplas em NODE_OPTIONS como delimitadores
  const opt = `--import=data:text/javascript,import('${pathToFileURL(ARQUIVO).href}').catch(()=>{})`
  const r = await rodarFilho(['-e', 'console.log("app ok")'], { ...ENV_TRES, NODE_OPTIONS: opt })
  assert.equal(r.codigo, 0, r.err)
  assert.ok(r.out.includes('app ok'))
  assert.ok(r.out.includes('[cc-usuarios] ligado para oferta-carga, mapa-logistica, calculadora-frete'), r.out + r.err)
  assert.ok(r.ms < 10_000)
  const r2 = await rodarFilho(['-e', 'console.log("app ok")'], { NODE_OPTIONS: opt })
  assert.equal(r2.codigo, 0, r2.err)
  assert.ok(!r2.out.includes('[cc-usuarios]'))
})

test('ligação: start.mjs importa o módulo depois do servidor e o Dockerfile o copia para a imagem', () => {
  const start = fs.readFileSync(path.join(aqui, 'start.mjs'), 'utf8')
  const iServidor = start.indexOf("await import('./server.js')")
  const iModulo = start.indexOf("await import('./cc-usuarios.mjs')")
  assert.ok(iServidor >= 0 && iModulo > iServidor)
  assert.match(start.slice(iModulo), /\.catch\(/)
  const docker = fs.readFileSync(path.join(aqui, 'Dockerfile'), 'utf8')
  assert.match(docker, /^COPY .*\bcc-usuarios\.mjs\b.* \.\/\r?$/m)
  assert.ok(!/cc-usuarios\.test\.mjs/.test(docker))
})
