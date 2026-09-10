import { useEffect, useRef, useState } from 'react'
import '../../styles/earth-globe.css'

type CesiumNS = typeof import('cesium')
type Coord = { lat: number; lng: number }

export type EarthGlobePick = 'A' | 'B'

async function loadCesium(): Promise<CesiumNS> {
  const w = window as Window & { Cesium?: CesiumNS; CESIUM_BASE_URL?: string }
  const base = `${import.meta.env.BASE_URL}cesium/`
  w.CESIUM_BASE_URL = base

  const fromWindow = () => w.Cesium
  if (fromWindow()?.Viewer) return fromWindow()!

  try {
    const mod = (await import('cesium')) as CesiumNS & { default?: CesiumNS }
    const ns = mod.Viewer ? mod : mod.default
    if (ns?.Viewer) return ns
  } catch {
    /* tenta o Cesium.js copiado em /cesium */
  }

  if (fromWindow()?.Viewer) return fromWindow()!

  await new Promise<void>((resolve, reject) => {
    const hrefCss = `${base}Widgets/widgets.css`
    if (!document.querySelector(`link[href="${hrefCss}"]`)) {
      const link = document.createElement('link')
      link.rel = 'stylesheet'
      link.href = hrefCss
      document.head.appendChild(link)
    }
    const src = `${base}Cesium.js`
    const prev = document.querySelector(`script[src="${src}"]`) as HTMLScriptElement | null
    if (fromWindow()?.Viewer) {
      resolve()
      return
    }
    const onOk = () => resolve()
    const onErr = () => reject(new Error('CesiumJS não carregou'))
    if (prev) {
      prev.addEventListener('load', onOk, { once: true })
      prev.addEventListener('error', onErr, { once: true })
      return
    }
    const script = document.createElement('script')
    script.src = src
    script.async = true
    script.onload = onOk
    script.onerror = onErr
    document.head.appendChild(script)
  })

  const ready = fromWindow()
  if (!ready?.Viewer) throw new Error('CesiumJS não carregou')
  return ready
}

type Props = {
  pickMode?: EarthGlobePick | null
  onPick?: (lat: number, lng: number) => void
  pontoA?: Coord | null
  pontoB?: Coord | null
  onReady?: () => void
  onError?: () => void
}

