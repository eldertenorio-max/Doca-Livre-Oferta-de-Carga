import { appStoreGet, appStoreGetCached, appStoreSet } from './appStore'
import { URL_MAPA_FROTA, URL_MAPA_LOGISTICA, URL_ROTA_PUBLICA, URL_SISTEMA } from './siteOfertaDeCarga'

export type TipoMural = 'anuncio' | 'noticia'

export type SistemaCadeia = 'cadeia' | 'sistema' | 'calculadora' | 'frota' | 'logistica'

export type ItemMural = {
  id: string
  tipo: TipoMural
  titulo: string
  texto: string
  sistema: SistemaCadeia
  link: string
  autor_nome: string
  created_at: string
}

export const SISTEMAS_CADEIA: { id: SistemaCadeia; label: string; href: string }[] = [
  { id: 'cadeia', label: 'Cadeia de sistemas', href: URL_SISTEMA },
  { id: 'sistema', label: 'Oferta de Carga', href: URL_SISTEMA },
  { id: 'calculadora', label: 'Calculadora de rota', href: URL_ROTA_PUBLICA },
  { id: 'frota', label: 'Mapa da Frota', href: URL_MAPA_FROTA },
  { id: 'logistica', label: 'Mapa da Logística', href: URL_MAPA_LOGISTICA },
]

const STORE_KEY = 'home_mural'

export function loadHomeMural(): ItemMural[] {
  const cached = appStoreGetCached<ItemMural[] | null>(STORE_KEY, null)
  return Array.isArray(cached) ? cached : []
}

export async function hydrateHomeMural(): Promise<ItemMural[]> {
  const remote = await appStoreGet<ItemMural[] | null>(STORE_KEY, null)
  return Array.isArray(remote) ? remote : []
}

export function saveHomeMural(itens: ItemMural[]) {
  void appStoreSet(STORE_KEY, itens)
}

export function publicarMural(
  itens: ItemMural[],
  input: Omit<ItemMural, 'id' | 'created_at'>,
): ItemMural[] {
  const item: ItemMural = {
    ...input,
    titulo: input.titulo.trim(),
    texto: input.texto.trim(),
    link: input.link.trim(),
    id: `mural-${Date.now().toString(36)}`,
    created_at: new Date().toISOString(),
  }
  return [item, ...itens]
}
