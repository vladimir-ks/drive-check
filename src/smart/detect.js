/**
 * Detect smartctl binary on the system.
 * Checks PATH, then OS-specific known locations.
 */

import { execFileSync } from 'node:child_process';

const KNOWN_PATHS = {
  win32: ['C:\\Program Files\\smartmontools\\bin\\smartctl.exe'],
  darwin: ['/opt/homebrew/bin/smartctl', '/usr/local/bin/smartctl'],
  linux: ['/usr/sbin/smartctl', '/usr/bin/smartctl'],
};

export function detectSmartctl() {
  // Try PATH first
  try {
    const cmd = process.platform === 'win32' ? 'where' : 'which';
    const result = execFileSync(cmd, ['smartctl'], { encoding: 'utf8', timeout: 5000 }).trim();
    if (result) return { found: true, path: result.split('\n')[0] };
  } catch { /* not in PATH */ }

  // Try known locations
  const paths = KNOWN_PATHS[process.platform] ?? [];
  for (const p of paths) {
    try {
      execFileSync(p, ['--version'], { encoding: 'utf8', timeout: 5000 });
      return { found: true, path: p };
    } catch { /* not here */ }
  }

  return { found: false, path: null };
}
