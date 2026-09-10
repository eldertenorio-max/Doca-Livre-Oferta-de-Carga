import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type { Empresa } from '../../types'
import { semAcento } from '../../lib/search'
import { EMPRESA_DOCA_LIVRE } from '../../lib/empresaDocaLivre'
import '../../styles/perfil-empresa.css'

type Props = {
  empresas: Empresa[]
}

export function SeletorEditarEmpresa({ empresas }: Props) {
  const navigate = useNavigate()
  const [q, setQ] = useState('')

  const lista = useMemo(() => {
    const base = empresas.some((e) => e.id === EMPRESA_DOCA_LIVRE.id)
      ? empresas
      : [EMPRESA_DOCA_LIVRE, ...empresas]
    const tokens = semAcento(q)
      .split(/\s+/)
      .filter((t) => t.length >= 2)
    const filtrada = tokens.length
      ? base.filter((e) => {
          const hay = semAcento(
            `${e.nome_fantasia} ${e.razao_social} ${e.cidade} ${e.uf} ${e.slug} ${e.cnpj || ''}`,
          )
          return tokens.every((t) => hay.includes(t))
        })
      : base
    return [...filtrada].sort((a, b) => a.nome_fantasia.localeCompare(b.nome_fantasia, 'pt-BR')).slice(0, 40)
  }, [empresas, q])

  return (
    <section className="tv-perfil-picker">
      <h2>Editar perfil de outra empresa</h2>
      <p>Busque pelo nome, cidade ou CNPJ e abra a página de apresentação para editar.</p>
      <input
        className="tv-perfil-picker__busca"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Ex.: Braspress, Guarulhos, Toyota…"
        aria-label="Buscar empresa para editar"
      />
      <ul className="tv-perfil-picker__lista">
        {lista.map((e) => (
          <li key={e.id}>
            <button
              type="button"
              onClick={() => navigate(`/embarcador/mapa-logistica/empresa/${e.slug}?editar=1`)}
            >
              <strong>{e.nome_fantasia}</strong>
              <span>
                {e.cidade}/{e.uf}
                {e.cnpj ? ` · ${e.cnpj}` : ''}
              </span>
            </button>
          </li>
        ))}
      </ul>
      {lista.length === 0 ? <p className="tv-perfil-picker__vazio">Nenhuma empresa encontrada.</p> : null}
    </section>
  )
}
