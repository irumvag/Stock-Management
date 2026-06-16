import { neon } from '@neondatabase/serverless';
import bcrypt from 'bcryptjs';
import { requireAuth, cors } from '../_lib/auth.js';

export default async function handler(req, res) {
  if (cors(req, res)) return;
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const user = requireAuth(req, res);
  if (!user) return;

  const { currentPassword, newPassword } = req.body || {};
  if (!currentPassword || !newPassword) {
    return res.status(400).json({ error: 'currentPassword and newPassword are required' });
  }
  if (newPassword.length < 4) {
    return res.status(400).json({ error: 'New password must be at least 4 characters' });
  }

  const sql = neon(process.env.DATABASE_URL);

  // Fetch current hash — query differs for SuperAdmin vs company user
  let row;
  if (user.company_id) {
    const rows = await sql`
      SELECT password_hash FROM users
      WHERE uuid = ${user.uuid} AND company_id = ${user.company_id}
    `;
    row = rows[0];
  } else {
    const rows = await sql`SELECT password_hash FROM super_admins WHERE uuid = ${user.uuid}`;
    row = rows[0];
  }

  if (!row || !bcrypt.compareSync(currentPassword, row.password_hash)) {
    return res.status(400).json({ error: 'Current password is incorrect' });
  }

  const hash = bcrypt.hashSync(newPassword, 10);

  if (user.company_id) {
    await sql`UPDATE users SET password_hash = ${hash} WHERE uuid = ${user.uuid}`;
  } else {
    await sql`UPDATE super_admins SET password_hash = ${hash} WHERE uuid = ${user.uuid}`;
  }

  return res.json({ success: true });
}
