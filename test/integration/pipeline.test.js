import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { parseSmartctl } from '../../src/smart/parse.js';
import { generateReport } from '../../src/report/generate.js';
import { signReport, verifySignature } from '../../src/report/sign.js';
import { formatReport } from '../../src/report/format.js';
import { validateToken } from '../../src/token/decode.js';

const healthy = JSON.parse(readFileSync(new URL('../fixtures/smart-3tb-wd-healthy.json', import.meta.url), 'utf8'));
const failing = JSON.parse(readFileSync(new URL('../fixtures/smart-3tb-wd-failing.json', import.meta.url), 'utf8'));

describe('Full pipeline: parse → generate → sign → format', () => {
  const TOKEN = 'dc-integtest1234';
  const VERSION = '1.0.0';

  it('healthy drive produces valid signed report', () => {
    // Validate token
    expect(validateToken(TOKEN).valid).toBe(true);

    // Parse
    const parsed = parseSmartctl(healthy);
    expect(parsed.drive.serial).toBe('WD-WCC1T0994579');

    // Generate
    const report = generateReport(parsed, TOKEN, VERSION);
    expect(report.version).toBe('1.1');
    expect(report.token).toBe(TOKEN);
    expect(report.drive.model).toContain('WD30EZRX');

    // Sign
    const sig = signReport(report, TOKEN, VERSION);
    expect(sig).toMatch(/^[0-9a-f]{64}$/);

    // Verify
    expect(verifySignature(report, sig, TOKEN, VERSION)).toBe(true);

    // Format
    const text = formatReport(report);
    expect(text).toContain('WD-WCC1T0994579');
    expect(text.length).toBeGreaterThan(100);
  });

  it('failing drive produces FAILING verdict with reasons', () => {
    const parsed = parseSmartctl(failing);
    const report = generateReport(parsed, TOKEN, VERSION);

    expect(report.verdict.overall).toBe('FAILING');
    expect(report.verdict.reasons.length).toBeGreaterThan(0);
    expect(report.verdict.reasons.some(r => r.level === 'FAIL')).toBe(true);

    // Signature works
    const sig = signReport(report, TOKEN, VERSION);
    expect(verifySignature(report, sig, TOKEN, VERSION)).toBe(true);

    // Tampered report fails verification
    const tampered = JSON.parse(JSON.stringify(report));
    tampered.verdict.overall = 'HEALTHY';
    expect(verifySignature(tampered, sig, TOKEN, VERSION)).toBe(false);
  });

  it('report JSON is serializable', () => {
    const parsed = parseSmartctl(healthy);
    const report = generateReport(parsed, TOKEN, VERSION);
    const sig = signReport(report, TOKEN, VERSION);
    const payload = JSON.stringify({ ...report, signature: sig });

    // Round-trip
    const restored = JSON.parse(payload);
    expect(restored.drive.serial).toBe('WD-WCC1T0994579');
    expect(restored.signature).toBe(sig);
  });
});
