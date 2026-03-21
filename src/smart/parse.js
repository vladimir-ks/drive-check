/**
 * Parse smartctl JSON output into normalized drive health data.
 * Handles both ATA and NVMe drive types.
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
  const health = parseHealth(json);
  const selfTests = parseSelfTests(json);
  const errorCount = json.ata_smart_error_log?.summary?.count ?? 0;

  return { drive, health, selfTests, errorCount };
}

function parseDriveIdentity(json) {
  const dev = json.model_name ? json : (json.device ?? {});
  return {
    model: json.model_name ?? json.model_family ?? 'Unknown',
    model_family: json.model_family ?? '',
    serial: json.serial_number ?? 'Unknown',
    firmware: json.firmware_version ?? '',
    capacity_bytes: json.user_capacity?.bytes ?? 0,
    capacity_human: formatBytes(json.user_capacity?.bytes ?? 0),
    rotation_rpm: json.rotation_rate ?? 0,
    form_factor: json.form_factor?.name ?? '',
    interface: json.device?.type ?? 'unknown',
    protocol: json.device?.protocol ?? 'unknown',
  };
}

function parseHealth(json) {
  const smartPassed = json.smart_status?.passed ?? null;
  const attrs = {};

  // ATA drives: attributes in ata_smart_attributes.table
  if (json.ata_smart_attributes?.table) {
    for (const attr of json.ata_smart_attributes.table) {
      const name = ATA_ATTRS[attr.id];
      if (name) {
        attrs[name] = attr.raw?.value ?? 0;
      }
    }
  }

  // NVMe drives: health info in nvme_smart_health_information_log
  if (json.nvme_smart_health_information_log) {
    const nvme = json.nvme_smart_health_information_log;
    attrs.power_on_hours = nvme.power_on_hours ?? 0;
    attrs.temperature_c = nvme.temperature ?? 0;
    attrs.pending_sectors = 0;
    attrs.uncorrectable_sectors = nvme.media_errors ?? 0;
    attrs.reallocated_sectors = 0;
    attrs.crc_errors = 0;
    attrs.spin_retries = 0;
    attrs.reported_uncorrectable = 0;
    attrs.load_cycles = 0;
    attrs.command_timeouts = 0;
  }

  return {
    smart_passed: smartPassed,
    power_on_hours: attrs.power_on_hours ?? 0,
    temperature_c: attrs.temperature_c ?? 0,
    reallocated_sectors: attrs.reallocated_sectors ?? 0,
    pending_sectors: attrs.pending_sectors ?? 0,
    uncorrectable_sectors: attrs.uncorrectable_sectors ?? 0,
    crc_errors: attrs.crc_errors ?? 0,
    spin_retries: attrs.spin_retries ?? 0,
    reported_uncorrectable: attrs.reported_uncorrectable ?? 0,
    load_cycles: attrs.load_cycles ?? 0,
    command_timeouts: attrs.command_timeouts ?? 0,
    reallocated_events: attrs.reallocated_events ?? 0,
  };
}

function parseSelfTests(json) {
  const table = json.ata_smart_self_test_log?.standard?.table ?? [];
  return table.slice(0, 5).map(t => ({
    type: t.type?.string ?? 'unknown',
    status: t.status?.string ?? 'unknown',
    passed: t.status?.passed ?? false,
    hours: t.lifetime_hours ?? 0,
  }));
}

function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1000));
  return `${(bytes / Math.pow(1000, i)).toFixed(2)} ${units[i]}`;
}
