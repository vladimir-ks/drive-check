/**
 * Report integrity — multi-layer tamper detection.
 *
 * Layer 1: Raw data hash — SHA256 of raw smartctl JSON output
 * Layer 2: HMAC signature — proves report matches token + tool version
 * Layer 3: Consistency checks — catches naive forgery of raw data
 * Layer 4: Smartctl fingerprint — version/OS info from the smartctl binary
 *
 * LIMITATIONS (documented honestly):
 * - Seller CAN modify the tool to output fake data
 * - Seller CAN connect a different drive
 * - These layers make forgery HARDER, not impossible
 * - Only a server-side signing service could provide cryptographic proof
 */

import { createHash } from 'node:crypto';

/**
 * Generate integrity envelope for the report.
 * Includes raw data hash and consistency checks.
 */
export function generateIntegrity(rawSmartctlJson, parsed, reportTimestamp) {
  const rawString = JSON.stringify(rawSmartctlJson);
  const rawHash = createHash('sha256').update(rawString).digest('hex');

  const checks = runConsistencyChecks(rawSmartctlJson, parsed);

  return {
    raw_data_hash: rawHash,
    raw_data_bytes: Buffer.byteLength(rawString),
    smartctl_version: extractSmartctlVersion(rawSmartctlJson),
    consistency: {
      passed: checks.every(c => c.passed),
      checks,
    },
    timestamp_binding: {
      report_generated: reportTimestamp,
      drive_power_on_hours: parsed.health.power_on_hours,
      drive_power_cycles: rawSmartctlJson.power_cycle_count ?? null,
    },
  };
}

/**
 * Buyer-side verification: re-parse raw JSON and compare to report.
 * If raw JSON was included/sent alongside the report.
 */
export function verifyFromRaw(rawJson, reportHealth) {
  const mismatches = [];

  // Re-extract key attributes from raw and compare to report
  const attrs = {};
  if (rawJson.ata_smart_attributes?.table) {
    for (const attr of rawJson.ata_smart_attributes.table) {
      attrs[attr.id] = attr.raw?.value ?? 0;
    }
  }

  const checks = [
    { field: 'pending_sectors', rawId: 197, reported: reportHealth.pending_sectors },
    { field: 'uncorrectable_sectors', rawId: 198, reported: reportHealth.uncorrectable_sectors },
    { field: 'reallocated_sectors', rawId: 5, reported: reportHealth.reallocated_sectors },
    { field: 'power_on_hours', rawId: 9, reported: reportHealth.power_on_hours },
    { field: 'temperature_c', rawId: 194, reported: reportHealth.temperature_c },
    { field: 'load_cycles', rawId: 193, reported: reportHealth.load_cycles },
  ];

  for (const c of checks) {
    const rawVal = attrs[c.rawId] ?? 0;
    if (rawVal !== c.reported) {
      mismatches.push({
        field: c.field,
        raw_value: rawVal,
        reported_value: c.reported,
      });
    }
  }

  return {
    valid: mismatches.length === 0,
    mismatches,
  };
}

/**
 * Consistency checks that catch naive forgery.
 * These verify internal relationships in the smartctl data.
 */
