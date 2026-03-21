/**
 * CLI prompts using Node.js built-in readline. Zero dependencies.
 */

import { createInterface } from 'node:readline';

let rl = null;

function getRL() {
  if (!rl) {
    rl = createInterface({ input: process.stdin, output: process.stdout });
  }
  return rl;
}

export function closeRL() {
  if (rl) { rl.close(); rl = null; }
}

export function confirm(question) {
  return new Promise(resolve => {
    getRL().question(`${question} [Y/n] `, answer => {
      resolve(answer.trim().toLowerCase() !== 'n');
    });
  });
}

export function selectDrive(drives) {
  return new Promise((resolve, reject) => {
    if (drives.length === 1) {
      resolve(0);
      return;
    }
    getRL().question(`\nSelect drive (1-${drives.length}): `, answer => {
      const idx = parseInt(answer.trim(), 10) - 1;
      if (isNaN(idx) || idx < 0 || idx >= drives.length) {
        reject(new Error(`Invalid selection: ${answer}`));
        return;
      }
      resolve(idx);
    });
  });
}

export function waitForEnter(message) {
  return new Promise(resolve => {
    getRL().question(`${message}\nPress Enter to continue...`, () => resolve());
  });
}
