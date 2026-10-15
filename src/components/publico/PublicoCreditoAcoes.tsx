import { useEffect, useState, type FormEvent } from 'react'
import { LogIn } from 'lucide-react'
import { LinkSistema } from '../ui/HostLink'
import { RotaPaywallModal } from '../carga/RotaPaywallModal'
import { RotaPublicoLoginModal } from '../carga/RotaPublicoLogin'
import { gravarCpfRotaPublico, useRotaPublicoAuth, type ContaRotaPublico } from '../../lib/rotaPublicoAuth'
import { formatarCpf, soDigitos } from '../../lib/cpfCnpj'
import { consultarEstadoCalculosPublicos } from '../../lib/rotaPublicoCalculos'
import { consultarEstadoBuscasPublicas, type ProdutoBuscaPublica } from '../../lib/mapaPublicoBuscas'
import {
  consultarCreditosRotaPublico,
  marcarPresenteRotaVisto,
  presenteJaVistoLocal,
} from '../../lib/rotaPublicoCreditos'
import { RotaPresenteModal } from '../carga/RotaPresenteModal'

type Props = {
  uso: 'calculo' | 'busca'
  produto?: ProdutoBuscaPublica
  restamGratis?: number
  creditos?: number
  onCreditosLiberados?: () => void
}

/** Conta de créditos do site aberto, compra no PIX e entrada no login do sistema. */
export function PublicoCreditoAcoes({
  uso,
  produto = 'frota',
  restamGratis,
  creditos,
  onCreditosLiberados,
}: Props) {
  const auth = useRotaPublicoAuth()
  const [criar, setCriar] = useState(false)
  const [comprar, setComprar] = useState(false)
  const [gratis, setGratis] = useState(restamGratis ?? 0)
  const [saldo, setSaldo] = useState(creditos ?? 0)
  const [presente, setPresente] = useState<{ creditos: number; ids: string[] } | null>(null)
  const [cpf, setCpf] = useState('')
  const [cpfErro, setCpfErro] = useState('')
  const [cpfBusy, setCpfBusy] = useState(false)
  const conta: ContaRotaPublico | null = auth.conta

  useEffect(() => {
    if (restamGratis != null) setGratis(restamGratis)
    if (creditos != null) setSaldo(creditos)
  }, [restamGratis, creditos])

  useEffect(() => {
    if (restamGratis != null && creditos != null) return
    const pedido =
      uso === 'busca' ? consultarEstadoBuscasPublicas(produto) : consultarEstadoCalculosPublicos()
    void pedido.then((estado) => {
      setGratis(estado.restamGratis)
      setSaldo(estado.creditos)
    })
  }, [uso, produto, restamGratis, creditos, auth.conta?.id])

  useEffect(() => {
    if (!conta) {
      setPresente(null)
      return
    }
    let vivo = true
    async function checar() {
      const saldoConta = await consultarCreditosRotaPublico()
      if (!vivo) return
      const ids = saldoConta.presenteIds
      if (saldoConta.presente > 0 && ids.length > 0 && !presenteJaVistoLocal(ids)) {
        setPresente({ creditos: saldoConta.presente, ids })
        setSaldo(saldoConta.creditos)
      }
    }
    void checar()
    const timer = window.setInterval(() => void checar(), 15000)
    const aoVoltar = () => {
      if (document.visibilityState === 'visible') void checar()
    }
    document.addEventListener('visibilitychange', aoVoltar)
    return () => {
      vivo = false
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', aoVoltar)
    }
  }, [conta?.id])

  return (
    <>
      <LinkSistema className="mapa-pub__btn mapa-pub__btn--solid mapa-pub__entrar" to="/login">
        <LogIn size={15} strokeWidth={2.4} />
        Entrar no sistema
      </LinkSistema>
      {conta && !conta.cpf ? (
        <form
          className="mapa-pub-cpf"
          onSubmit={(e: FormEvent) => {
            e.preventDefault()
            setCpfErro('')
            setCpfBusy(true)
            void gravarCpfRotaPublico(cpf).then((r) => {
              setCpfBusy(false)
              if (!r.ok) setCpfErro(r.erro || 'Não foi possível gravar o CPF.')
              else setCpf('')
            })
          }}
        >
          <label>
            CPF
            <input
              value={formatarCpf(cpf)}
              onChange={(e) => setCpf(soDigitos(e.target.value).slice(0, 11))}
              inputMode="numeric"
              placeholder="000.000.000-00"
              required
            />
          </label>
          <button type="submit" className="mapa-pub__btn mapa-pub__btn--solid" disabled={cpfBusy}>
            {cpfBusy ? 'Salvando…' : 'Salvar CPF'}
          </button>
          {cpfErro ? <span className="mapa-pub-cpf__erro">{cpfErro}</span> : null}
        </form>
      ) : null}
      {conta ? (
        <div className="mapa-pub-conta">
          {conta.foto ? (
            <img src={conta.foto} alt="" referrerPolicy="no-referrer" />
          ) : (
            <span className="mapa-pub-conta__iniciais" aria-hidden>
              {conta.nome.slice(0, 1).toUpperCase()}
            </span>
          )}
          <span>
            {conta.nome.split(/\s+/)[0]}
            {saldo > 0 ? ` · ${saldo} crédito${saldo === 1 ? '' : 's'}` : ''}
          </span>
          <button type="button" className="mapa-pub__btn mapa-pub__btn--ghost" onClick={() => void auth.sair()}>
            Sair
          </button>
        </div>
      ) : (
        <button type="button" className="mapa-pub__btn mapa-pub__btn--ghost" onClick={() => setCriar(true)}>
          Criar conta
        </button>
      )}
      <button type="button" className="mapa-pub__btn mapa-pub__btn--ghost" onClick={() => setComprar(true)}>
        Comprar créditos
      </button>
      {criar && !conta ? (
        <RotaPublicoLoginModal abaInicial="criar" onClose={() => setCriar(false)} />
      ) : null}
      {comprar ? (
        <RotaPaywallModal
          uso={uso}
          restamGratis={gratis}
          creditos={saldo}
          conta={conta}
          onClose={() => setComprar(false)}
          onCreditosLiberados={() => {
            onCreditosLiberados?.()
          }}
        />
      ) : null}
      {presente ? (
        <RotaPresenteModal
          creditos={presente.creditos}
          onClose={() => {
            const ids = presente.ids
            setPresente(null)
            void marcarPresenteRotaVisto(ids).then(() => onCreditosLiberados?.())
          }}
        />
      ) : null}
    </>
  )
}
