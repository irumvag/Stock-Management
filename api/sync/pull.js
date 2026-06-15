import { sql } from '../_lib/db.js';
import { requireCompanyAuth, cors } from '../_lib/auth.js';
import { SYNC_TABLES } from '../_lib/tables.js';

// GET /api/sync/pull?since=<ISO timestamp>
// Returns every row changed after `since` within the caller's company,
// grouped by table, plus the new cursor (max updated_at seen).
export default async function handler(req, res) {
  if (cors(req, res)) return;
  const claims = requireCompanyAuth(req, res);
  if (!claims) return;
  const company_id = claims.company_id;

  const rawSince = req.query.since || '1970-01-01T00:00:00.000Z';
  const sinceDate = new Date(rawSince);
  if (isNaN(sinceDate.getTime())) {
    return res.status(400).json({ error: 'Invalid since parameter — must be an ISO timestamp' });
  }
  const since = sinceDate.toISOString();

  const tables = {};
  let cursor = since;

  for (const [name, def] of Object.entries(SYNC_TABLES)) {
    const cols = (def.pullCols || def.cols).join(', ');
    // table names come from our own whitelist (SYNC_TABLES keys) — safe to interpolate.
    const rows = await sql(
      `SELECT ${cols} FROM ${name} WHERE updated_at > $1 AND company_id = $2 ORDER BY updated_at ASC`,
      [since, company_id]
    );
    tables[name] = rows;
    for (const r of rows) {
      const u = new Date(r.updated_at).toISOString();
      if (u > cursor) cursor = u;
    }
  }

  return res.status(200).json({ cursor, tables });
}