export function EarthGlobe({
  pickMode = null,
  onPick,
  pontoA = null,
  pontoB = null,
  onReady,
  onError,
}: Props) {
  const rootRef = useRef<HTMLDivElement>(null)
  const cesiumRef = useRef<HTMLDivElement>(null)
  const viewerRef = useRef<import('cesium').Viewer | undefined>(undefined)
  const CesiumRef = useRef<CesiumNS | undefined>(undefined)
  const pinARef = useRef<import('cesium').Entity | undefined>(undefined)
  const pinBRef = useRef<import('cesium').Entity | undefined>(undefined)
  const pickModeRef = useRef(pickMode)
  const onPickRef = useRef(onPick)
  pickModeRef.current = pickMode
  onPickRef.current = onPick
  const onReadyRef = useRef(onReady)
  const onErrorRef = useRef(onError)
  onReadyRef.current = onReady
  onErrorRef.current = onError
  const [cesiumOk, setCesiumOk] = useState(false)

  useEffect(() => {
    const host = cesiumRef.current
    const root = rootRef.current
    if (!host || !root) return
    let disposed = false
    let viewer: import('cesium').Viewer | undefined
    let handler: import('cesium').ScreenSpaceEventHandler | undefined
    let resizeObs: ResizeObserver | undefined
    let onUi: ((e: Event) => void) | undefined

    const reduced =
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches

    void (async () => {
      const Cesium = await loadCesium()
      if (disposed || !host) return
      CesiumRef.current = Cesium

      Cesium.Ion.defaultAccessToken = ''

      const satelite = new Cesium.UrlTemplateImageryProvider({
        url: 'https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
        maximumLevel: 19,
        credit: new Cesium.Credit('Esri, Maxar, Earthstar Geographics'),
      })

      viewer = new Cesium.Viewer(host, {
        animation: false,
        timeline: false,
        geocoder: false,
        homeButton: false,
        sceneModePicker: false,
        baseLayerPicker: false,
        navigationHelpButton: false,
        fullscreenButton: false,
        infoBox: false,
        selectionIndicator: false,
        vrButton: false,
        scene3DOnly: true,
        baseLayer: new Cesium.ImageryLayer(satelite),
        terrainProvider: new Cesium.EllipsoidTerrainProvider(),
        requestRenderMode: false,
      })
      if (disposed) {
        viewer.destroy()
        return
      }
      viewerRef.current = viewer

      const scene = viewer.scene
      scene.globe.enableLighting = false
      scene.globe.showGroundAtmosphere = true
      scene.globe.depthTestAgainstTerrain = true
      scene.globe.maximumScreenSpaceError = 1.2
      scene.globe.tileCacheSize = 2000
      scene.skyAtmosphere.show = true
      scene.fog.enabled = true
      const camCtl = scene.screenSpaceCameraController
      camCtl.enableCollisionDetection = true
      camCtl.minimumZoomDistance = 1.5
      camCtl.maximumZoomDistance = 4.2e7
      camCtl.inertiaZoom = 0.8
      camCtl.inertiaSpin = 0.9
      camCtl.inertiaTranslate = 0.9
      camCtl.rotateEventTypes = Cesium.CameraEventType.LEFT_DRAG
      camCtl.tiltEventTypes = [
        Cesium.CameraEventType.RIGHT_DRAG,
        Cesium.CameraEventType.PINCH,
        {
          eventType: Cesium.CameraEventType.LEFT_DRAG,
          modifier: Cesium.KeyboardEventModifier.CTRL,
        },
      ]
      camCtl.zoomEventTypes = [Cesium.CameraEventType.WHEEL, Cesium.CameraEventType.PINCH]
      camCtl.lookEventTypes = [
        {
          eventType: Cesium.CameraEventType.LEFT_DRAG,
          modifier: Cesium.KeyboardEventModifier.SHIFT,
        },
      ]

      const visaoEspaco = (imediato = false) => {
        const pose = {
          destination: Cesium.Cartesian3.fromDegrees(-48, -14, 1.12e7),
          orientation: {
            heading: Cesium.Math.toRadians(8),
            pitch: Cesium.Math.toRadians(-28),
            roll: 0,
          },
        }
        if (imediato || reduced) viewer!.camera.setView(pose)
        else viewer!.camera.flyTo({ ...pose, duration: 1.15 })
      }

      visaoEspaco(true)

      void Cesium.ArcGISTiledElevationTerrainProvider.fromUrl(
        'https://elevation3d.arcgis.com/arcgis/rest/services/WorldElevation3D/Terrain3D/ImageServer',
      )
        .then((t) => {
          if (!disposed && viewerRef.current) viewerRef.current.terrainProvider = t
        })
        .catch(() => {
          /* relevo extra é opcional */
        })

      const altura = () => viewer!.camera.positionCartographic.height

      const zoomFator = (fator: number) => {
        const h = altura()
        const next = Math.min(4.2e7, Math.max(8, h * fator))
        const c = viewer!.camera.positionCartographic
        viewer!.camera.flyTo({
          destination: Cesium.Cartesian3.fromRadians(c.longitude, c.latitude, next),
          orientation: {
            heading: viewer!.camera.heading,
            pitch:
              next < 4000
                ? Math.min(viewer!.camera.pitch, Cesium.Math.toRadians(-28))
                : viewer!.camera.pitch,
            roll: viewer!.camera.roll,
          },
          duration: reduced ? 0 : 0.55,
        })
      }

      const hitDoClique = (position: import('cesium').Cartesian2) => {
        const ray = viewer!.camera.getPickRay(position)
        return (
          (ray && scene.globe.pick(ray, scene)) ||
          viewer!.camera.pickEllipsoid(position, scene.globe.ellipsoid)
        )
      }

      let down: import('cesium').Cartesian2 | undefined
      handler = new Cesium.ScreenSpaceEventHandler(scene.canvas)
      handler.setInputAction((c: { position: import('cesium').Cartesian2 }) => {
        down = Cesium.Cartesian2.clone(c.position)
      }, Cesium.ScreenSpaceEventType.LEFT_DOWN)
      handler.setInputAction((c: { position: import('cesium').Cartesian2 }) => {
        const modo = pickModeRef.current
        if (!modo || !onPickRef.current) return
        if (down && Cesium.Cartesian2.distance(down, c.position) > 6) return
        const hit = hitDoClique(c.position)
        if (!hit) return
        const carto = Cesium.Cartographic.fromCartesian(hit)
        onPickRef.current(
          Cesium.Math.toDegrees(carto.latitude),
          Cesium.Math.toDegrees(carto.longitude),
        )
      }, Cesium.ScreenSpaceEventType.LEFT_CLICK)
      handler.setInputAction((click: { position: import('cesium').Cartesian2 }) => {
        if (pickModeRef.current) return
        const hit = hitDoClique(click.position)
        if (!hit) {
          zoomFator(0.38)
          return
        }
        const carto = Cesium.Cartographic.fromCartesian(hit)
        const next = Math.max(12, altura() * 0.28)
        viewer!.camera.flyTo({
          destination: Cesium.Cartesian3.fromRadians(carto.longitude, carto.latitude, next),
          orientation: {
            heading: viewer!.camera.heading,
            pitch: next < 2500 ? Cesium.Math.toRadians(-28) : viewer!.camera.pitch,
            roll: 0,
          },
          duration: reduced ? 0 : 1.05,
        })
      }, Cesium.ScreenSpaceEventType.LEFT_DOUBLE_CLICK)

      onUi = (e: Event) => {
        const btn = (e.target as HTMLElement).closest('[data-earth]') as HTMLElement | null
        if (!btn) return
        const act = btn.dataset.earth
        if (act === 'in') zoomFator(0.42)
        if (act === 'out') zoomFator(2.35)
        if (act === 'home') visaoEspaco(false)
      }
      root.querySelector('.earth-globe__nav')?.addEventListener('click', onUi)

      const applySize = () => viewer?.resize()
      applySize()
      resizeObs = new ResizeObserver(applySize)
      resizeObs.observe(host)
      requestAnimationFrame(() => viewer?.resize())
      if (!disposed) {
        setCesiumOk(true)
        onReadyRef.current?.()
      }
    })().catch(() => {
      if (!disposed) onErrorRef.current?.()
    })

    return () => {
      disposed = true
      setCesiumOk(false)
      resizeObs?.disconnect()
      if (onUi) root.querySelector('.earth-globe__nav')?.removeEventListener('click', onUi)
      handler?.destroy()
      pinARef.current = undefined
      pinBRef.current = undefined
      viewer?.destroy()
      viewerRef.current = undefined
    }
  }, [])

  useEffect(() => {
    const viewer = viewerRef.current
    const Cesium = CesiumRef.current
    if (!cesiumOk || !viewer || !Cesium) return

    const upsert = (
      slot: { current: import('cesium').Entity | undefined },
      coords: Coord | null,
      letra: string,
      cor: import('cesium').Color,
    ) => {
      if (slot.current) {
        viewer.entities.remove(slot.current)
        slot.current = undefined
      }
      if (!coords) return
      slot.current = viewer.entities.add({
        position: Cesium.Cartesian3.fromDegrees(coords.lng, coords.lat),
        point: {
          pixelSize: 16,
          color: cor,
          outlineColor: Cesium.Color.WHITE,
          outlineWidth: 3,
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
          heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
        },
        label: {
          text: letra,
          font: '700 14px system-ui,sans-serif',
          fillColor: Cesium.Color.WHITE,
          outlineColor: Cesium.Color.BLACK,
          outlineWidth: 4,
          style: Cesium.LabelStyle.FILL_AND_OUTLINE,
          pixelOffset: new Cesium.Cartesian2(0, -22),
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
          heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
        },
      })
    }

    upsert(
      pinARef,
      pontoA,
      'A',
      Cesium.Color.fromCssColorString('#15803d') ?? Cesium.Color.LIME,
    )
    upsert(
      pinBRef,
      pontoB,
      'B',
      Cesium.Color.fromCssColorString('#dc2626') ?? Cesium.Color.RED,
    )
  }, [cesiumOk, pontoA, pontoB])

  return (
    <div
      ref={rootRef}
      className={`earth-globe${pickMode ? ' earth-globe--pick' : ''}${cesiumOk ? '' : ' earth-globe--boot'}`}
      role="application"
      aria-label="Globo 3D com satélite. Role para entrar no mapa, arraste para orbitar, botão direito para inclinar. Use Ponto A e Ponto B para marcar origem e destino."
    >
      <div ref={cesiumRef} className="earth-globe__cesium" />
      <div className="earth-globe__nav" data-pdf-ignore>
        <button type="button" data-earth="in" title="Entrar no mapa" aria-label="Entrar no mapa">
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
        Role a roda do mouse para puxar o zoom · arraste para girar · + entra no mapa
      </p>
    </div>
  )
}
