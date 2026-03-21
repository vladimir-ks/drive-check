import { describe, it, expect } from 'vitest';
import { signReport, verifySignature } from '../../src/report/sign.js';

const SAMPLE_REPORT = {
  version: '1.0',
  token: 'dc-test12345678',
  drive: { model: 'WDC WD30EZRX', serial: 'WD-TEST123' },
  health: { power_on_hours: 5000, pending_sectors: 0 },
};

describe('signReport', () => {
  it('produces hex string', () => {
    const sig = signReport(SAMPLE_REPORT, 'dc-test12345678', '1.0.0');
    expect(sig).toMatch(/^[0-9a-f]{64}$/);
  });

  it('is deterministic', () => {
    const sig1 = signReport(SAMPLE_REPORT, 'dc-test12345678', '1.0.0');
    const sig2 = signReport(SAMPLE_REPORT, 'dc-test12345678', '1.0.0');
    expect(sig1).toBe(sig2);
  });

  it('differs with different token', () => {
    const sig1 = signReport(SAMPLE_REPORT, 'dc-aaaa11112222', '1.0.0');
    const sig2 = signReport(SAMPLE_REPORT, 'dc-bbbb33334444', '1.0.0');
    expect(sig1).not.toBe(sig2);
  });

  it('differs with different version', () => {
    const sig1 = signReport(SAMPLE_REPORT, 'dc-test12345678', '1.0.0');
    const sig2 = signReport(SAMPLE_REPORT, 'dc-test12345678', '2.0.0');
    expect(sig1).not.toBe(sig2);
  });
});

describe('verifySignature', () => {
  it('verifies correct signature', () => {
    const sig = signReport(SAMPLE_REPORT, 'dc-test12345678', '1.0.0');
    expect(verifySignature(SAMPLE_REPORT, sig, 'dc-test12345678', '1.0.0')).toBe(true);
  });

  it('rejects tampered report', () => {
    const sig = signReport(SAMPLE_REPORT, 'dc-test12345678', '1.0.0');
    const tampered = { ...SAMPLE_REPORT, health: { ...SAMPLE_REPORT.health, pending_sectors: 999 } };
    expect(verifySignature(tampered, sig, 'dc-test12345678', '1.0.0')).toBe(false);
  });
});
