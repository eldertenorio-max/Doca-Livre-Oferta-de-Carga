import { LOGO_DOCA_LIVRE_SRC } from './brandAssets'
import { formatCurrency } from './businessRules'
import type { RotaResultadoPayload } from './rotaResultadoAcoes'
import { rotuloPreferenciaRota } from './rotaResultadoAcoes'

const COR_MARCA: [number, number, number] = [249, 219, 0]
const COR_PRETO: [number, number, number] = [10, 10, 10]
const COR_TEXTO: [number, number, number] = [24, 24, 24]
const COR_LABEL: [number, number, number] = [110, 112, 118]
const COR_LINHA: [number, number, number] = [228, 229, 233]

let logoPromise: Promise<{ dataUrl: string; width: number; height: number } | null> | null =
  null

function carregarLogo() {
  if (typeof window === 'undefined') return Promise.resolve(null)
  if (!logoPromise) {
    logoPromise = (async () => {
      try {
        const res = await fetch(LOGO_DOCA_LIVRE_SRC)
        const blob = await res.blob()
        const dataUrl = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader()
          reader.onload = () => resolve(String(reader.result))
          reader.onerror = () => reject(reader.error)
          reader.readAsDataURL(blob)
        })
        const dims = await new Promise<{ width: number; height: number }>((resolve, reject) => {
          const img = new Image()
          img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight })
          img.onerror = () => reject(new Error('logo'))
          img.src = dataUrl
        })
        return { dataUrl, width: dims.width || 1, height: dims.height || 1 }
      } catch {
        return null
      }
    })()
  }
  return logoPromise
}

function slugArquivo(s: string): string {
  const t = s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\w]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 36)
  return t || 'rota'
}

