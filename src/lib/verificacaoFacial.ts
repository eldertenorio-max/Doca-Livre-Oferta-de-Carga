/** Pontos estáveis do rosto (Face Mesh) para comparar a mesma pessoa. */
const PONTOS = [1, 4, 10, 33, 61, 133, 152, 159, 263, 291, 362, 386, 13, 14, 168, 454]

/** Distância média aceita entre o rosto ao vivo e o do cadastro. */
export const FACIAL_DISTANCIA_MAX = 0.16

export type FacialCaptura = {
  imagemDataUrl: string
  descriptor: number[]
}

export type FacialHistoricoItem = {
  foto_url: string
  verificado_em: string
  /** null = cadastro do rosto. Número = distância em relação ao rosto já gravado. */
  distancia: number | null
  /** Motorista que fez a verificação (ausente no histórico antigo). */
  motorista_id?: string | null
  motorista_nome?: string | null
  /** Rosto de referência do motorista (gravado no cadastro do rosto dele). */
  descriptor?: number[] | null
  /** Próxima cobrança deste motorista. */
  proxima_em?: string | null
  /** Excluído pelo super (fica guardado para o sync não trazer o item de volta). */
  excluido_em?: string | null
}

export type FacialMotorista = { id: string; nome: string }

/** Converte a foto (data URL) em bytes sem usar fetch (fetch de data: falha em alguns celulares). */
export function dataUrlParaBytes(dataUrl: string): { bytes: Uint8Array; tipo: string } {
  const [cabecalho, dados = ''] = dataUrl.split(',', 2)
  const tipo = /data:([^;,]+)/.exec(cabecalho)?.[1] || 'image/jpeg'
  const binario = cabecalho.includes(';base64') ? atob(dados) : decodeURIComponent(dados)
  const bytes = new Uint8Array(binario.length)
  for (let i = 0; i < binario.length; i++) bytes[i] = binario.charCodeAt(i)
  return { bytes, tipo }
}

/** Erros de rede ("Failed to fetch", "Load failed", "NetworkError") em pt-BR. */
export function mensagemErroFacial(err: unknown, padrao = 'Não foi possível salvar a verificação.'): string {
  const msg = err instanceof Error ? err.message : typeof err === 'string' ? err : ''
  if (/failed to fetch|load failed|networkerror|network request failed|fetch/i.test(msg)) {
    return 'Sem conexão com o servidor para salvar a verificação. Confira a internet e toque em "Tentar de novo".'
  }
  return msg || padrao
}

export type FacialReferencia = {
  facial_descriptor?: number[] | null
  facial_proxima_em?: string | null
  facial_foto_url?: string | null
  facial_verificado_em?: string | null
  facial_historico?: FacialHistoricoItem[] | null
  /** Quando o super apagou a verificação. Um rosto anterior a isso não volta. */
  facial_reset_em?: string | null
}

export function chaveFacial(item: Pick<FacialHistoricoItem, 'foto_url' | 'verificado_em'>): string {
  return `${item.verificado_em}|${item.foto_url.split('?')[0]}`
}

/**
 * Junta cópias do mesmo item (remoto, local, Kanban). Exclusão (excluido_em) sempre vence,
 * para o sync não ressuscitar o item; a próxima cobrança fica com a data mais cedo (Refazer).
 */
export function normalizarHistoricoFacial(valor: unknown): FacialHistoricoItem[] {
  const lista = Array.isArray(valor) ? valor : []
  const porChave = new Map<string, FacialHistoricoItem>()
  for (const item of lista) {
    if (!item || typeof item !== 'object') continue
    const bruto = item as Record<string, unknown>
    const foto = String(bruto.foto_url || '').trim()
    const quando = String(bruto.verificado_em || '').trim()
    if (!foto || !quando) continue
    const dist = bruto.distancia == null || bruto.distancia === '' ? null : Number(bruto.distancia)
    const novo: FacialHistoricoItem = {
      foto_url: foto,
      verificado_em: quando,
      distancia: dist != null && Number.isFinite(dist) ? dist : null,
      ...(bruto.motorista_id ? { motorista_id: String(bruto.motorista_id) } : {}),
      ...(bruto.motorista_nome ? { motorista_nome: String(bruto.motorista_nome) } : {}),
      ...(descritorValido(bruto.descriptor) ? { descriptor: descritorValido(bruto.descriptor) } : {}),
      ...(bruto.proxima_em ? { proxima_em: String(bruto.proxima_em) } : {}),
      ...(bruto.excluido_em ? { excluido_em: String(bruto.excluido_em) } : {}),
    }
    const chave = chaveFacial(novo)
    const ja = porChave.get(chave)
    if (!ja) {
      porChave.set(chave, novo)
      continue
    }
    if (!ja.motorista_id && novo.motorista_id) {
      ja.motorista_id = novo.motorista_id
      ja.motorista_nome = novo.motorista_nome ?? null
    }
    if (!ja.descriptor && novo.descriptor) ja.descriptor = novo.descriptor
    if (novo.proxima_em && (!ja.proxima_em || quandoFacial(novo.proxima_em) < quandoFacial(ja.proxima_em))) {
      ja.proxima_em = novo.proxima_em
    }
    if (novo.excluido_em && !ja.excluido_em) ja.excluido_em = novo.excluido_em
  }
  const out = Array.from(porChave.values()).map((i) =>
    i.excluido_em ? { foto_url: i.foto_url, verificado_em: i.verificado_em, distancia: null, excluido_em: i.excluido_em } : i,
  )
  return out.sort((x, y) => new Date(y.verificado_em).getTime() - new Date(x.verificado_em).getTime())
}

