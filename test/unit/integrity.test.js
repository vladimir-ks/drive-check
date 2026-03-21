import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { generateIntegrity, verifyFromRaw } from '../../src/report/integrity.js';
import { parseSmartctl } from '../../src/smart/parse.js';

const healthy = JSON.parse(readFileSync(new URL('../fixtures/smart-3tb-wd-healthy.json', import.meta.url), 'utf8'));
const failing = JSON.parse(readFileSync(new URL('../fixtures/smart-3tb-wd-failing.json', import.meta.url), 'utf8'));

describe('generateIntegrity', () => {
  it('produces raw data hash', () => {
    const parsed = parseSmartctl(healthy);
    const integrity = generateIntegrity(healthy, parsed, '2026-03-21T12:00:00Z');
    expect(integrity.raw_data_hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('hash is deterministic', () => {
    const parsed = parseSmartctl(healthy);
    const i1 = generateIntegrity(healthy, parsed, '2026-03-21T12:00:00Z');
    const i2 = generateIntegrity(healthy, parsed, '2026-03-21T12:00:00Z');
    expect(i1.raw_data_hash).toBe(i2.raw_data_hash);
  });

  it('different data produces different hash', () => {
    const p1 = parseSmartctl(healthy);
    const p2 = parseSmartctl(failing);
    const i1 = generateIntegrity(healthy, p1, '2026-03-21T12:00:00Z');
    const i2 = generateIntegrity(failing, p2, '2026-03-21T12:00:00Z');
    expect(i1.raw_data_hash).not.toBe(i2.raw_data_hash);
  });

  it('includes smartctl version info', () => {
    const parsed = parseSmartctl(healthy);
    const integrity = generateIntegrity(healthy, parsed, '2026-03-21T12:00:00Z');
    expect(integrity.smartctl_version.version).toBeDefined();
  });

  it('includes timestamp binding', () => {
    const parsed = parseSmartctl(healthy);
    const integrity = generateIntegrity(healthy, parsed, '2026-03-21T12:00:00Z');
    expect(integrity.timestamp_binding.report_generated).toBe('2026-03-21T12:00:00Z');
    expect(integrity.timestamp_binding.drive_power_on_hours).toBeGreaterThan(0);
  });

  it('raw data byte count is reasonable', () => {
    const parsed = parseSmartctl(healthy);
    const integrity = generateIntegrity(healthy, parsed, '2026-03-21T12:00:00Z');
    expect(integrity.raw_data_bytes).toBeGreaterThan(1000);
    expect(integrity.raw_data_bytes).toBeLessThan(100000);
  });
});

describe('consistency checks — healthy drive', () => {
  it('all checks pass for healthy drive', () => {
    const parsed = parseSmartctl(healthy);
    const integrity = generateIntegrity(healthy, parsed, '2026-03-21T12:00:00Z');
    expect(integrity.consistency.passed).toBe(true);
    for (const check of integrity.consistency.checks) {
      expect(check.passed).toBe(true);
    }
  });
});

describe('consistency checks — failing drive', () => {
  it('runs checks on failing drive', () => {
    const parsed = parseSmartctl(failing);
    const integrity = generateIntegrity(failing, parsed, '2026-03-21T12:00:00Z');
    // Failing drive should still pass consistency (data is real, just degraded)
    expect(integrity.consistency.checks.length).toBeGreaterThan(0);
  });
});

describe('verifyFromRaw', () => {
  it('valid report matches raw data', () => {
    const parsed = parseSmartctl(healthy);
    const result = verifyFromRaw(healthy, parsed.health);
    expect(result.valid).toBe(true);
    expect(result.mismatches).toHaveLength(0);
  });

  it('detects tampered pending sectors', () => {
    const parsed = parseSmartctl(healthy);
    const tampered = { ...parsed.health, pending_sectors: 999 };
    const result = verifyFromRaw(healthy, tampered);
    expect(result.valid).toBe(false);
    expect(result.mismatches.some(m => m.field === 'pending_sectors')).toBe(true);
  });

  it('detects tampered power-on hours', () => {
    const parsed = parseSmartctl(healthy);
    const tampered = { ...parsed.health, power_on_hours: 100 };
    const result = verifyFromRaw(healthy, tampered);
    expect(result.valid).toBe(false);
    expect(result.mismatches.some(m => m.field === 'power_on_hours')).toBe(true);
  });
});
