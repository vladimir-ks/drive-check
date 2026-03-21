/**
 * Format report as human-readable text for seller preview.
 * Handles both ATA and NVMe drive types.
 */

import { color, verdictBadge } from '../cli/display.js';

export function formatReport(report) {
  const { drive, health, verdict, self_tests } = report;
  const years = (health.power_on_hours / 8760).toFixed(1);
  const isNvme = health.type === 'nvme';

  let smartStatus;
  if (health.smart_passed === true) smartStatus = color.green('PASSED');
  else if (health.smart_passed === false) smartStatus = color.red('FAILED');
  else smartStatus = color.yellow('N/A');

  let out = `
${color.bold('=== REPORT PREVIEW ===')}

  Drive:              ${drive.model}
  Serial:             ${drive.serial}
  Capacity:           ${drive.capacity_human}
  Firmware:           ${drive.firmware}
  Type:               ${isNvme ? 'NVMe SSD' : drive.rotation_rpm ? `HDD (${drive.rotation_rpm} RPM)` : 'SATA SSD'}
  Power-On Hours:     ${fmtNum(health.power_on_hours)} (${years} years)
  Temperature:        ${health.temperature_c}C
  SMART Status:       ${smartStatus}
`;

  if (isNvme) {
    out += `  Wear (% used):     ${health.percentage_used}%
  Available Spare:    ${health.available_spare}% (threshold: ${health.available_spare_threshold}%)
  Media Errors:       ${health.media_errors}
  Unsafe Shutdowns:   ${fmtNum(health.unsafe_shutdowns)}
`;
  } else {
    out += `  Reallocated:        ${health.reallocated_sectors}
  Pending Sectors:    ${health.pending_sectors}
  Uncorrectable:      ${health.uncorrectable_sectors}
  Load Cycles:        ${fmtNum(health.load_cycles)}
  CRC Errors:         ${health.crc_errors}
`;
  }

  out += `
  Overall:            ${verdictBadge(verdict.overall)}
`;

  if (verdict.reasons.length > 0) {
    out += `\n  ${color.bold('Reasons:')}\n`;
    for (const r of verdict.reasons) {
      const icon = r.level === 'FAIL' ? color.red('x') : color.yellow('!');
      out += `    ${icon} ${r.msg}\n`;
    }
  }

  if (self_tests.length > 0) {
    out += `\n  ${color.bold('Last self-test:')} ${self_tests[0].type} - ${self_tests[0].status}\n`;
  }

  out += `\n${color.bold('=== END OF REPORT ===')}\n`;
  return out;
}

function fmtNum(n) {
  return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}
