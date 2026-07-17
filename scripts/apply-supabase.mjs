import pg from 'pg'
import fs from 'fs'

const client = new pg.Client({
  host: 'aws-1-sa-east-1.pooler.supabase.com',
  port: 5432,
  database: 'postgres',
  user: 'postgres.imnlbbfgaztfhwndfxwb',
  password: process.env.PGPASSWORD,
  ssl: { rejectUnauthorized: false },
  connectionTimeoutMillis: 20000,
})

await client.connect()
console.log('connected')

const files = process.argv.slice(2)
if (files.length === 0) {
  console.error('Usage: node apply-supabase.mjs file1.sql [file2.sql...]')
  process.exit(1)
}

try {
  for (const file of files) {
    let sql = fs.readFileSync(file, 'utf8')
    if (sql.charCodeAt(0) === 0xfeff) sql = sql.slice(1)
    console.log('running', file)
    await client.query(sql)
    console.log('ok', file)
  }
  const r = await client.query('select count(*)::int as n from transportadores')
  console.log('transportadores=', r.rows[0].n)
  const c = await client.query('select count(*)::int as n from cargas')
  console.log('cargas=', c.rows[0].n)
  console.log('SQL_OK')
} catch (e) {
  console.error('SQL_ERR', e.message)
  process.exitCode = 1
} finally {
  await client.end()
}
