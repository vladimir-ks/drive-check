import { describe, it, expect } from 'vitest';
import { computeLifeScore, checkRequirements, DEFAULT_CONFIG, isTokenExpired, setNestedValue, getNestedValue } from '../../tools/drive-buy.js';

// ============================================================================
// computeLifeScore
// ============================================================================
describe('computeLifeScore — healthy ATA drive', () => {
  const report = {
    health: { power_on_hours: 15000, load_cycles: 50000, pending_sectors: 0, uncorrectable_sectors: 0, reallocated_sectors: 0, smart_passed: true, temperature_c: 35 },
    drive: { model: 'WD30EFRX', capacity_bytes: 3000592982016 },
  };
  const score = computeLifeScore(report);

  it('scores high (>80%)', () => {
    expect(score.total).toBeGreaterThanOrEqual(80);
  });

  it('has remaining years', () => {
    expect(Number(score.years_remaining)).toBeGreaterThan(10);
  });

  it('breakdown says no issues', () => {
    expect(score.breakdown).toBe('no issues detected');
  });
});

describe('computeLifeScore — aging ATA drive', () => {
  const report = {
    health: { power_on_hours: 45000, load_cycles: 150000, pending_sectors: 0, uncorrectable_sectors: 0, reallocated_sectors: 3, smart_passed: true },
  };
  const score = computeLifeScore(report);

  it('scores lower (25-60%)', () => {
    expect(score.total).toBeGreaterThanOrEqual(25);
    expect(score.total).toBeLessThanOrEqual(60);
  });

  it('notes aging and cycles', () => {
    expect(score.breakdown).toContain('aging');
    expect(score.breakdown).toContain('cycles');
  });
});

describe('computeLifeScore — failing ATA drive', () => {
  const report = {
    health: { power_on_hours: 48912, load_cycles: 198457, pending_sectors: 1130, uncorrectable_sectors: 1052, reallocated_sectors: 0, smart_passed: true },
  };
  const score = computeLifeScore(report);

  it('scores near zero', () => {
    expect(score.total).toBeLessThanOrEqual(10);
  });

  it('notes pending and uncorrectable', () => {
    expect(score.breakdown).toContain('pending');
    expect(score.breakdown).toContain('uncorrectable');
  });
});

describe('computeLifeScore — SMART failed drive', () => {
  const report = { health: { smart_passed: false, power_on_hours: 1000 } };
  const score = computeLifeScore(report);

  it('scores exactly 0', () => {
    expect(score.total).toBe(0);
  });
});

describe('computeLifeScore — NVMe drive', () => {
  const report = {
    health: { type: 'nvme', percentage_used: 15, media_errors: 0, critical_warning: 0, available_spare: 100 },
  };
  const score = computeLifeScore(report);

  it('subtracts percentage_used from 100', () => {
    expect(score.total).toBe(85);
  });
});

describe('computeLifeScore — empty report', () => {
  const score = computeLifeScore({});

  it('scores 100 with no data', () => {
    expect(score.total).toBe(100);
  });
});

// ============================================================================
// checkRequirements
// ============================================================================
describe('checkRequirements — passing drive', () => {
  const report = {
    health: { power_on_hours: 20000, load_cycles: 80000, pending_sectors: 0, reallocated_sectors: 0 },
    drive: { capacity_bytes: 3000592982016 },
  };
  const result = checkRequirements(report, DEFAULT_CONFIG);

  it('meets requirements', () => {
    expect(result.meets).toBe(true);
    expect(result.issues).toHaveLength(0);
  });
});

describe('checkRequirements — too many hours', () => {
  const report = {
    health: { power_on_hours: 60000, load_cycles: 80000, pending_sectors: 0, reallocated_sectors: 0 },
    drive: { capacity_bytes: 3000592982016 },
  };
  const result = checkRequirements(report, DEFAULT_CONFIG);

  it('fails on hours', () => {
    expect(result.meets).toBe(false);
    expect(result.issues[0]).toContain('hours');
  });
});

describe('checkRequirements — too small capacity', () => {
  const report = {
    health: { power_on_hours: 10000, pending_sectors: 0, reallocated_sectors: 0 },
    drive: { capacity_bytes: 500107862016 }, // ~500GB
  };
  const result = checkRequirements(report, DEFAULT_CONFIG);

  it('fails on capacity', () => {
    expect(result.meets).toBe(false);
    expect(result.issues[0]).toContain('capacity');
  });
});

describe('checkRequirements — pending sectors over limit', () => {
  const report = {
    health: { power_on_hours: 10000, pending_sectors: 5, reallocated_sectors: 0 },
    drive: { capacity_bytes: 3000592982016 },
  };
  const result = checkRequirements(report, DEFAULT_CONFIG);

  it('fails on pending sectors', () => {
    expect(result.meets).toBe(false);
    expect(result.issues[0]).toContain('pending');
  });
});

