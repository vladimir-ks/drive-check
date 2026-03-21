import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { parseSmartctl } from '../../src/smart/parse.js';
import { generateReport } from '../../src/report/generate.js';
import { formatReport } from '../../src/report/format.js';

const healthy = JSON.parse(readFileSync(new URL('../fixtures/smart-3tb-wd-healthy.json', import.meta.url), 'utf8'));
const failing = JSON.parse(readFileSync(new URL('../fixtures/smart-3tb-wd-failing.json', import.meta.url), 'utf8'));

describe('formatReport', () => {
  it('contains drive model and serial', () => {
    const report = generateReport(parseSmartctl(healthy), 'dc-test12345678', '1.0.0');
    const text = formatReport(report);
    expect(text).toContain('WDC WD30EZRX-00DC0B0');
    expect(text).toContain('WD-WCC1T0994579');
  });

  it('contains verdict for healthy drive', () => {
    const report = generateReport(parseSmartctl(healthy), 'dc-test12345678', '1.0.0');
    const text = formatReport(report);
    expect(text).toMatch(/HEALTHY|WARNING/);
  });

  it('contains FAILING verdict for bad drive', () => {
    const report = generateReport(parseSmartctl(failing), 'dc-test12345678', '1.0.0');
    const text = formatReport(report);
    expect(text).toContain('FAILING');
  });

  it('contains power-on hours', () => {
    const report = generateReport(parseSmartctl(healthy), 'dc-test12345678', '1.0.0');
    const text = formatReport(report);
    expect(text).toContain('Power-On Hours');
  });

  it('shows reasons for failing drive', () => {
    const report = generateReport(parseSmartctl(failing), 'dc-test12345678', '1.0.0');
    const text = formatReport(report);
    expect(text).toContain('pending');
  });
});
