/**
 * Collect SMART data from a specific drive.
 * Uses smartctl -j -a (JSON output, all attributes).
 */

import { execFile } from 'node:child_process';

export function collectSmart(smartctlPath, devicePath) {
  return new Promise((resolve, reject) => {
    const args = ['-j', '-a', devicePath];

    execFile(smartctlPath, args, { timeout: 60000, maxBuffer: 5 * 1024 * 1024 }, (err, stdout, stderr) => {
      // smartctl returns non-zero for various warnings, but still outputs valid JSON
      if (!stdout) {
        const msg = (err?.message ?? '') + ' ' + (stderr ?? '');
        if (msg.toLowerCase().includes('permission') || msg.toLowerCase().includes('eacces')) {
          reject(new Error('PERMISSION_DENIED'));
          return;
        }
        reject(new Error(`smartctl returned no output for ${devicePath}: ${err?.message ?? 'unknown error'}`));
        return;
      }
      try {
        const data = JSON.parse(stdout);
        resolve(data);
      } catch (e) {
        reject(new Error(`Failed to parse smartctl output for ${devicePath}: ${e.message}`));
      }
    });
  });
}