/** Só os itens que não foram excluídos (a lista guardada mantém as exclusões para o sync). */
export function historicoFacialVisivel(valor: unknown): FacialHistoricoItem[] {
  return normalizarHistoricoFacial(valor).filter((i) => !i.excluido_em)
}

/** Marca um item como excluído. */
export function excluirItemFacial(valor: unknown, chave: string, quando = new Date().toISOString()): FacialHistoricoItem[] {
  return normalizarHistoricoFacial(valor).map((i) =>
    chaveFacial(i) === chave ? { foto_url: i.foto_url, verificado_em: i.verificado_em, distancia: null, excluido_em: quando } : i,
  )
}

/** Força nova verificação do motorista no próximo login. */
export function refazerFacialMotorista(valor: unknown, motoristaId: string, quando = new Date().toISOString()): FacialHistoricoItem[] {
  const lista = normalizarHistoricoFacial(valor)
  const ultimo = lista.find((i) => !i.excluido_em && i.motorista_id === motoristaId)
  if (!ultimo) return lista
  return lista.map((i) => (i === ultimo ? { ...i, proxima_em: quando } : i))
}

export function unirHistoricoFacial(...listas: unknown[]): FacialHistoricoItem[] {
  return normalizarHistoricoFacial(listas.flatMap((lista) => (Array.isArray(lista) ? lista : [])))
}

export function descritorDoRosto(landmarks: Array<{ x: number; y: number }>): number[] | null {
  if (landmarks.length < 468) return null
  const left = landmarks[33]
  const right = landmarks[263]
  if (!left || !right) return null
  const iod = Math.hypot(right.x - left.x, right.y - left.y)
  if (iod < 0.02) return null
  const cx = (left.x + right.x) / 2
  const cy = (left.y + right.y) / 2
  const out: number[] = []
  for (const i of PONTOS) {
    const p = landmarks[i]
    if (!p || !Number.isFinite(p.x) || !Number.isFinite(p.y)) return null
    out.push((p.x - cx) / iod, (p.y - cy) / iod)
  }
  return out
}

export function distanciaFacial(a: number[], b: number[]): number {
  if (!a.length || a.length !== b.length) return Number.POSITIVE_INFINITY
  let soma = 0
  for (let i = 0; i < a.length; i++) {
    const d = a[i] - b[i]
    soma += d * d
  }
  return Math.sqrt(soma / a.length)
}

export function mesmoRosto(atual: number[], referencia: number[]): boolean {
  return distanciaFacial(atual, referencia) <= FACIAL_DISTANCIA_MAX
}

/** Próxima cobrança entre 14 e 35 dias — não é em todo login. */
export function agendarProximaFacial(desde = new Date()): string {
  const dias = 14 + Math.floor(Math.random() * 22)
  return new Date(desde.getTime() + dias * 24 * 60 * 60 * 1000).toISOString()
}

export function descritorValido(valor: unknown): number[] | null {
  let bruto: unknown = valor
  if (typeof valor === 'string') {
    try {
      bruto = JSON.parse(valor) as unknown
    } catch {
      return null
    }
  }
  const lista = Array.isArray(bruto) ? bruto : null
  if (!lista || lista.length < 8) return null
  const nums = lista.map((n) => Number(n))
  if (nums.some((n) => !Number.isFinite(n))) return null
  return nums
}

/** Por enquanto a facial é só da transportadora. Motorista, embarcador e unidade ficam de fora. */
export function facialParaTransportadora(ramificacao: string | null | undefined): boolean {
  const r = (ramificacao || '').trim().toLowerCase()
  return !r || r === 'transportadora'
}

const FACIAL_LOCAL_KEY = 'doca-facial-verificacao-v1'

