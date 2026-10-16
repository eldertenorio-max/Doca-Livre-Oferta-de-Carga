/**
 * Proxy de tiles OSM em português (osMap / Map Services).
 * O CDN exige Referer de osmap.pt; o browser não pode forjar isso,
 * então a Edge busca o PNG e devolve ao mapa do Oferta.
 *
 * Deploy:
 *   supabase functions deploy mapa-tile-pt --project-ref imnlbbfgaztfhwndfxwb
 *
 * URL: /functions/v1/mapa-tile-pt/{s}/{z}/{x}/{y}.png
 */

const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
}

const SUBS = new Set(['a', 'b', 'c', 'd'])
const MAX_Z = 19

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }
  if (req.method !== 'GET') {
    return new Response('Method not allowed', { status: 405, headers: corsHeaders })
  }

  const url = new URL(req.url)
  // /mapa-tile-pt/a/4/12/7.png  ou path com /functions/v1/...
  const parts = url.pathname.split('/').filter(Boolean)
  const i = parts.lastIndexOf('mapa-tile-pt')
  const slice = i >= 0 ? parts.slice(i + 1) : parts.slice(-4)
  if (slice.length < 4) {
    return new Response('Bad path', { status: 400, headers: corsHeaders })
  }
  const [sRaw, zRaw, xRaw, yRaw] = slice
  const s = (sRaw || 'a').toLowerCase()
  const z = Number(zRaw)
  const x = Number(xRaw)
  const y = Number(String(yRaw).replace(/\.png$/i, ''))
  if (!SUBS.has(s) || !Number.isInteger(z) || !Number.isInteger(x) || !Number.isInteger(y)) {
    return new Response('Bad tile', { status: 400, headers: corsHeaders })
  }
  if (z < 0 || z > MAX_Z || x < 0 || y < 0 || x >= 2 ** z || y >= 2 ** z) {
    return new Response('Out of range', { status: 400, headers: corsHeaders })
  }

  const upstream = `https://osmap.${s}.tile.maphost.pt/pt/map/v1/${z}/${x}/${y}.png`
  try {
    const res = await fetch(upstream, {
      headers: {
        Referer: 'https://www.osmap.pt/',
        'User-Agent': 'DocaLivre-OfertaMapa/1.0 (diego@docalivre.com)',
        Accept: 'image/png,image/*;q=0.8,*/*;q=0.5',
      },
    })
    if (!res.ok) {
      return new Response(`upstream ${res.status}`, {
        status: res.status === 404 ? 404 : 502,
        headers: corsHeaders,
      })
    }
    const body = await res.arrayBuffer()
    return new Response(body, {
      status: 200,
      headers: {
        ...corsHeaders,
        'Content-Type': 'image/png',
        'Cache-Control': 'public, max-age=86400, stale-while-revalidate=604800',
      },
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'fetch failed'
    return new Response(msg, { status: 502, headers: corsHeaders })
  }
})
