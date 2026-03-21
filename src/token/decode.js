/**
 * Token validation for drive-check.
 * Token format: dc-<8-24 alphanumeric chars>
 */

const TOKEN_REGEX = /^dc-[a-zA-Z0-9]{8,24}$/;

export function validateToken(token) {
  if (!token || typeof token !== 'string') {
    return { valid: false, error: 'No token provided. Usage: npx drive-check <TOKEN>' };
  }
  if (!token.startsWith('dc-')) {
    return { valid: false, error: `Token must start with "dc-". Got: "${token}"` };
  }
  if (!TOKEN_REGEX.test(token)) {
    return { valid: false, error: `Invalid token format. Expected: dc-<8-24 alphanumeric chars>. Got: "${token}"` };
  }
  return { valid: true, topic: token };
}
