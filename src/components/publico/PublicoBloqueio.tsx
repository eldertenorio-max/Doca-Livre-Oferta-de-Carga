import { logoDocaLivre } from '../../lib/brandAssets'

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
        {/* Fundo escuro: versão com moldura e "LIVRE" em branco. */}
        <img
          src={logoDocaLivre('escuro')}
          alt="Doca Livre"
          style={{ width: 200, maxWidth: '70%', height: 'auto', marginBottom: 20 }}
        />
        <h1 style={{ fontSize: 22, margin: '0 0 8px' }}>Acesso bloqueado</h1>
        <p style={{ margin: 0, opacity: 0.85, lineHeight: 1.5 }}>{motivo}</p>
      </div>
    </main>
  )
}
