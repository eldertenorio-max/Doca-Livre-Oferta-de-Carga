import sharp from 'sharp'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const publicDir = join(root, 'public')
const svg = readFileSync(join(publicDir, 'favicon.svg'))

async function raster(size, out) {
  await sharp(svg, { density: Math.max(72, size * 2) })
    .resize(size, size)
    .png({ compressionLevel: 9 })
    .toFile(join(publicDir, out))
  console.log('ok', out, size)
}

await raster(16, 'favicon-16.png')
await raster(32, 'favicon-32.png')
await raster(48, 'favicon-48.png')
await raster(192, 'favicon.png')
await raster(192, 'icon-192.png')
await raster(192, 'apple-touch-icon.png')
await raster(512, 'icon-512.png')
console.log('favicons regenerados')
