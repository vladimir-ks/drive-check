/**
 * Detect smartctl binary on the system.
 * Checks PATH, then OS-specific known locations.
 */

import { execFileSync } from 'node:child_process';

const KNOWN_PATHS = {
  win32: [
    'C:\\Program Files\\smartmontools\\bin\\smartctl.exe',
    'C:\\Program Files (x86)\\smartmontools\\bin\\smartctl.exe',
  ],
  darwin: ['/opt/homebrew/bin/smartctl', '/usr/local/bin/smartctl'],
  linux: ['/usr/sbin/smartctl', '/usr/bin/smartctl'],
};

export function detectSmartctl() {
  // Try PATH first
  try {
    const cmd = process.platform === 'win32' ? 'where' : 'which';
    const result = execFileSync(cmd, ['smartctl'], {
      encoding: 'utf8',
      timeout: 5000,
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();
    if (result) {
      const firstLine = result.split(/\r?\n/)[0].trim();
      if (firstLine) return { found: true, path: firstLine };
    }
  } catch { /* not in PATH */ }

  // Try known locations
  const paths = KNOWN_PATHS[process.platform] ?? KNOWN_PATHS.linux;
  for (const p of paths) {
    try {
      execFileSync(p, ['--version'], {
        encoding: 'utf8',
        timeout: 5000,
        stdio: ['pipe', 'pipe', 'pipe'],
      });
      return { found: true, path: p };
    } catch { /* not here */ }
  }

  return { found: false, path: null };
}
