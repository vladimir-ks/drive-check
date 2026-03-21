/**
 * Token validation for drive-check.
 *
 * Two token formats supported:
 *   Simple:  dc-<8-24 alphanumeric>        (no expiry)
 *   Timed:   dc-<8-24 alphanumeric>-t<hex> (expires after 48h)
 *
 * Timed tokens encode creation timestamp as hex epoch seconds.
 * Buyer generates: dc-randomchars-t<Date.now()/1000 in hex>
 * Tool checks: if -t suffix present, report must be within 48h of creation.
 *
 * Generation helper (buyer runs in Node):
 *   const id = crypto.randomBytes(6).toString('hex');
 *   const ts = Math.floor(Date.now()/1000).toString(16);
 *   console.log(`dc-${id}-t${ts}`);
 */

const TOKEN_SIMPLE = /^dc-[a-zA-Z0-9]{8,24}$/;
const TOKEN_TIMED = /^dc-[a-zA-Z0-9]{8,24}-t([0-9a-f]{8})$/;
const MAX_AGE_SECONDS = 48 * 3600; // 48 hours

export function validateToken(token) {
  if (!token || typeof token !== 'string') {
    return { valid: false, error: 'No token provided. Usage: npx drive-check <TOKEN>' };
  }
  if (!token.startsWith('dc-')) {
    return { valid: false, error: `Token must start with "dc-". Got: "${token}"` };
  }

  // Check timed token first
  const timedMatch = token.match(TOKEN_TIMED);
  if (timedMatch) {
    const createdAt = parseInt(timedMatch[1], 16);
    const now = Math.floor(Date.now() / 1000);
    const age = now - createdAt;

    if (age < -300) {
      // Token from future (>5 min clock skew)
      return { valid: false, error: 'Token timestamp is in the future. Check system clock.' };
    }
    if (age > MAX_AGE_SECONDS) {
      const hoursAgo = Math.floor(age / 3600);
      return { valid: false, error: `Token expired ${hoursAgo}h ago. Ask buyer for a new token.` };
    }

    return { valid: true, topic: token, timed: true, created_at: createdAt, age_seconds: age };
  }

  // Simple token
  if (TOKEN_SIMPLE.test(token)) {
    return { valid: true, topic: token, timed: false };
  }

  return { valid: false, error: `Invalid token format. Got: "${token}"` };
}

/**
 * Generate a timed token (buyer-side helper).
 * Usage: node -e "import('drive-check/src/token/decode.js').then(m => console.log(m.generateTimedToken()))"
 */
export function generateTimedToken() {
  const bytes = new Uint8Array(6);
  globalThis.crypto.getRandomValues(bytes);
  const id = Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
  const ts = Math.floor(Date.now() / 1000).toString(16);
  return `dc-${id}-t${ts}`;
}
