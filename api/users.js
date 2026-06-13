import bcrypt from 'bcryptjs';
import { sql } from './_lib/db.js';
import { requireAuth, cors } from './_lib/auth.js';

const SALT = 10;

// Owner-only user management. Runs online (not via the offline outbox) because
// it touches credentials. The cashier device picks up the new/updated users on
// its next sync/pull, enabling offline login for them afterwards.
export default async function handler(req, res) {
  if (cors(req, res)) return;
  if (!requireAuth(req, res, 'Owner')) return;

  try {
    if (req.method === 'GET') {
      const rows = await sql`
        SELECT uuid, username, role, created_at FROM users
        WHERE deleted = false ORDER BY username`;
      return res.status(200).json(rows);
    }

    if (req.method === 'POST') {
      const { username, password, role } = req.body || {};
      if (!username || !password) return res.status(400).json({ success: false, error: 'Username and password required' });
      const hash = bcrypt.hashSync(password, SALT);
      try {
        const rows = await sql`
          INSERT INTO users (username, password_hash, role)
          VALUES (${username}, ${hash}, ${role || 'Cashier'})
          RETURNING uuid, username, role`;
        return res.status(200).json({ success: true, user: rows[0] });
      } catch {
        return res.status(200).json({ success: false, error: 'Username already taken' });
      }
    }

    if (req.method === 'PUT') {
      const { uuid, username, role, newPassword } = req.body || {};
      if (!uuid) return res.status(400).json({ success: false, error: 'uuid required' });
      if (newPassword) {
        const hash = bcrypt.hashSync(newPassword, SALT);
        await sql`UPDATE users SET password_hash = ${hash}, updated_at = now() WHERE uuid = ${uuid}`;
      }
      if (username || role) {
        await sql`UPDATE users SET username = COALESCE(${username || null}, username),
                  role = COALESCE(${role || null}, role), updated_at = now() WHERE uuid = ${uuid}`;
      }
      return res.status(200).json({ success: true });
    }

    if (req.method === 'DELETE') {
      const { uuid } = req.body || {};
      const rows = await sql`SELECT username FROM users WHERE uuid = ${uuid}`;
      if (!rows[0]) return res.status(200).json({ success: false, error: 'User not found' });
      if (rows[0].username === 'admin') return res.status(200).json({ success: false, error: 'Cannot delete the default admin account' });
      await sql`UPDATE users SET deleted = true, updated_at = now() WHERE uuid = ${uuid}`;
      return res.status(200).json({ success: true });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
}
