import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { computeVerdict, generateReport } from '../../src/report/generate.js';
import { parseSmartctl } from '../../src/smart/parse.js';

const healthy = JSON.parse(readFileSync(new URL('../fixtures/smart-3tb-wd-healthy.json', import.meta.url), 'utf8'));
const failing = JSON.parse(readFileSync(new URL('../fixtures/smart-3tb-wd-failing.json', import.meta.url), 'utf8'));

describe('computeVerdict — HEALTHY', () => {
  it('returns HEALTHY for clean drive', () => {
    const health = { smart_passed: true, pending_sectors: 0, uncorrectable_sectors: 0,
      reallocated_sectors: 0, spin_retries: 0, reported_uncorrectable: 0,
      power_on_hours: 5000, temperature_c: 30, crc_errors: 0, load_cycles: 1000 };
    const v = computeVerdict(health, 0);
    expect(v.overall).toBe('HEALTHY');
    expect(v.reasons).toHaveLength(0);
  });
});

describe('computeVerdict — FAILING', () => {
  it('FAILING on pending sectors', () => {
    const health = { pending_sectors: 1, smart_passed: true, uncorrectable_sectors: 0,
      reallocated_sectors: 0, spin_retries: 0, reported_uncorrectable: 0,
      power_on_hours: 100, temperature_c: 30, crc_errors: 0, load_cycles: 0 };
    const v = computeVerdict(health);
    expect(v.overall).toBe('FAILING');
    expect(v.reasons[0].level).toBe('FAIL');
  });

  it('FAILING on uncorrectable sectors', () => {
    const health = { pending_sectors: 0, uncorrectable_sectors: 5, smart_passed: true,
      reallocated_sectors: 0, spin_retries: 0, reported_uncorrectable: 0,
      power_on_hours: 100, temperature_c: 30, crc_errors: 0, load_cycles: 0 };
    expect(computeVerdict(health).overall).toBe('FAILING');
  });

  it('FAILING on SMART test failed', () => {
    const health = { smart_passed: false, pending_sectors: 0, uncorrectable_sectors: 0,
      reallocated_sectors: 0, spin_retries: 0, reported_uncorrectable: 0,
      power_on_hours: 100, temperature_c: 30, crc_errors: 0, load_cycles: 0 };
    expect(computeVerdict(health).overall).toBe('FAILING');
  });

  it('FAILING on >100 reallocated', () => {
    const health = { reallocated_sectors: 101, smart_passed: true, pending_sectors: 0,
      uncorrectable_sectors: 0, spin_retries: 0, reported_uncorrectable: 0,
      power_on_hours: 100, temperature_c: 30, crc_errors: 0, load_cycles: 0 };
    expect(computeVerdict(health).overall).toBe('FAILING');
  });

  it('FAILING on spin retries', () => {
    const health = { spin_retries: 1, smart_passed: true, pending_sectors: 0,
      uncorrectable_sectors: 0, reallocated_sectors: 0, reported_uncorrectable: 0,
      power_on_hours: 100, temperature_c: 30, crc_errors: 0, load_cycles: 0 };
    expect(computeVerdict(health).overall).toBe('FAILING');
  });

  it('FAILING on reported uncorrectable', () => {
    const health = { reported_uncorrectable: 3, smart_passed: true, pending_sectors: 0,
      uncorrectable_sectors: 0, reallocated_sectors: 0, spin_retries: 0,
      power_on_hours: 100, temperature_c: 30, crc_errors: 0, load_cycles: 0 };
    expect(computeVerdict(health).overall).toBe('FAILING');
  });
});

describe('computeVerdict — WARNING', () => {
  it('WARNING on high hours', () => {
    const health = { power_on_hours: 45000, smart_passed: true, pending_sectors: 0,
      uncorrectable_sectors: 0, reallocated_sectors: 0, spin_retries: 0,
      reported_uncorrectable: 0, temperature_c: 30, crc_errors: 0, load_cycles: 0 };
    const v = computeVerdict(health);
    expect(v.overall).toBe('WARNING');
    expect(v.reasons[0].msg).toContain('45000');
  });

  it('WARNING on small reallocated count', () => {
    const health = { reallocated_sectors: 5, smart_passed: true, pending_sectors: 0,
      uncorrectable_sectors: 0, spin_retries: 0, reported_uncorrectable: 0,
      power_on_hours: 100, temperature_c: 30, crc_errors: 0, load_cycles: 0 };
    expect(computeVerdict(health).overall).toBe('WARNING');
  });

  it('WARNING on high temperature', () => {
    const health = { temperature_c: 55, smart_passed: true, pending_sectors: 0,
      uncorrectable_sectors: 0, reallocated_sectors: 0, spin_retries: 0,
      reported_uncorrectable: 0, power_on_hours: 100, crc_errors: 0, load_cycles: 0 };
    expect(computeVerdict(health).overall).toBe('WARNING');
  });

  it('WARNING on error log', () => {
    const health = { smart_passed: true, pending_sectors: 0, uncorrectable_sectors: 0,
      reallocated_sectors: 0, spin_retries: 0, reported_uncorrectable: 0,
      power_on_hours: 100, temperature_c: 30, crc_errors: 0, load_cycles: 0 };
    expect(computeVerdict(health, 3).overall).toBe('WARNING');
  });

  it('WARNING on high CRC errors', () => {
    const health = { crc_errors: 15, smart_passed: true, pending_sectors: 0,
      uncorrectable_sectors: 0, reallocated_sectors: 0, spin_retries: 0,
      reported_uncorrectable: 0, power_on_hours: 100, temperature_c: 30, load_cycles: 0 };
    expect(computeVerdict(health).overall).toBe('WARNING');
  });

  it('WARNING on high load cycles', () => {
    const health = { load_cycles: 250000, smart_passed: true, pending_sectors: 0,
      uncorrectable_sectors: 0, reallocated_sectors: 0, spin_retries: 0,
      reported_uncorrectable: 0, power_on_hours: 100, temperature_c: 30, crc_errors: 0 };
    expect(computeVerdict(health).overall).toBe('WARNING');
  });
});

describe('computeVerdict — multiple reasons', () => {
  it('FAILING overrides WARNING', () => {
    const health = { pending_sectors: 10, power_on_hours: 50000, smart_passed: true,
      uncorrectable_sectors: 0, reallocated_sectors: 0, spin_retries: 0,
      reported_uncorrectable: 0, temperature_c: 30, crc_errors: 0, load_cycles: 0 };
    const v = computeVerdict(health);
    expect(v.overall).toBe('FAILING');
    expect(v.reasons.length).toBe(2);
  });
});

describe('generateReport — real fixtures', () => {
  it('healthy drive → HEALTHY or WARNING (high hours)', () => {
    const parsed = parseSmartctl(healthy);
    const report = generateReport(parsed, 'dc-test12345678', '1.0.0');
    expect(report.version).toBe('1.0');
    expect(report.token).toBe('dc-test12345678');
    expect(report.drive.serial).toBe('WD-WCC1T0994579');
    expect(['HEALTHY', 'WARNING']).toContain(report.verdict.overall);
  });

  it('failing drive → FAILING', () => {
    const parsed = parseSmartctl(failing);
    const report = generateReport(parsed, 'dc-test12345678', '1.0.0');
    expect(report.verdict.overall).toBe('FAILING');
    expect(report.verdict.reasons.some(r => r.msg.includes('pending'))).toBe(true);
  });
});
