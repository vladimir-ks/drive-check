/**
 * Fallback delivery — save report as local JSON file.
 * Uses timestamp-based filename (doesn't leak ntfy topic).
 * Falls back to temp dir if cwd is not writable.
 */

import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

export function saveLocalReport(report, signature, token) {
  const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const filename = `drive-report-${ts}.json`;
  const payload = JSON.stringify({ ...report, signature }, null, 2);

  // Try cwd first, fallback to temp dir
  for (const dir of [process.cwd(), tmpdir()]) {
    try {
      const filepath = join(dir, filename);
      writeFileSync(filepath, payload, 'utf8');
      return filepath;
    } catch { /* try next */ }
  }

  // Last resort: return null, caller handles
  return null;
}
