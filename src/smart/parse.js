/**
 * Parse smartctl JSON output into normalized drive health data.
 * Handles both ATA (HDD/SATA SSD) and NVMe drive types.
 */

const ATA_ATTRS = {
  5: 'reallocated_sectors',
  9: 'power_on_hours',
  10: 'spin_retries',
  187: 'reported_uncorrectable',
  188: 'command_timeouts',
  193: 'load_cycles',
  194: 'temperature_c',
  196: 'reallocated_events',
  197: 'pending_sectors',
  198: 'uncorrectable_sectors',
  199: 'crc_errors',
};

export function parseSmartctl(json) {
  const drive = parseDriveIdentity(json);
  const isNvme = (json.device?.protocol ?? '').toLowerCase() === 'nvme'
    || !!json.nvme_smart_health_information_log;
  const health = isNvme ? parseNvmeHealth(json) : parseAtaHealth(json);
  const selfTests = isNvme ? parseNvmeSelfTests(json) : parseAtaSelfTests(json);
  const errorCount = json.ata_smart_error_log?.summary?.count ?? 0;

  return { drive, health, selfTests, errorCount, isNvme };
}

function parseDriveIdentity(json) {
  return {
    model: json.model_name ?? json.model_family ?? 'Unknown',
    model_family: json.model_family ?? '',
    serial: json.serial_number ?? 'Unknown',
    firmware: json.firmware_version ?? '',
    capacity_bytes: json.user_capacity?.bytes ?? 0,
    capacity_human: formatBytes(json.user_capacity?.bytes ?? 0),
    rotation_rpm: json.rotation_rate ?? null,
    form_factor: json.form_factor?.name ?? '',
    interface: json.device?.type ?? 'unknown',
    protocol: json.device?.protocol ?? 'unknown',
  };
}

function parseAtaHealth(json) {
  const smartPassed = json.smart_status?.passed ?? null;
  const attrs = {};

  if (json.ata_smart_attributes?.table) {
    for (const attr of json.ata_smart_attributes.table) {
      const name = ATA_ATTRS[attr.id];
      if (name) {
        // Temperature may be packed as min/max — use raw.value directly
        attrs[name] = attr.raw?.value ?? 0;
      }
    }
  }

  return {
    type: 'ata',
    smart_passed: smartPassed,
    power_on_hours: attrs.power_on_hours ?? 0,
    temperature_c: attrs.temperature_c ?? 0,
    reallocated_sectors: attrs.reallocated_sectors ?? 0,
    reallocated_events: attrs.reallocated_events ?? 0,
    pending_sectors: attrs.pending_sectors ?? 0,
    uncorrectable_sectors: attrs.uncorrectable_sectors ?? 0,
    crc_errors: attrs.crc_errors ?? 0,
    spin_retries: attrs.spin_retries ?? 0,
    reported_uncorrectable: attrs.reported_uncorrectable ?? 0,
    load_cycles: attrs.load_cycles ?? 0,
    command_timeouts: attrs.command_timeouts ?? 0,
    // NVMe-specific fields set to null for ATA
    percentage_used: null,
    available_spare: null,
    available_spare_threshold: null,
    critical_warning: null,
    media_errors: null,
    unsafe_shutdowns: null,
  };
}

function parseNvmeHealth(json) {
  const smartPassed = json.smart_status?.passed ?? null;
  const nvme = json.nvme_smart_health_information_log ?? {};

  return {
    type: 'nvme',
    smart_passed: smartPassed,
    power_on_hours: nvme.power_on_hours ?? 0,
    temperature_c: nvme.temperature ?? 0,
    // NVMe-specific
    percentage_used: nvme.percentage_used ?? 0,
    available_spare: nvme.available_spare ?? 100,
    available_spare_threshold: nvme.available_spare_threshold ?? 10,
    critical_warning: nvme.critical_warning ?? 0,
    media_errors: nvme.media_errors ?? 0,
    unsafe_shutdowns: nvme.unsafe_shutdowns ?? 0,
    // ATA-equivalent mappings
    reallocated_sectors: 0,
    reallocated_events: 0,
    pending_sectors: 0,
    uncorrectable_sectors: nvme.media_errors ?? 0,
    crc_errors: 0,
    spin_retries: 0,
    reported_uncorrectable: 0,
    load_cycles: 0,
    command_timeouts: 0,
  };
}

function parseAtaSelfTests(json) {
  const table = json.ata_smart_self_test_log?.standard?.table ?? [];
  return table.slice(0, 5).map(t => ({
    type: t.type?.string ?? 'unknown',
    status: t.status?.string ?? 'unknown',
    passed: t.status?.passed ?? false,
    hours: t.lifetime_hours ?? 0,
  }));
}

function parseNvmeSelfTests(json) {
  const table = json.nvme_self_test_log?.table ?? [];
  return table.slice(0, 5).map(t => ({
    type: t.self_test_code?.string ?? 'unknown',
    status: t.self_test_result?.string ?? 'unknown',
    passed: t.self_test_result?.value === 0,
    hours: t.power_on_hours ?? 0,
  }));
}

function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1000));
  return `${(bytes / Math.pow(1000, i)).toFixed(2)} ${units[i]}`;
}
