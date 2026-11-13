import { useEffect, useState } from 'react'
import {
  APK_URL,
  APK_URL_COMPLETA,
  QR_BAIXAR_URL,
  ehAndroid,
  ehIphone,
  estaNoApp,
  lerVersaoDoApp,
  type VersaoDoApp,
} from '../lib/aplicativo'

const CARTAO = 'rounded-xl border border-ink/10 bg-white px-4 py-4 shadow-sm'

/**
 * Tela "Aplicativo" (menu lateral): baixar o app Android (pasta android/, instalador em public/app) e como
 * instalar. No computador mostra um QR code para baixar direto no celular.
 */
export function AplicativoPage() {
  const [versao, setVersao] = useState<VersaoDoApp | null | 'buscando'>('buscando')
  const [copiado, setCopiado] = useState(false)
  const noApp = estaNoApp()
  const android = ehAndroid()
  const iphone = ehIphone()
  const computador = !android && !iphone

  useEffect(() => {
    let vivo = true
    void lerVersaoDoApp().then((v) => {
      if (vivo) setVersao(v)
    })
    return () => {
      vivo = false
    }
  }, [])

  async function copiarLink() {
    try {
      await navigator.clipboard.writeText(APK_URL_COMPLETA)
      setCopiado(true)
      window.setTimeout(() => setCopiado(false), 2500)
    } catch {
      window.prompt('Copie o link do app:', APK_URL_COMPLETA)
    }
  }

  const apk = versao !== 'buscando' && versao !== null ? versao : null

  return (
    <div className="cadastro-page animate-fade-up">
      <header className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div className="max-w-2xl">
          <h1 className="cadastro-page-title">Aplicativo</h1>
          <p className="text-sm text-ink-muted">
            O app para Android abre o Oferta de Carga em tela cheia, com ícone próprio, sem a barra do navegador e já
            logado. Ele não está na Play Store: o instalador é baixado daqui.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {noApp ? (
            <span className="rounded-full bg-emerald-100 px-3 py-1.5 text-sm font-semibold text-emerald-800">
              Você já está usando o app
            </span>
          ) : apk ? (
            <a className="cadastro-btn cadastro-btn--primary" href={APK_URL} download="oferta-de-carga.apk">
              Baixar o app para Android
              <span className="ml-1 text-xs font-normal opacity-80">
                · versão {apk.versao}
                {apk.tamanhoMb ? ` · ${String(apk.tamanhoMb).replace('.', ',')} MB` : ''}
              </span>
            </a>
          ) : versao === null ? (
            <span className="rounded-full bg-amber-100 px-3 py-1.5 text-sm font-semibold text-amber-800">
              O instalador ainda não foi publicado.
            </span>
          ) : null}
        </div>
      </header>

      {!noApp && iphone ? (
        <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <strong>iPhone:</strong> o app é só para Android. No iPhone, abra o Oferta de Carga no Safari, toque em
          Compartilhar e depois em <em>Adicionar à Tela de Início</em>.
        </div>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-3">
        {computador && !noApp ? (
          <section className={`${CARTAO} flex flex-col items-center text-center`}>
            <h2 className="mb-1 text-base font-bold text-ink">Baixar pelo celular</h2>
            <p className="mb-3 text-sm text-ink-muted">Aponte a câmera do celular Android para o código.</p>
            {/* Fundo branco próprio: o código continua legível no tema escuro. */}
            <img
              src={QR_BAIXAR_URL}
              alt="QR code para baixar o app do Oferta de Carga"
              width={200}
              height={200}
              className="tema-forcar-claro rounded-lg border border-ink/10 bg-white"
            />
            <p className="mt-3 text-xs text-ink-muted">Ou mande o link para o celular por WhatsApp:</p>
            <button
              type="button"
              className="cadastro-btn cadastro-btn--ghost mt-1"
              onClick={() => void copiarLink()}
            >
              {copiado ? 'Link copiado!' : 'Copiar link do app'}
            </button>
          </section>
        ) : null}

        <section className={CARTAO}>
          <h2 className="mb-2 text-base font-bold text-ink">O que o app tem a mais que o site</h2>
          <ul className="list-disc space-y-1.5 pl-5 text-sm text-ink">
            <li>Abre em tela cheia, com ícone próprio, sem a barra do navegador e já logado.</li>
            <li>
              Avisos de oferta nova, lance e viagem chegam como notificação do celular, com o ícone do app (permita as
              notificações quando o app pedir).
            </li>
            <li>
              Atalhos: segure o ícone do app para ir direto a <strong>Início</strong>, <strong>Calcular rota</strong>{' '}
              ou <strong>Mapa da frota</strong>.
            </li>
            <li>Links do Oferta de Carga recebidos por WhatsApp ou e-mail abrem direto no app.</li>
          </ul>
        </section>

        <section className={CARTAO}>
          <h2 className="mb-2 text-base font-bold text-ink">Como instalar</h2>
          <ol className="list-decimal space-y-1.5 pl-5 text-sm text-ink">
            <li>
              No celular Android, toque em <strong>Baixar o app para Android</strong>
              {computador ? ' (ou leia o QR code)' : ''}.
            </li>
            <li>
              Abra o arquivo baixado. Se o celular perguntar, <strong>permita instalar desta fonte</strong>.
            </li>
            <li>
              Se o Play Protect avisar que não conhece o app, toque em <strong>Instalar mesmo assim</strong>.
            </li>
            <li>
              Abra o <strong>Oferta de Carga</strong> e entre com o seu usuário.
            </li>
          </ol>
          <p className="mt-3 text-xs text-ink-muted">
            Para atualizar, baixe de novo e instale por cima. O app usa o Google Chrome do celular. Se você tinha
            instalado pelo Chrome (atalho na tela inicial), pode apagar aquele atalho.
          </p>
        </section>
      </div>
    </div>
  )
}
