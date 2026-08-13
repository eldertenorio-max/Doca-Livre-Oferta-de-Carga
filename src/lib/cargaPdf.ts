import { jsPDF } from 'jspdf'
import { formatCnpj } from './cnpj'
import { formatPhoneBr } from './phoneBr'
import type { PontoPassagemRota } from '../types'

export type CargaPdfData = {
  numero: string
  pedido?: string
  origem: string
  destino: string
  pontosPassagem?: PontoPassagemRota[]
  classificacao?: string
  tipoCarga?: string
  veiculo?: string
  carrocerias?: string[]
  complemento?: string
  gerenciamentoRisco?: string
  cargaRetorno?: boolean
  retornaOrigem?: boolean
  remetente?: string
  remetenteCnpj?: string
  destinatario?: string
  destinatarioCnpj?: string
  destinatarioWhatsapp?: string | null
  destinatarioEmail?: string | null
  peso?: number
  volumes?: number
  numEntregas?: number
  valorMercadorias?: number
  freteTabela?: number
  dataCarregamentoIso?: string
  previsaoEntregaIso?: string
  observacao?: string
}

function moeda(v?: number | null): string {
  if (v == null || !Number.isFinite(v) || v <= 0) return '—'
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function numero(v?: number | null): string {
  if (v == null || !Number.isFinite(v)) return '—'
  return v.toLocaleString('pt-BR')
}

function dataBr(iso?: string): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleDateString('pt-BR')
}

