import { useState } from 'react'
import { useData } from '../../context/DataContext'
import {
  deveCobrarVerificacaoFacial,
  descritorValido,
  facialExigeNovoCadastro,
  facialParaTransportadora,
  lerFacialLocal,
  limparFacialLocal,
  preservarVerificacaoFacial,
  type FacialCaptura,
  type FacialMotorista,
} from '../../lib/verificacaoFacial'
import { VerificacaoFacial } from './VerificacaoFacial'
import './verificacaoFacial.css'

/** Cobra a verificação de tempos em tempos só na conta do transportador. */
export function FacialGate() {
  const { user, logout, transportadores, motoristasDoTransportador, concluirVerificacaoFacial } = useData()
  const [motoristaId, setMotoristaId] = useState('')
  const [erro, setErro] = useState('')
  const [busy, setBusy] = useState(false)

  if (!user || user.role !== 'transportador' || user.is_superuser || !user.transportador_id) {
    return null
  }

  const cadastro = transportadores.find((t) => t.id === user.transportador_id)
  if (!cadastro || !facialParaTransportadora(cadastro.ramificacao)) return null
  const novoCadastro = facialExigeNovoCadastro(cadastro)
  if (novoCadastro) limparFacialLocal(user.transportador_id)
  const servidorCobra = deveCobrarVerificacaoFacial(cadastro)
  const efetivo = servidorCobra
    ? cadastro
    : preservarVerificacaoFacial(cadastro, lerFacialLocal(user.transportador_id))
  if (!deveCobrarVerificacaoFacial(efetivo)) return null

  const referencia = novoCadastro || facialExigeNovoCadastro(efetivo) ? null : descritorValido(efetivo.facial_descriptor)
  const modo = referencia ? 'confirmar' : 'cadastrar'

  const motoristas = motoristasDoTransportador(user.transportador_id).filter((m) => m.situacao !== 'inativo')
  const escolhido = motoristas.find((m) => m.id === motoristaId)
  const precisaEscolher = motoristas.length > 0 && !escolhido

  async function concluir(captura: FacialCaptura) {
    setBusy(true)
    setErro('')
    const res = await concluirVerificacaoFacial(
      captura,
      escolhido ? ({ id: escolhido.id, nome: escolhido.nome } satisfies FacialMotorista) : null,
    )
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
            ? novoCadastro
              ? 'A verificação anterior foi excluída. Faça de novo para liberar o acesso.'
              : 'Ainda não há um rosto gravado nesta conta. Faça a verificação para liberar o acesso.'
            : 'De tempos em tempos pedimos a verificação facial para confirmar que é a mesma pessoa do cadastro.'}
        </p>
        {motoristas.length > 0 ? (
          <label className="facial-box__texto" style={{ display: 'block', marginBottom: 12 }}>
            <strong>Qual motorista está fazendo a verificação?</strong>
            <select
              className="facial-motorista-select"
              value={motoristaId}
              disabled={busy}
              onChange={(e) => setMotoristaId(e.target.value)}
            >
              <option value="">Selecione o motorista</option>
              {motoristas.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.nome}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        {precisaEscolher ? (
          <p className="facial-box__texto">Selecione o motorista para iniciar a verificação.</p>
        ) : busy ? (
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
