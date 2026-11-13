import { LOGO_DOCA_LIVRE_SRC } from '../lib/brandAssets'
import { APK_URL, ehAndroid, linkAbrirApp } from '../lib/aplicativo'
import '../styles/login.css'

/**
 * Tela no lugar do sistema quando ele é aberto pelo app instalado pelo navegador (Chrome/Edge). Esse jeito de
 * instalar foi desativado: no Android vale só o app oficial (APK); no computador, o site no navegador.
 */
export function AtalhoDesativado() {
  const android = ehAndroid()
  return (
    <div className="portal-login portal-login--fundo tema-forcar-claro">
      <div className="portal-login__card" role="alert">
        <div className="portal-login__header">
          <img src={LOGO_DOCA_LIVRE_SRC} alt="Doca Livre" className="portal-login__logo" />
          <h1 className="portal-login__title">Este atalho foi desativado</h1>
        </div>
        {android ? (
          <>
            <p className="portal-login__lead">
              O Oferta de Carga agora tem um <strong>aplicativo de verdade para Android</strong>. O app instalado
              pelo Chrome não funciona mais.
            </p>
            <a className="portal-login__submit atalho-desativado__btn" href={APK_URL} download="oferta-de-carga.apk">
              Baixar o app
            </a>
            <a className="portal-login__link atalho-desativado__link" href={linkAbrirApp()}>
              Já instalei — abrir o app
            </a>
            <p className="portal-login__hint atalho-desativado__passos">
              Abra o arquivo baixado e toque em <strong>Instalar</strong> (se o celular pedir, permita instalar desta
              fonte). Depois apague este atalho antigo: segure o ícone e toque em <strong>Desinstalar</strong>.
            </p>
          </>
        ) : (
          <>
            <p className="portal-login__lead">
              O app instalado pelo navegador não funciona mais. Use o Oferta de Carga direto no navegador, em{' '}
              <strong>ofertadecarga.com.br</strong> (dá para salvar nos favoritos). No celular Android, use o app
              oficial: menu <strong>Aplicativo</strong> do sistema.
            </p>
            <p className="portal-login__hint atalho-desativado__passos">
              Para remover este atalho: menu <strong>⋮</strong> no canto do app → <strong>Desinstalar</strong>.
            </p>
          </>
        )}
      </div>
    </div>
  )
}
