import { describe, it, expect, vi } from 'vitest';
import { validateToken } from '../../src/token/decode.js';

describe('validateToken — simple tokens', () => {
  it('accepts valid simple token', () => {
    const r = validateToken('dc-a8f3b2c9d1e4');
    expect(r.valid).toBe(true);
    expect(r.topic).toBe('dc-a8f3b2c9d1e4');
    expect(r.timed).toBe(false);
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

  it('rejects special characters', () => {
    expect(validateToken('dc-abcd!@#$efgh').valid).toBe(false);
  });
});

describe('validateToken — timed tokens', () => {
  it('accepts valid timed token (recent)', () => {
    const ts = Math.floor(Date.now() / 1000).toString(16);
    const token = `dc-abcdef123456-t${ts}`;
    const r = validateToken(token);
    expect(r.valid).toBe(true);
    expect(r.timed).toBe(true);
    expect(r.created_at).toBeDefined();
    expect(r.age_seconds).toBeLessThan(10);
  });

  it('accepts token created 24h ago', () => {
    const ts = Math.floor(Date.now() / 1000 - 24 * 3600).toString(16);
    const token = `dc-abcdef123456-t${ts}`;
    const r = validateToken(token);
    expect(r.valid).toBe(true);
    expect(r.age_seconds).toBeGreaterThan(24 * 3600 - 60);
  });

  it('rejects token older than 7 days', () => {
    const ts = Math.floor(Date.now() / 1000 - 8 * 24 * 3600).toString(16);
    const token = `dc-abcdef123456-t${ts}`;
    const r = validateToken(token);
    expect(r.valid).toBe(false);
    expect(r.error).toContain('expired');
  });

  it('rejects future token (>5 min ahead)', () => {
    const ts = Math.floor(Date.now() / 1000 + 600).toString(16);
    const token = `dc-abcdef123456-t${ts}`;
    const r = validateToken(token);
    expect(r.valid).toBe(false);
    expect(r.error).toContain('future');
  });

  it('accepts slight clock skew (3 min ahead)', () => {
    const ts = Math.floor(Date.now() / 1000 + 180).toString(16);
    const token = `dc-abcdef123456-t${ts}`;
    expect(validateToken(token).valid).toBe(true);
  });
});
