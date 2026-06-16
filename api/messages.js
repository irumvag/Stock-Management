import { sql } from './_lib/db.js';
import { requireAuth, cors } from './_lib/auth.js';

// GET  /api/messages  — fetch messages for the current user
// POST /api/messages  — send a new message
export default async function handler(req, res) {
  if (cors(req, res)) return;
  const user = requireAuth(req, res);
  if (!user) return;

  if (req.method === 'GET') {
    const rows = await sql`
      SELECT uuid, from_user, to_user, subject, body, is_read, updated_at, deleted
      FROM messages
      WHERE deleted = false
        AND (to_user = ${user.username} OR to_user = 'all' OR from_user = ${user.username})
      ORDER BY updated_at DESC
      LIMIT 200
    `;
    return res.status(200).json(rows);
  }

  if (req.method === 'POST') {
    const { to_user, subject = '', body } = req.body || {};
    if (!to_user || !body) {
      return res.status(400).json({ error: 'to_user and body are required' });
    }
    const [row] = await sql`
      INSERT INTO messages (from_user, to_user, subject, body, updated_at)
      VALUES (${user.username}, ${to_user}, ${subject}, ${body}, now())
      RETURNING uuid, from_user, to_user, subject, body, is_read, updated_at, deleted
    `;
    return res.status(201).json(row);
  }

  if (req.method === 'PATCH') {
    // Mark a message as read: PATCH /api/messages?uuid=<uuid>
    const { uuid } = req.query;
    if (!uuid) return res.status(400).json({ error: 'uuid required' });
    await sql`
      UPDATE messages SET is_read = true, updated_at = now()
      WHERE uuid = ${uuid}
        AND (to_user = ${user.username} OR to_user = 'all')
    `;
    return res.status(200).json({ ok: true });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
