import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { Empresa } from '../types'
import {
  autenticar,
  empresaDaSessao,
  loadSessao,
  registrarEmpresa,
  saveSessao,
  SUPER_USUARIOS,
  USUARIOS_EMPRESA,
  type Sessao,
} from './auth'
import { listarEmpresas, loadEmpresasCadastro, saveEmpresaCadastro } from './cadastroStore'
import { EMPRESA_DOCA_LIVRE } from './empresaDocaLivre'
import { sincronizarCatalogo, unirComCatalogoLocal, salvarUsuarioRemoto, tabelaAindaNaoExiste } from './supabaseSync'
import { EMPRESAS } from '../data/empresas'

type AuthCtx = {
  sessao: Sessao | null
  empresas: Empresa[]
  minhaEmpresa: Empresa | undefined
  login: (usuario: string, senha: string) => Promise<string | null>
  logout: () => void
  cadastrar: (params: Parameters<typeof registrarEmpresa>[0]) => Promise<Sessao>
  recarregarEmpresas: () => Promise<void>
  atualizarEmpresa: (empresa: Empresa) => Promise<void>
}

const Ctx = createContext<AuthCtx | null>(null)

function montarLista(remoto: Empresa[]): Empresa[] {
  const extra = listarEmpresas().filter((e) => e.origem === 'cadastro')
  const base = unirComCatalogoLocal(
    remoto.filter((e) => e.origem !== 'cadastro'),
    [...EMPRESAS, ...extra],
  )
  const edicoes = loadEmpresasCadastro()
  if (edicoes.length === 0) return base
  const porId = new Map(edicoes.map((e) => [e.id, e]))
  const porSlug = new Map(edicoes.map((e) => [e.slug, e]))
  const ids = new Set(base.map((e) => e.id))
  const slugs = new Set(base.map((e) => e.slug))
  const mesclada = base.map((e) => porId.get(e.id) ?? porSlug.get(e.slug) ?? e)
  const novas = edicoes.filter((e) => !ids.has(e.id) && !slugs.has(e.slug))
  return [...mesclada, ...novas]
}

export function AuthProvider({
  children,
  forcarSuper = null,
}: {
  children: ReactNode
  forcarSuper?: { nome: string; usuario: string } | null
}) {
  const [sessao, setSessao] = useState<Sessao | null>(() =>
    forcarSuper
      ? {
          usuario: forcarSuper.usuario,
          email: '',
          nome: forcarSuper.nome,
          papel: 'super',
          nivelHierarquia: 'super',
          superior: null,
          isSuper: true,
        }
      : loadSessao(),
  )

  useEffect(() => {
    if (!forcarSuper) return
    setSessao({
      usuario: forcarSuper.usuario,
      email: '',
      nome: forcarSuper.nome,
      papel: 'super',
      nivelHierarquia: 'super',
      superior: null,
      isSuper: true,
    })
  }, [forcarSuper?.usuario, forcarSuper?.nome])
  const [empresas, setEmpresas] = useState<Empresa[]>(() => listarEmpresas())

  useEffect(() => {
    let ativo = true
    void sincronizarCatalogo().then((lista) => {
      if (!ativo) return
      setEmpresas(montarLista(lista))
    })
    for (const conta of [...SUPER_USUARIOS, ...USUARIOS_EMPRESA]) {
      void salvarUsuarioRemoto(conta).catch(() => undefined)
    }
    return () => {
      ativo = false
    }
  }, [])

  const value = useMemo<AuthCtx>(() => {
    async function recarregarEmpresas() {
      const lista = await sincronizarCatalogo()
      setEmpresas(montarLista(lista))
    }

    async function atualizarEmpresa(empresa: Empresa) {
      setEmpresas((atual) => {
        const tem = atual.some((e) => e.id === empresa.id || e.slug === empresa.slug)
        if (!tem) return [...atual, empresa]
        return atual.map((e) => (e.id === empresa.id || e.slug === empresa.slug ? empresa : e))
      })
      try {
        await saveEmpresaCadastro(empresa)
      } catch (err) {
        if (tabelaAindaNaoExiste(err)) return
        console.warn('Perfil salvo neste aparelho; a nuvem não confirmou.', err)
      }
    }

    return {
      sessao,
      empresas,
      minhaEmpresa:
        empresas.find((e) => e.id === sessao?.empresaId || e.slug === sessao?.empresaSlug) ??
        empresaDaSessao(sessao) ??
        (sessao?.isSuper ? EMPRESA_DOCA_LIVRE : undefined),
      recarregarEmpresas,
      atualizarEmpresa,
      async login(usuario, senha) {
        const r = await autenticar(usuario, senha)
        if (!r.ok) return r.erro
        setSessao(r.sessao)
        await recarregarEmpresas()
        return null
      },
      logout() {
        saveSessao(null)
        setSessao(null)
      },
      async cadastrar(params) {
        const next = await registrarEmpresa(params)
        setSessao(next)
        await recarregarEmpresas()
        return next
      },
    }
  }, [sessao, empresas])

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useAuth() {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useAuth precisa estar dentro de AuthProvider')
  return ctx
}
