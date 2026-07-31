import { ViagensBoard } from '../../components/viagens/ViagensBoard'

export function ViagensEmbarcadorPage() {
  return (
    <div className="flex h-full min-h-0 flex-col gap-3 overflow-hidden">
      <div className="shrink-0">
        <h1 className="cadastro-page-title m-0 text-lg font-extrabold text-ink">Viagens</h1>
        <p className="mt-1 text-xs text-ink-muted">
          Acompanhe cargas alocadas: aguardando início, em rota, finalizadas e canceladas. Em
          Rota iniciada, use Finalizar rota para gravar o tempo e avaliar motorista e veículo.
        </p>
      </div>
      <div className="min-h-0 flex-1 overflow-hidden">
        <ViagensBoard mode="minerva" />
      </div>
    </div>
  )
}
