import { useEffect, useRef } from 'react'
import '../../styles/earth-globe.css'

const LON0 = 28
const LAT0 = 50
const SCALE0 = 1
const SCALE_MIN = 0.72
const SCALE_MAX = 2.6
const LAT_MIN = 18
const LAT_MAX = 82

export function EarthGlobe() {
  const rootRef = useRef<HTMLDivElement>(null)
  const spaceRef = useRef<HTMLDivElement>(null)
  const sphereRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const root = rootRef.current
    const space = spaceRef.current
    const sphere = sphereRef.current
    if (!root || !space || !sphere) return

    const st = {
      lon: LON0,
      lat: LAT0,
      scale: SCALE0,
      dragging: false,
      lastX: 0,
      lastY: 0,
      pointerId: -1,
      spinning: true,
      pinch: 0,
    }

    const reduced =
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (reduced) st.spinning = false

    const wrapLon = () => {
      st.lon = ((st.lon % 200) + 200) % 200
    }

    const paint = () => {
      wrapLon()
      sphere.style.backgroundPosition = `${st.lon}% ${st.lat}%`
      space.style.transform = `scale(${st.scale})`
    }

    paint()

    let raf = 0
    const tick = () => {
      if (st.spinning && !st.dragging && st.pinch < 2) {
        st.lon += 0.035
        paint()
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)

    const stopSpin = () => {
      st.spinning = false
    }

    const onPointerDown = (e: PointerEvent) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return
      stopSpin()
      st.dragging = true
      st.pointerId = e.pointerId
      st.lastX = e.clientX
      st.lastY = e.clientY
      space.classList.add('is-grabbing')
      root.classList.add('is-grabbing')
      try {
        root.setPointerCapture(e.pointerId)
      } catch {
        /* ignore */
      }
      e.preventDefault()
    }

    const onPointerMove = (e: PointerEvent) => {
      if (!st.dragging || e.pointerId !== st.pointerId) return
      const dx = e.clientX - st.lastX
      const dy = e.clientY - st.lastY
      st.lastX = e.clientX
      st.lastY = e.clientY
      st.lon += dx * 0.085
      st.lat = Math.min(LAT_MAX, Math.max(LAT_MIN, st.lat + dy * 0.045))
      paint()
    }

    const endDrag = (e: PointerEvent) => {
      if (e.pointerId !== st.pointerId && st.pointerId !== -1) return
      st.dragging = false
      st.pointerId = -1
      space.classList.remove('is-grabbing')
      root.classList.remove('is-grabbing')
    }

    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      stopSpin()
      const dir = e.deltaY > 0 ? -1 : 1
      const next = st.scale * (dir > 0 ? 1.08 : 1 / 1.08)
      st.scale = Math.min(SCALE_MAX, Math.max(SCALE_MIN, next))
      paint()
    }

    const onDblClick = (e: MouseEvent) => {
      e.preventDefault()
      st.lon = LON0
      st.lat = LAT0
      st.scale = SCALE0
      st.spinning = !reduced
      paint()
    }

    const distTouches = (a: Touch, b: Touch) =>
      Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY)

    let pinchStart = 0
    let pinchScale = SCALE0

    const onTouchStart = (e: TouchEvent) => {
      st.pinch = e.touches.length
      if (e.touches.length === 2) {
        stopSpin()
        st.dragging = false
        pinchStart = distTouches(e.touches[0], e.touches[1])
        pinchScale = st.scale
      }
    }

    const onTouchMove = (e: TouchEvent) => {
      if (e.touches.length !== 2 || pinchStart <= 0) return
      e.preventDefault()
      const d = distTouches(e.touches[0], e.touches[1])
      st.scale = Math.min(SCALE_MAX, Math.max(SCALE_MIN, pinchScale * (d / pinchStart)))
      paint()
    }

    const onTouchEnd = (e: TouchEvent) => {
      st.pinch = e.touches.length
      if (e.touches.length < 2) pinchStart = 0
    }

    root.addEventListener('pointerdown', onPointerDown)
    root.addEventListener('pointermove', onPointerMove)
    root.addEventListener('pointerup', endDrag)
    root.addEventListener('pointercancel', endDrag)
    root.addEventListener('wheel', onWheel, { passive: false })
    root.addEventListener('dblclick', onDblClick)
    root.addEventListener('touchstart', onTouchStart, { passive: true })
    root.addEventListener('touchmove', onTouchMove, { passive: false })
    root.addEventListener('touchend', onTouchEnd)
    root.addEventListener('touchcancel', onTouchEnd)

    return () => {
      cancelAnimationFrame(raf)
      root.removeEventListener('pointerdown', onPointerDown)
      root.removeEventListener('pointermove', onPointerMove)
      root.removeEventListener('pointerup', endDrag)
      root.removeEventListener('pointercancel', endDrag)
      root.removeEventListener('wheel', onWheel)
      root.removeEventListener('dblclick', onDblClick)
      root.removeEventListener('touchstart', onTouchStart)
      root.removeEventListener('touchmove', onTouchMove)
      root.removeEventListener('touchend', onTouchEnd)
      root.removeEventListener('touchcancel', onTouchEnd)
    }
  }, [])

  return (
    <div
      ref={rootRef}
      className="earth-globe"
      role="img"
      aria-label="Globo terrestre. Arraste para girar, role o mouse para zoom. Clique duas vezes para resetar."
    >
      <div ref={spaceRef} className="earth-globe__space">
        <div ref={sphereRef} className="earth-globe__sphere" />
        <div className="earth-globe__shine" />
      </div>
    </div>
  )
}
