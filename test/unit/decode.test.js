import { describe, it, expect } from 'vitest';
import { validateToken } from '../../src/token/decode.js';

describe('validateToken', () => {
  it('accepts valid token', () => {
    const r = validateToken('dc-a8f3b2c9d1e4');
    expect(r.valid).toBe(true);
    expect(r.topic).toBe('dc-a8f3b2c9d1e4');
  });

  it('accepts 8-char suffix (minimum)', () => {
    expect(validateToken('dc-abcd1234').valid).toBe(true);
  });

  it('accepts 24-char suffix (maximum)', () => {
    expect(validateToken('dc-abcdefghijklmnopqrstuv').valid).toBe(true);
  });

  it('rejects missing token', () => {
    expect(validateToken(undefined).valid).toBe(false);
    expect(validateToken(null).valid).toBe(false);
    expect(validateToken('').valid).toBe(false);
  });

  it('rejects wrong prefix', () => {
    const r = validateToken('xx-abcdefgh');
    expect(r.valid).toBe(false);
    expect(r.error).toContain('dc-');
  });

  it('rejects too short suffix', () => {
    expect(validateToken('dc-abc').valid).toBe(false);
  });

  it('rejects too long suffix', () => {
    expect(validateToken('dc-' + 'a'.repeat(25)).valid).toBe(false);
  });

  it('rejects special characters', () => {
    expect(validateToken('dc-abcd!@#$efgh').valid).toBe(false);
  });
});
