import sharp from 'sharp'
import { writeFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const publicDir = join(root, 'public')

const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96" viewBox="0 0 96 96">
  <g fill="none" stroke="#ffffff" stroke-width="7" stroke-linecap="round" transform="translate(18 18)">
    <path d="M0 0h24"/>
    <path d="M0 60h24"/>
    <path d="M0 0v28"/>
    <path d="M0 60v-28"/>
    <path d="M60 0H36"/>
    <path d="M60 60H36"/>
    <path d="M60 0v28"/>
    <path d="M60 60v-28"/>
  </g>
  <g fill="#ffffff" transform="translate(18 18)">
    <path d="M14 30h20" stroke="#ffffff" stroke-width="10" stroke-linecap="round"/>
    <path d="M12 30l14-12v24z"/>
    <path d="M46 30H26" stroke="#ffffff" stroke-width="10" stroke-linecap="round"/>
    <path d="M48 30L34 18v24z"/>
  </g>
</svg>`

writeFileSync(join(publicDir, 'badge.svg'), svg)

await sharp(Buffer.from(svg), { density: 384 })
  .resize(96, 96)
  .ensureAlpha()
  .png()
  .toFile(join(publicDir, 'badge-96.png'))

const { data, info } = await sharp(join(publicDir, 'badge-96.png'))
  .ensureAlpha()
  .raw()
  .toBuffer({ resolveWithObject: true })

let opaque = 0
let transparent = 0
let whiteish = 0
for (let i = 0; i < data.length; i += 4) {
  const a = data[i + 3]
  if (a < 16) transparent++
  else {
    opaque++
    if (data[i] > 200 && data[i + 1] > 200 && data[i + 2] > 200) whiteish++
  }
}
console.log({ w: info.width, h: info.height, opaque, transparent, whiteish })