describe('checkRequirements — reallocated over limit', () => {
  const report = {
    health: { power_on_hours: 10000, pending_sectors: 0, reallocated_sectors: 15 },
    drive: { capacity_bytes: 3000592982016 },
  };
  const result = checkRequirements(report, DEFAULT_CONFIG);

  it('fails on reallocated', () => {
    expect(result.meets).toBe(false);
    expect(result.issues[0]).toContain('reallocated');
  });
});

describe('checkRequirements — no config', () => {
  const report = { health: { power_on_hours: 99999 }, drive: {} };
  const result = checkRequirements(report, {});

  it('passes when no requirements defined', () => {
    expect(result.meets).toBe(true);
  });
});

describe('checkRequirements — multiple failures', () => {
  const report = {
    health: { power_on_hours: 60000, load_cycles: 300000, pending_sectors: 10, reallocated_sectors: 50 },
    drive: { capacity_bytes: 500000000000 },
  };
  const result = checkRequirements(report, DEFAULT_CONFIG);

  it('reports all issues', () => {
    expect(result.meets).toBe(false);
    expect(result.issues.length).toBeGreaterThanOrEqual(4);
  });
});

// ============================================================================
// isTokenExpired
// ============================================================================
describe('isTokenExpired', () => {
  it('returns false for non-expired token', () => {
    const entry = { expires: new Date(Date.now() + 86400000).toISOString() };
    expect(isTokenExpired(entry)).toBe(false);
  });

  it('returns true for expired token', () => {
    const entry = { expires: new Date(Date.now() - 86400000).toISOString() };
    expect(isTokenExpired(entry)).toBe(true);
  });

  it('falls back to created + 7 days', () => {
    const entry = { created: new Date(Date.now() - 8 * 86400000).toISOString() };
    expect(isTokenExpired(entry)).toBe(true);
  });

  it('not expired by created fallback within 7 days', () => {
    const entry = { created: new Date(Date.now() - 3 * 86400000).toISOString() };
    expect(isTokenExpired(entry)).toBe(false);
  });
});

// ============================================================================
// setNestedValue / getNestedValue
// ============================================================================
describe('config path helpers', () => {
  it('getNestedValue reads deep path', () => {
    const obj = { a: { b: { c: 42 } } };
    expect(getNestedValue(obj, 'a.b.c')).toBe(42);
  });

  it('getNestedValue returns undefined for missing path', () => {
    expect(getNestedValue({}, 'a.b.c')).toBeUndefined();
  });

  it('setNestedValue updates numeric value', () => {
    const obj = { pricing: { new_reference_price_eur: 70 } };
    setNestedValue(obj, 'pricing.new_reference_price_eur', '85');
    expect(obj.pricing.new_reference_price_eur).toBe(85);
  });

  it('setNestedValue updates boolean value', () => {
    const obj = { polling: { enabled: false } };
    setNestedValue(obj, 'polling.enabled', 'true');
    expect(obj.polling.enabled).toBe(true);
  });

  it('setNestedValue updates array value', () => {
    const obj = { requirements: { preferred_models: ['WD30EFRX'] } };
    setNestedValue(obj, 'requirements.preferred_models', 'WD30EFRX,ST3000,WD30EZRX');
    expect(obj.requirements.preferred_models).toEqual(['WD30EFRX', 'ST3000', 'WD30EZRX']);
  });

  it('setNestedValue rejects unknown path', () => {
    const obj = { a: { b: 1 } };
    const result = setNestedValue(obj, 'a.c', '2');
    expect(result).toBe(false);
  });
});

// ============================================================================
// DEFAULT_CONFIG structure
// ============================================================================
describe('DEFAULT_CONFIG', () => {
  it('has requirements section', () => {
    expect(DEFAULT_CONFIG.requirements).toBeDefined();
    expect(DEFAULT_CONFIG.requirements.min_capacity_gb).toBe(3000);
    expect(DEFAULT_CONFIG.requirements.max_power_on_hours).toBe(50000);
    expect(DEFAULT_CONFIG.requirements.max_pending_sectors).toBe(0);
  });

  it('has pricing section', () => {
    expect(DEFAULT_CONFIG.pricing).toBeDefined();
    expect(DEFAULT_CONFIG.pricing.new_reference_price_eur).toBe(70);
    expect(DEFAULT_CONFIG.pricing.life_multiplier).toBe(0.7);
    expect(DEFAULT_CONFIG.pricing.negotiation_margin).toBe(0.15);
  });

  it('has polling section', () => {
    expect(DEFAULT_CONFIG.polling).toBeDefined();
    expect(DEFAULT_CONFIG.polling.enabled).toBe(false);
    expect(DEFAULT_CONFIG.polling.interval_hours).toBe(4);
  });

  it('has defaults section', () => {
    expect(DEFAULT_CONFIG.defaults).toBeDefined();
    expect(DEFAULT_CONFIG.defaults.language).toBe('es');
  });
});
