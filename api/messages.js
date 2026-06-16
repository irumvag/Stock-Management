import { neon } from '@neondatabase/serverless';
import { requireCompanyAuth, cors } from './_lib/auth.js';

export default async function handler(req, res) {
  if (cors(req, res)) return;
  const user = requireCompanyAuth(req, res);
  if (!user) return;

  const sql = neon(process.env.DATABASE_URL);

  if (req.method === 'GET') {
    const rows = await sql`
      SELECT uuid, from_user, to_user, subject, body, is_read, updated_at, deleted
      FROM messages
      WHERE company_id = ${user.company_id}
        AND deleted = false
        AND (to_user = ${user.username} OR to_user = 'all' OR from_user = ${user.username})
      ORDER BY updated_at DESC
      LIMIT 200
    `;
    return res.json(rows);
  }

  if (req.method === 'POST') {
    const { to_user, subject, body } = req.body || {};
    if (!to_user || !body) return res.status(400).json({ error: 'to_user and body are required' });
    const msgUuid = crypto.randomUUID();
    await sql`
      INSERT INTO messages (uuid, company_id, from_user, to_user, subject, body, is_read, updated_at, deleted)
      VALUES (${msgUuid}, ${user.company_id}, ${user.username}, ${to_user}, ${subject || ''}, ${body}, false, NOW(), false)
    `;
    return res.json({ success: true, uuid: msgUuid });
  }

  if (req.method === 'PATCH') {
    const { uuid } = req.body || {};
    if (!uuid) return res.status(400).json({ error: 'uuid required' });
    await sql`
      UPDATE messages SET is_read = true, updated_at = NOW()
      WHERE uuid = ${uuid} AND company_id = ${user.company_id}
        AND (to_user = ${user.username} OR to_user = 'all')
    `;
    return res.json({ success: true });
  }

  res.status(405).json({ error: 'Method not allowed' });
}
