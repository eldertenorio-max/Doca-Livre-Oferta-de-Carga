import { describe, expect, it } from 'vitest'
import { idsVisiveisSombra, modulosAbertosSombra } from './escopoSombra'
import { flattenOrg, nosVisiveis, type OrgNo } from './orgHierarchy'

const tree: OrgNo[] = [
  {
    id: 'emb',
    parent_id: null,
    tipo: 'embarcador',
    nome: 'Ultrafrio',
    children: [
      {
        id: 'cd',
        parent_id: 'emb',
        tipo: 'unidade',
        nome: 'CD Guarulhos',
        children: [
          {
            id: 'santos',
            parent_id: 'cd',
            tipo: 'transportadora',
            nome: 'Santos',
            transportador_id: 't-santos',
            children: [],
          },
        ],
      },
      {
        id: 'cd2',
        parent_id: 'emb',
        tipo: 'unidade',
        nome: 'CD Campinas',
        children: [
          {
            id: 'nova',
            parent_id: 'cd2',
            tipo: 'transportadora',
            nome: 'Nova Era',
            transportador_id: 't-nova',
            children: [],
          },
        ],
      },
    ],
  },
]

function ids(lista: { id: string }[]) {
  return lista.map((n) => n.id).sort()
}

describe('fase 1 — hierarquia, perfil e permissões', () => {
  it('o super vê a árvore inteira', () => {
    const visto = idsVisiveisSombra(tree, { role: 'super', usuario: 'diego' }).sort()
    expect(visto).toEqual(ids(flattenOrg(tree)))
  })

  it('o embarcador vê a si e quem está abaixo, igual à hierarquia atual', () => {
    const sombra = idsVisiveisSombra(tree, { role: 'minerva', empresa_org_id: 'emb' }).sort()
    expect(sombra).toEqual(ids(nosVisiveis(tree, 'emb')))
    expect(sombra).toContain('santos')
    expect(sombra).toContain('nova')
  })

  it('a unidade não vê a transportadora da outra unidade', () => {
    const sombra = idsVisiveisSombra(tree, { role: 'minerva', empresa_org_id: 'cd' }).sort()
    expect(sombra).toEqual(ids(nosVisiveis(tree, 'cd')))
    expect(sombra).toContain('santos')
    expect(sombra).not.toContain('nova')
  })

  it('a transportadora vê só o próprio ponto', () => {
    const sombra = idsVisiveisSombra(tree, {
      role: 'transportador',
      transportador_id: 't-santos',
    }).sort()
    expect(sombra).toEqual(ids(nosVisiveis(tree, 'santos')))
    expect(sombra).toEqual(['santos'])
  })

  it('embarcador sem ponto na hierarquia não vê ninguém', () => {
    expect(idsVisiveisSombra(tree, { role: 'minerva' })).toEqual([])
  })

  it('super abre o kanban do embarcador; transportadora não', () => {
    const superMods = modulosAbertosSombra({ role: 'super', is_superuser: true })
    const transp = modulosAbertosSombra({
      role: 'transportador',
      permissoes_modulos: {
        kanban_transportador: 'editar',
        veiculos: 'visualizar',
      },
    })
    expect(superMods).toContain('kanban')
    expect(superMods).toContain('hierarquia')
    expect(transp).not.toContain('kanban')
    expect(transp).toContain('kanban_transportador')
    expect(transp).toContain('veiculos')
    expect(transp).not.toContain('permissoes')
  })

  it('conta de transportadora não vira super pelo e-mail', () => {
    const visto = idsVisiveisSombra(tree, {
      role: 'transportador',
      email: 'diego@docalivre.com',
      transportador_id: 't-santos',
    })
    expect(visto).toEqual(['santos'])
  })
})