/** Cópia neste aparelho: o sync do Kanban não pode apagar o rosto já confirmado. */
export function guardarFacialLocal(transportadorId: string, campos: FacialReferencia) {
  const id = transportadorId.trim()
  if (!id || !descritorValido(campos.facial_descriptor)) return
  try {
    const bruto = localStorage.getItem(FACIAL_LOCAL_KEY)
    const all = bruto ? (JSON.parse(bruto) as Record<string, FacialReferencia>) : {}
    all[id] = {
      facial_descriptor: descritorValido(campos.facial_descriptor),
      facial_foto_url: campos.facial_foto_url || null,
      facial_verificado_em: campos.facial_verificado_em || null,
      facial_proxima_em: campos.facial_proxima_em || null,
      facial_historico: normalizarHistoricoFacial(campos.facial_historico),
    }
    localStorage.setItem(FACIAL_LOCAL_KEY, JSON.stringify(all))
  } catch {
    /* quota */
  }
}

export function limparFacialLocal(transportadorId: string | null | undefined) {
  const id = (transportadorId || '').trim()
  if (!id) return
  try {
    const bruto = localStorage.getItem(FACIAL_LOCAL_KEY)
    if (!bruto) return
    const all = JSON.parse(bruto) as Record<string, FacialReferencia>
    if (!all[id]) return
    delete all[id]
    localStorage.setItem(FACIAL_LOCAL_KEY, JSON.stringify(all))
  } catch {
    /* ignore */
  }
}

export function lerFacialLocal(transportadorId: string | null | undefined): FacialReferencia | null {
  const id = (transportadorId || '').trim()
  if (!id) return null
  try {
    const bruto = localStorage.getItem(FACIAL_LOCAL_KEY)
    if (!bruto) return null
    const all = JSON.parse(bruto) as Record<string, FacialReferencia>
    const item = all[id]
    if (!item || !descritorValido(item.facial_descriptor)) return null
    return item
  } catch {
    return null
  }
}

function quandoFacial(iso?: string | null): number {
  if (!iso) return 0
  const n = new Date(iso).getTime()
  return Number.isFinite(n) ? n : 0
}

function isoMaisRecente(a?: string | null, b?: string | null): string | null {
  const ta = quandoFacial(a)
  const tb = quandoFacial(b)
  if (!ta && !tb) return null
  return ta >= tb ? a || null : b || null
}

/** Super excluiu e ainda não houve um cadastro de rosto depois disso. */
export function facialExigeNovoCadastro(t: FacialReferencia | null | undefined): boolean {
  if (!t) return false
  const reset = quandoFacial(t.facial_reset_em)
  if (reset && quandoFacial(t.facial_verificado_em) <= reset) return true
  return t.facial_descriptor === null && t.facial_foto_url == null
}

/** Fica com a verificação mais recente. Sync sem rosto não apaga a que já foi salva. */
export function preservarVerificacaoFacial<T extends FacialReferencia>(
  remoto: T,
  local?: FacialReferencia | null,
): T {
  const historico = unirHistoricoFacial(remoto.facial_historico, local?.facial_historico)
  const resetEm = isoMaisRecente(remoto.facial_reset_em, local?.facial_reset_em)

  const aplicar = (base: T): T => {
    const comHistorico = { ...base, facial_historico: historico, facial_reset_em: resetEm ?? base.facial_reset_em ?? null }
    if (resetEm && quandoFacial(base.facial_verificado_em) <= quandoFacial(resetEm)) {
      return {
        ...comHistorico,
        facial_descriptor: null,
        facial_foto_url: null,
        facial_verificado_em: null,
        facial_proxima_em: null,
        facial_reset_em: resetEm,
      }
    }
    return comHistorico
  }

  // Super excluiu: o nulo manda, salvo um cadastro feito depois da exclusão.
  if (remoto.facial_descriptor === null && remoto.facial_foto_url == null) {
    const localMaisNovo = Boolean(
      resetEm && local && quandoFacial(local.facial_verificado_em) > quandoFacial(resetEm),
    )
    if (!localMaisNovo) {
      return aplicar({
        ...remoto,
        facial_descriptor: null,
        facial_foto_url: null,
        facial_verificado_em: null,
        facial_proxima_em: null,
      })
    }
  }
  if (remoto.facial_proxima_em === null && descritorValido(remoto.facial_descriptor)) {
    return aplicar({
      ...remoto,
      facial_proxima_em: null,
      facial_verificado_em: remoto.facial_verificado_em ?? null,
    })
  }
  if (!local) return aplicar(remoto)
  const localDesc = descritorValido(local.facial_descriptor)
  const remotoDesc = descritorValido(remoto.facial_descriptor)
  const ficarLocal =
    Boolean(localDesc) && (!remotoDesc || quandoFacial(local.facial_verificado_em) >= quandoFacial(remoto.facial_verificado_em))
  if (!ficarLocal) {
    return aplicar({
      ...remoto,
      facial_descriptor: remotoDesc ?? localDesc ?? remoto.facial_descriptor,
      facial_foto_url: remoto.facial_foto_url || local.facial_foto_url,
      facial_verificado_em: remoto.facial_verificado_em || local.facial_verificado_em,
      facial_proxima_em: remoto.facial_proxima_em || local.facial_proxima_em,
    })
  }
  return aplicar({
    ...remoto,
    facial_descriptor: localDesc,
    facial_foto_url: local.facial_foto_url || remoto.facial_foto_url,
    facial_verificado_em: local.facial_verificado_em,
    facial_proxima_em: local.facial_proxima_em || remoto.facial_proxima_em,
  })
}

