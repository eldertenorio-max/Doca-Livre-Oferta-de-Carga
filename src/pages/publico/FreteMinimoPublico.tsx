import { useMemo } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { LOGO_DOCA_LIVRE_SRC } from '../../lib/brandAssets'
import { lerPerfilLocal } from '../../lib/perfilLocal'
import { isSiteOfertaDeCarga } from '../../lib/siteOfertaDeCarga'
import { LinkMapaFrota, LinkMapaLogistica, LinkRota, LinkSistema } from '../../components/ui/HostLink'
import { FreteMinimoCalc } from '../../components/carga/FreteMinimoCalc'
import { EIXOS_ANTT } from '../../lib/anttFrete'
import '../../styles/mapa-publico.css'
import '../../styles/rota-publico.css'
import '../../styles/frete-minimo.css'

export function FreteMinimoPublicoPage() {
  const user = lerPerfilLocal()
  const logado = Boolean(user)
  const navigate = useNavigate()
  const [sp] = useSearchParams()
  const kmRota = useMemo(() => {
    const n = Number(String(sp.get('km') || '').replace(',', '.'))
    return Number.isFinite(n) && n > 0 ? n : null
  }, [sp])
  const eixosInicial = useMemo(() => {
    const n = Number(sp.get('eixos'))
    if (EIXOS_ANTT.includes(n as (typeof EIXOS_ANTT)[number])) return n
    return 5
  }, [sp])
  const categoriaInicial = useMemo(() => {
    const n = Number(sp.get('cat'))
    return Number.isFinite(n) && n > 0 ? n : 5
  }, [sp])
  const pedagioRota = useMemo(() => {
    const n = Number(String(sp.get('pedagio') || '').replace(',', '.'))
    return Number.isFinite(n) && n > 0 ? n : null
  }, [sp])

  return (
    <div className="mapa-pub rota-pub frete-min-pagina">
      <header className="mapa-pub__top">
        <LinkRota className="mapa-pub__brand">
          <img src={LOGO_DOCA_LIVRE_SRC} alt="Doca Livre" />
          <strong>Oferta de carga</strong>
        </LinkRota>
        <div className="mapa-pub__top-actions">
          <LinkRota className="mapa-pub__btn mapa-pub__btn--ghost">Calcular rota</LinkRota>
          <LinkMapaLogistica className="mapa-pub__btn mapa-pub__btn--ghost">
            Mapa da Logística
          </LinkMapaLogistica>
          <LinkMapaFrota className="mapa-pub__btn mapa-pub__btn--ghost">
            Mapa da Frota
          </LinkMapaFrota>
          {logado ? (
            <LinkSistema
              className="mapa-pub__btn mapa-pub__btn--solid"
              to={user?.role === 'transportador' ? '/transportador' : '/embarcador'}
            >
              Ir para o sistema
            </LinkSistema>
          ) : (
            <>
              <LinkSistema className="mapa-pub__btn mapa-pub__btn--ghost" to="/login">
                Entrar
              </LinkSistema>
              <LinkSistema className="mapa-pub__btn mapa-pub__btn--solid" to="/cadastro-transportador">
                Cadastrar
              </LinkSistema>
            </>
          )}
        </div>
      </header>

      <div className="frete-min-pagina__shell">
        <div className="frete-min-pagina__card">
          <FreteMinimoCalc
            pagina
            kmRota={kmRota}
            pedagioRota={pedagioRota}
            eixosInicial={eixosInicial}
            categoriaInicial={categoriaInicial}
            onPedirRota={() => navigate(isSiteOfertaDeCarga() ? '/' : '/rota')}
          />
        </div>
      </div>
    </div>
  )
}
