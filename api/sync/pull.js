import { sql } from '../_lib/db.js';
import { requireAuth, cors } from '../_lib/auth.js';
import { SYNC_TABLES } from '../_lib/tables.js';

// GET /api/sync/pull?since=<ISO timestamp>
// Returns every row changed after `since`, grouped by table, plus the new
// cursor (max updated_at seen). First sync uses since=epoch.
export default async function handler(req, res) {
  if (cors(req, res)) return;
  if (!requireAuth(req, res)) return;

  // Validate the `since` cursor — must be a parseable date.
  const rawSince = req.query.since || '1970-01-01T00:00:00.000Z';
  const sinceDate = new Date(rawSince);
  if (isNaN(sinceDate.getTime())) {
    return res.status(400).json({ error: 'Invalid since parameter — must be an ISO timestamp' });
  }
  const since = sinceDate.toISOString();

  const tables = {};
  let cursor = since;

  for (const [name, def] of Object.entries(SYNC_TABLES)) {
    // Use pullCols if defined (e.g. users strips password_hash); fall back to cols.
    const cols = (def.pullCols || def.cols).join(', ');
    // table names are from our own whitelist, safe to interpolate.
    // neon() HTTP driver uses sql(text, params) not sql.query().
    const rows = await sql(
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
