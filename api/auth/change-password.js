import bcrypt from 'bcryptjs';
import { sql } from '../_lib/db.js';
import { requireAuth, cors } from '../_lib/auth.js';

// POST /api/auth/change-password
// Body: { current_password, new_password }
export default async function handler(req, res) {
  if (cors(req, res)) return;
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const user = requireAuth(req, res);
  if (!user) return;

  const { current_password, new_password } = req.body || {};
  if (!current_password || !new_password) {
    return res.status(400).json({ error: 'current_password and new_password are required' });
  }
  if (new_password.length < 4) {
    return res.status(400).json({ error: 'New password must be at least 4 characters' });
  }

  const [row] = await sql`SELECT password_hash FROM users WHERE username = ${user.username} AND deleted = false`;
  if (!row) return res.status(404).json({ error: 'User not found' });

  if (!bcrypt.compareSync(current_password, row.password_hash)) {
    return res.status(401).json({ error: 'Current password is incorrect' });
  }

  const newHash = bcrypt.hashSync(new_password, 10);
  await sql`UPDATE users SET password_hash = ${newHash}, updated_at = now() WHERE username = ${user.username}`;

  return res.status(200).json({ success: true });
}
