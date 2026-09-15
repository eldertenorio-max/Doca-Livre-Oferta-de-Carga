/** Payload PIX Copia e Cola (EMV / BR Code) com CRC-16. */

function tlv(id: string, value: string) {
  const v = value.slice(0, 99)
  return `${id}${String(v.length).padStart(2, '0')}${v}`
}

function crc16(payload: string) {
  let crc = 0xffff
  for (let i = 0; i < payload.length; i++) {
    crc ^= payload.charCodeAt(i) << 8
    for (let b = 0; b < 8; b++) {
      crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, '0')
}

export type PixBrCodeOpts = {
  chave: string
  nome: string
  cidade: string
  valor: number
  txid: string
}

export function pixChavePadrao() {
  return (import.meta.env.VITE_PIX_CHAVE as string | undefined)?.trim() || '553591368282'
}

export function pixNomePadrao() {
  return (import.meta.env.VITE_PIX_NOME as string | undefined)?.trim() || 'DOCA LIVRE'
}

export function pixCidadePadrao() {
  return (import.meta.env.VITE_PIX_CIDADE as string | undefined)?.trim() || 'POUSO ALEGRE'
}

export function gerarPixCopiaECola(opts: PixBrCodeOpts) {
  const chave = opts.chave.replace(/\s+/g, '')
  const nome = opts.nome
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .slice(0, 25)
  const cidade = opts.cidade
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .slice(0, 15)
  const valor = opts.valor.toFixed(2)
  const txid = opts.txid.replace(/[^A-Za-z0-9]/g, '').slice(0, 25) || '***'
  const merchant = tlv('00', 'BR.GOV.BCB.PIX') + tlv('01', chave)
  const extra = tlv('05', txid)
  const corpo =
    tlv('00', '01') +
    tlv('26', merchant) +
    tlv('52', '0000') +
    tlv('53', '986') +
    tlv('54', valor) +
    tlv('58', 'BR') +
    tlv('59', nome || 'DOCA LIVRE') +
    tlv('60', cidade || 'POUSO ALEGRE') +
    tlv('62', extra) +
    '6304'
  return corpo + crc16(corpo)
}

export function urlQrPix(payload: string) {
  return `https://api.qrserver.com/v1/create-qr-code/?size=220x220&margin=8&data=${encodeURIComponent(payload)}`
}
