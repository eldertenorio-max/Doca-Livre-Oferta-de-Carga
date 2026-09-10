import { Download, FileText, Music } from 'lucide-react'
import { formatarTamanhoArquivo, type MidiaFeed } from '../../lib/feedMidia'

function classeGaleria(n: number) {
  if (n <= 1) return 'feed__galeria--1'
  if (n === 2) return 'feed__galeria--2'
  if (n === 3) return 'feed__galeria--3'
  return 'feed__galeria--4'
}

function MidiaItem({ midia, compacto }: { midia: MidiaFeed; compacto?: boolean }) {
  if (midia.tipo === 'imagem') {
    return <img src={midia.url} alt={midia.nome} className="feed__midia-foto" />
  }
  if (midia.tipo === 'video') {
    return (
      <video className="feed__midia-video" src={midia.url} controls playsInline preload="metadata">
        Seu navegador não reproduz este vídeo.
      </video>
    )
  }
  if (midia.tipo === 'audio') {
    return (
      <div className="feed__arquivo">
        <Music size={18} />
        <div>
          <strong>{midia.nome}</strong>
          {midia.tamanho ? <span>{formatarTamanhoArquivo(midia.tamanho)}</span> : null}
        </div>
        <audio src={midia.url} controls preload="metadata" />
      </div>
    )
  }
  return (
    <a className={`feed__arquivo ${compacto ? 'feed__arquivo--compacto' : ''}`} href={midia.url} target="_blank" rel="noreferrer">
      <FileText size={18} />
      <div>
        <strong>{midia.nome}</strong>
        {midia.tamanho ? <span>{formatarTamanhoArquivo(midia.tamanho)}</span> : null}
      </div>
      <Download size={16} />
    </a>
  )
}

export function FeedGaleria({ midias }: { midias: MidiaFeed[] }) {
  if (!midias.length) return null
  const visuais = midias.filter((m) => m.tipo === 'imagem' || m.tipo === 'video')
  const outros = midias.filter((m) => m.tipo !== 'imagem' && m.tipo !== 'video')
  const extra = visuais.length > 4 ? visuais.length - 4 : 0
  const grade = visuais.slice(0, 4)

  return (
    <div className="feed__midias">
      {grade.length > 0 ? (
        <div className={`feed__galeria ${classeGaleria(grade.length)}`}>
          {grade.map((m, i) => (
            <div key={`${m.url}-${i}`} className="feed__galeria-item">
              <MidiaItem midia={m} />
              {extra > 0 && i === 3 ? <span className="feed__galeria-mais">+{extra}</span> : null}
            </div>
          ))}
        </div>
      ) : null}
      {outros.map((m, i) => (
        <MidiaItem key={`${m.url}-file-${i}`} midia={m} />
      ))}
    </div>
  )
}
