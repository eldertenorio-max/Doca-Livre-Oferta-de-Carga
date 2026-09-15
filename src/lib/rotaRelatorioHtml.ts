import { LOGO_DOCA_LIVRE_SRC } from './brandAssets'
import { formatCurrency } from './businessRules'
import { TABELAS_ANTT } from './anttCoeficientes'
import {
  googleMapsDirUrl,
  rotuloPreferenciaRota,
  textoCompartilharRota,
  wazeRotaUrl,
  type RotaResultadoPayload,
} from './rotaResultadoAcoes'

const UF_NOME: Record<string, string> = {
  AC: 'Acre',
  AL: 'Alagoas',
  AP: 'Amapá',
  AM: 'Amazonas',
  BA: 'Bahia',
  CE: 'Ceará',
  DF: 'Distrito Federal',
  ES: 'Espírito Santo',
  GO: 'Goiás',
  MA: 'Maranhão',
  MT: 'Mato Grosso',
  MS: 'Mato Grosso do Sul',
  MG: 'Minas Gerais',
  PA: 'Pará',
  PB: 'Paraíba',
  PR: 'Paraná',
  PE: 'Pernambuco',
  PI: 'Piauí',
  RJ: 'Rio de Janeiro',
  RN: 'Rio Grande do Norte',
  RS: 'Rio Grande do Sul',
  RO: 'Rondônia',
  RR: 'Roraima',
  SC: 'Santa Catarina',
  SP: 'São Paulo',
  SE: 'Sergipe',
  TO: 'Tocantins',
}

function logoAbsoluto(): string {
  const src = LOGO_DOCA_LIVRE_SRC
  if (/^(data:|https?:|blob:)/i.test(src)) return src
  try {
    return new URL(src, window.location.href).href
  } catch {
    return src
  }
}

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function ufsEmTexto(s: string): string[] {
  const out: string[] = []
  const re = /(?:^|[\s,.;:/\\-])([A-Z]{2})(?=$|[\s,.;:/\\-])/g
  const t = s.toUpperCase()
  let m: RegExpExecArray | null
  while ((m = re.exec(t))) {
    if (UF_NOME[m[1]] && !out.includes(m[1])) out.push(m[1])
  }
  return out
}

function coletarEstados(p: RotaResultadoPayload): string[] {
  const ufs: string[] = []
  const add = (u?: string | null) => {
    const x = (u || '').trim().toUpperCase()
    if (UF_NOME[x] && !ufs.includes(x)) ufs.push(x)
  }
  for (const t of [p.origem, p.destino, ...(p.vias ?? []).map((v) => v.endereco)]) {
    ufsEmTexto(t || '').forEach(add)
  }
  for (const pr of p.calc.rota.pracas ?? []) add(pr.uf)
  return ufs
}

function rodovias(p: RotaResultadoPayload): string[] {
  const seen = new Set<string>()
  const lista: string[] = []
  for (const pr of [...(p.calc.rota.pracas ?? [])].sort(
    (a, b) => (a.ordem ?? a.km_ate ?? 0) - (b.ordem ?? b.km_ate ?? 0),
  )) {
    const nome = (pr.rodovia || '').trim()
    if (!nome) continue
    const k = nome.toUpperCase()
    if (seen.has(k)) continue
    seen.add(k)
    lista.push(nome)
  }
  return lista
}

function pontosMapa(p: RotaResultadoPayload) {
  const pts: Array<{ lat: number; lng: number; label: string; cor: string }> = []
  if (p.origemCoords && Number.isFinite(p.origemCoords.lat) && Number.isFinite(p.origemCoords.lng)) {
    pts.push({ ...p.origemCoords, label: 'A', cor: '#2563eb' })
  }
  ;(p.vias ?? []).forEach((v, i) => {
    if (v.lat != null && v.lng != null && Number.isFinite(v.lat) && Number.isFinite(v.lng)) {
      pts.push({ lat: v.lat, lng: v.lng, label: String(i + 1), cor: '#ea580c' })
    }
  })
  if (p.destinoCoords && Number.isFinite(p.destinoCoords.lat) && Number.isFinite(p.destinoCoords.lng)) {
    pts.push({ ...p.destinoCoords, label: 'B', cor: '#ef4444' })
  }
  for (const pr of p.calc.rota.pracas ?? []) {
    if (pr.lat != null && pr.lng != null && Number.isFinite(pr.lat) && Number.isFinite(pr.lng)) {
      pts.push({ lat: pr.lat, lng: pr.lng, label: 'P', cor: '#0f766e' })
    }
  }
  return pts
}

