/**
 * Captura erros de runtime para inspeção no Chrome (F12).
 * Ative com: localStorage.setItem('doca-debug-console','1') e recarregue
 * ou abra a URL com ?debugConsole=1
 *
 * Nota: falhas de rede de <img>/<link> (404 de favicon) NÃO passam por
 * window.onerror — evite URLs que 404 (ver empresaVisual).
 */

export type DocaConsoleEvent = {
  at: number
  tipo: 'error' | 'unhandledrejection' | 'console.error'
  mensagem: string
  fonte?: string
  stack?: string
}

const MAX = 80
const KEY = 'doca-debug-console'
const buf: DocaConsoleEvent[] = []
let instalado = false
let badgeEl: HTMLButtonElement | null = null
let painelEl: HTMLDivElement | null = null

function ativo(): boolean {
  try {
    if (typeof window === 'undefined') return false
    if (import.meta.env.DEV) return true
    if (new URLSearchParams(location.search).get('debugConsole') === '1') return true
    if (localStorage.getItem(KEY) === '1') return true
  } catch {
    /* ignore */
  }
  return false
}

function push(ev: DocaConsoleEvent) {
  buf.push(ev)
  if (buf.length > MAX) buf.shift()
  try {
    ;(window as unknown as { __DOCA_ERRORS__?: DocaConsoleEvent[] }).__DOCA_ERRORS__ = [...buf]
  } catch {
    /* ignore */
  }
  atualizarBadge()
}

function fmt(e: DocaConsoleEvent) {
  const t = new Date(e.at).toLocaleTimeString('pt-BR')
  return `[${t}] ${e.tipo}: ${e.mensagem}${e.fonte ? ` (${e.fonte})` : ''}`
}

function atualizarBadge() {
  if (!ativo() || !badgeEl) return
  badgeEl.textContent = buf.length ? `⚠ ${buf.length}` : '⚠ 0'
  badgeEl.style.display = 'flex'
  badgeEl.title = buf.length
    ? `${buf.length} erro(s) capturado(s). Clique para ver.`
    : 'Console guard ativo. Sem erros capturados.'
}

function montarUi() {
  if (typeof document === 'undefined' || badgeEl) return

  badgeEl = document.createElement('button')
  badgeEl.type = 'button'
  badgeEl.setAttribute('aria-label', 'Erros do console (debug)')
  Object.assign(badgeEl.style, {
    position: 'fixed',
    right: '12px',
    bottom: '12px',
    zIndex: '2147483000',
    border: '0',
    borderRadius: '999px',
    padding: '8px 12px',
    background: '#0f172a',
    color: '#f8fafc',
    font: '700 12px/1 system-ui,sans-serif',
    cursor: 'pointer',
    boxShadow: '0 8px 24px rgba(15,23,42,.35)',
    display: 'none',
  } as CSSStyleDeclaration)

  painelEl = document.createElement('div')
  Object.assign(painelEl.style, {
    position: 'fixed',
    right: '12px',
    bottom: '52px',
    zIndex: '2147483000',
    width: 'min(420px, calc(100vw - 24px))',
    maxHeight: '40vh',
    overflow: 'auto',
    background: '#0f172a',
    color: '#e2e8f0',
    borderRadius: '12px',
    padding: '12px',
    font: '12px/1.45 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
    boxShadow: '0 12px 40px rgba(15,23,42,.45)',
    display: 'none',
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-word',
  } as CSSStyleDeclaration)

  badgeEl.addEventListener('click', () => {
    if (!painelEl) return
    const aberto = painelEl.style.display === 'block'
    if (aberto) {
      painelEl.style.display = 'none'
      return
    }
    painelEl.textContent = buf.length
      ? buf.map(fmt).join('\n\n')
      : 'Nenhum erro de JS capturado.\n\nDica Chrome: F12 → Console → filtre por "error".\nIssues (aba) lista avisos de acessibilidade/rede.'
    painelEl.style.display = 'block'
  })

  document.documentElement.appendChild(badgeEl)
  document.documentElement.appendChild(painelEl)
  atualizarBadge()
}

function ruidoConhecido(msg: string): boolean {
  const m = msg.toLowerCase()
  return (
    m.includes('message channel closed') ||
    m.includes('non-precached-url') ||
    m.includes('resizeobserver loop') ||
    m.includes('script error')
  )
}

/** Instala captura. Seguro chamar várias vezes. */
export function instalarDevConsoleGuard() {
  if (typeof window === 'undefined' || instalado) return
  instalado = true

  ;(window as unknown as { __DOCA_ERRORS__?: DocaConsoleEvent[] }).__DOCA_ERRORS__ = buf
  ;(window as unknown as { __DOCA_CLEAR_ERRORS__?: () => void }).__DOCA_CLEAR_ERRORS__ = () => {
    buf.length = 0
    atualizarBadge()
    if (painelEl) painelEl.style.display = 'none'
  }

  window.addEventListener('error', (e) => {
    const mensagem = e.message || String(e.error || 'error')
    if (ruidoConhecido(mensagem)) return
    push({
      at: Date.now(),
      tipo: 'error',
      mensagem,
      fonte: e.filename ? `${e.filename}:${e.lineno}:${e.colno}` : undefined,
      stack: e.error instanceof Error ? e.error.stack : undefined,
    })
  })

  window.addEventListener('unhandledrejection', (e) => {
    const mensagem = e.reason instanceof Error ? e.reason.message : String(e.reason || '')
    if (ruidoConhecido(mensagem)) {
      e.preventDefault()
      return
    }
    push({
      at: Date.now(),
      tipo: 'unhandledrejection',
      mensagem,
      stack: e.reason instanceof Error ? e.reason.stack : undefined,
    })
  })

  if (ativo()) {
    const orig = console.error.bind(console)
    console.error = (...args: unknown[]) => {
      const mensagem = args
        .map((a) => (a instanceof Error ? a.message : typeof a === 'string' ? a : JSON.stringify(a)))
        .join(' ')
      if (!ruidoConhecido(mensagem)) {
        push({ at: Date.now(), tipo: 'console.error', mensagem })
      }
      orig(...args)
    }
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', montarUi)
    } else {
      montarUi()
    }
  }
}
