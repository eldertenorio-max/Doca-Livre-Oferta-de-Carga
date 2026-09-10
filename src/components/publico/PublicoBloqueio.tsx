import { LOGO_DOCA_LIVRE_SRC } from '../../lib/brandAssets'

export function PublicoBloqueio({ motivo }: { motivo: string }) {
  return (
    <main
      style={{
        minHeight: '100dvh',
        display: 'grid',
        placeItems: 'center',
        padding: 24,
        background: '#0b1220',
        color: '#e2e8f0',
        fontFamily: 'system-ui, sans-serif',
      }}
    >
      <div style={{ maxWidth: 420, textAlign: 'center' }}>
        <img
          src={LOGO_DOCA_LIVRE_SRC}
          alt="Doca Livre"
          style={{ width: 72, height: 72, objectFit: 'contain', marginBottom: 16 }}
        />
        <h1 style={{ fontSize: 22, margin: '0 0 8px' }}>Acesso bloqueado</h1>
        <p style={{ margin: 0, opacity: 0.85, lineHeight: 1.5 }}>{motivo}</p>
      </div>
    </main>
  )
}
