import { sql } from '../_lib/db.js';
import { requireAuth, cors } from '../_lib/auth.js';
import { SYNC_TABLES } from '../_lib/tables.js';

// POST /api/sync/push  { mutations: [{ table, row }] }
// Upserts each row, last-write-wins by updated_at. Returns how many applied.
// Rows whose updated_at is older than the stored row are ignored (stale).
export default async function handler(req, res) {
  if (cors(req, res)) return;
  if (!requireAuth(req, res)) return;
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const mutations = (req.body && req.body.mutations) || [];
  let applied = 0;

  for (const m of mutations) {
    const def = SYNC_TABLES[m.table];
    if (!def || !def.pushable || !m.row || !m.row.uuid) continue;

    const cols = def.cols;
    const jsonCols = def.json || [];
    const values = cols.map((c) =>
      jsonCols.includes(c) ? JSON.stringify(m.row[c] ?? null) : (m.row[c] ?? null)
    );
    const placeholders = cols.map((_, i) => `$${i + 1}`);
    const updates = cols
      .filter((c) => c !== 'uuid')
      .map((c) => `${c} = EXCLUDED.${c}`)
      .join(', ');

    const text =
      `INSERT INTO ${m.table} (${cols.join(', ')}) VALUES (${placeholders.join(', ')}) ` +
      `ON CONFLICT (uuid) DO UPDATE SET ${updates} ` +
      `WHERE ${m.table}.updated_at <= EXCLUDED.updated_at`;

    await sql(text, values);
    applied++;
  }

  return res.status(200).json({ applied });
}
