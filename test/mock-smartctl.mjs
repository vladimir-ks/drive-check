#!/usr/bin/env node

/**
 * Mock smartctl binary for testing.
 * Prepend this directory to PATH to intercept smartctl calls.
 *
 * Routes:
 *   --scan -j          → scan-multi.json
 *   -j -a /dev/sdb     → smart-3tb-wd-healthy.json
 *   -j -a /dev/sde     → smart-3tb-wd-failing.json
 *   --version          → version string (for detect.js)
 *   other              → exit 1
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixturesDir = join(__dirname, 'fixtures');

const args = process.argv.slice(2).join(' ');

if (args.includes('--scan')) {
  process.stdout.write(readFileSync(join(fixturesDir, 'scan-multi.json'), 'utf8'));
  process.exit(0);
}

if (args.includes('--version')) {
  process.stdout.write('smartctl 7.4 2024-10-15 r5620 [x86_64-linux-mock]\n');
  process.exit(0);
}

if (args.includes('-a')) {
  if (args.includes('/dev/sdb')) {
    process.stdout.write(readFileSync(join(fixturesDir, 'smart-3tb-wd-healthy.json'), 'utf8'));
    process.exit(0);
  }
  if (args.includes('/dev/sde')) {
    process.stdout.write(readFileSync(join(fixturesDir, 'smart-3tb-wd-failing.json'), 'utf8'));
    process.exit(0);
  }
}

process.stderr.write(`mock-smartctl: unknown args: ${args}\n`);
process.exit(1);
