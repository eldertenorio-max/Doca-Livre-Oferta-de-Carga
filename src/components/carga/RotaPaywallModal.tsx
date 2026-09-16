import { useEffect, useMemo, useState } from 'react'
import { Check, Copy, MessageCircle, QrCode, Wallet } from 'lucide-react'
import { formatCurrency } from '../../lib/businessRules'
import { LinkSistema } from '../ui/HostLink'
import {
  gerarPixCopiaECola,
  pixChavePadrao,
  pixCidadePadrao,
  pixNomePadrao,
  urlQrPix,
} from '../../lib/pixBrCode'
import {
  creditarPacoteRotaPublicoNaConta,
  novoTxidPix,
  PACOTES_CREDITO_ROTA,
  type PacoteCreditoRota,
} from '../../lib/rotaPublicoCreditos'
import { ROTA_PUBLICO_LIMITE_CALCULOS } from '../../lib/rotaPublicoCalculos'
import type { ContaRotaPublico } from '../../lib/rotaPublicoAuth'
import { hrefWhatsappComprovanteCreditos, hrefWhatsappComprovantePlano } from '../../lib/whatsappSuporte'
import {
  PLANOS_OFERTA_CARGA,
  marcarComprovantePlanoEnviado,
  marcarPlanoPago,
} from '../../lib/planosOfertaCarga'
import { GoogleGIcon } from './GoogleGIcon'

type Aba = 'creditos' | 'plano'
type EtapaPlano = 'pix' | 'verificar' | 'enviado'

type Props = {
  restamGratis: number
  creditos: number
  conta: ContaRotaPublico | null
  entrandoGoogle: boolean
  erroGoogle: string
  onEntrarGoogle: () => void
  onClose: () => void
  onCreditosLiberados: () => void
}

