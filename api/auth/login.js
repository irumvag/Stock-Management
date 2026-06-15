import bcrypt from 'bcryptjs';
import { sql } from '../_lib/db.js';
import { signToken, cors } from '../_lib/auth.js';

export default async function handler(req, res) {
  if (cors(req, res)) return;
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { username, password } = req.body || {};

  // Reject missing or oversized inputs before hitting bcrypt — bcrypt on a
  // multi-MB string is a CPU DoS vector.
  if (!username || !password) {
    return res.status(400).json({ success: false, error: 'Username and password required' });
  }
  if (typeof username !== 'string' || username.length > 64) {
    return res.status(400).json({ success: false, error: 'Invalid username' });
  }
  if (typeof password !== 'string' || password.length > 128) {
    return res.status(400).json({ success: false, error: 'Invalid password' });
  }

  const rows = await sql`SELECT * FROM users WHERE username = ${username} AND deleted = false`;
  const user = rows[0];

  // Always run bcrypt (even on dummy hash) to avoid user-enumeration via timing.
  const DUMMY_HASH = '$2b$10$abcdefghijklmnopqrstuuABCDEFGHIJKLMNOPQRSTUVWXYZ012345';
  const hashToCheck = user ? user.password_hash : DUMMY_HASH;
  const valid = bcrypt.compareSync(password, hashToCheck);

  if (!user || !valid) {
    return res.status(401).json({ success: false, error: 'Invalid username or password' });
  }

  const token = signToken(user);
  return res.status(200).json({
    success: true,
    token,
    user: { uuid: user.uuid, username: user.username, role: user.role },
  });
}
