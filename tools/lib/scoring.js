/**
 * Pure functions for drive scoring and requirements checking.
 * Extracted for cross-platform testability (no shebang, no side effects).
 */

// ============================================================================
// DEFAULT CONFIG
// ============================================================================
export const DEFAULT_CONFIG = {
  requirements: {
    min_capacity_gb: 3000,
    max_power_on_hours: 50000,
    max_load_cycles: 200000,
    max_pending_sectors: 0,
    max_reallocated_sectors: 10,
    max_price_eur: 40,
    preferred_models: ['WD30EFRX', 'WD30EZRX', 'WD30EFZX', 'ST3000'],
    acceptable_protocols: ['ATA'],
  },
  pricing: {
    new_reference_price_eur: 70,
    life_multiplier: 0.7,
    negotiation_margin: 0.15,
  },
  polling: {
    enabled: false,
    interval_hours: 4,
    notify_command: null,
  },
  defaults: {
    language: 'es',
    auto_copy: true,
    auto_subscribe: true,
  },
};

// ============================================================================
// SCORING ENGINE
// ============================================================================
export function computeLifeScore(report) {
  const h = report.health || {};
  const isNvme = h.type === 'nvme';
  let score = 100;
  const notes = [];

  if (isNvme) {
    const used = h.percentage_used ?? 0;
    score -= used;
    if (used > 0) notes.push(`${used}% worn`);
    if (h.media_errors > 0) { score -= 50; notes.push(`${h.media_errors} media errors`); }
    if (h.critical_warning > 0) { score = 0; notes.push('critical warning'); }
    if ((h.available_spare ?? 100) < 20) { score -= 30; notes.push(`spare ${h.available_spare}%`); }
  } else {
    const hours = h.power_on_hours ?? 0;
    if (hours > 60000) { score -= 40; notes.push(`${fmtNum(hours)}h (very old)`); }
    else if (hours > 40000) { score -= 25; notes.push(`${fmtNum(hours)}h (aging)`); }
    else if (hours > 20000) { score -= 10; notes.push(`${fmtNum(hours)}h`); }

    const cycles = h.load_cycles ?? 0;
    if (cycles > 200000) { score -= 30; notes.push(`${fmtNum(cycles)} cycles (>66% consumed)`); }
    else if (cycles > 100000) { score -= 15; notes.push(`${fmtNum(cycles)} cycles`); }

    if ((h.pending_sectors ?? 0) > 0) { score -= 60; notes.push(`${h.pending_sectors} pending sectors`); }
    if ((h.uncorrectable_sectors ?? 0) > 0) { score -= 60; notes.push(`${h.uncorrectable_sectors} uncorrectable`); }
    if ((h.reallocated_sectors ?? 0) > 10) { score -= 30; notes.push(`${h.reallocated_sectors} reallocated`); }
    else if ((h.reallocated_sectors ?? 0) > 0) { score -= 10; notes.push(`${h.reallocated_sectors} reallocated`); }

    if ((h.crc_errors ?? 0) > 10) { score -= 5; notes.push('CRC errors (cable)'); }
  }

  if (h.smart_passed === false) { score = 0; notes.push('SMART FAILED'); }
  score = Math.max(0, Math.min(100, score));

  const bearingHoursLeft = Math.max(0, 50000 - (h.power_on_hours ?? 0));
  const cyclesLeft = Math.max(0, 300000 - (h.load_cycles ?? 0));
  const hoursPerYear = 365;
  const yearsFromHours = bearingHoursLeft / hoursPerYear;
  const yearsFromCycles = cyclesLeft / 365;
  const yearsRemaining = Math.min(yearsFromHours, yearsFromCycles, 30);

  return {
    total: score,
    years_remaining: Math.max(0, yearsRemaining).toFixed(0),
    breakdown: notes.length > 0 ? notes.join(', ') : 'no issues detected',
  };
}

// ============================================================================
// REQUIREMENTS CHECKER
// ============================================================================
export function checkRequirements(report, config) {
  const req = config?.requirements;
  if (!req) return { meets: true, issues: [] };

  const h = report.health || {};
  const d = report.drive || {};
  const issues = [];

  if (req.min_capacity_gb && d.capacity_bytes) {
    const capacityGb = d.capacity_bytes / (1000 * 1000 * 1000);
    if (capacityGb < req.min_capacity_gb) {
      issues.push(`capacity ${capacityGb.toFixed(0)}GB < ${req.min_capacity_gb}GB min`);
    }
  }
  if (req.max_power_on_hours != null && (h.power_on_hours || 0) > req.max_power_on_hours) {
    issues.push(`hours ${fmtNum(h.power_on_hours)} > ${fmtNum(req.max_power_on_hours)} max`);
  }
  if (req.max_load_cycles != null && (h.load_cycles || 0) > req.max_load_cycles) {
    issues.push(`cycles ${fmtNum(h.load_cycles)} > ${fmtNum(req.max_load_cycles)} max`);
  }
  if (req.max_pending_sectors != null && (h.pending_sectors || 0) > req.max_pending_sectors) {
    issues.push(`pending ${h.pending_sectors} > ${req.max_pending_sectors} max`);
  }
  if (req.max_reallocated_sectors != null && (h.reallocated_sectors || 0) > req.max_reallocated_sectors) {
    issues.push(`reallocated ${h.reallocated_sectors} > ${req.max_reallocated_sectors} max`);
  }

  return { meets: issues.length === 0, issues };
}

// ============================================================================
// TOKEN EXPIRY
// ============================================================================
export function isTokenExpired(entry) {
  if (entry.expires) {
    return new Date(entry.expires).getTime() < Date.now();
  }
  if (entry.created) {
    return Date.now() - new Date(entry.created).getTime() > 7 * 24 * 3600 * 1000;
  }
  return false;
}

// ============================================================================
// CONFIG HELPERS
// ============================================================================
export function getNestedValue(obj, path) {
  return path.split('.').reduce((o, k) => o?.[k], obj);
}

export function setNestedValue(obj, path, rawValue) {
  const keys = path.split('.');
  let current = obj;

  for (let i = 0; i < keys.length - 1; i++) {
    if (current[keys[i]] === undefined || typeof current[keys[i]] !== 'object') {
      console.log(`\n  Unknown config path: ${path}\n`);
      return false;
    }
    current = current[keys[i]];
  }

  const lastKey = keys[keys.length - 1];
  if (!(lastKey in current)) {
    console.log(`\n  Unknown config key: ${path}`);
    console.log('  Available keys at this level: ' + Object.keys(current).join(', ') + '\n');
    return false;
  }

  const existing = current[lastKey];
  let value = rawValue;

  if (typeof existing === 'number') {
    value = Number(rawValue);
    if (isNaN(value)) { console.log(`\n  Invalid number: ${rawValue}\n`); return false; }
  } else if (typeof existing === 'boolean') {
    value = rawValue === 'true';
  } else if (Array.isArray(existing)) {
    value = rawValue.split(',').map(s => s.trim());
  } else if (existing === null) {
    value = rawValue === 'null' ? null : rawValue;
  }

  current[lastKey] = value;
  return true;
}

function fmtNum(n) {
  return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}
