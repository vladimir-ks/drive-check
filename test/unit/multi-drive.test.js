import { describe, it, expect } from 'vitest';
import { generateMultiReport, generateReport, computeVerdict } from '../../src/report/generate.js';

const healthyDrive = {
  drive: { model: 'WD30EFRX', serial: 'WD-ABC123', capacity_bytes: 3000592982016, capacity_human: '3.00 TB' },
  health: { type: 'ata', smart_passed: true, power_on_hours: 15000, temperature_c: 35, pending_sectors: 0, uncorrectable_sectors: 0, reallocated_sectors: 0, load_cycles: 50000 },
  selfTests: [{ type: 'Short', status: 'Completed', passed: true, hours: 14990 }],
  errorCount: 0,
  isNvme: false,
};

const failingDrive = {
  drive: { model: 'WD30EZRX', serial: 'WD-DEF456', capacity_bytes: 3000592982016, capacity_human: '3.00 TB' },
  health: { type: 'ata', smart_passed: true, power_on_hours: 48912, temperature_c: 30, pending_sectors: 1130, uncorrectable_sectors: 1052, reallocated_sectors: 0, load_cycles: 111201 },
  selfTests: [],
  errorCount: 0,
  isNvme: false,
};

describe('generateMultiReport — v1.2', () => {
  const report = generateMultiReport([healthyDrive, failingDrive], 'dc-test123', '1.0.1');

  it('has version 1.2', () => {
    expect(report.version).toBe('1.2');
  });

  it('has drive_count', () => {
    expect(report.drive_count).toBe(2);
  });

  it('has drives array', () => {
    expect(report.drives).toHaveLength(2);
  });

  it('first drive is healthy', () => {
    expect(report.drives[0].verdict.overall).toBe('HEALTHY');
    expect(report.drives[0].drive.model).toBe('WD30EFRX');
  });

  it('second drive is failing', () => {
    expect(report.drives[1].verdict.overall).toBe('FAILING');
    expect(report.drives[1].drive.model).toBe('WD30EZRX');
  });

  it('each drive has health data', () => {
    expect(report.drives[0].health.power_on_hours).toBe(15000);
    expect(report.drives[1].health.pending_sectors).toBe(1130);
  });

  it('has token and generated_at', () => {
    expect(report.token).toBe('dc-test123');
    expect(report.generated_at).toBeDefined();
  });
});

describe('generateReport — v1.1 backward compat', () => {
  const report = generateReport(healthyDrive, 'dc-test456', '1.0.1');

  it('has version 1.1', () => {
    expect(report.version).toBe('1.1');
  });

  it('has single drive field (not drives array)', () => {
    expect(report.drive).toBeDefined();
    expect(report.drives).toBeUndefined();
  });

  it('has verdict', () => {
    expect(report.verdict.overall).toBe('HEALTHY');
  });
});

describe('generateMultiReport — single drive still works', () => {
  const report = generateMultiReport([healthyDrive], 'dc-single', '1.0.1');

  it('wraps single drive in v1.2 format', () => {
    expect(report.version).toBe('1.2');
    expect(report.drive_count).toBe(1);
    expect(report.drives).toHaveLength(1);
  });
});
