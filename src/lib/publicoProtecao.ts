/** Proteção dos sites públicos (calculadora e mapa da frota). */

const SONDAS = [
  /(?:^|\/)\.env(?:\.|$)/i,
  /(?:^|\/)\.git(?:\/|$)/i,
  /(?:^|\/)\.htaccess/i,
  /(?:^|\/)\.svn(?:\/|$)/i,
  /\/wp-admin/i,
  /\/wp-login/i,
  /\/xmlrpc\.php/i,
  /\/phpmyadmin/i,
  /\/phpinfo/i,
  /\/vendor\/phpunit/i,
  /\/cgi-bin/i,
  /\/administrator\/index\.php/i,
  /\/(shell|eval|cmd|config)\.(php|asp|aspx|jsp)/i,
  /\.(php|asp|aspx|jsp|cgi)(?:\?|$)/i,
]

const INJECAO = [
  /<script/i,
  /javascript:/i,
  /on(error|load|mouseover)\s*=/i,
  /\bunion\b.+\bselect\b/i,
  /\bdrop\s+table\b/i,
  /\.\.\/\.\.\//,
  /%00/,
  /%3c%73%63%72%69%70%74/i,
]

const SCANNER_UA = [
  'sqlmap',
  'nikto',
  'nuclei',
  'wpscan',
  'masscan',
  'nmap',
  'zgrab',
  'dirbuster',
  'gobuster',
  'httpx',
  'acunetix',
  'nessus',
  'openvas',
  'burpsuite',
]

function textoUrl(): string {
  if (typeof window === 'undefined') return ''
  return `${window.location.pathname}${window.location.search}${window.location.hash}`
}

export function motivoBloqueioPublico(): string | null {
  if (typeof window === 'undefined') return null

  try {
    if (window.self !== window.top) {
      return 'Este site não abre dentro de outro site.'
    }
  } catch {
    return 'Este site não abre dentro de outro site.'
  }

  const url = textoUrl()
  if (SONDAS.some((re) => re.test(url))) {
    return 'Acesso bloqueado.'
  }
  if (INJECAO.some((re) => re.test(url))) {
    return 'Pedido inválido.'
  }

  const ua = (navigator.userAgent || '').toLowerCase()
  if (ua && SCANNER_UA.some((s) => ua.includes(s))) {
    return 'Acesso bloqueado.'
  }

  return null
}

const ritmo = { n: 0, t: 0 }

/** Evita rajada de chamadas (script / bot) no cliente. */
export function ritmoPublicoOk(max = 12, janelaMs = 20_000): boolean {
  const agora = Date.now()
  if (agora - ritmo.t > janelaMs) {
    ritmo.n = 1
    ritmo.t = agora
    return true
  }
  ritmo.n += 1
  return ritmo.n <= max
}
