/** Login da fase 6. A coluna senha_hash entra como está, sem reset e sem hash novo. */

export type ContaImportada = {
  usuario: string
  email: string
  senha_hash: string | null
  ativo: boolean
  origem?: string | null
}

export type ParecerLogin =
  | { ok: true; email: string; senha_hash: string | null }
  | { ok: false; erro: string }

/** Cópia fiel da coluna. Não corta espaço, não gera hash. */
export function senhaParaImportar(senhaHash: string | null | undefined): string | null {
  if (senhaHash == null) return null
  return senhaHash
}

/** Mesma conferência do portal: igual, ou igual sem diferenciar maiúsculas. */
export function senhaGravadaConfere(
  senhaHash: string | null | undefined,
  digitada: string,
): boolean {
  const salva = senhaHash || ''
  if (!salva) return false
  if (salva === digitada) return true
  return salva.toLowerCase() === digitada.toLowerCase()
}

function normalizarLogin(valor: string): string {
  return (valor || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
}

export function parecerLogin(
  contas: ContaImportada[],
  identificador: string,
  senha: string,
): ParecerLogin {
  const id = normalizarLogin(identificador)
  const idCompact = id.replace(/\s+/g, '')
  const candidatos = contas.filter((c) => {
    const email = normalizarLogin(c.email)
    const usuario = normalizarLogin(c.usuario)
    return email === id || usuario === id || usuario.replace(/\s+/g, '') === idCompact
  })
  const conta = candidatos.find((c) =>
    senhaGravadaConfere(senhaParaImportar(c.senha_hash) || '', senha),
  )
  if (!conta) return { ok: false, erro: 'Usuário ou senha incorretos.' }

  if ((conta.origem || '').trim() === 'rota_publico') {
    return {
      ok: false,
      erro:
        'Esta conta é só dos sites públicos (calculadora ou mapas). Para o sistema Oferta de Carga, use o cadastro de transportadora ou embarcador.',
    }
  }
  if (!conta.ativo) {
    return {
      ok: false,
      erro: 'Cadastro aguardando aprovação. Você poderá entrar após a liberação.',
    }
  }
  const gravada = senhaParaImportar(conta.senha_hash) || ''
  if (gravada.length < 4) {
    return {
      ok: false,
      erro: 'Esta conta está sem senha. Peça ao Super Usuário para definir uma senha no painel.',
    }
  }
  return { ok: true, email: conta.email, senha_hash: conta.senha_hash }
}
