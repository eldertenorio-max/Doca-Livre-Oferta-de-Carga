import { useEffect, useRef, useState } from 'react'
import { analisarFrame, carregarDetectorFacial, frameParaJpeg, type AnaliseRosto } from '../../lib/faceLandmarker'
import { mesmoRosto, type FacialCaptura } from '../../lib/verificacaoFacial'
import './verificacaoFacial.css'

type Etapa = 'enquadrar' | 'piscar' | 'virar' | 'voltar'

const PASSOS: Array<{ id: Etapa; label: string }> = [
  { id: 'enquadrar', label: 'Enquadrar' },
  { id: 'piscar', label: 'Piscar' },
  { id: 'virar', label: 'Virar' },
  { id: 'voltar', label: 'Confirmar' },
]

const TEXTO: Record<Etapa, string> = {
  enquadrar: 'Enquadre o rosto no oval, em um lugar iluminado, sem óculos escuros.',
  piscar: 'Pisque os olhos uma vez.',
  virar: 'Vire o rosto devagar para um dos lados.',
  voltar: 'Olhe de novo para a frente e fique parado.',
}

type Props = {
  modo: 'cadastrar' | 'confirmar'
  referencia?: number[] | null
  onConcluido: (captura: FacialCaptura) => void
}

export function VerificacaoFacial({ modo, referencia, onConcluido }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const onConcluidoRef = useRef(onConcluido)
  const referenciaRef = useRef(referencia)
  const etapaRef = useRef<Etapa>('enquadrar')
  const estavelRef = useRef(0)
  const piscouRef = useRef(false)
  const virouRef = useRef(false)
  const ocupadoRef = useRef(false)

  const [etapa, setEtapa] = useState<Etapa>('enquadrar')
  const [erro, setErro] = useState('')
  const [preparando, setPreparando] = useState(true)
  const [centralizado, setCentralizado] = useState(false)
  const encerrouRef = useRef(false)

  onConcluidoRef.current = onConcluido
  referenciaRef.current = referencia

  useEffect(() => {
    const video = videoRef.current
    if (!video) return
    let parado = false
    let quadro = 0
    let stream: MediaStream | null = null

    function resetar() {
      etapaRef.current = 'enquadrar'
      estavelRef.current = 0
      piscouRef.current = false
      virouRef.current = false
      setEtapa('enquadrar')
      setCentralizado(false)
    }

    function avancar(proxima: Etapa) {
      etapaRef.current = proxima
      estavelRef.current = 0
      setEtapa(proxima)
    }

    function concluir(analise: AnaliseRosto) {
      if (ocupadoRef.current || !analise.descritor) return
      ocupadoRef.current = true
      const ref = referenciaRef.current
      if (modo === 'confirmar' && ref && ref.length > 0 && !mesmoRosto(analise.descritor, ref)) {
        ocupadoRef.current = false
        setErro('O rosto não confere com o cadastro. Tente de novo, de frente e com boa luz.')
        resetar()
        return
      }
      try {
        const imagemDataUrl = frameParaJpeg(video!)
        encerrouRef.current = true
        onConcluidoRef.current({ imagemDataUrl, descriptor: analise.descritor })
      } catch (err) {
        ocupadoRef.current = false
        setErro(err instanceof Error ? err.message : 'Não foi possível capturar a foto.')
        resetar()
      }
    }

    function tratar(analise: AnaliseRosto) {
      if (analise.quantidade > 1) {
        estavelRef.current = 0
        setCentralizado(false)
        setErro('Deixe apenas uma pessoa na frente da câmera.')
        return
      }
      setErro('')
      setCentralizado(analise.centralizado)
      const etapaAtual = etapaRef.current

      if (etapaAtual === 'enquadrar') {
        estavelRef.current = analise.centralizado ? estavelRef.current + 1 : 0
        if (estavelRef.current >= 10) avancar('piscar')
        return
      }

      if (etapaAtual === 'piscar') {
        if (analise.olhosFechados) piscouRef.current = true
        if (piscouRef.current && analise.olhosAbertos && analise.centralizado) {
          estavelRef.current += 1
        } else if (!piscouRef.current) {
          estavelRef.current = 0
        }
        if (estavelRef.current >= 4) avancar('virar')
        return
      }

      if (etapaAtual === 'virar') {
        if (Math.abs(analise.yaw) > 0.16) {
          virouRef.current = true
          estavelRef.current += 1
        }
        if (virouRef.current && estavelRef.current >= 5) avancar('voltar')
        return
      }

      estavelRef.current = analise.centralizado && analise.descritor ? estavelRef.current + 1 : 0
      if (estavelRef.current >= 8) concluir(analise)
    }

    async function loop() {
      if (parado) return
      const detector = await carregarDetectorFacial().catch((err: unknown) => {
        if (!parado) {
          setErro(
            err instanceof Error
              ? err.message
              : 'Não foi possível preparar a verificação facial.',
          )
          setPreparando(false)
        }
        return null
      })
      if (!detector || parado) return
      setPreparando(false)
      const tick = () => {
        if (parado || encerrouRef.current) return
        if (!ocupadoRef.current) {
          try {
            const analise = analisarFrame(detector, video)
            if (analise) tratar(analise)
          } catch {
            /* quadro inválido enquanto a câmera abre */
          }
        }
        quadro = window.requestAnimationFrame(tick)
      }
      quadro = window.requestAnimationFrame(tick)
    }

    async function abrir() {
      if (!navigator.mediaDevices?.getUserMedia) {
        setPreparando(false)
        setErro('Este navegador não abre a câmera. Use o Chrome ou o Edge no celular ou no computador.')
        return
      }
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 800 } },
        })
      } catch {
        setPreparando(false)
        setErro('Permita o uso da câmera para continuar. A verificação é feita ao vivo, como no banco.')
        return
      }
      if (parado) {
        stream.getTracks().forEach((t) => t.stop())
        return
      }
      video.srcObject = stream
      await video.play().catch(() => undefined)
      void loop()
    }

    void abrir()
    return () => {
      parado = true
      if (quadro) window.cancelAnimationFrame(quadro)
      stream?.getTracks().forEach((t) => t.stop())
      if (video) video.srcObject = null
    }
  }, [modo])

  return (
    <div className="facial-box">
      <p className="facial-box__titulo">
        {modo === 'cadastrar' ? 'Verificação facial' : 'Confirme que é você'}
      </p>
      <p className="facial-box__texto">
        {preparando ? 'Preparando a câmera…' : TEXTO[etapa]}
      </p>
      <div className="facial-passos" aria-hidden>
        {PASSOS.map((p) => (
          <span key={p.id} className={p.id === etapa ? 'is-on' : undefined}>
            {p.label}
          </span>
        ))}
      </div>
      <div className="facial-stage">
        <video ref={videoRef} playsInline muted autoPlay />
        <div className={centralizado ? 'facial-oval is-ok' : 'facial-oval'} />
      </div>
      {erro ? <p className="facial-erro">{erro}</p> : null}
    </div>
  )
}
