import { useEffect, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useData } from '../../context/DataContext'
import {
  adiarFacialMotorista,
  deveCobrarVerificacaoFacial,
  descritorValido,
  facialExigeNovoCadastro,
  facialParaTransportadora,
  lerFacialAdiados,
  lerFacialLocal,
  limparFacialLocal,
  motoristaDeveFacial,
  preservarVerificacaoFacial,
  referenciaFacialMotorista,
  unirHistoricoFacial,
  type FacialCaptura,
} from '../../lib/verificacaoFacial'
import { VerificacaoFacial } from './VerificacaoFacial'
import './verificacaoFacial.css'

/**
 * Cobra a verificação facial na conta do transportador.
 * Cada motorista ativo precisa do próprio rosto; as próximas cobranças comparam com o rosto dele.
 */
export function FacialGate() {
  const { user, logout, transportadores, motoristasDoTransportador, concluirVerificacaoFacial } = useData()
  const [erro, setErro] = useState('')
  const [busy, setBusy] = useState(false)
  const [, setAdiados] = useState(0)
  const [escolhidoId, setEscolhidoId] = useState('')

  if (!user || user.role !== 'transportador' || user.is_superuser || !user.transportador_id) {
    return null
  }
  const transportadorId = user.transportador_id

  const cadastro = transportadores.find((t) => t.id === transportadorId)
  if (!cadastro || !facialParaTransportadora(cadastro.ramificacao)) return null
  const novoCadastro = facialExigeNovoCadastro(cadastro)
  if (novoCadastro) limparFacialLocal(transportadorId)

  const motoristas = motoristasDoTransportador(transportadorId).filter((m) => m.situacao !== 'inativo')

  async function concluir(captura: FacialCaptura, motorista: { id: string; nome: string } | null) {
    setBusy(true)
    setErro('')
    const res = await concluirVerificacaoFacial(captura, motorista)
    setBusy(false)
    if (!res.ok) setErro(res.error || 'Não foi possível salvar a verificação.')
  }

  // Sem motoristas ativos: segue a verificação única da transportadora.
  if (motoristas.length === 0) {
    const servidorCobra = deveCobrarVerificacaoFacial(cadastro)
    const efetivo = servidorCobra ? cadastro : preservarVerificacaoFacial(cadastro, lerFacialLocal(transportadorId))
    if (!deveCobrarVerificacaoFacial(efetivo)) return null
    const referencia = novoCadastro || facialExigeNovoCadastro(efetivo) ? null : descritorValido(efetivo.facial_descriptor)
    const modo = referencia ? 'confirmar' : 'cadastrar'
    return (
      <FacialOverlay>
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
            <VerificacaoFacial modo={modo} referencia={referencia} onConcluido={(c) => void concluir(c, null)} />
          )}
          {erro ? <p className="facial-erro" style={{ marginTop: 10 }}>{erro}</p> : null}
          <button type="button" className="cadastro-btn cadastro-btn--ghost" style={{ marginTop: 12 }} onClick={logout}>
            Sair
          </button>
        </div>
      </FacialOverlay>
    )
  }

  const local = lerFacialLocal(transportadorId)
  const efetivo = {
    facial_historico: unirHistoricoFacial(cadastro.facial_historico, local?.facial_historico),
    facial_reset_em: cadastro.facial_reset_em,
  }
  const adiados = lerFacialAdiados(transportadorId)
  const pendentes = motoristas.filter((m) => motoristaDeveFacial(efetivo, m.id))
  const semRosto = pendentes.filter((m) => !referenciaFacialMotorista(efetivo, m.id))
  const fila = pendentes.filter((m) => !adiados.includes(m.id))
  const atual = pendentes.find((m) => m.id === escolhidoId) ?? fila[0]
  if (!atual) return null

  const referencia = referenciaFacialMotorista(efetivo, atual.id)
  const modo = referencia ? 'confirmar' : 'cadastrar'
  const posicao = motoristas.length - semRosto.length + (referencia ? 0 : semRosto.findIndex((m) => m.id === atual.id) + 1)

  return (
    <FacialOverlay>
      <div className="facial-gate__card">
        <h2 id="facial-gate-titulo" className="facial-box__titulo" style={{ marginBottom: 8 }}>
          {modo === 'cadastrar' ? 'Cadastro facial do motorista' : 'Verificação de acesso'}
        </h2>
        <label className="facial-box__texto" style={{ display: 'block', marginBottom: 8 }}>
          <strong>Motorista fazendo a facial</strong>
          <select
            className="facial-motorista-select"
            value={atual.id}
            disabled={busy}
            onChange={(e) => {
              setErro('')
              setEscolhidoId(e.target.value)
            }}
          >
            {pendentes.map((m) => (
              <option key={m.id} value={m.id}>
                {m.nome}
                {referenciaFacialMotorista(efetivo, m.id) ? ' (verificação)' : ' (pendente)'}
              </option>
            ))}
          </select>
        </label>
        <p className="facial-box__texto" style={{ marginBottom: 12 }}>
          {modo === 'cadastrar'
            ? `Todos os motoristas ativos precisam ter a facial cadastrada (${posicao} de ${motoristas.length}). Peça para este motorista ficar de frente para a câmera.`
            : 'De tempos em tempos pedimos a verificação facial para confirmar que é o mesmo motorista do cadastro.'}
        </p>
        {busy ? (
          <p className="facial-box__texto">Salvando a verificação…</p>
        ) : (
          <VerificacaoFacial
            key={atual.id}
            modo={modo}
            referencia={referencia}
            onConcluido={(c) => void concluir(c, { id: atual.id, nome: atual.nome })}
          />
        )}
        {erro ? <p className="facial-erro" style={{ marginTop: 10 }}>{erro}</p> : null}
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 12 }}>
          {modo === 'cadastrar' ? (
            <button
              type="button"
              className="cadastro-btn cadastro-btn--ghost"
              disabled={busy}
              onClick={() => {
                adiarFacialMotorista(transportadorId, atual.id)
                setEscolhidoId('')
                setErro('')
                setAdiados((n) => n + 1)
              }}
            >
              Cadastrar depois
            </button>
          ) : null}
          <button type="button" className="cadastro-btn cadastro-btn--ghost" onClick={logout}>
            Sair
          </button>
        </div>
      </div>
    </FacialOverlay>
  )
}

