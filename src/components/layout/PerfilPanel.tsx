import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useData } from '../../context/DataContext'
import { formatCurrency, roundMoney } from '../../lib/businessRules'
import { isAcceptedImageFile } from '../../lib/veiculoFotos'
import { isSuperSession } from '../../lib/superUsers'
import { canonicalTransportadorId } from '../../lib/transportadorIds'
import { ImageCropModal } from '../ui/ImageCropModal'
import '../../styles/perfil.css'

type Aba = 'sobre' | 'conta'

function iniciais(nome: string) {
  const parts = nome.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return 'DL'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase()
}

function labelClassificacao(c?: string) {
  if (c === 'ouro') return 'Ouro'
  if (c === 'prata') return 'Prata'
  if (c === 'bronze') return 'Bronze'
  return '—'
}

type Props = {
  /** Fecha o painel no canto (popover). */
  onClose?: () => void
  /** Já abre o seletor de arquivo da foto ao montar (vindo do aviso "Adicionar agora"). */
  autoOpenFoto?: boolean
}

export function PerfilPanel({ onClose, autoOpenFoto }: Props) {
  const navigate = useNavigate()
  const {
    user,
    cargas,
    lances,
    transportadores,
    veiculos,
    motoristas,
    atualizarAvatarPerfil,
    effectiveTransportadorId,
  } = useData()
  const [aba, setAba] = useState<Aba>('sobre')
  const [busy, setBusy] = useState(false)
  const [erro, setErro] = useState('')
  const [okMsg, setOkMsg] = useState('')
  const [fotoParaAjustar, setFotoParaAjustar] = useState<File | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (autoOpenFoto) fileRef.current?.click()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- só na montagem
  }, [])

  const isSuper = isSuperSession(user)
  const tid = canonicalTransportadorId(
    effectiveTransportadorId() || user?.transportador_id || null,
  )
  const transportador = useMemo(
    () =>
      tid
        ? (transportadores ?? []).find(
            (t) => t.id === tid || canonicalTransportadorId(t.id) === tid,
          ) ?? null
        : null,
    [tid, transportadores],
  )

  const fotoUrl =
    user?.avatar_url?.trim() || transportador?.logo_url?.trim() || null
  const nome = user?.nome || transportador?.nome_fantasia || 'Usuário'
  const papel = isSuper
    ? 'Super Usuário'
    : user?.role === 'transportador'
      ? 'Transportador'
      : 'Embarcador'

  const stats = useMemo(() => {
    if (isSuper) {
      const publicadas = (cargas ?? []).filter((c) => c.publicado_em).length
      const fechadas = (cargas ?? []).filter(
        (c) => c.frete_fechado != null || c.transportador_vencedor_id,
      ).length
      return {
        esquerda: { valor: String(publicadas), rotulo: 'Cargas publicadas' },
        direita: { valor: String(fechadas), rotulo: 'Fretes fechados' },
      }
    }
    const tidLocal = tid
    const meusVencedores = (cargas ?? []).filter(
      (c) => tidLocal && c.transportador_vencedor_id === tidLocal,
    )
    const viagens = meusVencedores.filter(
      (c) => c.status === 'alocadas' || c.status === 'confirmadas' || c.frete_fechado != null,
    ).length
    const economia = meusVencedores.reduce((acc, c) => {
      if (c.frete_fechado == null || !c.frete_tabela) return acc
      const diff = c.frete_tabela - c.frete_fechado
      return acc + (diff > 0 ? diff : 0)
    }, 0)
    const meusLances = (lances ?? []).filter((l) => l.transportador_id === tidLocal).length
    return {
      esquerda: {
        valor: economia > 0 ? formatCurrency(roundMoney(economia)) : formatCurrency(0),
        rotulo: 'Economia até agora',
      },
      direita: {
        valor: String(viagens || meusLances),
        rotulo: viagens > 0 ? 'Total de fretes' : 'Lances enviados',
      },
    }
  }, [isSuper, cargas, lances, tid])

  const email = user?.email || transportador?.email || user?.usuario || '—'
  const telefone = transportador?.telefone || transportador?.contato_telefone || '—'
  const docsOk =
    transportador?.situacao === 'ativo' || isSuper || Boolean(transportador?.rntrc)
  const nivel = isSuper ? 'Administrador' : labelClassificacao(transportador?.classificacao)

  const qtdVeiculos = useMemo(() => {
    if (!tid) return 0
    return (veiculos ?? []).filter((v) => v.transportador_id === tid).length
  }, [veiculos, tid])
  const qtdMotoristas = useMemo(() => {
    if (!tid) return 0
    return (motoristas ?? []).filter((m) => m.transportador_id === tid).length
  }, [motoristas, tid])

  function onSelecionarArquivo(file: File | null) {
    if (!file) return
    setErro('')
    setOkMsg('')
    if (!isAcceptedImageFile(file)) {
      setErro('Use JPG, PNG ou WEBP.')
      return
    }
    setFotoParaAjustar(file)
  }

  async function onConfirmarRecorte(fotoRecortada: File) {
    setBusy(true)
    const res = await atualizarAvatarPerfil(fotoRecortada)
    setBusy(false)
    if (!res.ok) {
      setErro(res.error ?? 'Não foi possível salvar a foto.')
      return
    }
    setFotoParaAjustar(null)
    setOkMsg('Foto de perfil atualizada.')
  }

  async function onRemoverFoto() {
    setBusy(true)
    setErro('')
    setOkMsg('')
    const res = await atualizarAvatarPerfil(null)
    setBusy(false)
    if (!res.ok) {
      setErro(res.error ?? 'Não foi possível remover a foto.')
      return
    }
    setOkMsg('Foto removida.')
  }

  function go(path: string) {
    onClose?.()
    navigate(path)
  }

  return (
    <div className="perfil-panel-root">
      <div className="perfil-tabs" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={aba === 'sobre'}
          className={aba === 'sobre' ? 'is-active' : undefined}
          onClick={() => setAba('sobre')}
        >
          Sobre você
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={aba === 'conta'}
          className={aba === 'conta' ? 'is-active' : undefined}
          onClick={() => setAba('conta')}
        >
          Conta
        </button>
      </div>

      {aba === 'sobre' ? (
        <div className="perfil-panel">
          <div className="perfil-hero perfil-hero--static">
            <span className="perfil-hero__avatar" aria-hidden>
              {fotoUrl ? <img src={fotoUrl} alt="" /> : <span>{iniciais(nome)}</span>}
              {(docsOk || isSuper) && (
                <i className="perfil-hero__badge" title="Perfil verificado" />
              )}
            </span>
            <span className="perfil-hero__text">
              <strong>{nome}</strong>
              <span>{papel}</span>
              <div className="perfil-foto-acoes">
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp"
                  hidden
                  onChange={(e) => {
                    const f = e.target.files?.[0] ?? null
                    e.target.value = ''
                    onSelecionarArquivo(f)
                  }}
                />
                <button
                  type="button"
                  className="perfil-foto-acao"
                  disabled={busy}
                  onClick={() => fileRef.current?.click()}
                >
                  {fotoUrl ? 'Alterar' : 'Adicionar foto'}
                </button>
                {fotoUrl ? (
                  <>
                    <button
                      type="button"
                      className="perfil-foto-acao"
                      disabled={busy}
                      onClick={() => fileRef.current?.click()}
                    >
                      Editar
                    </button>
                    <button
                      type="button"
                      className="perfil-foto-acao perfil-foto-acao--danger"
                      disabled={busy}
                      onClick={() => void onRemoverFoto()}
                    >
                      Excluir
                    </button>
                  </>
                ) : null}
              </div>
            </span>
          </div>

          <div className="perfil-stats">
            <div>
              <p className="perfil-stats__value">{stats.esquerda.valor}</p>
              <p className="perfil-stats__label">{stats.esquerda.rotulo}</p>
            </div>
            <div>
              <p className="perfil-stats__value">{stats.direita.valor}</p>
              <p className="perfil-stats__label">{stats.direita.rotulo}</p>
            </div>
          </div>

          <div className="perfil-links">
            <button type="button" className="perfil-link" onClick={() => setAba('conta')}>
              Ver dados pessoais
            </button>
          </div>

          {(erro || okMsg) && (
            <p className={erro ? 'perfil-msg perfil-msg--erro' : 'perfil-msg'}>
              {erro || okMsg}
            </p>
          )}

          <div className="perfil-verified">
            <h3>
              {isSuper || docsOk ? 'Você tem um Perfil Verificado' : 'Perfil em verificação'}
            </h3>
            <ul>
              <li className={docsOk || isSuper ? 'is-ok' : undefined}>
                {docsOk || isSuper ? 'Documentação confirmada' : 'Documentação pendente'}
              </li>
              <li className={email && email !== '—' ? 'is-ok' : undefined}>{email}</li>
              <li className={telefone && telefone !== '—' ? 'is-ok' : undefined}>{telefone}</li>
            </ul>
          </div>

          {!isSuper && transportador && (
            <div className="perfil-extra">
              <p>
                <span>Nível</span>
                <strong>{nivel}</strong>
              </p>
              <p>
                <span>Pontuação</span>
                <strong>{transportador.pontuacao ?? 0}</strong>
              </p>
              <p>
                <span>Veículos</span>
                <strong>{qtdVeiculos}</strong>
              </p>
              <p>
                <span>Motoristas</span>
                <strong>{qtdMotoristas}</strong>
              </p>
            </div>
          )}
        </div>
      ) : (
        <div className="perfil-panel">
          <h3 className="perfil-conta-title">Dados da conta</h3>
          <dl className="perfil-dl">
            <div>
              <dt>Nome</dt>
              <dd>{nome}</dd>
            </div>
            <div>
              <dt>Usuário / e-mail</dt>
              <dd>{email}</dd>
            </div>
            <div>
              <dt>Perfil</dt>
              <dd>{papel}</dd>
            </div>
            {transportador && (
              <>
                <div>
                  <dt>Empresa</dt>
                  <dd>{transportador.nome_fantasia || transportador.razao_social}</dd>
                </div>
                <div>
                  <dt>CNPJ</dt>
                  <dd>{transportador.cnpj || '—'}</dd>
                </div>
                <div>
                  <dt>Telefone</dt>
                  <dd>{telefone}</dd>
                </div>
                <div>
                  <dt>Cidade</dt>
                  <dd>
                    {[transportador.cidade, transportador.uf].filter(Boolean).join(' / ') || '—'}
                  </dd>
                </div>
                <div>
                  <dt>Classificação</dt>
                  <dd>{labelClassificacao(transportador.classificacao)}</dd>
                </div>
              </>
            )}
          </dl>

          <div className="perfil-conta-actions">
            {isSuper && (
              <button
                type="button"
                className="perfil-btn"
                onClick={() => go('/embarcador/config')}
              >
                Configuração do portal
              </button>
            )}
            {user?.role === 'transportador' && (
              <button
                type="button"
                className="perfil-btn"
                onClick={() => go('/transportador/painel')}
              >
                Painel do transportador
              </button>
            )}
            {onClose && (
              <button type="button" className="perfil-btn perfil-btn--ghost" onClick={onClose}>
                Fechar
              </button>
            )}
          </div>
        </div>
      )}
      <ImageCropModal
        open={Boolean(fotoParaAjustar)}
        file={fotoParaAjustar}
        busy={busy}
        onCancel={() => setFotoParaAjustar(null)}
        onConfirm={(f) => void onConfirmarRecorte(f)}
      />
    </div>
  )
}
