import fs from 'node:fs'
import pg from 'pg'

export const pool = new pg.Pool({
  ssl: process.env.PGHOST ? { rejectUnauthorized: false } : undefined,
})

const arquivos = ['001_nucleo.sql', '002_resto.sql']

export async function preparar() {
  for (const nome of arquivos) {
    const sql = fs.readFileSync(new URL(`./sql/${nome}`, import.meta.url), 'utf8')
    await pool.query(sql)
  }
  await pool.query("notify pgrst, 'reload schema'")
}
