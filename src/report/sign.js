/**
 * HMAC-SHA256 report signing for tamper detection.
 * Key derived from token + tool version (no shared secret needed).
 */

import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

export function signReport(report, token, toolVersion) {
  const key = deriveKey(token, toolVersion);
  const canonical = canonicalize(report);
  return createHmac('sha256', key).update(canonical).digest('hex');
}

export function verifySignature(report, signature, token, toolVersion) {
  const expected = signReport(report, token, toolVersion);
  // Constant-time comparison to prevent timing side-channel
  const a = Buffer.from(expected, 'hex');
  const b = Buffer.from(signature, 'hex');
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

function deriveKey(token, toolVersion) {
  // Pipe-separated to prevent concatenation ambiguity
  return createHash('sha256')
    .update(`${token}|${toolVersion}|drive-check`)
    .digest();
}

function canonicalize(obj) {
  return JSON.stringify(sortDeep(obj));
}

function sortDeep(val) {
  if (val === null || typeof val !== 'object') return val;
  if (Array.isArray(val)) return val.map(sortDeep);
  const sorted = {};
  for (const key of Object.keys(val).sort()) {
    sorted[key] = sortDeep(val[key]);
  }
  return sorted;
}
