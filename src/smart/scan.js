/**
 * Scan for connected drives using smartctl.
 */

import { execFile } from 'node:child_process';

export function scanDrives(smartctlPath) {
  return new Promise((resolve, reject) => {
    execFile(smartctlPath, ['--scan', '-j'], { timeout: 15000 }, (err, stdout) => {
      if (err && !stdout) {
        reject(new Error(`smartctl scan failed: ${err.message}`));
        return;
      }
      try {
        const data = JSON.parse(stdout);
        const drives = (data.devices ?? []).map(d => ({
          path: d.name,
          type: d.type,
          protocol: d.protocol,
        }));
        resolve(drives);
      } catch (e) {
        reject(new Error(`Failed to parse smartctl scan output: ${e.message}`));
      }
    });
  });
}
