import bcrypt from 'bcryptjs';
import { sql } from '../_lib/db.js';
import { signToken, cors } from '../_lib/auth.js';

export default async function handler(req, res) {
  if (cors(req, res)) return;
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { username, password, company } = req.body || {};

  if (!username || !password) {
    return res.status(400).json({ success: false, error: 'Username and password required' });
  }
  if (typeof username !== 'string' || username.length > 64) {
    return res.status(400).json({ success: false, error: 'Invalid username' });
  }
  if (typeof password !== 'string' || password.length > 128) {
    return res.status(400).json({ success: false, error: 'Invalid password' });
  }

  // Always run bcrypt even on a dummy hash to prevent timing-based enumeration.
  const DUMMY_HASH = '$2b$10$abcdefghijklmnopqrstuuABCDEFGHIJKLMNOPQRSTUVWXYZ012345';

  if (company) {
    // ── Company user login ──
    if (typeof company !== 'string' || company.length > 64) {
      return res.status(400).json({ success: false, error: 'Invalid company code' });
    }
    const companies = await sql`
      SELECT uuid FROM companies WHERE slug = ${company} AND active = true AND deleted = false`;
    const comp = companies[0];
    if (!comp) {
      bcrypt.compareSync(password, DUMMY_HASH); // timing equalisation
      return res.status(401).json({ success: false, error: 'Invalid company code or credentials' });
    }
    const rows = await sql`
      SELECT * FROM users
      WHERE username = ${username} AND company_id = ${comp.uuid} AND deleted = false`;
    const user = rows[0];
    const hashToCheck = user ? user.password_hash : DUMMY_HASH;
    const valid = bcrypt.compareSync(password, hashToCheck);
    if (!user || !valid) {
      return res.status(401).json({ success: false, error: 'Invalid credentials' });
    }
    const token = signToken({ ...user, company_id: comp.uuid });
    return res.status(200).json({
      success: true,
      token,
      user: { uuid: user.uuid, username: user.username, role: user.role, company_id: comp.uuid, company_slug: company },
    });
  }

  // ── SuperAdmin login (no company code) ──
  const rows = await sql`SELECT * FROM super_admins WHERE username = ${username}`;
  const admin = rows[0];
  const hashToCheck = admin ? admin.password_hash : DUMMY_HASH;
  const valid = bcrypt.compareSync(password, hashToCheck);
  if (!admin || !valid) {
    return res.status(401).json({ success: false, error: 'Invalid credentials' });
  }
  const token = signToken({ uuid: admin.uuid, username: admin.username, role: 'SuperAdmin', company_id: null });
  return res.status(200).json({
    success: true,
    token,
    user: { uuid: admin.uuid, username: admin.username, role: 'SuperAdmin' },
  });
}
