/**
 * Prepara os estilos das telas internas para o padrão visual do WMS Doca Livre.
 *
 * O CSS do sistema usa cores fixas. Os fundos e as bordas quase pretos das telas internas (botões de ação,
 * cabeçalho de tabela, abas ativas) passam a ser escritos assim:
 *
 *     background: var(--acao-fundo, #0f172a);
 *
 * A cor de sempre fica como reserva; quem define as variáveis é o src/styles/padrao-wms.css, só no tema claro e só
 * com a classe padrao-wms no <html> (sistema: login e painel). Com isso:
 *  - os sites públicos e o tema escuro continuam com a cor de sempre (a variável não existe lá);
 *  - nenhuma regra ganha peso novo: variações como "botão secundário" continuam valendo exatamente como antes;
 *  - as abas de mapa e as calculadoras dentro do sistema não mudam: os arquivos delas não entram na lista.
 *
 * Pode rodar de novo quando quiser (o que já está com a variável é pulado):
 *
 *   node scripts/aplicar-padrao-wms.mjs      (ou: npm run tema:padrao)
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import postcss from 'postcss'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

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

/** Cor quase preta -> qual variável entra no lugar (normal ou "passar o mouse"). */
const CORES = [
  [/#0f172a\b/gi, ''],
  [/#111827\b/gi, ''],
  [/#0a0a0a\b/gi, ''],
  [/#000000\b/gi, ''],
  [/#000(?![0-9a-f])/gi, ''],
  [/#1e293b\b/gi, '-hover'],
  [/#1f2937\b/gi, '-hover'],
]
const FUNDO = /^(background|background-color)$/
const BORDA = /^(border|border-color|border-(top|right|bottom|left)(-color)?|outline|outline-color)$/
/** O menu e a barra usam as variáveis deles; regras de tema ficam como estão. */
const PULAR = /\.sidebar\b|\[data-tema|\.tema-forcar-claro|^:root|^html\b|^body\b/
const FIM_DE_LINHA_WINDOWS = String.fromCharCode(13, 10)

let total = 0
for (const arquivo of ARQUIVOS) {
  const caminho = join(root, arquivo)
  const css = readFileSync(caminho, 'utf8')
  const arvore = postcss.parse(css, { from: arquivo })
  let mudou = 0
  arvore.walkDecls((decl) => {
    const tipo = FUNDO.test(decl.prop) ? 'fundo' : BORDA.test(decl.prop) ? 'borda' : null
    if (!tipo || decl.value.includes('var(--acao-')) return
    const regra = decl.parent
    if (regra?.type !== 'rule') return
    if (regra.parent?.type === 'atrule' && /keyframes/i.test(regra.parent.name)) return
    if (postcss.list.comma(regra.selector).some((parte) => PULAR.test(parte.trim()))) return
    let valor = decl.value
    for (const [cor, sufixo] of CORES) valor = valor.replace(cor, (achada) => `var(--acao-${tipo}${sufixo}, ${achada})`)
    if (valor !== decl.value) {
      decl.value = valor
      mudou += 1
    }
  })
  if (mudou) {
    // mantém o fim de linha que o arquivo já tinha
    const linhas = arvore.toString().split(/\r?\n/)
    writeFileSync(caminho, linhas.join(css.includes(FIM_DE_LINHA_WINDOWS) ? FIM_DE_LINHA_WINDOWS : '\n'))
    total += mudou
  }
  console.log(`${arquivo}: ${mudou} cor(es)`)
}
console.log(`total: ${total} cor(es) passaram a usar as variáveis --acao-*`)
