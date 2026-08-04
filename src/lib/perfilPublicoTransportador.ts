/** Conteúdo editável do perfil público (layout estilo Transvias). */
export type PerfilPublicoTransportador = {
  /** Tags abaixo do título (ex.: Carga Fracionada, Refrigerado). */
  especialidades: string[]
  /** Texto da seção Apresentação. */
  apresentacao: string
  /** Frase introdutória dos Serviços. */
  servicos_intro: string
  /** Lista de serviços. */
  servicos: string[]
  /** Texto da seção Referências. */
  referencias: string
  /** Área de cobertura / atuação. */
  cobertura: string
  /** Site externo opcional. */
  site_url: string
  /**
   * Até 5 imagens da página (Personalize sua página).
   * Exibidas abaixo do mapa em “Ver perfil”.
   */
  galeria: string[]
}

export const GALERIA_PERFIL_MAX = 5

export const EMPTY_PERFIL_PUBLICO: PerfilPublicoTransportador = {
  especialidades: [],
  apresentacao: '',
  servicos_intro: '',
  servicos: [],
  referencias: '',
  cobertura: '',
  site_url: '',
  galeria: [],
}

function asStringList(raw: unknown): string[] {
  if (!Array.isArray(raw)) return []
  return raw.map((x) => String(x ?? '').trim()).filter(Boolean)
}

/** Sempre 5 posições (string vazia = slot vazio) para o editor. */
export function galeriaSlots(galeria: string[] | undefined | null): string[] {
  const g = Array.isArray(galeria) ? galeria : []
  const out: string[] = []
  for (let i = 0; i < GALERIA_PERFIL_MAX; i++) {
    out.push(String(g[i] ?? '').trim())
  }
  return out
}

export function normalizePerfilPublico(
  raw: unknown,
): PerfilPublicoTransportador {
  if (!raw || typeof raw !== 'object') return { ...EMPTY_PERFIL_PUBLICO }
  const p = raw as Partial<PerfilPublicoTransportador>
  const rawList = Array.isArray(p.galeria)
    ? p.galeria.map((x) => String(x ?? '').trim())
    : []
  return {
    especialidades: asStringList(p.especialidades),
    apresentacao: String(p.apresentacao ?? '').trim(),
    servicos_intro: String(p.servicos_intro ?? '').trim(),
    servicos: asStringList(p.servicos),
    referencias: String(p.referencias ?? '').trim(),
    cobertura: String(p.cobertura ?? '').trim(),
    site_url: String(p.site_url ?? '').trim(),
    galeria: rawList.filter(Boolean).slice(0, GALERIA_PERFIL_MAX),
  }
}

/** Compacta os 5 slots em lista de URLs preenchidas. */
export function compactGaleriaSlots(slots: string[]): string[] {
  return galeriaSlots(slots).filter(Boolean).slice(0, GALERIA_PERFIL_MAX)
}

/** Converte textarea (1 item por linha) ↔ lista. */
export function linhasParaLista(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
}

export function listaParaLinhas(list: string[]): string {
  return list.join('\n')
}
