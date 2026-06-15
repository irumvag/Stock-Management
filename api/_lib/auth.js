import jwt from 'jsonwebtoken';

const SECRET = process.env.JWT_SECRET;
if (!SECRET) {
  if (process.env.NODE_ENV === 'production' || process.env.VERCEL_ENV === 'production') {
    throw new Error('JWT_SECRET environment variable is required in production');
  }
  console.warn('[auth] WARNING: JWT_SECRET not set — using insecure dev default. Set it before deploying.');
}
const JWT_SECRET = SECRET || 'dev-insecure-secret-change-me-before-deploy';
const TOKEN_TTL = '8h';

export function signToken(user) {
  return jwt.sign(
    {
      sub: user.uuid,
      username: user.username,
      role: user.role,
      company_id: user.company_id || null,
    },
    JWT_SECRET,
    { expiresIn: TOKEN_TTL }
  );
}

export function verifyToken(req) {
  const header = req.headers['authorization'] || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return null;
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch {
    return null;
  }
}

// Returns decoded claims or sends 401/403 and returns null.
// Optional `role` enforces a specific role (e.g. 'Owner').
export function requireAuth(req, res, role) {
  const claims = verifyToken(req);
  if (!claims) {
    res.status(401).json({ error: 'Unauthorized' });
    return null;
  }
  if (role && claims.role !== role) {
    res.status(403).json({ error: 'Forbidden' });
    return null;
  }
  return claims;
}

// Like requireAuth but also enforces the caller has a company_id (i.e. is not SuperAdmin).
export function requireCompanyAuth(req, res, role) {
  const claims = requireAuth(req, res, role);
  if (!claims) return null;
  if (!claims.company_id) {
    res.status(403).json({ error: 'Forbidden: no company context' });
    return null;
  }
  return claims;
}

// Enforces the caller is a SuperAdmin (system-level, no company).
export function requireSuperAdmin(req, res) {
  const claims = verifyToken(req);
  if (!claims) {
    res.status(401).json({ error: 'Unauthorized' });
    return null;
  }
  if (claims.role !== 'SuperAdmin') {
    res.status(403).json({ error: 'Forbidden' });
    return null;
  }
  return claims;
}

// Allowlist for CORS. In production set to the Vercel URL via ALLOWED_ORIGIN env var.
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || '*';

export function cors(req, res) {
  const origin = req.headers.origin || '';
  if (ALLOWED_ORIGIN === '*') {
    res.setHeader('Access-Control-Allow-Origin', '*');
  } else if (origin === ALLOWED_ORIGIN || origin.startsWith('http://localhost:')) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
  }
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return true;
  }
  return false;
}