/** Tela cheia por cima de todo o app (portal no body) e sem rolar o fundo. */
function telaMovel(): boolean {
  if (typeof window === 'undefined') return false
  const toque = window.matchMedia?.('(pointer: coarse)').matches || navigator.maxTouchPoints > 0
  return window.innerWidth <= 900 || (toque && Math.min(window.innerWidth, window.screen?.width || 9999) <= 1024)
}

function FacialOverlay({ children }: { children: ReactNode }) {
  const [movel, setMovel] = useState(telaMovel)
  useEffect(() => {
    const atualizar = () => setMovel(telaMovel())
    window.addEventListener('resize', atualizar)
    return () => window.removeEventListener('resize', atualizar)
  }, [])
  useEffect(() => {
    const body = document.body
    const html = document.documentElement
    const antes = { body: body.style.overflow, html: html.style.overflow }
    body.style.overflow = 'hidden'
    html.style.overflow = 'hidden'
    body.classList.add('facial-gate-aberto')
    return () => {
      body.style.overflow = antes.body
      html.style.overflow = antes.html
      body.classList.remove('facial-gate-aberto')
    }
  }, [])
  return createPortal(
    <div
      className={`facial-gate${movel ? ' facial-gate--movel' : ''}`}
      role="dialog"
      aria-modal="true"
      aria-labelledby="facial-gate-titulo"
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        width: '100vw',
        height: '100dvh',
        zIndex: 2147483000,
        margin: 0,
        ...(movel ? { padding: 0, background: '#fff', alignItems: 'stretch', justifyContent: 'stretch' } : {}),
      }}
    >
      {children}
    </div>,
    document.body,
  )
}
