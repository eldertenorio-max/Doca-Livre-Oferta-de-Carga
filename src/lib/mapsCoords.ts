/**
 * Aceita cola do Google Maps: `-23.5613545,-46.6590692,17`
 * (latitude, longitude e zoom opcional).
 */
export function parseMapsCoords(
  raw: string,
): { lat: number; lng: number; zoom?: number } | null {
  const s = raw.trim()
  if (!s) return null
  const m = s.match(
    /^\s*(-?\d+(?:[.,]\d+)?)\s*[,;]\s*(-?\d+(?:[.,]\d+)?)(?:\s*[,;]\s*(\d+(?:[.,]\d+)?))?\s*$/,
  )
  if (!m) return null
  const lat = Number(m[1].replace(',', '.'))
  const lng = Number(m[2].replace(',', '.'))
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null
  const zoom =
    m[3] != null && m[3] !== ''
      ? Number(m[3].replace(',', '.'))
      : undefined
  return {
    lat,
    lng,
    zoom: zoom != null && Number.isFinite(zoom) ? zoom : undefined,
  }
}

export function fmtMapsCoords(
  lat: number | null | undefined,
  lng: number | null | undefined,
): string {
  if (lat == null || lng == null || !Number.isFinite(lat) || !Number.isFinite(lng)) {
    return ''
  }
  return `${lat.toFixed(7)},${lng.toFixed(7)}`
}
