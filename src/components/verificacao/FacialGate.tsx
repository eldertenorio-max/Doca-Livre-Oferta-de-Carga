import { useState } from 'react'
import { useData } from '../../context/DataContext'
import { deveCobrarVerificacaoFacial, descritorValido, type FacialCaptura } from '../../lib/verificacaoFacial'
import { VerificacaoFacial } from './VerificacaoFacial'
import './verificacaoFacial.css'

/** Cobra a verificação de tempos em tempos só na conta do transportador. */
export function FacialGate() {
  const { user, logout, transportadores, concluirVerificacaoFacial } = useData()
  const [erro, setErro] = useState('')
  const [busy, setBusy] = useState(false)

  if (!user || user.role !== 'transportador' || user.is_superuser || !user.transportador_id) {
    return null
  }

  const cadastro = transportadores.find((t) => t.id === user.transportador_id)
  if (!cadastro || !deveCobrarVerificacaoFacial(cadastro)) return null

  const referencia = descritorValido(cadastro.facial_descriptor)
  const modo = referencia ? 'confirmar' : 'cadastrar'

  async function concluir(captura: FacialCaptura) {
    setBusy(true)
    setErro('')
    const res = await concluirVerificacaoFacial(captura)
    setBusy(false)
    if (!res.ok) {
      setErro(res.error || 'Não foi possível salvar a verificação.')
      return
    }
  }

  return (
    <div className="facial-gate" role="dialog" aria-modal="true" aria-labelledby="facial-gate-titulo">
      <div className="facial-gate__card">
        <h2 id="facial-gate-titulo" className="facial-box__titulo" style={{ marginBottom: 8 }}>
          {modo === 'cadastrar' ? 'Cadastre seu rosto' : 'Verificação de acesso'}
        </h2>
        <p className="facial-box__texto" style={{ marginBottom: 12 }}>
          {modo === 'cadastrar'
            ? 'Ainda não há um rosto gravado nesta conta. Faça a verificação para liberar o acesso.'
            : 'De tempos em tempos pedimos a verificação facial para confirmar que é a mesma pessoa do cadastro.'}
        </p>
        {busy ? (
          <p className="facial-box__texto">Salvando a verificação…</p>
        ) : (
          <VerificacaoFacial modo={modo} referencia={referencia} onConcluido={(c) => void concluir(c)} />
        )}
        {erro ? <p className="facial-erro" style={{ marginTop: 10 }}>{erro}</p> : null}
        <button
          type="button"
          className="cadastro-btn cadastro-btn--ghost"
          style={{ marginTop: 12 }}
          onClick={logout}
        >
          Sair
        </button>
      </div>
    </div>
  )
}
