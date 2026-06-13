import { sql } from '../_lib/db.js';
import { requireAuth, cors } from '../_lib/auth.js';
import { SYNC_TABLES } from '../_lib/tables.js';

// GET /api/sync/pull?since=<ISO timestamp>
// Returns every row changed after `since`, grouped by table, plus the new
// cursor (max updated_at seen). First sync uses since=epoch.
export default async function handler(req, res) {
  if (cors(req, res)) return;
  if (!requireAuth(req, res)) return;

  const since = req.query.since || '1970-01-01T00:00:00.000Z';
  const tables = {};
  let cursor = since;

  for (const [name, def] of Object.entries(SYNC_TABLES)) {
    const cols = def.cols.join(', ');
    // table names are from our own whitelist, safe to interpolate
    const rows = await sql.query(
      `SELECT ${cols} FROM ${name} WHERE updated_at > $1 ORDER BY updated_at ASC`,
      [since]
    );
    tables[name] = rows;
    for (const r of rows) {
      const u = new Date(r.updated_at).toISOString();
      if (u > cursor) cursor = u;
    }
  }

  return res.status(200).json({ cursor, tables });
}
