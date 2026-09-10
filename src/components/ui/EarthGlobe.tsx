import { useEffect, useRef } from 'react'
import '../../styles/earth-globe.css'

type CesiumNS = typeof import('cesium')

function cesiumFromPage(): CesiumNS {
  const w = window as Window & { Cesium?: CesiumNS; CESIUM_BASE_URL?: string }
  if (!w.CESIUM_BASE_URL) {
    w.CESIUM_BASE_URL = `${import.meta.env.BASE_URL}cesium/`
  }
  if (!w.Cesium) {
    throw new Error('CesiumJS não carregou')
  }
  return w.Cesium
}

export function EarthGlobe() {
  const rootRef = useRef<HTMLDivElement>(null)
  const cesiumRef = useRef<HTMLDivElement>(null)

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
      const Cesium = cesiumFromPage()
      if (disposed || !host) return

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

      try {
        viewer.terrainProvider = await Cesium.ArcGISTiledElevationTerrainProvider.fromUrl(
          'https://elevation3d.arcgis.com/arcgis/rest/services/WorldElevation3D/Terrain3D/ImageServer',
        )
      } catch {
        /* relevo 3D da Esri às vezes pede token; o satélite continua carregando ao zoom */
      }
      if (disposed) {
        viewer.destroy()
        return
      }

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

      const visaoEspaco = () => {
        viewer!.camera.flyTo({
          destination: Cesium.Cartesian3.fromDegrees(-47.9, -12.5, 1.85e7),
          orientation: {
            heading: Cesium.Math.toRadians(18),
            pitch: Cesium.Math.toRadians(-38),
            roll: 0,
          },
          duration: reduced ? 0 : 1.4,
        })
      }

      visaoEspaco()

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

      handler = new Cesium.ScreenSpaceEventHandler(scene.canvas)
      handler.setInputAction((click: { position: import('cesium').Cartesian2 }) => {
        const ray = viewer!.camera.getPickRay(click.position)
        const hit =
          (ray && scene.globe.pick(ray, scene)) ||
          viewer!.camera.pickEllipsoid(click.position, scene.globe.ellipsoid)
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
        if (act === 'home') visaoEspaco()
      }
      root.querySelector('.earth-globe__nav')?.addEventListener('click', onUi)

      const applySize = () => viewer?.resize()
      applySize()
      resizeObs = new ResizeObserver(applySize)
      resizeObs.observe(host)
    })().catch(() => {
      /* globo fica no fundo escuro se o Cesium falhar */
    })

    return () => {
      disposed = true
      resizeObs?.disconnect()
      if (onUi) root.querySelector('.earth-globe__nav')?.removeEventListener('click', onUi)
      handler?.destroy()
      viewer?.destroy()
    }
  }, [])

  return (
    <div
      ref={rootRef}
      className="earth-globe"
      role="application"
      aria-label="Globo 3D com satélite. Role para entrar no mapa, arraste para orbitar, botão direito para inclinar, clique duplo para aproximar o ponto."
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
        Role para entrar no mapa · arraste para girar · botão direito inclina · clique duplo no ponto
      </p>
    </div>
  )
}
