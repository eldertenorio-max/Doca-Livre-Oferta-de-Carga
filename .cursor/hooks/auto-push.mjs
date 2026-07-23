/**
 * Ao terminar a resposta do agent: se houver mudanças locais, commit + push.
 * Lê JSON do stdin (evento stop) e devolve JSON vazio ou followup.
 */
import { execSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

function sh(cmd, opts = {}) {
  return execSync(cmd, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    ...opts,
  }).trim()
}

function out(obj) {
  process.stdout.write(JSON.stringify(obj))
}

try {
  // consome stdin (payload do hook)
  try {
    readFileSync(0, 'utf8')
  } catch {
    /* ignore */
  }

  const status = sh('git status --porcelain')
  if (!status) {
    out({})
    process.exit(0)
  }

  // não versionar secrets
  const lines = status.split(/\r?\n/).filter(Boolean)
  const hasCode = lines.some((l) => {
    const f = l.slice(3).trim().replace(/^"+|"+$/g, '')
    if (f === '.env' || f.startsWith('.env.')) return false
    if (f.includes('credentials') || f.endsWith('.pem')) return false
    return true
  })
  if (!hasCode) {
    out({})
    process.exit(0)
  }

  sh('git add -A')
  try {
    sh('git reset HEAD -- .env .env.local .env.production 2>nul || exit 0', {
      shell: true,
    })
  } catch {
    /* ok */
  }

  // se após filtrar não sobrou nada staged
  const staged = sh('git diff --cached --name-only')
  if (!staged) {
    out({})
    process.exit(0)
  }

  const summary = staged
    .split(/\r?\n/)
    .filter(Boolean)
    .slice(0, 4)
    .join(', ')
  const msg = `chore: sync automático (${summary})`.slice(0, 120)

  sh(
    `git -c user.name="Diego" -c user.email="diego@docalivre.com" commit -m ${JSON.stringify(msg)}`,
    { shell: true },
  )
  sh('git push origin HEAD', { shell: true })
  out({})
  process.exit(0)
} catch (err) {
  const message = err instanceof Error ? err.message : String(err)
  out({
    followup_message: `Falha ao subir automaticamente: ${message.slice(0, 300)}. Faça commit e push manualmente.`,
  })
  process.exit(0)
}
