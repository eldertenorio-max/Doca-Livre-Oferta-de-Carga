import { ManagedIdentityCredential } from '@azure/identity'
import { BlobServiceClient } from '@azure/storage-blob'

const baldes = new Set(['documentos-transportadores', 'veiculos-fotos', 'feed-midias'])
const conta = process.env.BLOB_ACCOUNT || 'stofertacargaprod'

let servico

function blobs() {
  if (!servico) {
    const credencial = new ManagedIdentityCredential(process.env.AZURE_CLIENT_ID)
    servico = new BlobServiceClient(`https://${conta}.blob.core.windows.net`, credencial)
  }
  return servico
}

function caminhoSeguro(path) {
  const limpo = decodeURIComponent(path || '').replace(/^\/+/, '')
  if (!limpo || limpo.includes('..')) return ''
  return limpo
}

function lerCorpo(req) {
  return new Promise((resolve, reject) => {
    const partes = []
    req.on('data', (parte) => partes.push(parte))
    req.on('end', () => {
      try {
        resolve(JSON.parse(Buffer.concat(partes).toString('utf8') || '{}'))
      } catch (erro) {
        reject(erro)
      }
    })
    req.on('error', reject)
  })
}

export async function atenderArquivo(req, res, caminho) {
  const publico = caminho.match(/^\/storage\/v1\/object\/public\/([^/]+)\/(.+)$/)
  if (publico && req.method === 'GET') {
    const bucket = publico[1]
    const path = caminhoSeguro(publico[2])
    if (!baldes.has(bucket) || !path) {
      res.writeHead(404)
      res.end()
      return
    }
    res.writeHead(302, { location: `https://${conta}.blob.core.windows.net/${bucket}/${path}` })
    res.end()
    return
  }

  const lista = caminho.match(/^\/storage\/v1\/object\/list\/([^/]+)$/)
  if (lista && req.method === 'POST') {
    const bucket = lista[1]
    if (!baldes.has(bucket)) {
      res.writeHead(404)
      res.end()
      return
    }
    const corpo = await lerCorpo(req)
    const prefixo = String(corpo.prefix || '')
    const nomes = []
    for await (const item of blobs().getContainerClient(bucket).listBlobsFlat({ prefix: prefixo })) {
      nomes.push({ name: item.name })
      if (nomes.length >= 1000) break
    }
    res.writeHead(200, { 'content-type': 'application/json' })
    res.end(JSON.stringify(nomes))
    return
  }

  const objeto = caminho.match(/^\/storage\/v1\/object\/([^/]+)(?:\/(.*))?$/)
  if (!objeto) {
    res.writeHead(404)
    res.end()
    return
  }
  const bucket = objeto[1]
  if (!baldes.has(bucket)) {
    res.writeHead(404)
    res.end()
    return
  }

  if (req.method === 'DELETE' && !objeto[2]) {
    const corpo = await lerCorpo(req)
    const prefixes = Array.isArray(corpo.prefixes) ? corpo.prefixes : []
    const container = blobs().getContainerClient(bucket)
    for (const prefixo of prefixes) {
      const path = caminhoSeguro(String(prefixo))
      if (path) await container.getBlockBlobClient(path).deleteIfExists()
    }
    res.writeHead(200, { 'content-type': 'application/json' })
    res.end(JSON.stringify(prefixes))
    return
  }

  const path = caminhoSeguro(objeto[2] || '')
  if (!path) {
    res.writeHead(400)
    res.end()
    return
  }

  if (req.method === 'GET') {
    res.writeHead(302, { location: `https://${conta}.blob.core.windows.net/${bucket}/${path}` })
    res.end()
    return
  }

  if (req.method === 'POST' || req.method === 'PUT') {
    const tipo = String(req.headers['content-type'] || 'application/octet-stream')
    await blobs()
      .getContainerClient(bucket)
      .getBlockBlobClient(path)
      .uploadStream(req, 4 * 1024 * 1024, 2, {
        blobHTTPHeaders: { blobContentType: tipo },
      })
    res.writeHead(200, { 'content-type': 'application/json' })
    res.end(JSON.stringify({ Key: `${bucket}/${path}` }))
    return
  }

  res.writeHead(404)
  res.end()
}
