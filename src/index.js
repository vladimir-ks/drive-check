/**
 * Main orchestrator — ties all modules together.
 * Supports multi-drive selection via interactive TUI.
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
import { generateReport, generateMultiReport } from './report/generate.js';
import { signReport } from './report/sign.js';
import { formatReport } from './report/format.js';
import { sendToNtfy } from './delivery/ntfy.js';
import { saveLocalReport } from './delivery/fallback.js';
import { banner, transparencyPledge, color, spinner } from './cli/display.js';
import { confirm as legacyConfirm, closeRL } from './cli/prompts.js';
import { logCommand, logAction } from './security/audit-log.js';
import { multiSelect, select, confirm as tuiConfirm } from './tui.js';

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

// Use TUI confirm when TTY is available, fall back to legacy readline
const confirmFn = process.stdin.isTTY ? tuiConfirm : legacyConfirm;

export async function run(token) {
  try {
    // 1. Validate token
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
      const proceed = await confirmFn('Continue?');
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

    // 4. Scan drives
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
    enrichSp.stop(color.green(`+ Found ${drives.length} drive(s)`));

    // 6. Select drives (multi-select for >1, auto-select for 1)
    let selectedDrives;
    if (drives.length === 1) {
      selectedDrives = [drives[0]];
      console.log(color.dim(`  Drive: ${drives[0].path} — ${drives[0].model || 'Unknown'}`));
    } else {
      const choices = drives.map(d => ({
        label: `${d.path} — ${d.model || 'Unknown'} (${d.size || '?'})`,
        value: d,
      }));
      selectedDrives = await multiSelect('Which drives are you selling?', choices, { preselectAll: false });
      if (selectedDrives.length === 0) {
        console.log('\n  No drives selected. Exiting.');
        closeRL();
        return;
      }
    }

    // 7. Collect SMART data for all selected drives
    const results = [];
    for (const drive of selectedDrives) {
      const sp = spinner(`Checking ${drive.model || drive.path}...`);
      logCommand(smartctl.path, ['-j', '-a', drive.path]);
      try {
        const rawSmart = await collectSmart(smartctl.path, drive.path);
        sp.stop(color.green(`+ ${drive.model || drive.path}`));
        const parsed = parseSmartctl(rawSmart);
        results.push({ drive, rawSmart, parsed });
      } catch (err) {
        sp.stop(color.red(`x ${drive.model || drive.path} — failed`));
        if (err.message === 'PERMISSION_DENIED') {
          console.log(SUDO_MSG);
          closeRL();
          process.exitCode = 1;
          return;
        }
        console.log(color.yellow(`  Skipped: ${err.message}`));
      }
    }

    if (results.length === 0) {
      console.log(color.red('\nAll drive checks failed.'));
      closeRL();
      process.exitCode = 1;
      return;
    }

    // 8. Generate report
    let report, signature;
    const effectiveToken = token ?? 'self-test';

    if (results.length === 1) {
      // Single drive → v1.1 (backward compat)
      report = generateReport(results[0].parsed, effectiveToken, pkg.version, results[0].rawSmart);
      signature = signReport(report, effectiveToken, pkg.version);
      console.log(formatReport(report));
    } else {
      // Multiple drives → v1.2
      report = generateMultiReport(
        results.map(r => r.parsed),
        effectiveToken,
        pkg.version,
        results.map(r => r.rawSmart),
      );
      signature = signReport(report, effectiveToken, pkg.version);
      console.log(formatMultiSummary(report));
    }

    // 9. Self-test mode: show and exit
    if (selfTestMode) {
      console.log(color.dim('  (Self-test mode — no data sent)'));
      const localPath = saveLocalReport(report, signature, 'self-test');
      console.log(color.dim(`  Report saved: ${localPath}\n`));
      closeRL();
      return;
    }

    // 10. Send (default yes)
    const shouldSend = await confirmFn('Send report to buyer?');

    // 11. Save local copy always
    const localPath = saveLocalReport(report, signature, token);
    logAction(`Saved local copy: ${localPath}`);

    if (shouldSend) {
      const sendSp = spinner('Sending report...');
      try {
        await sendToNtfy(token, report, signature);
        sendSp.stop(color.green('+ Report sent'));
      } catch (err) {
        sendSp.stop(color.yellow('! Could not reach ntfy.sh'));
        console.log(color.yellow(`  Error: ${err.message}`));
        console.log(`\n  Report saved locally: ${color.bold(localPath)}`);
      }
    } else {
      console.log(`\n  Report saved locally: ${color.bold(localPath)}`);
    }

    // 12. Optional questionnaire (post-send, low friction)
    if (process.stdin.isTTY) {
      const wantQ = await confirmFn('Answer 5 quick questions about the drive?', false);
      if (wantQ) {
        const answers = await runQuestionnaire();
        if (answers) {
          report.seller_responses = answers;
          saveLocalReport(report, signature, token);
          // Re-send with answers (best-effort)
          if (shouldSend) {
            try { await sendToNtfy(token, report, signature); } catch { /* silent */ }
          }
        }
      }
    }

    console.log(color.dim('\nDone!'));
  } catch (err) {
    console.error(color.red(`\nError: ${err.message}`));
    process.exitCode = 1;
  } finally {
    closeRL();
  }
}

// ============================================================================
// Multi-drive summary table
// ============================================================================
function formatMultiSummary(report) {
  let out = `\n${color.bold('=== DRIVE CHECK RESULTS ===')}\n\n`;
  out += '  # | Model                  | Serial           |   Hours | Temp | Verdict\n';
  out += '  ' + '-'.repeat(78) + '\n';

  for (const [i, d] of report.drives.entries()) {
    const model = (d.drive?.model || '?').padEnd(22).slice(0, 22);
    const serial = (d.drive?.serial || '?').padEnd(16).slice(0, 16);
    const hours = String(d.health?.power_on_hours || 0).padStart(7);
    const temp = String(d.health?.temperature_c || '?').padStart(4);
    const v = d.verdict?.overall;
    const vc = v === 'HEALTHY' ? color.green(v) : v === 'WARNING' ? color.yellow(v) : color.red(v);
    out += `  ${i + 1} | ${model} | ${serial} | ${hours} | ${temp} | ${vc}\n`;

    // Show reasons if not healthy
    if (d.verdict?.reasons?.length > 0) {
      for (const r of d.verdict.reasons) {
        const icon = r.level === 'FAIL' ? color.red('x') : color.yellow('!');
        out += `    ${icon} ${r.msg}\n`;
      }
    }
  }

  out += `\n${color.bold('=== END OF RESULTS ===')}\n`;
  return out;
}

// ============================================================================
// Questionnaire — uses TUI select for each question
// ============================================================================
async function runQuestionnaire() {
  const answers = {};
  for (const item of QUESTIONNAIRE) {
    const choices = item.options.map(opt => ({ label: opt, value: opt }));
    answers[item.q] = await select(item.q, choices);
  }
  console.log(color.dim('\n  Thank you!'));
  return answers;
}