/** Sem rosto gravado, cobra na hora. Com rosto, só quando a data marcada chega. */
export function deveCobrarVerificacaoFacial(t: FacialReferencia | null | undefined): boolean {
  if (!t) return false
  if (facialExigeNovoCadastro(t)) return true
  if (!descritorValido(t.facial_descriptor)) return true
  if (!t.facial_proxima_em) return true
  const quando = new Date(t.facial_proxima_em).getTime()
  if (!Number.isFinite(quando)) return true
  return quando <= Date.now()
}

export function nomeMotoristaFacial(item: Pick<FacialHistoricoItem, 'motorista_nome'>): string {
  return item.motorista_nome?.trim() || 'Motorista não identificado'
}

/** Verificações feitas por um motorista (histórico antigo sem motorista fica de fora). */
export function historicoFacialDoMotorista(valor: unknown, motoristaId: string | null | undefined): FacialHistoricoItem[] {
  const id = (motoristaId || '').trim()
  if (!id) return []
  return historicoFacialVisivel(valor).filter((i) => i.motorista_id === id)
}

/** Itens do motorista que valem (depois da última exclusão feita pelo super). */
function itensValidosDoMotorista(
  t: Pick<FacialReferencia, 'facial_historico' | 'facial_reset_em'> | null | undefined,
  motoristaId: string,
): FacialHistoricoItem[] {
  const reset = quandoFacial(t?.facial_reset_em)
  return historicoFacialDoMotorista(t?.facial_historico, motoristaId).filter(
    (i) => !reset || quandoFacial(i.verificado_em) > reset,
  )
}

/** Rosto de referência do motorista: o do cadastro dele (o mais antigo válido). */
export function referenciaFacialMotorista(
  t: Pick<FacialReferencia, 'facial_historico' | 'facial_reset_em'> | null | undefined,
  motoristaId: string,
): number[] | null {
  const itens = itensValidosDoMotorista(t, motoristaId).filter((i) => i.descriptor)
  return itens.length ? itens[itens.length - 1].descriptor ?? null : null
}

/** O motorista já tem rosto próprio cadastrado. */
export function motoristaTemFacial(
  t: Pick<FacialReferencia, 'facial_historico' | 'facial_reset_em'> | null | undefined,
  motoristaId: string,
): boolean {
  return Boolean(referenciaFacialMotorista(t, motoristaId))
}

/** Sem rosto próprio, cobra na hora. Com rosto, só quando a data dele chega. */
export function motoristaDeveFacial(
  t: Pick<FacialReferencia, 'facial_historico' | 'facial_reset_em'> | null | undefined,
  motoristaId: string,
): boolean {
  if (!motoristaTemFacial(t, motoristaId)) return true
  const ultimo = itensValidosDoMotorista(t, motoristaId)[0]
  if (!ultimo?.proxima_em) return true
  const quando = new Date(ultimo.proxima_em).getTime()
  return !Number.isFinite(quando) || quando <= Date.now()
}

const FACIAL_ADIADOS_KEY = 'doca-facial-adiados-v1'

/** Motoristas que a transportadora deixou para cadastrar depois (só nesta sessão). */
export function lerFacialAdiados(transportadorId: string): string[] {
  try {
    const all = JSON.parse(sessionStorage.getItem(FACIAL_ADIADOS_KEY) || '{}') as Record<string, string[]>
    return Array.isArray(all[transportadorId]) ? all[transportadorId] : []
  } catch {
    return []
  }
}

export function adiarFacialMotorista(transportadorId: string, motoristaId: string) {
  try {
    const all = JSON.parse(sessionStorage.getItem(FACIAL_ADIADOS_KEY) || '{}') as Record<string, string[]>
    all[transportadorId] = Array.from(new Set([...(all[transportadorId] || []), motoristaId]))
    sessionStorage.setItem(FACIAL_ADIADOS_KEY, JSON.stringify(all))
  } catch {
    /* ignore */
  }
}
