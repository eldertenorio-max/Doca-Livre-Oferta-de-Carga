import { descritorDoRosto } from './verificacaoFacial'

const WASM =
  'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.32/wasm'
const MODELO =
  'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task'

type Landmark = { x: number; y: number }
type Blend = { categoryName?: string; score?: number }

type Detector = {
  detectForVideo: (
    video: HTMLVideoElement,
    timestamp: number,
  ) => {
    faceLandmarks?: Landmark[][]
    faceBlendshapes?: Array<{ categories?: Blend[] }>
  }
}

export type AnaliseRosto = {
  quantidade: number
  yaw: number
  centralizado: boolean
  olhosFechados: boolean
  olhosAbertos: boolean
  descritor: number[] | null
}

let modeloPromise: Promise<Detector> | null = null

async function criarDetector(delegate: 'GPU' | 'CPU'): Promise<Detector> {
  const vision = await import('@mediapipe/tasks-vision')
  const files = await vision.FilesetResolver.forVisionTasks(WASM)
  return vision.FaceLandmarker.createFromOptions(files, {
    baseOptions: {
      modelAssetPath: MODELO,
      delegate,
    },
    runningMode: 'VIDEO',
    numFaces: 2,
    outputFaceBlendshapes: true,
    outputFacialTransformationMatrixes: false,
  }) as Promise<Detector>
}

export function carregarDetectorFacial(): Promise<Detector> {
  if (!modeloPromise) {
    modeloPromise = criarDetector('GPU').catch(async () => {
      try {
        return await criarDetector('CPU')
      } catch (err) {
        modeloPromise = null
        throw err
      }
    })
  }
  return modeloPromise
}

function nota(blends: Blend[] | undefined, nome: string): number {
  const item = blends?.find((c) => c.categoryName === nome)
  return Number(item?.score ?? 0)
}

export function analisarFrame(detector: Detector, video: HTMLVideoElement): AnaliseRosto | null {
  if (video.readyState < 2 || video.videoWidth < 2) return null
  const res = detector.detectForVideo(video, performance.now())
  const rostos = res.faceLandmarks ?? []
  const lm = rostos[0]
  if (!lm) {
    return {
      quantidade: 0,
      yaw: 0,
      centralizado: false,
      olhosFechados: false,
      olhosAbertos: false,
      descritor: null,
    }
  }

  const left = lm[33]
  const right = lm[263]
  const nose = lm[1]
  const bochechaE = lm[234]
  const bochechaD = lm[454]
  const testa = lm[10]
  const queixo = lm[152]
  const iod = Math.abs((right?.x ?? 0) - (left?.x ?? 0)) || 0.001
  const yaw = ((nose?.x ?? 0) - (((left?.x ?? 0) + (right?.x ?? 0)) / 2)) / iod
  const cx = ((bochechaE?.x ?? 0) + (bochechaD?.x ?? 0)) / 2
  const cy = ((testa?.y ?? 0) + (queixo?.y ?? 0)) / 2
  const largura = Math.abs((bochechaD?.x ?? 0) - (bochechaE?.x ?? 0))
  const blends = res.faceBlendshapes?.[0]?.categories
  const blinkE = nota(blends, 'eyeBlinkLeft')
  const blinkD = nota(blends, 'eyeBlinkRight')

  const centralizado =
    rostos.length === 1 &&
    Math.abs(yaw) < 0.09 &&
    cx > 0.3 &&
    cx < 0.7 &&
    cy > 0.26 &&
    cy < 0.72 &&
    largura > 0.18 &&
    largura < 0.62

  return {
    quantidade: rostos.length,
    yaw,
    centralizado,
    olhosFechados: blinkE > 0.5 || blinkD > 0.5,
    olhosAbertos: blinkE < 0.22 && blinkD < 0.22,
    descritor: descritorDoRosto(lm),
  }
}

export function frameParaJpeg(video: HTMLVideoElement): string {
  const canvas = document.createElement('canvas')
  canvas.width = video.videoWidth
  canvas.height = video.videoHeight
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Não foi possível capturar a imagem.')
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
  return canvas.toDataURL('image/jpeg', 0.86)
}
