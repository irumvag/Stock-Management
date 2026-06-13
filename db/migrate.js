// Runs SQL migration files (and optionally the seed) against Neon.
//   node db/migrate.js          -> apply all migrations in db/migrations
//   node db/migrate.js --seed   -> apply migrations, then db/seed.sql
//
// Requires DATABASE_URL (Neon connection string) in the environment or .env.
import 'dotenv/config';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { neon } from '@neondatabase/serverless';

const __dirname = dirname(fileURLToPath(import.meta.url));

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('ERROR: DATABASE_URL is not set. Add it to .env or the environment.');
  process.exit(1);
}

const sql = neon(url);

// The Neon HTTP driver runs one statement per call. Strip line comments and
// split on semicolons (our SQL uses no functions/dollar-quoting).
function statements(text) {
  return text
    .split('\n')
    .filter((line) => !line.trim().startsWith('--'))
    .join('\n')
    .split(';')
    .map((s) => s.trim())
    .filter(Boolean);
}

async function applyFile(path, label) {
  console.log(`Applying ${label}`);
  for (const stmt of statements(readFileSync(path, 'utf8'))) {
    await sql.query(stmt);
  }
}

async function run() {
  const dir = join(__dirname, 'migrations');
  const files = readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();
  for (const file of files) {
    await applyFile(join(dir, file), `migration: ${file}`);
  }

  if (process.argv.includes('--seed')) {
    await applyFile(join(__dirname, 'seed.sql'), 'seed: db/seed.sql');
  }

  console.log('Done.');
}

run().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
