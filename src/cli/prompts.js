/**
 * CLI prompts using Node.js built-in readline. Zero dependencies.
 * Handles non-TTY (piped) input gracefully.
 */

import { createInterface } from 'node:readline';

let rl = null;

function getRL() {
  if (!rl) {
    rl = createInterface({ input: process.stdin, output: process.stdout });
    rl.on('close', () => { rl = null; });
  }
  return rl;
}

export function closeRL() {
  if (rl) {
    try { rl.close(); } catch { /* already closed */ }
    rl = null;
  }
}

export function confirm(question) {
  if (!process.stdin.isTTY) return Promise.resolve(true);
  return new Promise(resolve => {
    getRL().question(`${question} [Y/n] `, answer => {
      resolve(answer.trim().toLowerCase() !== 'n');
    });
  });
}

export function selectDrive(drives) {
  if (drives.length === 1) return Promise.resolve(0);
  if (!process.stdin.isTTY) return Promise.resolve(0);

  return new Promise((resolve, reject) => {
    const ask = () => {
      getRL().question(`\nSelect drive (1-${drives.length}): `, answer => {
        const idx = parseInt(answer.trim(), 10) - 1;
        if (isNaN(idx) || idx < 0 || idx >= drives.length) {
          console.log(`  Invalid choice. Enter a number between 1 and ${drives.length}.`);
          ask(); // retry
          return;
        }
        resolve(idx);
      });
    };
    ask();
  });
}