function bboxEmbed(p: RotaResultadoPayload): string | null {
  const pts = pontosMapa(p)
  if (pts.length < 1) return null
  let minLa = Math.min(...pts.map((x) => x.lat))
  let maxLa = Math.max(...pts.map((x) => x.lat))
  let minLo = Math.min(...pts.map((x) => x.lng))
  let maxLo = Math.max(...pts.map((x) => x.lng))
  const padLa = Math.max((maxLa - minLa) * 0.18, 0.08)
  const padLo = Math.max((maxLo - minLo) * 0.18, 0.08)
  minLa -= padLa
  maxLa += padLa
  minLo -= padLo
  maxLo += padLo
  return `${minLo},${minLa},${maxLo},${maxLa}`
}

function svgMapa(p: RotaResultadoPayload): string {
  const pts = pontosMapa(p)
  if (pts.length < 1) return ''
  const w = 760
  const h = 280
  const pad = 28
  const lats = pts.map((x) => x.lat)
  const lngs = pts.map((x) => x.lng)
  let minLa = Math.min(...lats)
  let maxLa = Math.max(...lats)
  let minLo = Math.min(...lngs)
  let maxLo = Math.max(...lngs)
  if (minLa === maxLa) {
    minLa -= 0.4
    maxLa += 0.4
  }
  if (minLo === maxLo) {
    minLo -= 0.4
    maxLo += 0.4
  }
  const dx = maxLo - minLo
  const dy = maxLa - minLa
  const xy = (lat: number, lng: number) => {
    const x = pad + ((lng - minLo) / dx) * (w - pad * 2)
    const y = pad + ((maxLa - lat) / dy) * (h - pad * 2)
    return `${x.toFixed(1)},${y.toFixed(1)}`
  }
  const paradas = pts.filter((pt) => pt.label !== 'P')
  const line = (paradas.length ? paradas : pts).map((pt) => xy(pt.lat, pt.lng)).join(' ')
  const marks = pts
    .map((pt) => {
      const [x, y] = xy(pt.lat, pt.lng).split(',')
      const r = pt.label === 'P' ? 5 : 9
      const fs = pt.label === 'P' ? 0 : 10
      const txt =
        fs === 0
          ? ''
          : `<text x="${x}" y="${Number(y) + 4}" text-anchor="middle" fill="#fff" font-size="${fs}" font-weight="800" font-family="Arial">${esc(pt.label)}</text>`
      return `<circle cx="${x}" cy="${y}" r="${r}" fill="${pt.cor}" stroke="#fff" stroke-width="2"/>${txt}`
    })
    .join('')
  return `<svg class="mapa-svg" viewBox="0 0 ${w} ${h}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Esquema da rota"><rect width="${w}" height="${h}" fill="#eef2f7"/><polyline fill="none" stroke="#1d4ed8" stroke-width="4" stroke-linecap="round" stroke-linejoin="round" points="${line}"/>${marks}</svg>`
}

function porKm(valor: number, km: number): string {
  if (!km || !Number.isFinite(km) || km <= 0) return '—'
  return `${formatCurrency(valor / km)}/km`
}

