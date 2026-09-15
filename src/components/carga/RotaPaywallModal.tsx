import { useEffect, useMemo, useState } from 'react'
import { Check, Copy, QrCode, Wallet } from 'lucide-react'
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
  creditarPacoteRotaPublico,
  novoTxidPix,
  PACOTES_CREDITO_ROTA,
  type PacoteCreditoRota,
} from '../../lib/rotaPublicoCreditos'
import { ROTA_PUBLICO_LIMITE_CALCULOS } from '../../lib/rotaPublicoCalculos'
import { hrefWhatsappSuporte } from '../../lib/whatsappSuporte'

const PLANOS = [
  {
    id: 'motorista',
    nome: 'Motorista',
    preco: 'R$ 49',
    periodo: '/mês',
    extra: 'ou R$ 14,90 /semana',
    para: 'Caminhoneiro e transportador',
    itens: ['Rotas ilimitadas', 'Mapa da frota', 'Perfil no sistema'],
    destaque: false,
  },
  {
    id: 'start',
    nome: 'Embarcador Start',
    preco: 'R$ 197',
    periodo: '/mês',
    extra: '2 usuários',
    para: 'Empresa pequena',
    itens: ['Publicar cargas', 'Rotas ilimitadas', 'WhatsApp e placa da frota'],
    destaque: true,
  },
  {
    id: 'pro',
    nome: 'Embarcador Pro',
    preco: 'R$ 397',
    periodo: '/mês',
    extra: '5 usuários',
    para: 'Operação com time',
    itens: ['Tudo do Start', 'Malha logística', 'Kanban e áreas salvas'],
    destaque: false,
  },
  {
    id: 'empresa',
    nome: 'Empresa',
    preco: 'R$ 890',
    periodo: '/mês',
    extra: 'ou sob consulta',
    para: 'Várias filiais',
    itens: ['10 usuários', 'Usuários extras', 'Prioridade no suporte'],
    destaque: false,
  },
] as const

type Aba = 'creditos' | 'plano'

type Props = {
  restamGratis: number
  creditos: number
  onClose: () => void
  onCreditosLiberados: () => void
}

export function RotaPaywallModal({ restamGratis, creditos, onClose, onCreditosLiberados }: Props) {
  const esgotado = restamGratis <= 0
  const [aba, setAba] = useState<Aba>(esgotado ? 'creditos' : 'plano')
  const [pacote, setPacote] = useState<PacoteCreditoRota | null>(PACOTES_CREDITO_ROTA[0])
  const [txid, setTxid] = useState(() => novoTxidPix())
  const [copiado, setCopiado] = useState(false)
  const [pagoOk, setPagoOk] = useState(false)
  const [erroPix, setErroPix] = useState('')

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

  const payload = useMemo(() => {
    if (!pacote) return ''
    return gerarPixCopiaECola({
      chave: pixChavePadrao(),
      nome: pixNomePadrao(),
      cidade: pixCidadePadrao(),
      valor: pacote.preco,
      txid,
    })
  }, [pacote, txid])

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

  function confirmarPagamento() {
    if (!pacote) return
    const ok = creditarPacoteRotaPublico(pacote, txid)
    if (!ok) {
      setErroPix('Este pagamento já foi usado neste aparelho.')
      return
    }
    setPagoOk(true)
    onCreditosLiberados()
  }

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
          {creditos > 0 ? ` Você já tem ${creditos} crédito${creditos === 1 ? '' : 's'} neste aparelho.` : ''}
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
            <p className="mapa-pub-creditos__hint">
              Cada crédito vale 1 cálculo de rota neste aparelho. Não expira no fim do dia.
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
                    <strong>{pacote.creditos} créditos</strong>.
                  </p>
                  <label className="mapa-pub-pix__copia">
                    PIX Copia e cola
                    <textarea readOnly rows={3} value={payload} />
                  </label>
                  <button type="button" className="mapa-pub__btn mapa-pub__btn--solid" onClick={() => void copiarPix()}>
                    {copiado ? <Check size={16} /> : <Copy size={16} />}
                    {copiado ? 'Código copiado' : 'Copiar código PIX'}
                  </button>
                  <button
                    type="button"
                    className="mapa-pub__btn mapa-pub__btn--ghost"
                    disabled={pagoOk}
                    onClick={confirmarPagamento}
                  >
                    {pagoOk ? 'Créditos liberados neste aparelho' : 'Já paguei'}
                  </button>
                  {pagoOk ? (
                    <a
                      className="mapa-pub-pix__wa"
                      href={hrefWhatsappSuporte({
                        pagina: `compra PIX de ${pacote.creditos} créditos (${formatCurrency(pacote.preco)}). Código ${txid}`,
                      })}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Enviar comprovante no WhatsApp
                    </a>
                  ) : null}
                  {erroPix ? <p className="mapa-pub-pix__erro">{erroPix}</p> : null}
                </div>
              </div>
            ) : null}
          </div>
        ) : (
          <div className="mapa-pub-planos">
            {PLANOS.map((plano) => (
              <article
                key={plano.id}
                className={`mapa-pub-plano${plano.destaque ? ' is-destaque' : ''}`}
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
                <LinkSistema
                  className="mapa-pub__btn mapa-pub__btn--solid"
                  to={`/cadastro-transportador?plano=${plano.id}`}
                >
                  Assinar {plano.nome}
                </LinkSistema>
              </article>
            ))}
          </div>
        )}

        <div className="mapa-pub-modal__acoes">
          <LinkSistema className="mapa-pub__btn mapa-pub__btn--ghost" to="/login">
            Já tenho conta
          </LinkSistema>
          <button type="button" className="mapa-pub-modal__fechar" onClick={onClose}>
            {esgotado ? 'Continuar vendo o último cálculo' : 'Continuar com o cálculo grátis'}
          </button>
        </div>
      </div>
    </div>
  )
}