/** Gera o PDF da carga em memória (client-side, sem backend). */
export function gerarPdfCarga(data: CargaPdfData): { blob: Blob; filename: string } {
  const doc = new jsPDF({ unit: 'pt', format: 'a4' })
  const pageW = doc.internal.pageSize.getWidth()
  const pageH = doc.internal.pageSize.getHeight()
  const marginX = 40
  let y = 46

  function ensureSpace(h: number) {
    if (y + h > pageH - 40) {
      doc.addPage()
      y = 46
    }
  }

  function titulo(txt: string) {
    ensureSpace(26)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(12)
    doc.setTextColor(20, 30, 40)
    doc.text(txt.toUpperCase(), marginX, y)
    y += 6
    doc.setDrawColor(200, 120, 60)
    doc.setLineWidth(1.2)
    doc.line(marginX, y, pageW - marginX, y)
    y += 16
  }

  function linha(label: string, valor: string) {
    ensureSpace(16)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(9.5)
    doc.setTextColor(90, 90, 90)
    doc.text(label.toUpperCase(), marginX, y)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(10.5)
    doc.setTextColor(20, 20, 20)
    const maxW = pageW - marginX * 2 - 150
    const linhas = doc.splitTextToSize(valor || '—', maxW)
    doc.text(linhas, marginX + 150, y)
    y += Math.max(14, linhas.length * 12)
  }

  function linhasDuplas(a: [string, string], b: [string, string]) {
    ensureSpace(16)
    const half = (pageW - marginX * 2) / 2
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(9.5)
    doc.setTextColor(90, 90, 90)
    doc.text(a[0].toUpperCase(), marginX, y)
    doc.text(b[0].toUpperCase(), marginX + half, y)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(10.5)
    doc.setTextColor(20, 20, 20)
    doc.text(a[1] || '—', marginX, y + 13)
    doc.text(b[1] || '—', marginX + half, y + 13)
    y += 28
  }

  // Cabeçalho
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(17)
  doc.setTextColor(196, 92, 38)
  doc.text('DOCA LIVRE', marginX, y)
  doc.setFontSize(10)
  doc.setTextColor(90, 90, 90)
  doc.setFont('helvetica', 'normal')
  doc.text('Oferta de Carga', marginX + 108, y)
  y += 20
  doc.setDrawColor(230, 230, 230)
  doc.setLineWidth(0.6)
  doc.line(marginX, y, pageW - marginX, y)
  y += 22

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(15)
  doc.setTextColor(20, 20, 20)
  doc.text(`Carga ${data.numero || ''}`.trim(), marginX, y)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.setTextColor(120, 120, 120)
  doc.text(
    `Gerado em ${new Date().toLocaleDateString('pt-BR')} às ${new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`,
    pageW - marginX,
    y,
    { align: 'right' },
  )
  y += 24

  titulo('Rota')
  linha('Origem', data.origem || '—')
  linha('Destino', data.destino || '—')
  const vias = (data.pontosPassagem ?? []).filter((p) => (p.endereco || '').trim())
  if (vias.length > 0) {
    linha(
      vias.length === 1 ? 'Ponto de passagem' : 'Pontos de passagem',
      vias.map((p, i) => `${i + 1}) ${p.endereco}`).join('\n'),
    )
  }
  linhasDuplas(
    ['Retorna p/ origem', data.retornaOrigem ? 'Sim' : 'Não'],
    ['Carga retorno', data.cargaRetorno ? 'Sim' : 'Não'],
  )
  y += 4

  titulo('Veículo e carga')
  linhasDuplas(
    ['Classificação', data.classificacao ? `Rota ${data.classificacao}` : '—'],
    ['Veículo', data.veiculo || '—'],
  )
  linhasDuplas(
    ['Tipo de carga', data.tipoCarga || '—'],
    ['Carroceria', (data.carrocerias ?? []).join(', ') || '—'],
  )
  linhasDuplas(
    ['Complemento', data.complemento || '—'],
    ['Gerenc. de risco', data.gerenciamentoRisco || '—'],
  )
  linhasDuplas(['Peso (kg)', numero(data.peso)], ['Volumes', numero(data.volumes)])
  linhasDuplas(
    ['Nº de entregas', String(data.numEntregas ?? '—')],
    ['Valor mercadorias', moeda(data.valorMercadorias)],
  )
  y += 4

  titulo('Frete e prazos')
  linhasDuplas(['Frete tabela', moeda(data.freteTabela)], ['Data carregamento', dataBr(data.dataCarregamentoIso)])
  linhasDuplas(['Previsão de entrega', dataBr(data.previsaoEntregaIso)], ['', ''])
  y += 4

  titulo('Remetente e destinatário')
  linhasDuplas(
    ['Remetente', data.remetente || '—'],
    ['CNPJ remetente', data.remetenteCnpj ? formatCnpj(data.remetenteCnpj) : '—'],
  )
  linhasDuplas(
    ['Destinatário', data.destinatario || '—'],
    ['CNPJ destinatário', data.destinatarioCnpj ? formatCnpj(data.destinatarioCnpj) : '—'],
  )
  linhasDuplas(
    ['WhatsApp', data.destinatarioWhatsapp ? formatPhoneBr(data.destinatarioWhatsapp) : '—'],
    ['E-mail', data.destinatarioEmail?.trim() || '—'],
  )

  if (data.observacao?.trim()) {
    y += 4
    titulo('Observações')
    linha('', data.observacao.trim())
  }

  ensureSpace(30)
  y = pageH - 34
  doc.setDrawColor(230, 230, 230)
  doc.line(marginX, y, pageW - marginX, y)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8)
  doc.setTextColor(140, 140, 140)
  doc.text(
    'Documento informativo gerado pela plataforma Doca Livre Oferta de Carga.',
    marginX,
    y + 14,
  )

  const blob = doc.output('blob') as Blob
  const numLimpo = (data.numero || 'carga').replace(/[^\w-]+/g, '')
  const filename = `carga-${numLimpo || 'nova'}.pdf`
  return { blob, filename }
}

export function baixarPdfCarga(data: CargaPdfData) {
  const { blob, filename } = gerarPdfCarga(data)
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 4000)
}

export async function compartilharPdfCarga(
  data: CargaPdfData,
): Promise<{ ok: true; via: 'share' | 'download' } | { ok: false; erro: string }> {
  const { blob, filename } = gerarPdfCarga(data)
  const file = new File([blob], filename, { type: 'application/pdf' })
  const nav = navigator as Navigator & {
    canShare?: (data?: { files?: File[] }) => boolean
    share?: (data: ShareData & { files?: File[] }) => Promise<void>
  }
  if (nav.canShare && nav.share && nav.canShare({ files: [file] })) {
    try {
      await nav.share({
        files: [file],
        title: `Carga ${data.numero || ''}`.trim(),
        text: `Carga ${data.numero || ''}: ${data.origem} → ${data.destino}`,
      })
      return { ok: true, via: 'share' }
    } catch (e) {
      if (e instanceof Error && e.name === 'AbortError') {
        return { ok: false, erro: 'Compartilhamento cancelado.' }
      }
      // segue para o fallback de download
    }
  }
  baixarPdfCarga(data)
  return { ok: true, via: 'download' }
}