export function montarHtmlRelatorioRota(p: RotaResultadoPayload): string {
  const r = p.calc.rota
  const pracas = [...(r.pracas ?? [])].sort(
    (a, b) => (a.ordem ?? a.km_ate ?? 0) - (b.ordem ?? b.km_ate ?? 0),
  )
  const estados = coletarEstados(p)
  const rods = rodovias(p)
  const tabela = TABELAS_ANTT.find((t) => t.id === p.calc.tabela)?.label || p.calc.tabela
  const maps = googleMapsDirUrl(p)
  const waze = wazeRotaUrl(p)
  const svg = svgMapa(p)
  const bbox = bboxEmbed(p)
  const agora = new Date().toLocaleString('pt-BR')
  const vias = (p.vias ?? []).filter((v) => (v.endereco || '').trim())
  const km = Number(r.distancia_km) || 0
  const piso = p.calc.piso_selecionado
  const acimaPiso =
    piso != null && Number.isFinite(piso) ? r.custo_total - piso : null

  const estadosHtml =
    estados.length === 0
      ? `<p class="vazio">Não foi possível identificar os estados deste trecho. Eles aparecem quando origem, destino ou praças trazem a UF.</p>`
      : `<ul class="chips">${estados
          .map((uf) => {
            const doUf = pracas.filter((pr) => (pr.uf || '').toUpperCase() === uf)
            const total = doUf.reduce((s, pr) => s + (Number(pr.valor) || 0), 0)
            const extra =
              doUf.length > 0
                ? ` · ${doUf.length} praça${doUf.length === 1 ? '' : 's'} · ${formatCurrency(total)}`
                : ''
            return `<li><strong>${esc(uf)}</strong> ${esc(UF_NOME[uf])}${esc(extra)}</li>`
          })
          .join('')}</ul>`

  const viasHtml = vias
    .map(
      (v, i) =>
        `<div class="kv"><span>Passagem ${i + 1}</span><strong>${esc(v.endereco)}</strong></div>`,
    )
    .join('')

  const pisosHtml = (p.calc.pisos ?? [])
    .map((item) => {
      const on = item.id === p.calc.categoria_id
      const valor = item.valor == null ? '—' : formatCurrency(item.valor)
      return `<tr class="${on ? 'is-on' : ''}"><td>${esc(item.label)}</td><td>${esc(valor)}</td></tr>`
    })
    .join('')

  const pracasHtml =
    pracas.length === 0
      ? `<p class="vazio">Nenhuma praça de pedágio detectada nesta rota.</p>`
      : `<table><thead><tr><th>#</th><th>Praça</th><th>Rodovia</th><th>UF</th><th>Km</th><th>Tempo</th><th>Concessionária</th><th>Valor</th></tr></thead><tbody>${pracas
          .map((pr, i) => {
            const ordem = pr.ordem ?? i + 1
            const extra = pr.free_flow ? ' · Free Flow' : pr.tipo ? ` · ${esc(pr.tipo)}` : ''
            const min =
              pr.min_ate != null
                ? `${Math.round(pr.min_ate)} min`
                : '—'
            return `<tr><td>${ordem}</td><td>${esc(pr.nome)}${extra}</td><td>${esc(pr.rodovia || '—')}</td><td>${esc((pr.uf || '').toUpperCase() || '—')}</td><td>${pr.km_ate != null ? `${pr.km_ate.toLocaleString('pt-BR')} km` : '—'}</td><td>${esc(min)}</td><td>${esc(pr.concessionaria || '—')}</td><td>${esc(formatCurrency(pr.valor))}</td></tr>`
          })
          .join('')}</tbody><tfoot><tr><td colspan="7">Total (${pracas.length})</td><td>${esc(formatCurrency(r.pedagio))}</td></tr></tfoot></table>`

  const rotogramaItens: string[] = [
    `<li class="roto-cid"><span>A</span><div><b>Origem</b><strong>${esc(p.origem || '—')}</strong></div></li>`,
    ...vias.map(
      (v, i) =>
        `<li class="roto-cid"><span>${i + 1}</span><div><b>Passagem</b><strong>${esc(v.endereco)}</strong></div></li>`,
    ),
    ...pracas.map((pr, i) => {
      const rod = [pr.rodovia, (pr.uf || '').toUpperCase()].filter(Boolean).join('/')
      const km = pr.km_ate != null ? `${pr.km_ate.toLocaleString('pt-BR')} km` : ''
      const det = [rod || null, km || null].filter(Boolean).join(' · ')
      return `<li class="roto-via"><span>P${pr.ordem ?? i + 1}</span><div><b>${esc(det || 'Trecho')}</b><strong>${esc(pr.nome)}</strong></div></li>`
    }),
    `<li class="roto-cid"><span>B</span><div><b>Destino</b><strong>${esc(p.destino || '—')}</strong></div></li>`,
  ]
  const rotogramaRod = rods.length
    ? `<p class="sub">Rodovias no trecho</p><ul class="chips">${rods.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>`
    : ''

  const conces = Array.from(
    new Set(pracas.map((pr) => (pr.concessionaria || '').trim()).filter(Boolean)),
  )
  const concesHtml = conces.length
    ? `<ul class="chips">${conces.map((c) => `<li>${esc(c)}</li>`).join('')}</ul>`
    : `<p class="vazio">Nenhuma concessionária identificada nas praças.</p>`

  const litros =
    r.litros != null
      ? `${r.litros.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} L`
      : '—'
  const consumo = r.consumo_km_l != null ? `${r.consumo_km_l.toLocaleString('pt-BR')} km/l` : '—'
  const diesel = r.preco_diesel != null ? formatCurrency(r.preco_diesel) : '—'
  const osm = bbox
    ? `<iframe class="mapa-osm no-print" title="Mapa da rota" src="https://www.openstreetmap.org/export/embed.html?bbox=${encodeURIComponent(bbox)}&amp;layer=mapnik" loading="lazy"></iframe>`
    : ''

  return `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Relatório da rota — Oferta de Carga</title>
  <style>
    :root { color-scheme: light; }
    * { box-sizing: border-box; }
    body { margin: 0; font: 15px/1.45 system-ui, Segoe UI, sans-serif; color: #171717; background: #fff; }
    .faixa { height: 8px; background: #f9db00; }
    .hero { padding: 18px 22px 10px; background: #fff; }
    .hero img { height: 32px; }
    .hero h1 { margin: 10px 0 0; font-size: 22px; letter-spacing: -.03em; }
    .hero small { display: block; margin-top: 4px; color: #6e7076; font-size: 12px; }
    .bar { position: sticky; top: 0; z-index: 5; padding: 10px 18px 14px; background: #fff; border-bottom: 1px solid #e5e7eb; }
    .bar b { margin-right: 8px; color: #111; }
    .checks { display: flex; flex-wrap: wrap; gap: 6px 16px; align-items: center; }
    .checks label { display: inline-flex; gap: 6px; align-items: center; font-size: 13px; color: #111; cursor: pointer; user-select: none; }
    .checks input { width: 15px; height: 15px; accent-color: #111; }
    .atalhos { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 8px; }
    .atalhos button { border: 0; background: none; color: #334155; font: inherit; font-size: 12px; font-weight: 700; text-decoration: underline; cursor: pointer; padding: 0; }
    .acoes { display: flex; flex-direction: column; gap: 8px; margin-top: 12px; }
    .acoes button { width: 100%; min-height: 42px; border: 0; border-radius: 8px; background: #2f3540; color: #fff; font: inherit; font-weight: 800; cursor: pointer; }
    .acoes button.sec { background: #111; color: #f9db00; }
    .dica { margin: 8px 0 0; color: #64748b; font-size: 12px; }
    main { padding: 18px 22px 40px; max-width: 960px; }
    section { margin: 0 0 22px; padding: 0 0 8px; break-inside: avoid; }
    [hidden] { display: none !important; }
    h2 { margin: 0 0 10px; font-size: 18px; }
    .kpis { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin: 0 0 8px; }
    .kpi { padding: 10px 12px; border: 1px solid #e5e7eb; border-radius: 10px; background: #f8fafc; }
    .kpi span { display: block; color: #64748b; font-size: 11px; font-weight: 800; text-transform: uppercase; }
    .kpi strong { font-size: 16px; }
    .kv { display: grid; grid-template-columns: 160px 1fr; gap: 4px 12px; padding: 6px 0; border-bottom: 1px solid #f1f5f9; }
    .kv span { color: #64748b; font-size: 12px; font-weight: 800; text-transform: uppercase; }
    .grade { display: grid; grid-template-columns: 1fr 1fr; gap: 8px 18px; }
    table { width: 100%; border-collapse: collapse; font-size: 13px; }
    th, td { padding: 8px 6px; border-bottom: 1px solid #e5e7eb; text-align: left; }
    th { font-size: 11px; text-transform: uppercase; color: #64748b; }
    tfoot td { font-weight: 800; }
    tr.is-on td { background: #fffbeb; font-weight: 800; }
    .chips { display: flex; flex-wrap: wrap; gap: 8px; margin: 0; padding: 0; list-style: none; }
    .chips li { padding: 6px 10px; border-radius: 999px; background: #f1f5f9; font-size: 13px; }
    .rotograma { margin: 0; padding-left: 18px; }
    .roto { list-style: none; margin: 0; padding: 0; }
    .roto li { display: grid; grid-template-columns: 42px 1fr; gap: 10px; align-items: start; padding: 8px 0; border-bottom: 1px solid #f1f5f9; }
    .roto li span { display: grid; place-items: center; width: 36px; height: 36px; border-radius: 999px; background: #0f172a; color: #fff; font-size: 11px; font-weight: 800; }
    .roto li.roto-via span { background: #1d4ed8; }
    .roto li b { display: block; color: #64748b; font-size: 11px; text-transform: uppercase; }
    .roto li strong { font-size: 14px; }
    .vazio { color: #64748b; }
    .mapa-svg { width: 100%; height: auto; border-radius: 12px; border: 1px solid #e2e8f0; }
    .mapa-osm { width: 100%; height: 360px; border: 1px solid #e2e8f0; border-radius: 12px; margin-top: 10px; }
    .links a { display: inline-block; margin: 0 10px 8px 0; color: #1d4ed8; font-weight: 700; }
    .sub { margin: 12px 0 6px; font-size: 12px; font-weight: 800; text-transform: uppercase; color: #64748b; }
    footer { color: #64748b; font-size: 12px; }
    @media (max-width: 720px) {
      .kpis, .grade { grid-template-columns: 1fr 1fr; }
      .kv { grid-template-columns: 1fr; }
    }
    @media print {
      .no-print { display: none !important; }
      .faixa, .hero, .roto li span { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      a { color: inherit; text-decoration: none; }
      table { font-size: 11px; }
    }
  </style>
</head>
<body>
  <div class="faixa"></div>
  <header class="hero">
    <img src="${esc(logoAbsoluto())}" alt="Doca Livre" />
    <h1>Relatório da rota</h1>
    <small>Gerado em ${esc(agora)} · Oferta de Carga</small>
  </header>
  <div class="bar no-print">
    <div class="checks">
      <b>Mostrar:</b>
      <label><input type="checkbox" data-sec="estados" checked /> Estados</label>
      <label><input type="checkbox" data-sec="detalhes" checked /> Detalhes gerais</label>
      <label><input type="checkbox" data-sec="frete" checked /> Tabela frete</label>
      <label><input type="checkbox" data-sec="pracas" checked /> Praças</label>
      <label><input type="checkbox" data-sec="rotograma" checked /> Rotograma</label>
      <label><input type="checkbox" data-sec="combustivel" checked /> Combustível</label>
      <label><input type="checkbox" data-sec="vale" checked /> Vale-pedágio</label>
      <label><input type="checkbox" data-sec="conces" checked /> Concessionárias</label>
      <label><input type="checkbox" data-sec="custoskm" checked /> Custo por km</label>
      <label><input type="checkbox" data-sec="navegacao" checked /> Navegação</label>
      <label><input type="checkbox" data-sec="obs" checked /> Observações</label>
      <label><input type="checkbox" data-sec="imagem" /> Mostrar imagem da rota</label>
    </div>
    <div class="atalhos">
      <button type="button" id="btn-all">Marcar tudo</button>
      <button type="button" id="btn-essencial">Só o essencial</button>
      <button type="button" id="btn-none">Desmarcar tudo</button>
    </div>
    <div class="acoes">
      <button type="button" id="btn-print">Imprimir</button>
      <button type="button" class="sec" id="btn-pdf">Salvar PDF</button>
      <button type="button" id="btn-copy">Copiar resumo</button>
    </div>
    <p class="dica">Em Salvar PDF, escolha <strong>Destino: Salvar como PDF</strong> na janela de impressão. Só entra no arquivo o que estiver marcado.</p>
  </div>
  <main>
    <section id="sec-estados">
      <h2>Estados</h2>
      ${estadosHtml}
    </section>
    <section id="sec-detalhes">
      <h2>Detalhes gerais</h2>
      <div class="kpis">
        <div class="kpi"><span>Distância</span><strong>${esc(String(r.distancia_km))} km</strong></div>
        <div class="kpi"><span>Tempo</span><strong>${esc(r.duracao_label || '—')}</strong></div>
        <div class="kpi"><span>Custo total</span><strong>${esc(formatCurrency(r.custo_total))}</strong></div>
        <div class="kpi"><span>Praças</span><strong>${pracas.length}</strong></div>
      </div>
      <div class="kv"><span>Origem</span><strong>${esc(p.origem || '—')}</strong></div>
      ${viasHtml}
      <div class="kv"><span>Destino</span><strong>${esc(p.destino || '—')}</strong></div>
      <div class="grade" style="margin-top:12px">
        <div class="kv"><span>Veículo</span><strong>${esc(p.tipoVeiculo || '—')}</strong></div>
        <div class="kv"><span>Eixos</span><strong>${p.calc.eixos}${p.calc.eixos_utilizados !== p.calc.eixos ? ` · ANTT ${p.calc.eixos_utilizados}` : ''}</strong></div>
        <div class="kv"><span>Categoria</span><strong>${esc(p.calc.categoria_label || '—')}</strong></div>
        <div class="kv"><span>Trecho</span><strong>${p.idaEVolta ? 'Ida e volta' : 'Só ida'}</strong></div>
        <div class="kv"><span>Preferência</span><strong>${esc(rotuloPreferenciaRota(p.preferencia) || '—')}</strong></div>
        <div class="kv"><span>Tabela ANTT</span><strong>${esc(tabela)}</strong></div>
        <div class="kv"><span>Provedor</span><strong>${esc(r.provedor === 'antt_aberto' ? 'Pedágio ANTT aberto' : r.provedor || '—')}</strong></div>
        <div class="kv"><span>Free flow</span><strong>${r.free_flow ? 'Sim' : 'Não'}</strong></div>
      </div>
    </section>
    <section id="sec-frete">
      <h2>Tabela frete</h2>
      <div class="grade">
        <div class="kv"><span>Pedágio</span><strong>${esc(formatCurrency(r.pedagio))}</strong></div>
        <div class="kv"><span>Pedágio / eixo</span><strong>${esc(formatCurrency(r.pedagio_por_eixo))}</strong></div>
        <div class="kv"><span>Combustível</span><strong>${esc(formatCurrency(r.combustivel))}</strong></div>
        <div class="kv"><span>Custo total</span><strong>${esc(formatCurrency(r.custo_total))}</strong></div>
        <div class="kv"><span>Piso ANTT</span><strong>${piso != null ? esc(formatCurrency(piso)) : '—'}</strong></div>
        <div class="kv"><span>Custo × piso</span><strong>${acimaPiso == null ? '—' : acimaPiso >= 0 ? `+ ${esc(formatCurrency(acimaPiso))} acima` : `${esc(formatCurrency(Math.abs(acimaPiso)))} abaixo`}</strong></div>
      </div>
      ${pisosHtml ? `<p class="sub">Pisos da tabela</p><table><thead><tr><th>Categoria</th><th>Piso</th></tr></thead><tbody>${pisosHtml}</tbody></table>` : ''}
    </section>
    <section id="sec-combustivel">
      <h2>Combustível</h2>
      <div class="grade">
        <div class="kv"><span>Consumo</span><strong>${esc(consumo)}</strong></div>
        <div class="kv"><span>Preço diesel</span><strong>${esc(diesel)}</strong></div>
        <div class="kv"><span>Litros</span><strong>${esc(litros)}</strong></div>
        <div class="kv"><span>Custo</span><strong>${esc(formatCurrency(r.combustivel))}</strong></div>
      </div>
    </section>
    <section id="sec-pracas">
      <h2>Praças (${pracas.length})</h2>
      ${pracasHtml}
    </section>
    <section id="sec-rotograma">
      <h2>Rotograma</h2>
      <ol class="roto">${rotogramaItens.join('')}</ol>
      ${rotogramaRod}
    </section>
    <section id="sec-vale">
      <h2>Vale-pedágio</h2>
      <div class="kv"><span>Valor</span><strong>${esc(formatCurrency(r.vale_pedagio ?? r.pedagio))}</strong></div>
      <p class="vazio">Res. ANTT 6.024/2023 — em geral corresponde ao pedágio da rota, obrigatório no embarque.</p>
    </section>
    <section id="sec-conces">
      <h2>Concessionárias</h2>
      ${concesHtml}
    </section>
    <section id="sec-custoskm">
      <h2>Custo por km</h2>
      <div class="grade">
        <div class="kv"><span>Pedágio</span><strong>${esc(porKm(r.pedagio, km))}</strong></div>
        <div class="kv"><span>Combustível</span><strong>${esc(porKm(r.combustivel, km))}</strong></div>
        <div class="kv"><span>Custo total</span><strong>${esc(porKm(r.custo_total, km))}</strong></div>
        <div class="kv"><span>Piso ANTT</span><strong>${piso != null ? esc(porKm(piso, km)) : '—'}</strong></div>
      </div>
    </section>
    <section id="sec-navegacao">
      <h2>Navegação</h2>
      <div class="links">
        ${maps ? `<a href="${esc(maps)}" target="_blank" rel="noopener">Abrir no Google Maps</a>` : '<span class="vazio">Google Maps indisponível</span>'}
        ${waze ? `<a href="${esc(waze)}" target="_blank" rel="noopener">Abrir no Waze</a>` : ''}
      </div>
    </section>
    <section id="sec-obs">
      <h2>Observações</h2>
      <p>${esc(p.calc.fonte || 'Oferta de Carga')}</p>
      <p class="vazio">Valores de pedágio e piso ANTT são estimativos. Confira tarifas vigentes e a tabela oficial antes de fechar o frete.</p>
    </section>
    <section id="sec-imagem" hidden>
      <h2>Imagem da rota</h2>
      ${svg || '<p class="vazio">Marque origem e destino no mapa para desenhar o esquema do trecho.</p>'}
      ${osm}
      <p class="vazio">Azul = origem, laranja = passagens, vermelho = destino, verde = praças.</p>
    </section>
    <footer>
      Oferta de Carga · relatório gerado em ${esc(agora)}
    </footer>
  </main>
  <script>
    const COPY = ${JSON.stringify(textoCompartilharRota(p))};
    const ESSENCIAL = ['estados', 'detalhes', 'frete', 'pracas', 'rotograma'];
    function aplicar(el) {
      const sec = document.getElementById('sec-' + el.getAttribute('data-sec'));
      if (sec) sec.hidden = !el.checked;
    }
    document.querySelectorAll('[data-sec]').forEach((el) => {
      el.addEventListener('change', () => aplicar(el));
      aplicar(el);
    });
    function marcar(pred) {
      document.querySelectorAll('[data-sec]').forEach((el) => {
        el.checked = pred(el.getAttribute('data-sec'));
        aplicar(el);
      });
    }
    document.getElementById('btn-all')?.addEventListener('click', () => marcar(() => true));
    document.getElementById('btn-none')?.addEventListener('click', () => marcar(() => false));
    document.getElementById('btn-essencial')?.addEventListener('click', () => marcar((id) => ESSENCIAL.includes(id)));
    document.getElementById('btn-print')?.addEventListener('click', () => window.print());
    document.getElementById('btn-pdf')?.addEventListener('click', () => window.print());
    document.getElementById('btn-copy')?.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(COPY);
        const btn = document.getElementById('btn-copy');
        if (btn) { btn.textContent = 'Copiado'; setTimeout(() => { btn.textContent = 'Copiar resumo'; }, 1600); }
      } catch {}
    });
  </script>
</body>
</html>`
}

export function abrirRelatorioRota(p: RotaResultadoPayload) {
  return montarHtmlRelatorioRota(p)
}