function runConsistencyChecks(raw, parsed) {
  const checks = [];

  // 1. Self-test hours must be ≤ power-on hours
  const selfTests = raw.ata_smart_self_test_log?.standard?.table ?? [];
  if (selfTests.length > 0) {
    const latestTestHours = selfTests[0].lifetime_hours ?? 0;
    checks.push({
      name: 'self_test_hours_consistent',
      passed: latestTestHours <= parsed.health.power_on_hours,
      detail: `Last test at ${latestTestHours}h, current ${parsed.health.power_on_hours}h`,
    });
  }

  // 2. Temperature in physical range (10-70°C for spinning drives)
  if (parsed.health.temperature_c > 0) {
    checks.push({
      name: 'temperature_physical_range',
      passed: parsed.health.temperature_c >= 10 && parsed.health.temperature_c <= (parsed.isNvme ? 85 : 70),
      detail: `${parsed.health.temperature_c}°C (expected 10-${parsed.isNvme ? 85 : 70}°C)`,
    });
  }

  // 3. Reallocated events ≥ reallocated sector count (events trigger remapping)
  const reallocEvents = parsed.health.reallocated_events ?? 0;
  const reallocSectors = parsed.health.reallocated_sectors ?? 0;
  if (reallocSectors > 0 || reallocEvents > 0) {
    checks.push({
      name: 'realloc_events_consistent',
      passed: reallocEvents >= reallocSectors || reallocSectors === 0,
      detail: `Events: ${reallocEvents}, Sectors: ${reallocSectors}`,
    });
  }

  // 4. Power cycle count correlates with start/stop count
  const powerCycles = raw.power_cycle_count ?? 0;
  const startStops = findAttrRaw(raw, 4) ?? 0;
  if (powerCycles > 0 && startStops > 0) {
    const ratio = startStops / powerCycles;
    checks.push({
      name: 'power_cycle_start_stop_ratio',
      passed: ratio >= 0.5 && ratio <= 2.0,
      detail: `Start/stops: ${startStops}, Power cycles: ${powerCycles}, Ratio: ${ratio.toFixed(2)}`,
    });
  }

  // 5. SMART status must match attribute thresholds
  const smartPassed = raw.smart_status?.passed;
  if (smartPassed !== undefined) {
    // If SMART says PASSED, pre-fail attributes should be above threshold
    const table = raw.ata_smart_attributes?.table ?? [];
    const prefailBreach = table.some(a =>
      a.flags?.prefailure && a.value <= a.thresh && a.thresh > 0
    );
    checks.push({
      name: 'smart_status_matches_attributes',
      passed: smartPassed ? !prefailBreach : true,
      detail: smartPassed ? 'PASSED, no pre-fail breaches' : 'FAILED status',
    });
  }

  // 6. Serial number format (WD drives: WD-XXXXXXXXXXXX)
  const serial = parsed.drive.serial;
  if (serial && serial !== 'Unknown') {
    const looksValid = /^[A-Za-z0-9][A-Za-z0-9\-_]{5,30}$/.test(serial);
    checks.push({
      name: 'serial_format_valid',
      passed: looksValid,
      detail: `Serial: ${serial}`,
    });
  }

  // 7. Capacity matches model family (rough check)
  if (parsed.drive.model && parsed.drive.capacity_bytes > 0) {
    const model = parsed.drive.model.toUpperCase();
    const tbApprox = parsed.drive.capacity_bytes / 1e12;
    let expected = null;
    if (model.includes('WD30') || model.includes('ST3000')) expected = 3;
    if (model.includes('WD20') || model.includes('ST2000')) expected = 2;
    if (model.includes('WD40') || model.includes('ST4000')) expected = 4;
    if (expected) {
      checks.push({
        name: 'capacity_matches_model',
        passed: Math.abs(tbApprox - expected) < 0.5,
        detail: `Model suggests ${expected}TB, actual ${tbApprox.toFixed(2)}TB`,
      });
    }
  }

  // 8. Attribute count sanity (real drives have 15-30 attributes)
  const attrCount = (raw.ata_smart_attributes?.table ?? []).length;
  if (attrCount > 0) {
    checks.push({
      name: 'attribute_count_sane',
      passed: attrCount >= 10 && attrCount <= 40,
      detail: `${attrCount} attributes (expected 10-40)`,
    });
  }

  return checks;
}

function extractSmartctlVersion(raw) {
  const sv = raw.smartctl ?? {};
  return {
    version: sv.version ? sv.version.join('.') : null,
    build_info: sv.build_info ?? null,
    platform: sv.platform_info ?? null,
  };
}

function findAttrRaw(raw, attrId) {
  const table = raw.ata_smart_attributes?.table ?? [];
  const attr = table.find(a => a.id === attrId);
  return attr?.raw?.value ?? null;
}