export function RotaPaywallModal({
  restamGratis,
  creditos,
  conta,
  entrandoGoogle,
  erroGoogle,
  onEntrarGoogle,
  onClose,
  onCreditosLiberados,
}: Props) {
  const esgotado = restamGratis <= 0
  const [aba, setAba] = useState<Aba>(esgotado ? 'creditos' : 'plano')
  const [pacote, setPacote] = useState<PacoteCreditoRota | null>(PACOTES_CREDITO_ROTA[0])
  const [txid, setTxid] = useState(() => novoTxidPix())
  const [copiado, setCopiado] = useState(false)
  const [pagoOk, setPagoOk] = useState(false)
  const [erroPix, setErroPix] = useState('')
  const [gravando, setGravando] = useState(false)
  const [planoSel, setPlanoSel] = useState<(typeof PLANOS_OFERTA_CARGA)[number]>(PLANOS_OFERTA_CARGA[1])
  const [txidPlano, setTxidPlano] = useState(() => novoTxidPix())
  const [copiadoPlano, setCopiadoPlano] = useState(false)
  const [etapaPlano, setEtapaPlano] = useState<EtapaPlano>('pix')
  const [abriuWhatsappPlano, setAbriuWhatsappPlano] = useState(false)
  const [erroPlano, setErroPlano] = useState('')

  useEffect(() => {
    setAba(esgotado ? 'creditos' : 'plano')
  }, [esgotado])

  useEffect(() => {
    if (!pacote) return
    setTxid(novoTxidPix())
    setCopiado(false)
    setPagoOk(false)
    setErroPix('')
  }, [pacote])

  useEffect(() => {
    setTxidPlano(novoTxidPix())
    setCopiadoPlano(false)
    setEtapaPlano('pix')
    setAbriuWhatsappPlano(false)
    setErroPlano('')
  }, [planoSel.id])

  const payload = useMemo(() => {
    if (!pacote || !conta) return ''
    return gerarPixCopiaECola({
      chave: pixChavePadrao(),
      nome: pixNomePadrao(),
      cidade: pixCidadePadrao(),
      valor: pacote.preco,
      txid,
    })
  }, [pacote, txid, conta])

  const payloadPlano = useMemo(() => {
    return gerarPixCopiaECola({
      chave: pixChavePadrao(),
      nome: pixNomePadrao(),
      cidade: pixCidadePadrao(),
      valor: planoSel.precoValor,
      txid: txidPlano,
    })
  }, [planoSel, txidPlano])

  async function copiarPix() {
    if (!payload) return
    try {
      await navigator.clipboard.writeText(payload)
      setCopiado(true)
      window.setTimeout(() => setCopiado(false), 2000)
    } catch {
      setErroPix('Não foi possível copiar. Selecione o código e copie na mão.')
    }
  }

  async function confirmarPagamento() {
    if (!pacote || !conta || gravando || pagoOk) return
    setGravando(true)
    setErroPix('')
    const r = await creditarPacoteRotaPublicoNaConta(pacote, txid)
    setGravando(false)
    if (!r.ok) {
      setErroPix(r.erro || 'Não foi possível liberar os créditos.')
      return
    }
    setPagoOk(true)
    onCreditosLiberados()
  }

  async function copiarPixPlano() {
    try {
      await navigator.clipboard.writeText(payloadPlano)
      setCopiadoPlano(true)
      window.setTimeout(() => setCopiadoPlano(false), 2000)
    } catch {
      setErroPlano('Não foi possível copiar. Selecione o código e copie na mão.')
    }
  }

  function confirmarPagamentoPlano() {
    marcarPlanoPago(planoSel.id, txidPlano, 'pendente')
    setEtapaPlano('verificar')
  }

  const hrefComprovantePlano = hrefWhatsappComprovantePlano({
    plano: planoSel.nome,
    valor: formatCurrency(planoSel.precoValor),
    txid: txidPlano,
  })

  const hrefComprovanteCreditos =
    pacote && conta
      ? hrefWhatsappComprovanteCreditos({
          email: conta.email,
          creditos: pacote.creditos,
          valor: formatCurrency(pacote.preco),
          txid,
        })
      : ''

  return (
    <div className="mapa-pub-modal" role="dialog" aria-modal="true" aria-labelledby="rota-pub-pay-title">
      <div className="mapa-pub-modal__card mapa-pub-modal__card--planos">
        <h2 id="rota-pub-pay-title">
          {esgotado ? 'Continuar calculando rotas' : 'Conheça os benefícios'}
        </h2>
        <p>
          {esgotado
            ? `Os ${ROTA_PUBLICO_LIMITE_CALCULOS} cálculos grátis de hoje acabaram. Compre créditos no PIX ou assine um plano.`
            : `Você ainda tem ${restamGratis} de ${ROTA_PUBLICO_LIMITE_CALCULOS} cálculos grátis hoje. Créditos avulsos no PIX ou plano mensal ilimitado.`}
          {creditos > 0
            ? ` Você já tem ${creditos} crédito${creditos === 1 ? '' : 's'}${conta ? ' na sua conta' : ''}.`
            : ''}
        </p>

        <div className="mapa-pub-pay-tabs" role="tablist" aria-label="Forma de continuar">
          <button
            type="button"
            role="tab"
            aria-selected={aba === 'creditos'}
            className={aba === 'creditos' ? 'is-on' : ''}
            onClick={() => setAba('creditos')}
          >
            <Wallet size={16} strokeWidth={2.4} />
            Comprar créditos
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={aba === 'plano'}
            className={aba === 'plano' ? 'is-on' : ''}
            onClick={() => setAba('plano')}
          >
            Fazer plano
          </button>
        </div>

        {aba === 'creditos' ? (
          <div className="mapa-pub-creditos">
            {!conta ? (
              <div className="mapa-pub-login-google">
                <p className="mapa-pub-creditos__hint">
                  Cadastro e login são o mesmo: entre com Google para comprar créditos e não perdê-los se trocar de
                  aparelho. Serve só para esta calculadora, não é a conta do sistema Doca Livre.
                </p>
                <button
                  type="button"
                  className="mapa-pub__btn mapa-pub__btn--google"
                  disabled={entrandoGoogle}
                  onClick={onEntrarGoogle}
                >
                  <GoogleGIcon />
                  {entrandoGoogle ? 'Abrindo Google…' : 'Entrar com Google'}
                </button>
                {erroGoogle ? <p className="mapa-pub-pix__erro">{erroGoogle}</p> : null}
              </div>
            ) : (
              <>
                <p className="mapa-pub-creditos__hint">
                  Cada crédito vale 1 cálculo na conta de {conta.nome.split(' ')[0]}. Não expira no fim do dia.
                </p>
                <div className="mapa-pub-creditos__packs">
                  {PACOTES_CREDITO_ROTA.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      className={`mapa-pub-credito${p.destaque ? ' is-destaque' : ''}${pacote?.id === p.id ? ' is-on' : ''}`}
                      onClick={() => setPacote(p)}
                    >
                      {p.destaque ? <span className="mapa-pub-plano__tag">Mais usado</span> : null}
                      <strong>{p.titulo}</strong>
                      <small>{p.sub}</small>
                      <em>{formatCurrency(p.preco)}</em>
                    </button>
                  ))}
                </div>

                {pacote ? (
                  <div className="mapa-pub-pix">
                    <div className="mapa-pub-pix__qr">
                      <img src={urlQrPix(payload)} alt="QR Code PIX" width={180} height={180} />
                      <span>
                        <QrCode size={14} /> PIX
                      </span>
                    </div>
                    <div className="mapa-pub-pix__lado">
                      <p>
                        Pague <strong>{formatCurrency(pacote.preco)}</strong> e libere{' '}
                        <strong>{pacote.creditos} créditos</strong> na sua conta Google.
                      </p>
                      <p className="mapa-pub-pix__txid">
                        Código deste pagamento: <strong>{txid}</strong>
                      </p>
                      <label className="mapa-pub-pix__copia">
                        PIX Copia e cola
                        <textarea readOnly rows={3} value={payload} />
                      </label>
                      {!pagoOk ? (
                        <>
                          <button
                            type="button"
                            className="mapa-pub__btn mapa-pub__btn--solid"
                            onClick={() => void copiarPix()}
                          >
                            {copiado ? <Check size={16} /> : <Copy size={16} />}
                            {copiado ? 'Código copiado' : 'Copiar código PIX'}
                          </button>
                          <button
                            type="button"
                            className="mapa-pub__btn mapa-pub__btn--ghost"
                            disabled={gravando}
                            onClick={() => void confirmarPagamento()}
                          >
                            {gravando ? 'Gravando…' : 'Já paguei'}
                          </button>
                        </>
                      ) : (
                        <div className="mapa-pub-pix__verificacao">
                          <p>
                            Créditos na sua conta. Envie o comprovante <strong>deste</strong> código{' '}
                            <strong>{txid}</strong>. Comprovante de outro pagamento não libera crédito
                            de novo.
                          </p>
                          <a
                            className="mapa-pub__btn mapa-pub__btn--whatsapp"
                            href={hrefComprovanteCreditos}
                            target="_blank"
                            rel="noreferrer"
                          >
                            <MessageCircle size={16} />
                            Clique aqui para enviar comprovante no WhatsApp
                          </a>
                        </div>
                      )}
                      {erroPix ? <p className="mapa-pub-pix__erro">{erroPix}</p> : null}
                    </div>
                  </div>
                ) : null}
              </>
            )}
            <button
              type="button"
              className="mapa-pub__btn mapa-pub__btn--ghost mapa-pub-creditos__mais-planos"
              onClick={() => setAba('plano')}
            >
              Conheça mais planos
            </button>
          </div>
        ) : (
          <div className="mapa-pub-creditos">
            <p className="mapa-pub-creditos__hint">
              A conta Google dos créditos é outra. O plano é a conta do sistema: pague o PIX, envie
              o comprovante e aguarde a confirmação. Só então sai o link do cadastro — lá a empresa
              informa a ramificação (embarcador, unidade, transportadora ou motorista).
            </p>
            <div className="mapa-pub-planos">
              {PLANOS_OFERTA_CARGA.map((plano) => (
                <article
                  key={plano.id}
                  role="button"
                  tabIndex={0}
                  className={`mapa-pub-plano${plano.destaque ? ' is-destaque' : ''}${planoSel.id === plano.id ? ' is-on' : ''}`}
                  onClick={() => setPlanoSel(plano)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault()
                      setPlanoSel(plano)
                    }
                  }}
                >
                  {plano.destaque ? <span className="mapa-pub-plano__tag">Mais escolhido</span> : null}
                  <h3>{plano.nome}</h3>
                  <p className="mapa-pub-plano__para">{plano.para}</p>
                  <p className="mapa-pub-plano__preco">
                    <strong>{plano.preco}</strong>
                    <small>{plano.periodo}</small>
                  </p>
                  <p className="mapa-pub-plano__extra">{plano.extra}</p>
                  <ul>
                    {plano.itens.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </article>
              ))}
            </div>
            <div className="mapa-pub-pix">
              <div className="mapa-pub-pix__qr">
                <img src={urlQrPix(payloadPlano)} alt="QR Code PIX do plano" width={180} height={180} />
                <span>
                  <QrCode size={14} /> PIX
                </span>
              </div>
              <div className="mapa-pub-pix__lado">
                <p>
                  Pague <strong>{formatCurrency(planoSel.precoValor)}</strong> do plano{' '}
                  <strong>{planoSel.nome}</strong>. Depois clique em Já paguei e envie o comprovante.
                  O cadastro do sistema só abre quando o PIX for confirmado.
                </p>
                <label className="mapa-pub-pix__copia">
                  PIX Copia e cola
                  <textarea readOnly rows={3} value={payloadPlano} />
                </label>
                {etapaPlano === 'pix' ? (
                  <>
                    <button
                      type="button"
                      className="mapa-pub__btn mapa-pub__btn--solid"
                      onClick={() => void copiarPixPlano()}
                    >
                      {copiadoPlano ? <Check size={16} /> : <Copy size={16} />}
                      {copiadoPlano ? 'Código copiado' : 'Copiar código PIX'}
                    </button>
                    <button
                      type="button"
                      className="mapa-pub__btn mapa-pub__btn--ghost"
                      onClick={confirmarPagamentoPlano}
                    >
                      Já paguei
                    </button>
                  </>
                ) : etapaPlano === 'verificar' ? (
                  <div className="mapa-pub-pix__verificacao">
                    <p>
                      Pagamento informado. Envie o comprovante no WhatsApp com o código{' '}
                      <strong>{txidPlano}</strong>. Sem essa conferência o cadastro do sistema não
                      abre.
                    </p>
                    <a
                      className="mapa-pub__btn mapa-pub__btn--solid"
                      href={hrefComprovantePlano}
                      target="_blank"
                      rel="noreferrer"
                      onClick={() => setAbriuWhatsappPlano(true)}
                    >
                      <MessageCircle size={16} />
                      Enviar comprovante no WhatsApp
                    </a>
                    <button
                      type="button"
                      className="mapa-pub__btn mapa-pub__btn--ghost"
                      disabled={!abriuWhatsappPlano}
                      onClick={() => {
                        marcarComprovantePlanoEnviado()
                        setEtapaPlano('enviado')
                      }}
                    >
                      Já enviei o comprovante
                    </button>
                    {!abriuWhatsappPlano ? (
                      <p className="mapa-pub-pix__verificacao-hint">
                        Abra o WhatsApp e anexe o comprovante do PIX antes de continuar.
                      </p>
                    ) : null}
                  </div>
                ) : (
                  <div className="mapa-pub-pix__verificacao">
                    <p>
                      Comprovante em verificação. Assim que o PIX for confirmado, você recebe no
                      WhatsApp o link para o cadastro do sistema.
                    </p>
                    <a
                      className="mapa-pub-pix__wa"
                      href={hrefComprovantePlano}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Abrir o WhatsApp de novo
                    </a>
                  </div>
                )}
                {erroPlano ? <p className="mapa-pub-pix__erro">{erroPlano}</p> : null}
              </div>
            </div>
          </div>
        )}

        <div className="mapa-pub-modal__acoes">
          {aba === 'plano' ? (
            <LinkSistema className="mapa-pub__btn mapa-pub__btn--ghost" to="/login">
              Já tenho conta no sistema
            </LinkSistema>
          ) : conta ? (
            <p className="mapa-pub-login-google__conta">Logado: {conta.email}</p>
          ) : (
            <span />
          )}
          <button type="button" className="mapa-pub-modal__fechar" onClick={onClose}>
            {esgotado ? 'Continuar vendo o último cálculo' : 'Continuar com o cálculo grátis'}
          </button>
        </div>
      </div>
    </div>
  )
}
