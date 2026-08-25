import { useMemo, useState } from 'react'
import {
  Building2,
  ChevronDown,
  ChevronRight,
  FileText,
  GitBranch,
  Minus,
  Pencil,
  Plus,
  Shield,
  Truck,
  Users,
  Warehouse,
} from 'lucide-react'
import {
  ORG_TIPO_LABEL,
  SUPER_HIERARQUIA,
  allowedOrgChildTypes,
  type OrgNo,
  type OrgTipo,
} from '../../lib/orgHierarchy'
import type { PortalAccount } from '../../lib/portalAuth'
import { isLocalSuperUser } from '../../lib/superUsers'
import { canonicalTransportadorId, sameTransportadorId } from '../../lib/transportadorIds'
import type { Transportador } from '../../types'

const SUPER_ID = 'super-root'

type TipoVisual = OrgTipo | 'super'

const TIPO_META: Record<
  TipoVisual,
  {
    card: string
    badge: string
    logo: string
    Icon: typeof Building2
  }
> = {
  super: {
    card: 'org-tree__card--super',
    badge: 'org-tree__badge--super',
    logo: 'org-tree__logo--super',
    Icon: Shield,
  },
  operador_logistico: {
    card: 'org-tree__card--operador',
    badge: 'org-tree__badge--operador',
    logo: 'org-tree__logo--operador',
    Icon: Building2,
  },
  filial_operador: {
    card: 'org-tree__card--filial',
    badge: 'org-tree__badge--filial',
    logo: 'org-tree__logo--filial',
    Icon: GitBranch,
  },
  embarcador: {
    card: 'org-tree__card--embarcador',
    badge: 'org-tree__badge--embarcador',
    logo: 'org-tree__logo--embarcador',
    Icon: Building2,
  },
  unidade: {
    card: 'org-tree__card--unidade',
    badge: 'org-tree__badge--unidade',
    logo: 'org-tree__logo--unidade',
    Icon: Warehouse,
  },
  transportadora: {
    card: 'org-tree__card--transportadora',
    badge: 'org-tree__badge--transportadora',
    logo: 'org-tree__logo--transportadora',
    Icon: Truck,
  },
}

