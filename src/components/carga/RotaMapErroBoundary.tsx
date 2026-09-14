import { Component, type ErrorInfo, type ReactNode } from 'react'

type Props = { children: ReactNode }

/** Erro no mapa não pode derrubar a calculadora. */
export class RotaMapErroBoundary extends Component<Props, { ok: boolean }> {
  state = { ok: true }

  static getDerivedStateFromError() {
    return { ok: false }
  }

  componentDidCatch(error: unknown, info: ErrorInfo) {
    console.error('[mapa]', error, info.componentStack)
  }

  render() {
    if (!this.state.ok) {
      return (
        <div
          className="h-full min-h-[360px] w-full"
          style={{ background: '#dbe4ea' }}
          aria-hidden
        />
      )
    }
    return this.props.children
  }
}
