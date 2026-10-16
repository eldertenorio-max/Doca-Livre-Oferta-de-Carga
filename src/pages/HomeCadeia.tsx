import { LOGO_DOCA_LIVRE_SRC } from '../lib/brandAssets'
import '../styles/home-cadeia.css'

export function HomeCadeiaPage() {
  return (
    <div className="home-cadeia">
      <header className="home-cadeia__boas">
        <img src={LOGO_DOCA_LIVRE_SRC} alt="Doca Livre" />
        <div>
          <p>Cadeia de sistemas</p>
          <h1>Bem-vindo</h1>
        </div>
      </header>
    </div>
  )
}
