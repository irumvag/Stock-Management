import jwt from 'jsonwebtoken';

const SECRET = process.env.JWT_SECRET || 'dev-insecure-secret-change-me';
const TOKEN_TTL = '30d';

export function signToken(user) {
  return jwt.sign(
    { sub: user.uuid, username: user.username, role: user.role },
    SECRET,
    { expiresIn: TOKEN_TTL }
  );
}

export function verifyToken(req) {
  const header = req.headers['authorization'] || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return null;
  try {
    return jwt.verify(token, SECRET);
  } catch {
    return null;
  }
}

// Guard helper for handlers. Returns the decoded claims, or sends 401/403 and
// returns null (caller should `return` immediately when null).
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

// Minimal CORS + JSON body helper so the PWA (different dev origin) can call us.
export function cors(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return true;
  }
  return false;
}
