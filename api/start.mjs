import { spawn } from 'node:child_process'
import { reportarErro } from './control-center.mjs'

const senha = encodeURIComponent(process.env.PGPASSWORD || '')
process.env.PGRST_DB_URI = `postgres://${process.env.PGUSER}:${senha}@${process.env.PGHOST}:5432/${process.env.PGDATABASE}?sslmode=require`
process.env.PGRST_DB_SCHEMAS = 'public'
process.env.PGRST_DB_ANON_ROLE = 'web'
process.env.PGRST_SERVER_HOST = '127.0.0.1'
process.env.PGRST_SERVER_PORT = '3001'

const { preparar } = await import('./migrar.mjs')
try {
  await preparar()
} catch (erro) {
  const mensagem = erro instanceof Error ? erro.message : 'Falha ao preparar'
  console.error(mensagem)
  process.env.MIGRACAO_ERRO = mensagem
}

const postgrest = spawn('/usr/local/bin/postgrest', [], { stdio: 'inherit' })
postgrest.on('exit', (codigo) => {
  console.error(`postgrest encerrou ${codigo}`)
  // Sem o PostgREST nenhuma tela de dados funciona, mesmo com a rota de saúde respondendo.
  reportarErro({
    nivel: 'critical',
    titulo: 'O serviço de dados (PostgREST) parou',
    mensagem: `O PostgREST encerrou com código ${codigo}; as telas que leem ou gravam dados deixam de funcionar.`,
    acao: 'Serviço de dados',
    tela: 'Servidor',
    chave: 'postgrest-exit',
  })
})

await import('./server.js')
