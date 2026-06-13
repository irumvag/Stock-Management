import bcrypt from 'bcryptjs';
import { sql } from '../_lib/db.js';
import { signToken, cors } from '../_lib/auth.js';

export default async function handler(req, res) {
  if (cors(req, res)) return;
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { username, password } = req.body || {};
  if (!username || !password) {
    return res.status(400).json({ success: false, error: 'Username and password required' });
  }

  const rows = await sql`SELECT * FROM users WHERE username = ${username} AND deleted = false`;
  const user = rows[0];
  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    return res.status(200).json({ success: false, error: 'Invalid username or password' });
  }

  const token = signToken(user);
  return res.status(200).json({
    success: true,
    token,
    user: { uuid: user.uuid, username: user.username, role: user.role },
  });
}
