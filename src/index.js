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
import { scanDrives } from './smart/scan.js';
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

export async function run(token) {
  try {
    // 1. Validate token
    const tokenResult = validateToken(token);
    if (!tokenResult.valid) {
      console.error(color.red(tokenResult.error));
      process.exitCode = 1;
      return;
    }

    // 2. Banner + transparency
    console.log(banner(pkg.version));
    console.log(transparencyPledge());

    const proceed = await confirm('Continue?');
    if (!proceed) {
      console.log('\nExited. No data was collected or sent.');
      closeRL();
      return;
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

    // 4. Scan drives
    logCommand(smartctl.path, ['--scan', '-j']);
    const drives = await scanDrives(smartctl.path);
    if (drives.length === 0) {
      console.log(color.yellow('\nNo drives detected.'));
      console.log('  If using a USB adapter, some enclosures block SMART data.');
      console.log('  Try connecting the drive directly via SATA.');
      closeRL();
      process.exitCode = 1;
      return;
    }

    // 5. Select drive
    console.log(driveList(drives));
    const driveIdx = await selectDrive(drives);
    const selectedDrive = drives[driveIdx];
    console.log(color.dim(`  Selected: ${selectedDrive.path}`));

    // 6. Collect SMART data
    const sp = spinner('Reading drive health data...');
    logCommand(smartctl.path, ['-j', '-a', selectedDrive.path]);
    const rawSmart = await collectSmart(smartctl.path, selectedDrive.path);
    sp.stop(color.green('✓ SMART data collected'));

    // 7. Parse + generate report
    const parsed = parseSmartctl(rawSmart);
    const report = generateReport(parsed, token, pkg.version);
    const signature = signReport(report, token, pkg.version);

    // 8. Show report to seller (mandatory preview)
    console.log(formatReport(report));

    // 9. Ask to send
    const shouldSend = await confirm('Send this report to buyer?');

    // 10. Save local copy always
    const localPath = saveLocalReport(report, signature, token);
    logAction(`Saved local copy: ${localPath}`);

    if (shouldSend) {
      // 11. Send via ntfy.sh
      const sendSp = spinner('Sending report...');
      try {
        await sendToNtfy(token, report, signature);
        sendSp.stop(color.green('✓ Report delivered successfully'));
      } catch (err) {
        sendSp.stop(color.yellow('✗ Could not reach ntfy.sh'));
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
