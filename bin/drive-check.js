#!/usr/bin/env node

/**
 * drive-check CLI entry point.
 * Usage: npx drive-check <TOKEN>
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(readFileSync(join(__dirname, '..', 'package.json'), 'utf8'));

const token = process.argv[2];

if (!token || token === '--help' || token === '-h') {
  console.log(`
  drive-check v${pkg.version} — Independent HDD/SSD health verification

  Usage:
    npx drive-check <TOKEN>

  The buyer provides the TOKEN. It looks like: dc-a8f3b2c9d1e4

  Options:
    --help, -h       Show this help
    --version, -v    Show version

  More info: https://github.com/vladimir-ks/drive-check
`);
  process.exit(token ? 0 : 1);
}

if (token === '--version' || token === '-v') {
  console.log(`drive-check v${pkg.version}`);
  process.exit(0);
}

import { run } from '../src/index.js';

run(token).catch(err => {
  console.error(`\nFatal: ${err.message}`);
  process.exit(1);
});
