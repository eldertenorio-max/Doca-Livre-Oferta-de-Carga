import { formatDateTime } from '../../lib/businessRules'
import './verificacaoFacial.css'

/** Foto da verificação facial, para o super ver no cadastro da transportadora. */
export function FotoFacialCadastro({
  fotoUrl,
  verificadoEm,
}: {
  fotoUrl?: string | null
  verificadoEm?: string | null
}) {
  if (!fotoUrl) {
    return (
      <div className="facial-cadastro">
        <div className="facial-cadastro__vazio">Sem foto</div>
        <div>
          <strong>Verificação facial</strong>
          <p>A transportadora ainda não fez a verificação do rosto.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="facial-cadastro">
      <img src={fotoUrl} alt="Foto da verificação facial do responsável" />
      <div>
        <strong>Verificação facial</strong>
        <p>
          Foto do responsável gravada no cadastro
          {verificadoEm ? ` em ${formatDateTime(verificadoEm)}` : ''}.
        </p>
        <a href={fotoUrl} target="_blank" rel="noopener noreferrer">
          Abrir foto
        </a>
      </div>
    </div>
  )
}
