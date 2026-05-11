/**
 * JWT authentication middleware.
 * Expects: Authorization: Bearer <token>
 * Attaches req.playerId on success.
 */
const jwt = require('jsonwebtoken');

const SECRET = process.env.JWT_SECRET || 'change-me-in-production';

/** Generate a JWT for a player. */
function signToken(playerId) {
  return jwt.sign({ id: playerId }, SECRET, { expiresIn: '7d' });
}

/** Express middleware: verify token and attach playerId. */
function requireAuth(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing or invalid token.' });
  }
  try {
    const decoded = jwt.verify(header.slice(7), SECRET);
    req.playerId = decoded.id;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Token expired or invalid.' });
  }
}

module.exports = { signToken, requireAuth };
