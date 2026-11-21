/**
 * Gera src/styles/padrao-wms.gerado.css: no tema claro do sistema (login e painel), os fundos e as bordas quase
 * pretos das telas internas viram o azul-marinho das ações do WMS Doca Livre (#1a237e; no "passar o mouse", #283593).
 *
 * O CSS do sistema usa cores fixas. Em vez de reescrever cada arquivo, este script lê as regras das telas internas,
 * troca só essas cores e escreve tudo com o seletor html.padrao-wms:not([data-tema="escuro"]) na frente. Assim:
 *  - os sites públicos (calculadora de rota, mapa da frota, mapa da logística) não mudam: não têm a classe padrao-wms;
 *  - o tema escuro não muda: continua vindo de tema-escuro.css e tema-escuro.gerado.css;
 *  - as abas de mapa dentro do sistema continuam iguais aos sites públicos: os arquivos delas não entram aqui.
 * Rode de novo sempre que mudar cores nos arquivos da lista:
 *
 *   node scripts/gerar-padrao-wms.mjs      (ou: npm run tema:padrao)
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import postcss from 'postcss'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const SAIDA = join(root, 'src/styles/padrao-wms.gerado.css')
const PREFIXO = 'html.padrao-wms:not([data-tema="escuro"])'

/** Só as telas internas. Mapas, calculadoras, login e abertura ficam de fora de propósito. */
const ARQUIVOS = [
  'src/styles/shell.css',
  'src/styles/cadastro.css',
  'src/styles/perfil.css',
  'src/styles/grid-cargas.css',
  'src/styles/kanban-board.css',
  'src/styles/ajuda-suporte.css',
  'src/styles/transportadoras-kanban.css',
  'src/styles/motorista-conquistas.css',
  'src/styles/action-flash.css',
]

/** Cor escura do sistema -> cor do padrão. */
const TROCAS = [
  [/#0f172a\b/gi, '#1a237e'],
  [/#111827\b/gi, '#1a237e'],
  [/#0a0a0a\b/gi, '#1a237e'],
  [/#000000\b/gi, '#1a237e'],
  [/#000(?![0-9a-f])/gi, '#1a237e'],
  [/#1e293b\b/gi, '#283593'],
  [/#1f2937\b/gi, '#283593'],
]
const PROPRIEDADES = /^(background|background-color|border|border-color|border-(top|right|bottom|left)(-color)?|outline|outline-color)$/
/** O menu e a barra usam variáveis (padrao-wms.css cuida deles); regras de tema ficam como estão. */
const PULAR = /\.sidebar\b|\[data-tema|\.tema-forcar-claro|^:root|^html\b|^body\b/

function trocar(valor) {
  let novo = valor
  for (const [de, para] of TROCAS) novo = novo.replace(de, para)
  return novo
}

function prefixar(seletor) {
  return postcss.list.comma(seletor).map((parte) => `${PREFIXO} ${parte}`).join(',\n')
}

let total = 0
const blocos = []
for (const arquivo of ARQUIVOS) {
  const css = readFileSync(join(root, arquivo), 'utf8')
  const saida = postcss.root()
  postcss.parse(css, { from: arquivo }).walkRules((regra) => {
    if (regra.parent?.type === 'atrule' && /keyframes/i.test(regra.parent.name)) return
    if (postcss.list.comma(regra.selector).some((parte) => PULAR.test(parte.trim()))) return
    const novas = []
    regra.each((no) => {
      if (no.type !== 'decl' || !PROPRIEDADES.test(no.prop)) return
      const valor = trocar(no.value)
      if (valor !== no.value) novas.push(postcss.decl({ prop: no.prop, value: valor, important: no.important }))
    })
    if (!novas.length) return
    const nova = postcss.rule({ selector: prefixar(regra.selector) })
    novas.forEach((d) => nova.append(d))
    total += novas.length
    // mantém o @media (ou @supports) em volta, quando houver
    let alvo = nova
    for (let pai = regra.parent; pai && pai.type === 'atrule'; pai = pai.parent) {
      const capa = postcss.atRule({ name: pai.name, params: pai.params })
      capa.append(alvo)
      alvo = capa
    }
    saida.append(alvo)
  })
  if (saida.nodes.length) blocos.push(`/* ${arquivo} */\n${saida.toString()}`)
}

const cabecalho = `/* GERADO por scripts/gerar-padrao-wms.mjs. Não edite à mão: rode o script de novo.
   Tema claro do sistema: fundos e bordas quase pretos das telas internas no azul-marinho do WMS Doca Livre. */
`
writeFileSync(SAIDA, (cabecalho + '\n' + blocos.join('\n\n') + '\n').replace(/\r?\n/g, '\r\n'))
console.log(`padrao-wms.gerado.css: ${total} cores trocadas em ${blocos.length} arquivo(s)`)
