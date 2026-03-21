/**
 * Main orchestrator — ties all modules together.
 * This is the full CLI flow from start to finish.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { validateToken } from './token/decode.js';
import { detectSmartctl } from './smart/detect.js';
import { getInstallGuide } from './smart/install-guide.js';
import { scanDrives, enrichDrive } from './smart/scan.js';
import { collectSmart } from './smart/collect.js';
import { parseSmartctl } from './smart/parse.js';
import { generateReport } from './report/generate.js';
import { signReport } from './report/sign.js';
import { formatReport } from './report/format.js';
import { sendToNtfy } from './delivery/ntfy.js';
import { saveLocalReport } from './delivery/fallback.js';
import { banner, transparencyPledge, driveList, color, spinner } from './cli/display.js';
import { confirm, selectDrive, closeRL } from './cli/prompts.js';
import { logCommand, logAction } from './security/audit-log.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(readFileSync(join(__dirname, '..', 'package.json'), 'utf8'));

const SUDO_MSG = `
  ${color.yellow('Permission denied.')} SMART access requires elevated privileges.

  ${color.bold('Try:')}
    Linux/macOS:  sudo npx drive-check <TOKEN>
    Windows:      Run terminal as Administrator
`;

const QUESTIONNAIRE = [
  { q: 'What kind of system was this drive in?', options: ['Desktop PC', 'NAS/Server (always on)', 'Laptop', 'External/USB enclosure', 'Other'] },
  { q: 'How was the system typically used?', options: ['On 24/7', 'On during day, off at night', 'Occasional use (few hours/week)', 'Mostly stored, rarely used'] },
  { q: 'Where was the system kept?', options: ['Climate-controlled room/office', 'Bedroom/living room', 'Garage/basement/attic', 'Server room/rack', 'Not sure'] },
  { q: 'Was the system ever moved while running?', options: ['Never moved', 'Moved occasionally (same room)', 'Relocated between locations', 'Portable/carried regularly'] },
  { q: 'Why are you selling this drive?', options: ['Upgraded to larger/newer', 'System no longer needed', 'Clearing out unused equipment', 'Had some issues with it', 'Other'] },
];

export async function run(token) {
  try {
    // 1. Validate token (or allow no-token mode for self-test)
    const selfTestMode = !token || token === '--self-test';
    let tokenResult;
    if (!selfTestMode) {
      tokenResult = validateToken(token);
      if (!tokenResult.valid) {
        console.error(color.red(tokenResult.error));
        process.exitCode = 1;
        return;
      }
    }

    // 2. Banner + transparency
    console.log(banner(pkg.version));
    if (!selfTestMode) {
      console.log(transparencyPledge());
      const proceed = await confirm('Continue?');
      if (!proceed) {
        console.log('\nExited. No data was collected or sent.');
        closeRL();
        return;
      }
    }

    // 3. Detect smartctl
    logAction('Checking for smartctl...');
    const smartctl = detectSmartctl();
    if (!smartctl.found) {
      console.log(color.yellow('\nsmartmontools is required but not found.'));
      console.log(getInstallGuide());
      closeRL();
      process.exitCode = 1;
      return;
    }
    console.log(color.dim(`  Using: ${smartctl.path}`));

    // 4. Scan drives (with permission detection)
    logCommand(smartctl.path, ['--scan', '-j']);
    let drives;
    try {
      drives = await scanDrives(smartctl.path);
    } catch (err) {
      if (err.message === 'PERMISSION_DENIED') {
        console.log(SUDO_MSG);
        closeRL();
        process.exitCode = 1;
        return;
      }
      throw err;
    }

    if (drives.length === 0) {
      console.log(color.yellow('\nNo drives detected.'));
      console.log('  Possible causes:');
      console.log('  - Need root/admin access (try: sudo npx drive-check ...)');
      console.log('  - USB enclosure blocking SMART (try direct SATA connection)');
      console.log('  - Drive not recognized by system');
      closeRL();
      process.exitCode = 1;
      return;
    }

    // 5. Enrich drive list with model/size
    const enrichSp = spinner('Identifying drives...');
    await Promise.all(drives.map(d => enrichDrive(smartctl.path, d)));
    enrichSp.stop(color.green('+ Drives identified'));

    // 6. Select drive
    console.log(driveList(drives));
    const driveIdx = await selectDrive(drives);
    const selectedDrive = drives[driveIdx];
    console.log(color.dim(`  Selected: ${selectedDrive.path}${selectedDrive.model ? ' (' + selectedDrive.model + ')' : ''}`));

    // 7. Collect SMART data
    const sp = spinner('Reading drive health data...');
    logCommand(smartctl.path, ['-j', '-a', selectedDrive.path]);
    let rawSmart;
    try {
      rawSmart = await collectSmart(smartctl.path, selectedDrive.path);
    } catch (err) {
      sp.stop(color.red('x Failed'));
      if (err.message === 'PERMISSION_DENIED') {
        console.log(SUDO_MSG);
        closeRL();
        process.exitCode = 1;
        return;
      }
      throw err;
    }
    sp.stop(color.green('+ SMART data collected'));

    // 8. Parse + generate report
    const parsed = parseSmartctl(rawSmart);
    const report = generateReport(parsed, token ?? 'self-test', pkg.version, rawSmart);
    const signature = signReport(report, token ?? 'self-test', pkg.version);

    // 9. Show report to seller
    console.log(formatReport(report));

    // Self-test mode: show report and exit
    if (selfTestMode) {
      console.log(color.dim('  (Self-test mode — no data sent)'));
      const localPath = saveLocalReport(report, signature, 'self-test');
      console.log(color.dim(`  Report saved: ${localPath}\n`));
      closeRL();
      return;
    }

    // 10. Seller questionnaire
    const answers = await runQuestionnaire();
    if (answers) {
      report.seller_responses = answers;
    }

    // 11. Ask to send
    const shouldSend = await confirm('Send this report to buyer?');

    // 12. Save local copy always
    const localPath = saveLocalReport(report, signature, token);
    logAction(`Saved local copy: ${localPath}`);

    if (shouldSend) {
      const sendSp = spinner('Sending report...');
      try {
        await sendToNtfy(token, report, signature);
        sendSp.stop(color.green('+ Report delivered successfully'));
      } catch (err) {
        sendSp.stop(color.yellow('! Could not reach ntfy.sh'));
        console.log(color.yellow(`  Error: ${err.message}`));
        console.log(`\n  The report was saved locally: ${color.bold(localPath)}`);
        console.log('  You can send the file contents to the buyer manually.\n');
      }
    } else {
      console.log(`\n  Report saved locally: ${color.bold(localPath)}`);
      console.log('  No data was sent to the buyer.\n');
    }

    console.log(color.dim('Thank you!'));
  } catch (err) {
    console.error(color.red(`\nError: ${err.message}`));
    process.exitCode = 1;
  } finally {
    closeRL();
  }
}

async function runQuestionnaire() {
  if (!process.stdin.isTTY) return null;

  console.log(`\n${color.bold('A few quick questions about the drive\'s history:')}`);
  console.log(color.dim('  (This helps the buyer assess the drive. Optional but appreciated.)\n'));

  const wantQ = await confirm('Answer 5 quick questions about the drive?');
  if (!wantQ) return null;

  const { createInterface } = await import('node:readline');
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const ask = (q) => new Promise(r => rl.question(q, r));

  const answers = {};
  for (const item of QUESTIONNAIRE) {
    console.log(`\n  ${color.bold(item.q)}`);
    item.options.forEach((opt, i) => {
      console.log(`    ${color.cyan(String(i + 1))}. ${opt}`);
    });
    const raw = await ask('  Your answer (number or text): ');
    const idx = parseInt(raw.trim(), 10) - 1;
    answers[item.q] = (idx >= 0 && idx < item.options.length) ? item.options[idx] : raw.trim();
  }

  rl.close();
  console.log(color.dim('\n  Thank you for the answers!'));
  return answers;
}
