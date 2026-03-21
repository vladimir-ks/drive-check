/**
 * Verdict engine and report generator.
 * Takes parsed SMART data, produces verdict + full report.
 */

export function generateReport(parsed, token, toolVersion) {
  const { drive, health, selfTests, errorCount } = parsed;
  const verdict = computeVerdict(health, errorCount);

  return {
    version: '1.0',
    token,
    generated_at: new Date().toISOString(),
    tool_version: toolVersion,
    drive,
    health,
    self_tests: selfTests,
    error_log_count: errorCount,
    verdict,
  };
}

export function computeVerdict(health, errorCount = 0) {
  const reasons = [];

  // FAILING checks (any = FAILING)
  if (health.smart_passed === false) {
    reasons.push({ level: 'FAIL', msg: 'SMART overall health test FAILED' });
  }
  if (health.pending_sectors > 0) {
    reasons.push({ level: 'FAIL', msg: `${health.pending_sectors} pending sectors (bad sectors awaiting remap)` });
  }
  if (health.uncorrectable_sectors > 0) {
    reasons.push({ level: 'FAIL', msg: `${health.uncorrectable_sectors} uncorrectable sectors (data loss risk)` });
  }
  if (health.reallocated_sectors > 100) {
    reasons.push({ level: 'FAIL', msg: `${health.reallocated_sectors} reallocated sectors (excessive remapping)` });
  }
  if (health.spin_retries > 0) {
    reasons.push({ level: 'FAIL', msg: `${health.spin_retries} spin retries (motor failure risk)` });
  }
  if (health.reported_uncorrectable > 0) {
    reasons.push({ level: 'FAIL', msg: `${health.reported_uncorrectable} reported uncorrectable errors` });
  }

  // WARNING checks
  if (health.power_on_hours > 40000) {
    reasons.push({ level: 'WARN', msg: `${health.power_on_hours} power-on hours (>40,000 — aging drive)` });
  }
  if (health.reallocated_sectors > 0 && health.reallocated_sectors <= 100) {
    reasons.push({ level: 'WARN', msg: `${health.reallocated_sectors} reallocated sectors (some remapping)` });
  }
  if (health.temperature_c > 50) {
    reasons.push({ level: 'WARN', msg: `${health.temperature_c}°C temperature (>50°C — overheating)` });
  }
  if (errorCount > 0) {
    reasons.push({ level: 'WARN', msg: `${errorCount} errors in error log` });
  }
  if (health.crc_errors > 10) {
    reasons.push({ level: 'WARN', msg: `${health.crc_errors} CRC errors (cable issues)` });
  }
  if (health.load_cycles > 200000) {
    reasons.push({ level: 'WARN', msg: `${health.load_cycles} load cycles (>200K of ~300K rated life)` });
  }

  const hasFail = reasons.some(r => r.level === 'FAIL');
  const hasWarn = reasons.some(r => r.level === 'WARN');

  let overall;
  if (hasFail) overall = 'FAILING';
  else if (hasWarn) overall = 'WARNING';
  else overall = 'HEALTHY';

  return { overall, reasons };
}
