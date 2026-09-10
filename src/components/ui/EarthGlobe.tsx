import { useEffect, useRef } from 'react'
import '../../styles/earth-globe.css'

export function EarthGlobe() {
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = rootRef.current
    if (!el) return
    let disposed = false
    let raf = 0
    let renderer: import('three').WebGLRenderer | undefined
    let controls: { dispose: () => void; update: () => void; autoRotate: boolean } | undefined
    let resizeObs: ResizeObserver | undefined

    const reduced =
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches

    void (async () => {
      const THREE = await import('three')
      const { OrbitControls } = await import('three/examples/jsm/controls/OrbitControls.js')
      if (disposed || !el) return

      const scene = new THREE.Scene()
      scene.background = new THREE.Color(0x02040a)

      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' })
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
      renderer.outputColorSpace = THREE.SRGBColorSpace
      renderer.domElement.className = 'earth-globe__canvas'
      if (disposed) {
        renderer.dispose()
        return
      }
      el.appendChild(renderer.domElement)

      const camera = new THREE.PerspectiveCamera(42, 1, 0.05, 200)
      camera.position.set(1.85, 0.72, 2.55)

      const orbit = new OrbitControls(camera, renderer.domElement)
      orbit.enableDamping = true
      orbit.dampingFactor = 0.07
      orbit.minDistance = 1.12
      orbit.maxDistance = 7.5
      orbit.enablePan = true
      orbit.panSpeed = 0.55
      orbit.rotateSpeed = 0.55
      orbit.zoomSpeed = 1.15
      orbit.autoRotate = !reduced
      orbit.autoRotateSpeed = 0.28
      orbit.minPolarAngle = 0.08
      orbit.maxPolarAngle = Math.PI - 0.08
      orbit.mouseButtons = {
        LEFT: THREE.MOUSE.ROTATE,
        MIDDLE: THREE.MOUSE.DOLLY,
        RIGHT: THREE.MOUSE.PAN,
      }
      orbit.touches = {
        ONE: THREE.TOUCH.ROTATE,
        TWO: THREE.TOUCH.DOLLY_PAN,
      }
      orbit.addEventListener('start', () => {
        orbit.autoRotate = false
      })
      controls = orbit

      const texLoader = new THREE.TextureLoader()
      const map = texLoader.load('/earth-globe.jpg')
      map.colorSpace = THREE.SRGBColorSpace
      map.anisotropy = renderer.capabilities.getMaxAnisotropy()

      const earth = new THREE.Mesh(
        new THREE.SphereGeometry(1, 96, 96),
        new THREE.MeshPhongMaterial({
          map,
          specular: new THREE.Color(0x1a2430),
          shininess: 12,
          emissive: new THREE.Color(0x050810),
          emissiveIntensity: 0.35,
        }),
      )
      scene.add(earth)

      const atmosphere = new THREE.Mesh(
        new THREE.SphereGeometry(1.055, 64, 64),
        new THREE.ShaderMaterial({
          vertexShader: `
            varying vec3 vNormal;
            void main() {
              vNormal = normalize(normalMatrix * normal);
              gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
            }
          `,
          fragmentShader: `
            varying vec3 vNormal;
            void main() {
              float intensity = pow(0.62 - dot(vNormal, vec3(0.0, 0.0, 1.0)), 3.2);
              gl_FragColor = vec4(0.35, 0.62, 1.0, 1.0) * intensity;
            }
          `,
          blending: THREE.AdditiveBlending,
          side: THREE.BackSide,
          transparent: true,
          depthWrite: false,
        }),
      )
      scene.add(atmosphere)

      const starGeo = new THREE.BufferGeometry()
      const starCount = 2800
      const starPos = new Float32Array(starCount * 3)
      for (let i = 0; i < starCount; i += 1) {
        const r = 28 + Math.random() * 50
        const theta = Math.random() * Math.PI * 2
        const phi = Math.acos(2 * Math.random() - 1)
        starPos[i * 3] = r * Math.sin(phi) * Math.cos(theta)
        starPos[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta)
        starPos[i * 3 + 2] = r * Math.cos(phi)
      }
      starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3))
      scene.add(
        new THREE.Points(
          starGeo,
          new THREE.PointsMaterial({ color: 0xdfebff, size: 0.045, sizeAttenuation: true }),
        ),
      )

      scene.add(new THREE.AmbientLight(0x6b82a8, 0.62))
      const sun = new THREE.DirectionalLight(0xfff3dd, 1.55)
      sun.position.set(6.2, 2.4, 3.1)
      scene.add(sun)
      const fill = new THREE.DirectionalLight(0x4d6d9a, 0.35)
      fill.position.set(-4, -1, -2)
      scene.add(fill)

      const raycaster = new THREE.Raycaster()
      const pointer = new THREE.Vector2()

      const home = () => {
        camera.position.set(1.85, 0.72, 2.55)
        orbit.target.set(0, 0, 0)
        orbit.autoRotate = !reduced
        orbit.update()
      }

      const zoomBy = (factor: number) => {
        const dir = camera.position.clone().sub(orbit.target)
        dir.multiplyScalar(factor)
        const next = orbit.target.clone().add(dir)
        const dist = next.distanceTo(orbit.target)
        if (dist < orbit.minDistance) next.copy(orbit.target).add(dir.setLength(orbit.minDistance))
        if (dist > orbit.maxDistance) next.copy(orbit.target).add(dir.setLength(orbit.maxDistance))
        camera.position.copy(next)
        orbit.update()
      }

      const zoomToEvent = (clientX: number, clientY: number) => {
        const rect = renderer!.domElement.getBoundingClientRect()
        pointer.x = ((clientX - rect.left) / rect.width) * 2 - 1
        pointer.y = -((clientY - rect.top) / rect.height) * 2 + 1
        raycaster.setFromCamera(pointer, camera)
        const hit = raycaster.intersectObject(earth)[0]
        orbit.autoRotate = false
        if (hit) {
          const p = hit.point
          orbit.target.lerp(p, 0.35)
          const toCam = camera.position.clone().sub(p)
          const nextLen = Math.max(orbit.minDistance, toCam.length() * 0.62)
          camera.position.copy(p).add(toCam.setLength(nextLen))
        } else {
          zoomBy(0.72)
        }
        orbit.update()
      }

      const onDblClick = (e: MouseEvent) => {
        e.preventDefault()
        zoomToEvent(e.clientX, e.clientY)
      }

      const onContext = (e: Event) => e.preventDefault()

      const onKey = (e: KeyboardEvent) => {
        if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
        if (e.key === '+' || e.key === '=') zoomBy(0.86)
        if (e.key === '-' || e.key === '_') zoomBy(1.16)
        if (e.key === 'Home' || e.key === 'h' || e.key === 'H') home()
      }

      const applySize = () => {
        const w = Math.max(1, el.clientWidth)
        const h = Math.max(1, el.clientHeight)
        renderer!.setSize(w, h, false)
        camera.aspect = w / h
        const pub = el.closest('.rota-pub') && window.matchMedia('(min-width: 861px)').matches
        if (pub) {
          const shift = Math.min(430, w * 0.36)
          camera.setViewOffset(w, h, -shift * 0.42, 0, w, h)
        } else {
          camera.clearViewOffset()
        }
        camera.updateProjectionMatrix()
      }

      applySize()
      resizeObs = new ResizeObserver(applySize)
      resizeObs.observe(el)

      const tick = () => {
        if (disposed) return
        orbit.update()
        renderer!.render(scene, camera)
        raf = requestAnimationFrame(tick)
      }
      raf = requestAnimationFrame(tick)

      const ui = el.querySelector('.earth-globe__nav')
      const onUi = (e: Event) => {
        const btn = (e.target as HTMLElement).closest('[data-earth]') as HTMLElement | null
        if (!btn) return
        const act = btn.dataset.earth
        if (act === 'in') zoomBy(0.82)
        if (act === 'out') zoomBy(1.2)
        if (act === 'home') home()
      }
      ui?.addEventListener('click', onUi)
      renderer.domElement.addEventListener('dblclick', onDblClick)
      renderer.domElement.addEventListener('contextmenu', onContext)
      window.addEventListener('keydown', onKey)

      const cleanupExtra = () => {
        ui?.removeEventListener('click', onUi)
        renderer?.domElement.removeEventListener('dblclick', onDblClick)
        renderer?.domElement.removeEventListener('contextmenu', onContext)
        window.removeEventListener('keydown', onKey)
        map.dispose()
        earth.geometry.dispose()
        ;(earth.material as import('three').Material).dispose()
        atmosphere.geometry.dispose()
        ;(atmosphere.material as import('three').Material).dispose()
        starGeo.dispose()
      }
      ;(el as HTMLDivElement & { __earthCleanup?: () => void }).__earthCleanup = cleanupExtra
    })()

    return () => {
      disposed = true
      cancelAnimationFrame(raf)
      resizeObs?.disconnect()
      controls?.dispose()
      const extra = (el as HTMLDivElement & { __earthCleanup?: () => void }).__earthCleanup
      extra?.()
      if (renderer) {
        renderer.dispose()
        renderer.domElement.remove()
      }
    }
  }, [])

  return (
    <div
      ref={rootRef}
      className="earth-globe"
      role="application"
      aria-label="Globo 3D. Arraste para orbitar, role para zoom, botão direito para deslocar, clique duplo para aproximar. + e - no teclado, H para visão inicial."
    >
      <div className="earth-globe__nav" data-pdf-ignore>
        <button type="button" data-earth="in" title="Aproximar" aria-label="Aproximar">
          +
        </button>
        <button type="button" data-earth="out" title="Afastar" aria-label="Afastar">
          −
        </button>
        <button type="button" data-earth="home" title="Visão do espaço" aria-label="Visão do espaço">
          ⌂
        </button>
      </div>
      <p className="earth-globe__hint">
        Arraste para girar · scroll zoom · botão direito desloca · clique duplo aproxima
      </p>
    </div>
  )
}
