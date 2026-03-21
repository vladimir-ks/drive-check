import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { parseSmartctl } from '../../src/smart/parse.js';

const healthy = JSON.parse(readFileSync(new URL('../fixtures/smart-3tb-wd-healthy.json', import.meta.url), 'utf8'));
const failing = JSON.parse(readFileSync(new URL('../fixtures/smart-3tb-wd-failing.json', import.meta.url), 'utf8'));

describe('parseSmartctl — healthy drive', () => {
  const result = parseSmartctl(healthy);

  it('extracts model', () => {
    expect(result.drive.model).toBe('WDC WD30EZRX-00DC0B0');
  });

  it('extracts serial', () => {
    expect(result.drive.serial).toBe('WD-WCC1T0994579');
  });

  it('extracts capacity', () => {
    expect(result.drive.capacity_bytes).toBe(3000592982016);
    expect(result.drive.capacity_human).toContain('3.00');
    expect(result.drive.capacity_human).toContain('TB');
  });

  it('extracts power-on hours', () => {
    expect(result.health.power_on_hours).toBeGreaterThan(27000);
  });

  it('extracts temperature', () => {
    expect(result.health.temperature_c).toBeGreaterThan(0);
    expect(result.health.temperature_c).toBeLessThan(60);
  });

  it('shows zero bad sectors', () => {
    expect(result.health.pending_sectors).toBe(0);
    expect(result.health.uncorrectable_sectors).toBe(0);
    expect(result.health.reallocated_sectors).toBe(0);
  });

  it('smart passed', () => {
    expect(result.health.smart_passed).toBe(true);
  });

  it('parses self-test log', () => {
    expect(result.selfTests.length).toBeGreaterThan(0);
    expect(result.selfTests[0].type).toBeDefined();
  });
});

describe('parseSmartctl — failing drive', () => {
  const result = parseSmartctl(failing);

  it('extracts model', () => {
    expect(result.drive.model).toBe('WDC WD30EZRX-00MMMB0');
  });

  it('extracts serial', () => {
    expect(result.drive.serial).toBe('WD-WMAWZ0137443');
  });

  it('detects pending sectors', () => {
    expect(result.health.pending_sectors).toBe(1130);
  });

  it('detects uncorrectable sectors', () => {
    expect(result.health.uncorrectable_sectors).toBe(1052);
  });

  it('high power-on hours', () => {
    expect(result.health.power_on_hours).toBeGreaterThan(48000);
  });

  it('detects load cycle count', () => {
    expect(result.health.load_cycles).toBeGreaterThan(100000);
  });
});

describe('parseSmartctl — edge cases', () => {
  it('handles empty JSON', () => {
    const result = parseSmartctl({});
    expect(result.drive.model).toBe('Unknown');
    expect(result.health.pending_sectors).toBe(0);
  });

  it('handles missing attributes table', () => {
    const result = parseSmartctl({ smart_status: { passed: true } });
    expect(result.health.smart_passed).toBe(true);
    expect(result.health.power_on_hours).toBe(0);
  });
});
