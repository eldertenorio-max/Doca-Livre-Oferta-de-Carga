import { useEffect, useRef, useState } from 'react'
import { LOGO_DOCA_LIVRE_SRC } from '../lib/brandAssets'
import { ProductMark } from './ProductMark'
import '../styles/splash.css'
import '../styles/shell.css'

const MIN_INTRO_MS = 2200

type Props = {
  onComplete: () => void
}

export function CompanySplash({ onComplete }: Props) {
  const [progress, setProgress] = useState(0)
  const [exiting, setExiting] = useState(false)
  const startRef = useRef(Date.now())
  const finishedRef = useRef(false)

  useEffect(() => {
    const tick = window.setInterval(() => {
      setProgress((prev) => {
        const elapsed = Date.now() - startRef.current
        if (elapsed >= MIN_INTRO_MS) return Math.min(100, prev + 6)
        return Math.min(95, prev + 2)
      })
    }, 60)
    return () => window.clearInterval(tick)
  }, [])

  useEffect(() => {
    if (finishedRef.current) return
    const elapsed = Date.now() - startRef.current
    if (progress >= 100 && elapsed >= MIN_INTRO_MS) {
      finishedRef.current = true
      const pause = window.setTimeout(() => setExiting(true), 350)
      return () => window.clearTimeout(pause)
    }
  }, [progress])

  useEffect(() => {
    if (!exiting) return
    const t = window.setTimeout(onComplete, 650)
    return () => window.clearTimeout(t)
  }, [exiting, onComplete])

  return (
    <div className={`intro-splash company-splash ${exiting ? 'intro-splash--exit' : ''}`} aria-busy="true">
      <div className="intro-content company-splash__content">
        <div className="company-splash__brand">
          <img
            src={LOGO_DOCA_LIVRE_SRC}
            alt=""
            className="intro-logo company-splash__logo"
          />
          <ProductMark size="lg" className="company-splash__mark" />
        </div>
        <div className="intro-progress-wrap">
          <div className="intro-progress-track">
            <div className="intro-progress-bar" style={{ width: `${progress}%` }} />
          </div>
          <span className="intro-progress-label">Carregando… {Math.round(progress)}%</span>
        </div>
      </div>
    </div>
  )
}
