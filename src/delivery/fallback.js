/**
 * Fallback delivery — save report as local JSON file.
 */

import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

export function saveLocalReport(report, signature, token) {
  const filename = `drive-report-${token}.json`;
  const filepath = join(process.cwd(), filename);
  const payload = JSON.stringify({ ...report, signature }, null, 2);
  writeFileSync(filepath, payload, 'utf8');
  return filepath;
}
