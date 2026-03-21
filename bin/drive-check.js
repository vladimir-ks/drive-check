#!/usr/bin/env node

/**
 * drive-check CLI entry point.
 * Usage: npx drive-check <TOKEN>
 */

import { run } from '../src/index.js';

const token = process.argv[2];

if (!token || token === '--help' || token === '-h') {
  console.log(`
  drive-check — Independent HDD/SSD health verification

  Usage:
    npx drive-check <TOKEN>

  The buyer provides the TOKEN. It looks like: dc-a8f3b2c9d1e4

  Options:
    --help, -h    Show this help

  More info: https://github.com/vladimir-ks/drive-check
`);
  process.exit(token ? 0 : 1);
}

run(token);
