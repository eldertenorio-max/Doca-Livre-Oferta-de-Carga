import { useEffect, useMemo, useRef, useState } from 'react'
import { Check, Copy, Loader2, MessageCircle, QrCode, Wallet } from 'lucide-react'
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
  irCadastroPlanoPago,
  marcarComprovantePlanoEnviado,
  marcarPlanoPago,
} from '../../lib/planosOfertaCarga'
import { GoogleGIcon } from './GoogleGIcon'
import { cpfCnpjValido, formatarCpfCnpj, soDigitos } from '../../lib/cpfCnpj'
import {
  asaasNaoConfigurado,
  criarPixAsaas,
  statusPixAsaas,
  type CobrancaAsaas,
} from '../../lib/asaasPix'

type Aba = 'creditos' | 'plano'
type EtapaPlano = 'pix' | 'verificar' | 'enviado' | 'pago'

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
  const [cpf, setCpf] = useState('')
  const [cobranca, setCobranca] = useState<CobrancaAsaas | null>(null)
  const [modoManual, setModoManual] = useState(false)
  const [gerando, setGerando] = useState(false)
  const [emailOk, setEmailOk] = useState(false)
  const [planoSel, setPlanoSel] = useState<(typeof PLANOS_OFERTA_CARGA)[number]>(PLANOS_OFERTA_CARGA[1])
  const [txidPlano, setTxidPlano] = useState(() => novoTxidPix())
  const [copiadoPlano, setCopiadoPlano] = useState(false)
  const [etapaPlano, setEtapaPlano] = useState<EtapaPlano>('pix')
  const [abriuWhatsappPlano, setAbriuWhatsappPlano] = useState(false)
  const [erroPlano, setErroPlano] = useState('')
  const [cpfPlano, setCpfPlano] = useState('')
  const [emailPlano, setEmailPlano] = useState('')
  const [cobrancaPlano, setCobrancaPlano] = useState<CobrancaAsaas | null>(null)
  const [modoManualPlano, setModoManualPlano] = useState(false)
  const [gerandoPlano, setGerandoPlano] = useState(false)
  const [emailPlanoOk, setEmailPlanoOk] = useState(false)
  const onCreditosLiberadosRef = useRef(onCreditosLiberados)
  onCreditosLiberadosRef.current = onCreditosLiberados

  useEffect(() => {
    setAba(esgotado ? 'creditos' : 'plano')
  }, [esgotado])

  useEffect(() => {
    if (!pacote) return
    setTxid(novoTxidPix())
    setCopiado(false)
    setPagoOk(false)
    setErroPix('')
    setCobranca(null)
    setEmailOk(false)
  }, [pacote])

  useEffect(() => {
    setTxidPlano(novoTxidPix())
    setCopiadoPlano(false)
    setEtapaPlano('pix')
    setAbriuWhatsappPlano(false)
    setErroPlano('')
    setCobrancaPlano(null)
    setEmailPlanoOk(false)
  }, [planoSel.id])

  useEffect(() => {
    if (conta?.email && !emailPlano) setEmailPlano(conta.email)
  }, [conta?.email, emailPlano])

  useEffect(() => {
    const id = cobranca?.paymentId
    if (!id || pagoOk || modoManual) return
    let stop = false
    async function tick() {
      const r = await statusPixAsaas(id)
      if (stop) return
      if (r.pago) {
        setPagoOk(true)
        setEmailOk(Boolean(r.emailEnviado))
        onCreditosLiberadosRef.current()
      }
    }
    void tick()
    const t = window.setInterval(() => void tick(), 3000)
    return () => {
      stop = true
      window.clearInterval(t)
    }
  }, [cobranca?.paymentId, pagoOk, modoManual])

  useEffect(() => {
    const id = cobrancaPlano?.paymentId
    if (!id || etapaPlano === 'pago' || modoManualPlano) return
    let stop = false
    async function tick() {
      const r = await statusPixAsaas(id)
      if (stop) return
      if (r.pago) {
        marcarPlanoPago(planoSel.id, id, 'comprovante_enviado')
        setEtapaPlano('pago')
        setEmailPlanoOk(Boolean(r.emailEnviado))
      }
    }
    void tick()
    const t = window.setInterval(() => void tick(), 3000)
    return () => {
      stop = true
      window.clearInterval(t)
    }
  }, [cobrancaPlano?.paymentId, etapaPlano, modoManualPlano, planoSel.id])

  const payloadManual = useMemo(() => {
    if (!pacote || !conta) return ''
    return gerarPixCopiaECola({
      chave: pixChavePadrao(),
      nome: pixNomePadrao(),
      cidade: pixCidadePadrao(),
      valor: pacote.preco,
      txid,
    })
  }, [pacote, txid, conta])

  const payloadPlanoManual = useMemo(() => {
    return gerarPixCopiaECola({
      chave: pixChavePadrao(),
      nome: pixNomePadrao(),
      cidade: pixCidadePadrao(),
      valor: planoSel.precoValor,
      txid: txidPlano,
    })
  }, [planoSel, txidPlano])

  const qrCredito = cobranca?.imagem || (modoManual ? urlQrPix(payloadManual) : '')
  const copiaCredito = cobranca?.payload || (modoManual ? payloadManual : '')
  const qrPlano = cobrancaPlano?.imagem || (modoManualPlano ? urlQrPix(payloadPlanoManual) : '')
  const copiaPlano = cobrancaPlano?.payload || (modoManualPlano ? payloadPlanoManual : '')

  async function copiarPix() {
    if (!copiaCredito) return
    try {
      await navigator.clipboard.writeText(copiaCredito)
      setCopiado(true)
      window.setTimeout(() => setCopiado(false), 2000)
    } catch {
      setErroPix('Não foi possível copiar. Selecione o código e copie na mão.')
    }
  }

  async function gerarPixCredito() {
    if (!pacote || !conta) return
    if (!cpfCnpjValido(cpf)) {
      setErroPix('Informe um CPF ou CNPJ válido para o PIX.')
      return
    }
    setGerando(true)
    setErroPix('')
    const r = await criarPixAsaas({
      tipo: 'credito',
      pacoteId: pacote.id,
      cpfCnpj: soDigitos(cpf),
      email: conta.email,
      nome: conta.nome,
    })
    setGerando(false)
    if (!r.ok) {
      if (asaasNaoConfigurado(r.erro)) {
        setModoManual(true)
        setErroPix('')
        return
      }
      setErroPix(r.erro)
      return
    }
    setCobranca(r.cobranca)
  }

  async function confirmarPagamento() {
    if (!pacote || !conta || gravando || pagoOk || !modoManual) return
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
    if (!copiaPlano) return
    try {
      await navigator.clipboard.writeText(copiaPlano)
      setCopiadoPlano(true)
      window.setTimeout(() => setCopiadoPlano(false), 2000)
    } catch {
      setErroPlano('Não foi possível copiar. Selecione o código e copie na mão.')
    }
  }

  async function gerarPixPlano() {
    if (!cpfCnpjValido(cpfPlano)) {
      setErroPlano('Informe um CPF ou CNPJ válido para o PIX.')
      return
    }
    const email = (emailPlano || conta?.email || '').trim()
    if (!email.includes('@')) {
      setErroPlano('Informe o e-mail para enviarmos a confirmação do plano.')
      return
    }
    setGerandoPlano(true)
    setErroPlano('')
    const r = await criarPixAsaas({
      tipo: 'plano',
      pacoteId: planoSel.id,
      cpfCnpj: soDigitos(cpfPlano),
      email,
      nome: conta?.nome || email.split('@')[0],
    })
    setGerandoPlano(false)
    if (!r.ok) {
      if (asaasNaoConfigurado(r.erro)) {
        setModoManualPlano(true)
        setErroPlano('')
        return
      }
      setErroPlano(r.erro)
      return
    }
    setCobrancaPlano(r.cobranca)
    setEtapaPlano('pix')
  }

  function confirmarPagamentoPlano() {
    marcarPlanoPago(planoSel.id, cobrancaPlano?.paymentId || txidPlano, 'pendente')
    setEtapaPlano('verificar')
  }

  const hrefComprovantePlano = hrefWhatsappComprovantePlano({
    plano: planoSel.nome,
    valor: formatCurrency(planoSel.precoValor),
    txid: cobrancaPlano?.paymentId || txidPlano,
  })

  const hrefComprovanteCreditos =
    pacote && conta
      ? hrefWhatsappComprovanteCreditos({
          email: conta.email,
          creditos: pacote.creditos,
          valor: formatCurrency(pacote.preco),
          txid: cobranca?.paymentId || txid,
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
                  Cada crédito vale 1 cálculo na conta de {conta.nome.split(' ')[0]}. Pague o PIX: os créditos entram
                  sozinhos e o comprovante vai por e-mail.
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
                    {qrCredito ? (
                      <div className="mapa-pub-pix__qr">
                        <img src={qrCredito} alt="QR Code PIX" width={180} height={180} />
                        <span>
                          <QrCode size={14} /> PIX
                        </span>
                      </div>
                    ) : (
                      <div className="mapa-pub-pix__qr mapa-pub-pix__qr--vazio">
                        <QrCode size={36} />
                        <span>Gere o QR do PIX</span>
                      </div>
                    )}
                    <div className="mapa-pub-pix__lado">
                      <p>
                        Pague <strong>{formatCurrency(pacote.preco)}</strong> e libere{' '}
                        <strong>{pacote.creditos} créditos</strong> na sua conta Google.
                      </p>
                      {!modoManual && !cobranca ? (
                        <>
                          <label className="mapa-pub-pix__copia">
                            CPF ou CNPJ
                            <input
                              value={cpf}
                              onChange={(e) => setCpf(formatarCpfCnpj(e.target.value))}
                              inputMode="numeric"
                              autoComplete="off"
                              placeholder="000.000.000-00"
                            />
                          </label>
                          <button
                            type="button"
                            className="mapa-pub__btn mapa-pub__btn--solid"
                            disabled={gerando}
                            onClick={() => void gerarPixCredito()}
                          >
                            {gerando ? <Loader2 size={16} className="mapa-pub-spin" /> : <QrCode size={16} />}
                            {gerando ? 'Gerando PIX…' : 'Gerar QR Code PIX'}
                          </button>
                        </>
                      ) : (
                        <>
                          <p className="mapa-pub-pix__txid">
                            Código deste pagamento:{' '}
                            <strong>{cobranca?.paymentId || txid}</strong>
                          </p>
                          <label className="mapa-pub-pix__copia">
                            PIX Copia e cola
                            <textarea readOnly rows={3} value={copiaCredito} />
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
                              {modoManual ? (
                                <button
                                  type="button"
                                  className="mapa-pub__btn mapa-pub__btn--ghost"
                                  disabled={gravando}
                                  onClick={() => void confirmarPagamento()}
                                >
                                  {gravando ? 'Gravando…' : 'Já paguei'}
                                </button>
                              ) : (
                                <p className="mapa-pub-pix__aguardando">
                                  <Loader2 size={16} className="mapa-pub-spin" />
                                  Aguardando o PIX. Os créditos entram sozinhos — não precisa clicar em já paguei.
                                </p>
                              )}
                            </>
                          ) : (
                            <div className="mapa-pub-pix__verificacao">
                              <p>
                                Pagamento confirmado. <strong>{pacote.creditos} créditos</strong> já estão na sua
                                conta
                                {emailOk
                                  ? `. Enviamos o e-mail para ${conta.email}.`
                                  : `. Se o e-mail não chegar, fale no WhatsApp.`}
                              </p>
                              <a
                                className="mapa-pub__btn mapa-pub__btn--whatsapp"
                                href={hrefComprovanteCreditos}
                                target="_blank"
                                rel="noreferrer"
                              >
                                <MessageCircle size={16} />
                                Dúvida? Falar no WhatsApp
                              </a>
                            </div>
                          )}
                        </>
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
              A conta Google dos créditos é outra. O plano é a conta do sistema: pague o PIX e, quando o banco
              confirmar, o cadastro libera e o e-mail de confirmação chega.
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
              {qrPlano ? (
                <div className="mapa-pub-pix__qr">
                  <img src={qrPlano} alt="QR Code PIX do plano" width={180} height={180} />
                  <span>
                    <QrCode size={14} /> PIX
                  </span>
                </div>
              ) : (
                <div className="mapa-pub-pix__qr mapa-pub-pix__qr--vazio">
                  <QrCode size={36} />
                  <span>Gere o QR do PIX</span>
                </div>
              )}
              <div className="mapa-pub-pix__lado">
                <p>
                  Pague <strong>{formatCurrency(planoSel.precoValor)}</strong> do plano{' '}
                  <strong>{planoSel.nome}</strong>. Quando o PIX cair, o e-mail com o link do cadastro sai
                  sozinho.
                </p>
                {!modoManualPlano && !cobrancaPlano ? (
                  <>
                    <label className="mapa-pub-pix__copia">
                      E-mail para a confirmação
                      <input
                        type="email"
                        value={emailPlano}
                        onChange={(e) => setEmailPlano(e.target.value)}
                        placeholder="voce@email.com"
                        autoComplete="email"
                      />
                    </label>
                    <label className="mapa-pub-pix__copia">
                      CPF ou CNPJ
                      <input
                        value={cpfPlano}
                        onChange={(e) => setCpfPlano(formatarCpfCnpj(e.target.value))}
                        inputMode="numeric"
                        autoComplete="off"
                        placeholder="000.000.000-00"
                      />
                    </label>
                    <button
                      type="button"
                      className="mapa-pub__btn mapa-pub__btn--solid"
                      disabled={gerandoPlano}
                      onClick={() => void gerarPixPlano()}
                    >
                      {gerandoPlano ? <Loader2 size={16} className="mapa-pub-spin" /> : <QrCode size={16} />}
                      {gerandoPlano ? 'Gerando PIX…' : 'Gerar QR Code PIX'}
                    </button>
                  </>
                ) : etapaPlano === 'pago' ? (
                  <div className="mapa-pub-pix__verificacao">
                    <p>
                      Pagamento confirmado
                      {emailPlanoOk
                        ? `. Enviamos o e-mail com o link do cadastro para ${emailPlano || conta?.email}.`
                        : '.'}{' '}
                      Conclua o cadastro do sistema.
                    </p>
                    <button
                      type="button"
                      className="mapa-pub__btn mapa-pub__btn--solid"
                      onClick={() => irCadastroPlanoPago(planoSel.id)}
                    >
                      Ir para o cadastro
                    </button>
                    <a
                      className="mapa-pub-pix__wa"
                      href={hrefComprovantePlano}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Falar no WhatsApp
                    </a>
                  </div>
                ) : (
                  <>
                    <label className="mapa-pub-pix__copia">
                      PIX Copia e cola
                      <textarea readOnly rows={3} value={copiaPlano} />
                    </label>
                    {modoManualPlano && etapaPlano === 'pix' ? (
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
                    ) : modoManualPlano && etapaPlano === 'verificar' ? (
                      <div className="mapa-pub-pix__verificacao">
                        <p>
                          Pagamento informado. Envie o comprovante no WhatsApp com o código{' '}
                          <strong>{txidPlano}</strong>. Sem essa conferência o cadastro do sistema não abre.
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
                      </div>
                    ) : modoManualPlano && etapaPlano === 'enviado' ? (
                      <div className="mapa-pub-pix__verificacao">
                        <p>
                          Comprovante em verificação. Assim que o PIX for confirmado, você recebe no WhatsApp o
                          link para o cadastro do sistema.
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
                    ) : (
                      <>
                        <button
                          type="button"
                          className="mapa-pub__btn mapa-pub__btn--solid"
                          onClick={() => void copiarPixPlano()}
                        >
                          {copiadoPlano ? <Check size={16} /> : <Copy size={16} />}
                          {copiadoPlano ? 'Código copiado' : 'Copiar código PIX'}
                        </button>
                        <p className="mapa-pub-pix__aguardando">
                          <Loader2 size={16} className="mapa-pub-spin" />
                          Aguardando o PIX. O cadastro e o e-mail saem sozinhos quando o pagamento cair.
                        </p>
                      </>
                    )}
                  </>
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
