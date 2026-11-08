import pg from 'pg';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from './config.js';

const { Pool } = pg;

export const pool = new Pool({
  connectionString: config.databaseUrl,
  max: config.poolMax,
});

pool.on('error', (err) => {
  console.error('Postgres pool error:', err.message);
});

export const query = (text, params) => pool.query(text, params);

export async function one(text, params) {
  const { rows } = await pool.query(text, params);
  return rows[0] ?? null;
}

export async function many(text, params) {
  const { rows } = await pool.query(text, params);
  return rows;
}

export async function tx(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function migrate() {
  const client = await pool.connect();
  try {
    await client.query('SELECT pg_advisory_lock(918273645)');
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version text PRIMARY KEY,
        applied_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    const { rows } = await client.query('SELECT version FROM schema_migrations');
    const applied = new Set(rows.map((r) => r.version));
    const dir = path.join(
      path.dirname(fileURLToPath(import.meta.url)),
      '..',
      'db',
      'migrations',
    );
    const files = (await readdir(dir)).filter((f) => f.endsWith('.sql')).sort();
    for (const file of files) {
      if (applied.has(file)) continue;
      const sql = await readFile(path.join(dir, file), 'utf8');
      await client.query('BEGIN');
      try {
        await client.query(sql);
        await client.query('INSERT INTO schema_migrations (version) VALUES ($1)', [file]);
        await client.query('COMMIT');
        console.log(`Migrated ${file}`);
      } catch (err) {
        await client.query('ROLLBACK');
        throw new Error(`Migration ${file} failed: ${err.message}`);
      }
    }
  } finally {
    await client.query('SELECT pg_advisory_unlock(918273645)').catch(() => {});
    client.release();
  }
}

export async function closeDb() {
  await pool.end();
}
