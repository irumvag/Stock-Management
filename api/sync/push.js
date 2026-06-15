import { sql } from '../_lib/db.js';
import { requireCompanyAuth, cors } from '../_lib/auth.js';
import { SYNC_TABLES } from '../_lib/tables.js';

// POST /api/sync/push  { mutations: [{ table, row }] }
// Upserts each row scoped to the caller's company. company_id is injected
// from the JWT — the client never needs to send it. Last-write-wins by updated_at.
export default async function handler(req, res) {
  if (cors(req, res)) return;
  const claims = requireCompanyAuth(req, res);
  if (!claims) return;
  const company_id = claims.company_id;

  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const mutations = (req.body && req.body.mutations) || [];
  let applied = 0;

  for (const m of mutations) {
    const def = SYNC_TABLES[m.table];
    if (!def || !def.pushable || !m.row || !m.row.uuid) continue;

    const baseCols = def.cols;
    const jsonCols = def.json || [];

    // Append company_id as the last column — injected from JWT, not from client.
    const cols = [...baseCols, 'company_id'];
    const values = [
      ...baseCols.map((c) =>
        jsonCols.includes(c) ? JSON.stringify(m.row[c] ?? null) : (m.row[c] ?? null)
      ),
      company_id,
    ];
    const placeholders = cols.map((_, i) => `$${i + 1}`);

    // On conflict, update all cols except uuid and company_id (both are fixed).
    const updates = baseCols
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
