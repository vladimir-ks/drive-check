/**
 * Format report as human-readable text for seller preview.
 */

import { color, verdictBadge } from '../cli/display.js';

export function formatReport(report) {
  const { drive, health, verdict, self_tests } = report;
  const years = (health.power_on_hours / 8760).toFixed(1);

  let out = `
${color.bold('═══ REPORT PREVIEW — THIS IS WHAT THE BUYER WILL SEE ═══')}

  Drive:              ${drive.model}
  Serial:             ${drive.serial}
  Capacity:           ${drive.capacity_human}
  Firmware:           ${drive.firmware}
  Power-On Hours:     ${health.power_on_hours.toLocaleString()} (${years} years)
  Temperature:        ${health.temperature_c}°C
  Reallocated:        ${health.reallocated_sectors}
  Pending Sectors:    ${health.pending_sectors}
  Uncorrectable:      ${health.uncorrectable_sectors}
  Load Cycles:        ${health.load_cycles.toLocaleString()}
  CRC Errors:         ${health.crc_errors}
  SMART Status:       ${health.smart_passed ? color.green('PASSED') : color.red('FAILED')}

  Overall:            ${verdictBadge(verdict.overall)}
`;

  if (verdict.reasons.length > 0) {
    out += `\n  ${color.bold('Reasons:')}\n`;
    for (const r of verdict.reasons) {
      const icon = r.level === 'FAIL' ? color.red('✗') : color.yellow('!');
      out += `    ${icon} ${r.msg}\n`;
    }
  }

  if (self_tests.length > 0) {
    out += `\n  ${color.bold('Last self-test:')} ${self_tests[0].type} — ${self_tests[0].status}\n`;
  }

  out += `\n${color.bold('═══ END OF REPORT ═══')}\n`;
  return out;
}
