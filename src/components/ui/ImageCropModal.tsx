import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { createPortal } from 'react-dom'
import { Button } from './Modal'

const CROP_SIZE = 260
const OUTPUT_SIZE = 480
const MAX_ZOOM = 3

type Offset = { x: number; y: number }

export type ImageCropShape = 'circle' | 'square'

type Props = {
  open: boolean
  /** Arquivo escolhido pelo usuário (imagem original, antes do recorte). */
  file: File | null
  onCancel: () => void
  /** Recebe o arquivo já recortado/redimensionado (JPEG). */
  onConfirm: (file: File) => void
  busy?: boolean
  title?: string
  /** Perfil: círculo. Fotos de veículo: quadrado. */
  shape?: ImageCropShape
}

/** Modal de recorte com zoom e arraste — sem dependências externas. */
export function ImageCropModal({
  open,
  file,
  onCancel,
  onConfirm,
  busy = false,
  title = 'Ajustar foto',
  shape = 'circle',
}: Props) {
  const [imgSrc, setImgSrc] = useState<string | null>(null)
  const [natural, setNatural] = useState({ w: 0, h: 0 })
  const [zoom, setZoom] = useState(1)
  const [offset, setOffset] = useState<Offset>({ x: 0, y: 0 })
  const dragRef = useRef<{ startX: number; startY: number; offX: number; offY: number } | null>(
    null,
  )
  const imgRef = useRef<HTMLImageElement>(null)

  useEffect(() => {
    if (!file) {
      setImgSrc(null)
      setNatural({ w: 0, h: 0 })
      return
    }
    const url = URL.createObjectURL(file)
    setImgSrc(url)
    setZoom(1)
    setOffset({ x: 0, y: 0 })
    return () => URL.revokeObjectURL(url)
  }, [file])

  const baseScale = natural.w > 0 ? Math.max(CROP_SIZE / natural.w, CROP_SIZE / natural.h) : 1
  const scale = baseScale * zoom
  const dispW = natural.w * scale
  const dispH = natural.h * scale

  function clamp(o: Offset): Offset {
    const minX = Math.min(0, CROP_SIZE - dispW)
    const minY = Math.min(0, CROP_SIZE - dispH)
    return {
      x: Math.max(minX, Math.min(0, o.x)),
      y: Math.max(minY, Math.min(0, o.y)),
    }
  }

  function onImgLoad() {
    const img = imgRef.current
    if (!img) return
    const w = img.naturalWidth
    const h = img.naturalHeight
    const base = Math.max(CROP_SIZE / w, CROP_SIZE / h)
    setNatural({ w, h })
    setOffset({ x: (CROP_SIZE - w * base) / 2, y: (CROP_SIZE - h * base) / 2 })
  }

  useEffect(() => {
    setOffset((o) => clamp(o))
    // eslint-disable-next-line react-hooks/exhaustive-deps -- só reclampar ao mudar zoom/imagem
  }, [zoom, natural.w, natural.h])

  function onPointerDown(e: ReactPointerEvent<HTMLDivElement>) {
    e.currentTarget.setPointerCapture(e.pointerId)
    dragRef.current = { startX: e.clientX, startY: e.clientY, offX: offset.x, offY: offset.y }
  }

  function onPointerMove(e: ReactPointerEvent<HTMLDivElement>) {
    if (!dragRef.current) return
    const dx = e.clientX - dragRef.current.startX
    const dy = e.clientY - dragRef.current.startY
    setOffset(clamp({ x: dragRef.current.offX + dx, y: dragRef.current.offY + dy }))
  }

  function onPointerUp() {
    dragRef.current = null
  }

  function handleConfirm() {
    const img = imgRef.current
    if (!img) return
    const w = natural.w || img.naturalWidth
    const h = natural.h || img.naturalHeight
    if (w === 0 || h === 0) return
    const base = Math.max(CROP_SIZE / w, CROP_SIZE / h)
    const sc = base * zoom
    const canvas = document.createElement('canvas')
    canvas.width = OUTPUT_SIZE
    canvas.height = OUTPUT_SIZE
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    // Se natural ainda não atualizou no state, usa offset centralizado
    const ox = natural.w > 0 ? offset.x : (CROP_SIZE - w * base) / 2
    const oy = natural.h > 0 ? offset.y : (CROP_SIZE - h * base) / 2
    const sx = -ox / sc
    const sy = -oy / sc
    const sw = CROP_SIZE / sc
    const sh = CROP_SIZE / sc
    ctx.drawImage(img, sx, sy, sw, sh, 0, 0, OUTPUT_SIZE, OUTPUT_SIZE)
    canvas.toBlob(
      (blob) => {
        if (!blob) return
        const baseName = (file?.name || 'foto').replace(/\.[^.]+$/, '')
        onConfirm(new File([blob], `${baseName}.jpg`, { type: 'image/jpeg' }))
      },
      'image/jpeg',
      0.92,
    )
  }

  if (!open) return null
  if (typeof document === 'undefined') return null

  const frameRadius = shape === 'circle' ? '9999px' : '12px'

  // Portal no body: formulários longos com transform/overflow (animate-fade-up)
  // faziam o fixed prender no meio da página — só o escurecimento ficava visível.
  return createPortal(
    <div
      className="image-crop-modal fixed inset-0 flex items-center justify-center p-4"
      style={{ zIndex: 200000 }}
    >
      <div
        role="presentation"
        aria-hidden
        className="absolute inset-0 bg-ink-deep/60 backdrop-blur-[2px]"
        onClick={busy ? undefined : onCancel}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="relative z-10 w-full max-w-xs rounded-xl border border-ink/10 bg-white p-4 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <h3 className="mb-3 text-center text-base font-extrabold text-black">{title}</h3>

        <div
          className="relative mx-auto touch-none select-none overflow-hidden bg-ink/10 ring-2 ring-inset ring-white"
          style={{
            width: CROP_SIZE,
            height: CROP_SIZE,
            borderRadius: frameRadius,
            cursor: dragRef.current ? 'grabbing' : 'grab',
          }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerLeave={onPointerUp}
        >
          {imgSrc && (
            <img
              ref={imgRef}
              src={imgSrc}
              alt=""
              onLoad={onImgLoad}
              draggable={false}
              style={{
                position: 'absolute',
                left: offset.x,
                top: offset.y,
                width: dispW || undefined,
                height: dispH || undefined,
                maxWidth: 'none',
                opacity: natural.w > 0 ? 1 : 0.3,
                pointerEvents: 'none',
              }}
            />
          )}
          {imgSrc && natural.w === 0 ? (
            <p
              className="pointer-events-none absolute inset-0 flex items-center justify-center text-xs font-semibold text-ink-muted"
            >
              Carregando…
            </p>
          ) : null}
        </div>

        <p className="mt-2 text-center text-[11px] font-semibold text-ink-muted">
          Arraste para posicionar. Use o controle abaixo para dar zoom.
        </p>

        <label className="mt-3 flex items-center gap-2 text-xs font-bold text-black">
          Zoom
          <input
            type="range"
            min={1}
            max={MAX_ZOOM}
            step={0.01}
            value={zoom}
            disabled={!imgSrc || natural.w === 0}
            onChange={(e) => setZoom(Number(e.target.value))}
            className="flex-1 accent-brand"
          />
        </label>

        <div className="mt-4 flex gap-2">
          <Button
            type="button"
            variant="ghost"
            className="flex-1 !border !border-ink/20 !bg-white"
            onClick={onCancel}
            disabled={busy}
          >
            Cancelar
          </Button>
          <Button
            type="button"
            variant="success"
            className="flex-1"
            onClick={handleConfirm}
            disabled={busy || !imgSrc || natural.w === 0}
          >
            {busy ? 'Salvando…' : 'Usar esta foto'}
          </Button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
