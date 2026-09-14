import { Component, type ErrorInfo, type ReactNode } from 'react'

type Props = { children: ReactNode }
type State = { erro: string | null }

export class AppErrorBoundary extends Component<Props, State> {
  state: State = { erro: null }

  static getDerivedStateFromError(error: unknown): State {
    const msg = error instanceof Error ? error.message : String(error || 'erro')
    return { erro: msg }
  }

  componentDidCatch(error: unknown, info: ErrorInfo) {
    console.error('[app]', error, info.componentStack)
  }

  render() {
    if (!this.state.erro) return this.props.children
    return (
      <main
        style={{
          minHeight: '100dvh',
          display: 'grid',
          placeItems: 'center',
          padding: 24,
          background: '#efe8dc',
          color: '#0f172a',
          fontFamily: 'system-ui, sans-serif',
          textAlign: 'center',
        }}
      >
        <div>
          <p style={{ margin: '0 0 8px', fontWeight: 800 }}>A calculadora não abriu.</p>
          <p style={{ margin: '0 0 16px', fontSize: 13, color: '#475569' }}>{this.state.erro}</p>
          <button
            type="button"
            onClick={() => location.reload()}
            style={{
              border: 0,
              borderRadius: 10,
              padding: '10px 14px',
              background: '#0f172a',
              color: '#fff',
              fontWeight: 800,
              cursor: 'pointer',
            }}
          >
            Tentar de novo
          </button>
        </div>
      </main>
    )
  }
}
