import { useEffect, useRef } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'

type Props = {
  lat: number
  lng: number
  height?: number
  className?: string
}

export function PontoMapPreview({ lat, lng, height = 320, className }: Props) {
  const elRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = elRef.current
    if (!el) return
    const map = L.map(el, {
      center: [lat, lng],
      zoom: 13,
      zoomControl: false,
      attributionControl: false,
    })
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 }).addTo(map)
    L.circleMarker([lat, lng], {
      radius: 9,
      color: '#0f172a',
      fillColor: '#f9db00',
      fillOpacity: 1,
      weight: 2,
    }).addTo(map)
    const t = window.setTimeout(() => map.invalidateSize(), 80)
    return () => {
      window.clearTimeout(t)
      map.remove()
    }
  }, [lat, lng])

  return <div ref={elRef} className={className} style={{ height, width: '100%' }} />
}
