import { PONTOS_ADERENCIA, PONTUACAO_INICIAL } from './businessRules'
import { appStoreGet, appStoreGetCached, appStoreSet } from './appStore'
import { ORG_EMBARCADOR_ULTRAFRIO_ID } from './orgHierarchy'

export type TipoRegraPontuacao = keyof typeof PONTOS_ADERENCIA

export type ConfigPontuacao = {
  inicial: number
  pontos: Record<TipoRegraPontuacao, number>
}

export type ConfigPontuacaoDB = {
  porEmbarcador: Record<string, ConfigPontuacao>
}

const STORE_KEY = 'config_pontuacao'

export const TIPOS_REGRA_PONTUACAO: TipoRegraPontuacao[] = [
  'nao_visualizada',
  'visualizada_sem_acao',
  'com_proposta',
  'frete_fechado',
  'recusada',
  'recusada_contra',
]

export function defaultConfigPontuacao(): ConfigPontuacao {
  return {
    inicial: PONTUACAO_INICIAL,
    pontos: { ...PONTOS_ADERENCIA },
  }
}

function asInt(raw: unknown, fallback: number): number {
  if (typeof raw === 'number' && Number.isFinite(raw)) return Math.trunc(raw)
  if (typeof raw === 'string' && raw.trim() !== '') {
    const n = Number(raw.replace(',', '.'))
    if (Number.isFinite(n)) return Math.trunc(n)
  }
  return fallback
}

export function normalizeConfigPontuacao(
  raw: Partial<ConfigPontuacao> | null | undefined,
): ConfigPontuacao {
  const d = defaultConfigPontuacao()
  const src = (raw?.pontos ?? {}) as Partial<Record<TipoRegraPontuacao, unknown>>
  const pontos = { ...d.pontos }
  for (const k of TIPOS_REGRA_PONTUACAO) {
    pontos[k] = asInt(src[k], d.pontos[k])
  }
  return {
    inicial: asInt(raw?.inicial, d.inicial),
    pontos,
  }
}

function normalizeDb(raw: Partial<ConfigPontuacaoDB> | null | undefined): ConfigPontuacaoDB {
  const por: Record<string, ConfigPontuacao> = {}
  const src = raw?.porEmbarcador
  if (src && typeof src === 'object') {
    for (const [k, v] of Object.entries(src)) {
      if (!k.trim()) continue
      por[k] = normalizeConfigPontuacao(v)
    }
  }
  return { porEmbarcador: por }
}

export function loadConfigPontuacaoDb(): ConfigPontuacaoDB {
  return normalizeDb(appStoreGetCached<Partial<ConfigPontuacaoDB> | null>(STORE_KEY, null))
}

export function saveConfigPontuacaoDb(db: ConfigPontuacaoDB) {
  void appStoreSet(STORE_KEY, normalizeDb(db))
}

export async function hydrateConfigPontuacao(): Promise<ConfigPontuacaoDB> {
  const remote = await appStoreGet<Partial<ConfigPontuacaoDB> | null>(STORE_KEY, null)
  const next = normalizeDb(remote)
  void appStoreSet(STORE_KEY, next)
  return next
}

export function embarcadorIdDaCarga(
  carga?: { org_embarcador_id?: string | null } | null,
): string {
  return (carga?.org_embarcador_id || '').trim() || ORG_EMBARCADOR_ULTRAFRIO_ID
}

export function configPontuacaoDe(
  db: ConfigPontuacaoDB | null | undefined,
  embarcadorId?: string | null,
): ConfigPontuacao {
  const id = (embarcadorId || '').trim() || ORG_EMBARCADOR_ULTRAFRIO_ID
  const found = db?.porEmbarcador?.[id]
  return found ? normalizeConfigPontuacao(found) : defaultConfigPontuacao()
}

export function pontosDoTipo(cfg: ConfigPontuacao, tipo: string): number {
  return cfg.pontos[tipo as TipoRegraPontuacao] ?? 0
}

export function upsertConfigPontuacao(
  db: ConfigPontuacaoDB,
  embarcadorId: string,
  cfg: ConfigPontuacao,
): ConfigPontuacaoDB {
  const id = embarcadorId.trim()
  if (!id) return normalizeDb(db)
  return {
    porEmbarcador: {
      ...db.porEmbarcador,
      [id]: normalizeConfigPontuacao(cfg),
    },
  }
}
