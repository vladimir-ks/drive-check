/**
 * Audit log — prints every external command to terminal.
 * Transparency: seller sees exactly what the tool runs.
 */

import { color } from '../cli/display.js';

export function logCommand(binary, args) {
  const cmd = [binary, ...args].join(' ');
  process.stderr.write(`${color.dim(`  [audit] ${cmd}`)}\n`);
}

export function logAction(action) {
  process.stderr.write(`${color.dim(`  [audit] ${action}`)}\n`);
}