export async function gerarPdfRelatorioRota(p: RotaResultadoPayload): Promise<{
  blob: Blob
  filename: string
}> {
  const [{ jsPDF }, logo] = await Promise.all([import('jspdf'), carregarLogo()])
  const doc = new jsPDF({ unit: 'pt', format: 'a4' })
  const pageW = doc.internal.pageSize.getWidth()
  const marginX = 40
  let y = 36

  doc.setFillColor(...COR_MARCA)
  doc.rect(0, 0, pageW, 8, 'F')

  if (logo) {
    const h = 28
    const w = (logo.width / logo.height) * h
    doc.addImage(logo.dataUrl, 'PNG', marginX, y, w, h)
    y += h + 16
  } else {
    y += 8
  }

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(16)
  doc.setTextColor(...COR_PRETO)
  doc.text('Relatório da rota', marginX, y)
  y += 18
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.setTextColor(...COR_LABEL)
  doc.text(
    `Gerado em ${new Date().toLocaleString('pt-BR')} · Oferta de Carga`,
    marginX,
    y,
  )
  y += 20

  const maxW = pageW - marginX * 2
  const bloco = (label: string, valor: string) => {
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(8)
    doc.setTextColor(...COR_LABEL)
    doc.text(label.toUpperCase(), marginX, y)
    y += 12
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(11)
    doc.setTextColor(...COR_TEXTO)
    const linhas = doc.splitTextToSize(valor || '—', maxW) as string[]
    doc.text(linhas, marginX, y)
    y += linhas.length * 14 + 6
  }

  bloco('Origem', p.origem)
  ;(p.vias ?? []).forEach((v, i) => {
    if (v.endereco.trim()) bloco(`Passagem ${i + 1}`, v.endereco)
  })
  bloco('Destino', p.destino)

  const r = p.calc.rota
  const fatos: [string, string][] = [
    ['Veículo', p.tipoVeiculo || '—'],
    ['Eixos', `${p.calc.eixos}${p.calc.eixos_utilizados !== p.calc.eixos ? ` · ANTT ${p.calc.eixos_utilizados}` : ''}`],
    ['Categoria', p.calc.categoria_label || '—'],
    ['Trecho', p.idaEVolta ? 'Ida e volta' : 'Só ida'],
    ['Preferência', rotuloPreferenciaRota(p.preferencia) || '—'],
    ['Distância', `${r.distancia_km} km`],
    ['Tempo', r.duracao_label],
    ['Pedágio', formatCurrency(r.pedagio)],
    ['Pedágio / eixo', formatCurrency(r.pedagio_por_eixo)],
    ['Vale-pedágio', formatCurrency(r.vale_pedagio ?? r.pedagio)],
    ['Combustível', formatCurrency(r.combustivel)],
    ['Custo total', formatCurrency(r.custo_total)],
  ]
  if (p.calc.piso_selecionado != null) {
    fatos.push(['Piso ANTT', formatCurrency(p.calc.piso_selecionado)])
  }

  doc.setDrawColor(...COR_LINHA)
  doc.line(marginX, y, pageW - marginX, y)
  y += 16
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(12)
  doc.setTextColor(...COR_PRETO)
  doc.text('Custos', marginX, y)
  y += 14

  const col2 = marginX + 250
  fatos.forEach(([label, valor], i) => {
    const x = i % 2 === 0 ? marginX : col2
    if (i % 2 === 0 && y > 760) {
      doc.addPage()
      y = 48
    }
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(8)
    doc.setTextColor(...COR_LABEL)
    doc.text(label.toUpperCase(), x, y)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(11)
    doc.setTextColor(...COR_TEXTO)
    doc.text(valor, x, y + 13)
    if (i % 2 === 1) y += 32
  })
  if (fatos.length % 2 === 1) y += 32

  const pracas = (r.pracas ?? [])
    .slice()
    .sort((a, b) => (a.ordem ?? a.km_ate ?? 0) - (b.ordem ?? b.km_ate ?? 0))
  y += 8
  if (y > 720) {
    doc.addPage()
    y = 48
  }
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(12)
  doc.setTextColor(...COR_PRETO)
  doc.text(`Praças (${pracas.length})`, marginX, y)
  y += 16
  if (pracas.length === 0) {
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(10)
    doc.setTextColor(...COR_LABEL)
    doc.text('Nenhuma praça detectada nesta rota.', marginX, y)
    y += 16
  } else {
    pracas.forEach((pr, i) => {
      if (y > 770) {
        doc.addPage()
        y = 48
      }
      const ordem = pr.ordem ?? i + 1
      const extra = [
        pr.km_ate != null ? `${pr.km_ate.toLocaleString('pt-BR')} km` : null,
        pr.free_flow ? 'Free Flow' : null,
      ]
        .filter(Boolean)
        .join(' · ')
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(10)
      doc.setTextColor(...COR_TEXTO)
      const nome = doc.splitTextToSize(`${ordem}ª  ${pr.nome}${extra ? ` (${extra})` : ''}`, maxW - 80) as string[]
      doc.text(nome, marginX, y)
      doc.setFont('helvetica', 'bold')
      doc.text(formatCurrency(pr.valor), pageW - marginX, y, { align: 'right' })
      y += Math.max(16, nome.length * 13)
    })
  }

  y += 18
  if (y > 760) {
    doc.addPage()
    y = 48
  }
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8)
  doc.setTextColor(...COR_LABEL)
  const fonte = doc.splitTextToSize(p.calc.fonte || '', maxW) as string[]
  doc.text(fonte, marginX, y)

  const blob = doc.output('blob') as Blob
  const filename = `relatorio-rota-${slugArquivo(p.origem)}-${slugArquivo(p.destino)}.pdf`
  return { blob, filename }
}

export async function abrirRelatorioRota(p: RotaResultadoPayload) {
  const { blob, filename } = await gerarPdfRelatorioRota(p)
  const url = URL.createObjectURL(blob)
  const win = window.open(url, '_blank', 'noopener,noreferrer')
  if (!win) {
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    document.body.appendChild(a)
    a.click()
    a.remove()
  }
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000)
}
