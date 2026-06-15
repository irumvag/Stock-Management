import bcrypt from 'bcryptjs';
import { sql } from './_lib/db.js';
import { requireSuperAdmin, cors } from './_lib/auth.js';

const SALT = 10;

// SuperAdmin-only company management.
// GET    — list all companies
// POST   — create company + initial Owner account
// PUT    — update company name / active flag
// DELETE — deactivate (soft-delete) a company
export default async function handler(req, res) {
  if (cors(req, res)) return;
  if (!requireSuperAdmin(req, res)) return;

  try {
    if (req.method === 'GET') {
      const rows = await sql`
        SELECT c.uuid, c.name, c.slug, c.active, c.created_at,
               COUNT(u.uuid) FILTER (WHERE u.deleted = false) AS user_count
        FROM companies c
        LEFT JOIN users u ON u.company_id = c.uuid
        WHERE c.deleted = false
        GROUP BY c.uuid
        ORDER BY c.name`;
      return res.status(200).json(rows);
    }

    if (req.method === 'POST') {
      const { name, slug, ownerUsername, ownerPassword } = req.body || {};
      if (!name || !slug || !ownerUsername || !ownerPassword) {
        return res.status(400).json({ success: false, error: 'name, slug, ownerUsername, ownerPassword are required' });
      }
      if (!/^[a-z0-9-]+$/.test(slug)) {
        return res.status(400).json({ success: false, error: 'Company code must be lowercase letters, numbers, and hyphens only' });
      }
      if (slug.length > 32) {
        return res.status(400).json({ success: false, error: 'Company code must be 32 characters or fewer' });
      }
      try {
        const compRows = await sql`
          INSERT INTO companies (name, slug) VALUES (${name}, ${slug})
          RETURNING uuid`;
        const company_id = compRows[0].uuid;
        const hash = bcrypt.hashSync(ownerPassword, SALT);
        await sql`
          INSERT INTO users (username, password_hash, role, company_id)
          VALUES (${ownerUsername}, ${hash}, 'Owner', ${company_id})`;
        return res.status(200).json({ success: true, company_id });
      } catch (err) {
        if (err.message && err.message.includes('unique')) {
          return res.status(200).json({ success: false, error: 'Company code already taken' });
        }
        throw err;
      }
    }

    if (req.method === 'PUT') {
      const { uuid, name, active } = req.body || {};
      if (!uuid) return res.status(400).json({ success: false, error: 'uuid required' });
      await sql`
        UPDATE companies
        SET name   = COALESCE(${name ?? null}, name),
            active = COALESCE(${active !== undefined ? active : null}, active),
            updated_at = now()
        WHERE uuid = ${uuid} AND deleted = false`;
      return res.status(200).json({ success: true });
    }

    if (req.method === 'DELETE') {
      const { uuid } = req.body || {};
      if (!uuid) return res.status(400).json({ success: false, error: 'uuid required' });
      await sql`
        UPDATE companies SET active = false, deleted = true, updated_at = now()
        WHERE uuid = ${uuid}`;
      return res.status(200).json({ success: true });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
}