function iniciais(nome: string) {
  const parts = nome.trim().split(/\s+/).filter(Boolean)
  if (!parts.length) return '?'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

function normCnpj(s: string | null | undefined) {
  return (s || '').replace(/\D/g, '')
}

function isContaSuper(a: PortalAccount) {
  if (a.role === 'super') return true
  return isLocalSuperUser(a.usuario) || isLocalSuperUser(a.email)
}

/** Diego/Elder (e outros Super) sem duplicar logins da mesma pessoa. */
function countContasSuper(accounts: PortalAccount[]): number {
  const seen = new Set<string>()
  for (const a of accounts) {
    if (!isContaSuper(a)) continue
    seen.add(chaveSuper(a.usuario, a.email) || a.id)
  }
  return seen.size || SUPER_HIERARQUIA.length
}

function chaveSuper(usuario: string, email: string) {
  const blob = `${usuario} ${email}`
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
  if (blob.includes('elder')) return 'elder'
  if (blob.includes('diego')) return 'diego'
  return (email || usuario).trim().toLowerCase()
}

function tidDaConta(a: PortalAccount): string | null {
  const direto = canonicalTransportadorId(a.transportador_id)
  if (direto) return direto
  const org = (a.empresa_org_id || '').trim()
  if (org.startsWith('transportador:')) {
    return canonicalTransportadorId(org.slice('transportador:'.length))
  }
  return canonicalTransportadorId(org)
}

/** IDs de transportadora cobertos por este nó (folha ou ramificação). */
function tidsDoNo(n: OrgNo, transportadores: Transportador[]): string[] {
  if (n.tipo === 'transportadora') {
    const ids = new Set<string>()
    const proprio = canonicalTransportadorId(n.transportador_id)
    if (proprio) ids.add(proprio)
    const cnpj = normCnpj(n.cnpj)
    const nome = (n.nome || '').trim().toLowerCase()
    for (const t of transportadores) {
      const tid = canonicalTransportadorId(t.id)
      if (!tid) continue
      if (proprio && sameTransportadorId(t.id, proprio)) ids.add(tid)
      else if (cnpj && normCnpj(t.cnpj) === cnpj) ids.add(tid)
      else if (nome && (t.nome_fantasia || '').trim().toLowerCase() === nome) ids.add(tid)
    }
    return [...ids]
  }
  return (n.children ?? []).flatMap((c) => tidsDoNo(c, transportadores))
}

function contaDaTransportadora(
  a: PortalAccount,
  tids: Set<string>,
  transportadores: Transportador[],
): boolean {
  if (isContaSuper(a) || a.role === 'super') return false
  const atid = tidDaConta(a)
  if (atid && [...tids].some((id) => sameTransportadorId(id, atid))) return true
  if (!atid) {
    const nome = (a.nome || a.usuario || '').trim().toLowerCase()
    if (!nome) return false
    return transportadores.some((t) => {
      const tid = canonicalTransportadorId(t.id)
      if (!tid || ![...tids].some((id) => sameTransportadorId(id, tid))) return false
      return (
        (t.nome_fantasia || '').trim().toLowerCase() === nome ||
        (t.razao_social || '').trim().toLowerCase() === nome
      )
    })
  }
  return false
}

function countUsers(
  n: OrgNo,
  accounts: PortalAccount[],
  transportadores: Transportador[],
): number {
  const tids = new Set(tidsDoNo(n, transportadores))
  if (tids.size === 0) return 0
  const seen = new Set<string>()
  for (const a of accounts) {
    if (!contaDaTransportadora(a, tids, transportadores)) continue
    const key = (a.id || a.email || a.usuario).toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
  }
  return seen.size
}

export function OrgHierarchyTree({
  nodes,
  accounts,
  transportadores,
  onAdd,
  onEdit,
  onRemove,
}: {
  nodes: OrgNo[]
  accounts: PortalAccount[]
  transportadores: Transportador[]
  onAdd: (parent: OrgNo | null) => void
  onEdit: (node: OrgNo) => void
  onRemove: (id: string) => void
}) {
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set())
  const logos = useMemo(() => {
    const map = new Map<string, string>()
    for (const t of transportadores) {
      const tid = canonicalTransportadorId(t.id)
      if (t.logo_url && tid) map.set(tid, t.logo_url)
    }
    return map
  }, [transportadores])

  function toggle(id: string) {
    setCollapsed((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const superOpen = !collapsed.has(SUPER_ID)
  const superUsers = countContasSuper(accounts)

  return (
    <ul className="org-tree">
      <li className="org-tree__node">
        <OrgCard
          tipo="super"
          nome="Super Usuários"
          subtitulo={SUPER_HIERARQUIA.map((s) => s.nome).join(' · ')}
          hasChildren={nodes.length > 0}
          open={superOpen}
          users={superUsers}
          canAdd
          canEdit={false}
          canRemove={false}
          addTitle="Adicionar embarcador"
          onToggle={() => toggle(SUPER_ID)}
          onAdd={() => onAdd(null)}
        />
        {superOpen && nodes.length > 0 && (
          <OrgNodes
            nodes={nodes}
            accounts={accounts}
            transportadores={transportadores}
            logos={logos}
            collapsed={collapsed}
            onToggle={toggle}
            onAdd={onAdd}
            onEdit={onEdit}
            onRemove={onRemove}
          />
        )}
        {superOpen && nodes.length === 0 && (
          <p className="org-tree__empty">Nenhum embarcador. Use + para cadastrar.</p>
        )}
      </li>
    </ul>
  )
}

function OrgNodes({
  nodes,
  accounts,
  transportadores,
  logos,
  collapsed,
  onToggle,
  onAdd,
  onEdit,
  onRemove,
}: {
  nodes: OrgNo[]
  accounts: PortalAccount[]
  transportadores: Transportador[]
  logos: Map<string, string>
  collapsed: Set<string>
  onToggle: (id: string) => void
  onAdd: (parent: OrgNo | null) => void
  onEdit: (node: OrgNo) => void
  onRemove: (id: string) => void
}) {
  return (
    <ul className="org-tree org-tree--nested">
      {nodes.map((n) => {
        const children = n.children ?? []
        const open = !collapsed.has(n.id)
        const canAdd = allowedOrgChildTypes(n.tipo).length > 0
        const tidLogo = canonicalTransportadorId(n.transportador_id)
        const logoUrl = tidLogo
          ? logos.get(tidLogo) ||
            [...logos.entries()].find(([id]) => sameTransportadorId(id, tidLogo))?.[1]
          : undefined
        return (
          <li key={n.id} className="org-tree__node">
            <OrgCard
              tipo={n.tipo}
              nome={n.nome}
              cnpj={n.cnpj}
              logoUrl={logoUrl}
              hasChildren={children.length > 0}
              open={open}
              users={countUsers(n, accounts, transportadores)}
              canAdd={canAdd}
              canEdit
              canRemove
              addTitle={`Adicionar ${ORG_TIPO_LABEL[allowedOrgChildTypes(n.tipo)[0] ?? n.tipo]}`}
              onToggle={() => onToggle(n.id)}
              onAdd={() => onAdd(n)}
              onEdit={() => onEdit(n)}
              onRemove={() => onRemove(n.id)}
            />
            {open && children.length > 0 && (
              <OrgNodes
                nodes={children}
                accounts={accounts}
                transportadores={transportadores}
                logos={logos}
                collapsed={collapsed}
                onToggle={onToggle}
                onAdd={onAdd}
                onEdit={onEdit}
                onRemove={onRemove}
              />
            )}
          </li>
        )
      })}
    </ul>
  )
}

function OrgCard({
  tipo,
  nome,
  cnpj,
  subtitulo,
  logoUrl,
  hasChildren,
  open,
  users,
  canAdd,
  canEdit,
  canRemove,
  addTitle,
  onToggle,
  onAdd,
  onEdit,
  onRemove,
}: {
  tipo: TipoVisual
  nome: string
  cnpj?: string | null
  subtitulo?: string
  logoUrl?: string
  hasChildren: boolean
  open: boolean
  users: number
  canAdd: boolean
  canEdit: boolean
  canRemove: boolean
  addTitle: string
  onToggle: () => void
  onAdd?: () => void
  onEdit?: () => void
  onRemove?: () => void
}) {
  const meta = TIPO_META[tipo]
  const BadgeIcon = meta.Icon
  const label = tipo === 'super' ? 'Super' : ORG_TIPO_LABEL[tipo]
  const doc = (cnpj || '').trim()
  const extra = (subtitulo || '').trim()

  return (
    <div className={`org-tree__card ${meta.card}`}>
      <div className="org-tree__left">
        {hasChildren ? (
          <button
            type="button"
            className="org-tree__toggle"
            aria-expanded={open}
            aria-label={open ? 'Recolher' : 'Expandir'}
            onClick={onToggle}
          >
            {open ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
          </button>
        ) : null}
        {logoUrl ? (
          <img className="org-tree__logo" src={logoUrl} alt="" />
        ) : (
          <span className={`org-tree__logo org-tree__logo--empty ${meta.logo}`} aria-hidden>
            {iniciais(nome)}
          </span>
        )}
        <div className="org-tree__meta">
          <strong className="org-tree__name">{nome}</strong>
          {doc ? (
            <span className="org-tree__cnpj">
              <FileText size={12} strokeWidth={2.2} />
              {doc}
            </span>
          ) : extra ? (
            <span className="org-tree__cnpj">{extra}</span>
          ) : null}
        </div>
      </div>
      <div className="org-tree__right">
        <span className={`org-tree__badge ${meta.badge}`}>
          <BadgeIcon size={13} strokeWidth={2.4} />
          {label}
        </span>
        <span className="org-tree__users" title="Contas de usuário neste nível">
          <Users size={15} strokeWidth={2.2} />
          {users}
        </span>
        {canEdit && (
          <button type="button" className="org-tree__icon-btn" title="Editar" onClick={onEdit}>
            <Pencil size={14} />
          </button>
        )}
        {canAdd && (
          <button type="button" className="org-tree__icon-btn" title={addTitle} onClick={onAdd}>
            <Plus size={16} />
          </button>
        )}
        {canRemove && (
          <button
            type="button"
            className="org-tree__icon-btn org-tree__icon-btn--danger"
            title="Remover"
            onClick={onRemove}
          >
            <Minus size={16} />
          </button>
        )}
      </div>
    </div>
  )
}
