/**
 * Scan for connected drives using smartctl.
 * Enriches drive list with model/size for better UX.
 */

import { execFile } from 'node:child_process';

export function scanDrives(smartctlPath) {
  return new Promise((resolve, reject) => {
    execFile(smartctlPath, ['--scan', '-j'], { timeout: 15000 }, (err, stdout, stderr) => {
      // Permission denied detection
      if (err && !stdout) {
        const msg = (err.message + ' ' + (stderr ?? '')).toLowerCase();
        if (msg.includes('permission') || msg.includes('eacces') || msg.includes('operation not permitted')) {
          reject(new Error('PERMISSION_DENIED'));
          return;
        }
        reject(new Error(`smartctl scan failed: ${err.message}`));
        return;
      }
      try {
        const data = JSON.parse(stdout);
        const drives = (data.devices ?? []).map(d => ({
          path: d.name,
          type: d.type,
          protocol: d.protocol,
          model: null,
          size: null,
        }));
        resolve(drives);
      } catch (e) {
        reject(new Error(`Failed to parse smartctl scan output: ${e.message}`));
      }
    });
  });
}

/**
 * Enrich a single drive entry with model + size via quick smartctl -i query.
 * Best-effort — returns original drive entry on any failure.
 */
export function enrichDrive(smartctlPath, drive) {
  return new Promise(resolve => {
    execFile(smartctlPath, ['-j', '-i', drive.path], { timeout: 10000, maxBuffer: 512 * 1024 }, (err, stdout) => {
      if (!stdout) { resolve(drive); return; }
      try {
        const info = JSON.parse(stdout);
        drive.model = info.model_name ?? info.model_family ?? null;
        const bytes = info.user_capacity?.bytes;
        if (bytes) {
          const tb = bytes / 1e12;
          drive.size = tb >= 1 ? `${tb.toFixed(1)} TB` : `${(bytes / 1e9).toFixed(0)} GB`;
        }
      } catch { /* ignore parse errors */ }
      resolve(drive);
    });
  });
}
