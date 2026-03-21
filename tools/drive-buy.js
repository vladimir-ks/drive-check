#!/usr/bin/env node

/**
 * drive-buy — Buyer-side CLI for used drive purchasing workflow.
 *
 * Data lives in ~/.drive-buy/ (survives repo re-clones).
 *
 * Commands:
 *   drive-buy init                            Create config with defaults
 *   drive-buy config                          Show current config
 *   drive-buy config set <path> <value>       Update config value
 *   drive-buy send <url> [name] [--es]        Generate seller message
 *   drive-buy inbox [--quiet]                 Poll ntfy.sh for reports
 *   drive-buy list                            Show tracked sellers
 *   drive-buy compare                         Compare received reports
 *   drive-buy offer <n>                       Generate offer for drive #n
 *   drive-buy best [--all]                    Rank drives (default: matching only)
 *   drive-buy campaign start "name" [--count] Start search campaign
 *   drive-buy campaign status                 Show campaign progress
 *   drive-buy campaign close                  Archive campaign
 *   drive-buy poll start                      Enable cron polling
 *   drive-buy poll stop                       Disable cron polling
 *   drive-buy poll status                     Show polling state
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync, copyFileSync, readdirSync, unlinkSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync, execSync } from 'node:child_process';
import { homedir } from 'node:os';
import { computeLifeScore, checkRequirements, DEFAULT_CONFIG, isTokenExpired, setNestedValue, getNestedValue } from './lib/scoring.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ============================================================================
// DATA PATHS — ~/.drive-buy/ (survives repo re-clones)
// ============================================================================
const DATA_DIR = join(homedir(), '.drive-buy');
const CONFIG_PATH = join(DATA_DIR, 'config.json');
const LEDGER_PATH = join(DATA_DIR, 'ledger.json');
const REPORTS_DIR = join(DATA_DIR, 'reports');
const CAMPAIGNS_DIR = join(DATA_DIR, 'campaigns');
const ARCHIVE_DIR = join(CAMPAIGNS_DIR, 'archive');

// Legacy paths (pre-migration)
const LEGACY_LEDGER = join(__dirname, '..', '.drive-checks.json');
const LEGACY_REPORTS = join(__dirname, '..', '.drive-reports');

// DEFAULT_CONFIG, computeLifeScore, checkRequirements, isTokenExpired,
// setNestedValue, getNestedValue imported from ./lib/scoring.js

// ============================================================================
// CLI PARSING
// ============================================================================
const cmd = process.argv[2];
const args = process.argv.slice(3);

const HELP = `
  drive-buy — Used drive purchasing workflow

  Commands:
    init                            Initialize ~/.drive-buy/ with default config
    config                          Show current configuration
    config set <path> <value>       Set config value (e.g. pricing.new_reference_price_eur 70)
    send <url> [name] [--es]        Send seller message (generates token, copies to clipboard)
    inbox [--quiet]                 Check for received reports from sellers
    list                            Show all tracked sellers and their status
    compare                         Compare all received drive reports
    offer <n>                       Generate offer for drive #n (from compare list)
    best [--all]                    Rank drives by remaining life (--all = include non-matching)
    campaign start "name" [--count N]  Start a search campaign
    campaign status                 Show campaign progress
    campaign close                  Archive active campaign
    poll start                      Enable cron-based polling
    poll stop                       Disable cron-based polling
    poll status                     Show polling state

  Data: ~/.drive-buy/
`;

// ============================================================================
// MAIN — interactive menu when no subcommand given
// ============================================================================
async function main() {
  // Subcommand mode (for scripting / power users)
  if (cmd) {
    switch (cmd) {
      case 'init': return cmdInit();
      case 'config': return args[0] === 'set' ? cmdConfigSet() : cmdConfig();
      case 'send': return cmdSend();
      case 'inbox': return cmdInbox();
      case 'list': return cmdList();
      case 'compare': return cmdCompare();
      case 'offer': return cmdOffer();
      case 'best': return cmdBest();
      case 'pick': return cmdPick();
      case 'campaign': {
        const sub = args[0];
        if (sub === 'start') return cmdCampaignStart();
        if (sub === 'status') return cmdCampaignStatus();
        if (sub === 'close') return cmdCampaignClose();
        console.log('\n  Usage: drive-buy campaign <start|status|close>\n');
        return;
      }
      case 'poll': {
        const sub = args[0];
        if (sub === 'start') return cmdPollStart();
        if (sub === 'stop') return cmdPollStop();
        if (sub === 'status') return cmdPollStatus();
        console.log('\n  Usage: drive-buy poll <start|stop|status>\n');
        return;
      }
      case '--help': case '-h':
        console.log(HELP);
        return;
      default:
        console.log(`\n  Unknown command: ${cmd}`);
        console.log(HELP);
        return;
    }
  }

  // Interactive menu mode (no subcommand)
  return cmdMenu();
}

// ============================================================================
// INTERACTIVE MENU — arrow keys + enter, no flags
// ============================================================================
async function cmdMenu() {
  const tui = await loadTui();
  if (!tui) { console.log(HELP); return; }

  // Auto-init if no config
  if (!existsSync(CONFIG_PATH)) {
    saveConfig(DEFAULT_CONFIG);
    console.log('  Initialized ~/.drive-buy/ with default config.\n');
  }

  const campaign = loadActiveCampaign();
  const ledger = loadLedger();
  const pending = ledger.filter(e => e.status === 'pending').length;
  const received = ledger.filter(e => e.status === 'received').length;

  // Status bar
  if (campaign) console.log(`  Campaign: "${campaign.name}" (${campaign.tokens.length}/${campaign.target_count || '\u221E'})`);
  if (pending > 0) console.log(`  ${pending} pending, ${received} received`);
  console.log('');

  const choice = await tui.select('drive-buy', [
    { label: 'Send check request to seller', value: 'send' },
    { label: `Check inbox${pending > 0 ? ` (${pending} pending)` : ''}`, value: 'inbox' },
    { label: 'View drive rankings', value: 'best' },
    { label: 'Compare all drives', value: 'compare' },
    { label: 'Pick drives to buy', value: 'pick' },
    { label: 'Make offer for a drive', value: 'offer' },
    { label: 'Campaign', value: 'campaign' },
    { label: 'Configuration', value: 'config' },
  ]);

  switch (choice) {
    case 'send': return cmdSendInteractive(tui);
    case 'inbox': return cmdInbox();
    case 'best': return cmdBest();
    case 'compare': return cmdCompare();
    case 'pick': return cmdPick();
    case 'offer': return cmdOfferInteractive(tui);
    case 'campaign': return cmdCampaignMenu(tui);
    case 'config': return cmdConfig();
  }
}

async function cmdSendInteractive(tui) {
  const url = await tui.input('Listing URL');
  if (!url) { console.log('\n  Cancelled.\n'); return; }

  const name = await tui.input('Seller name (optional)');

  // Auto-detect language from URL, fallback to system locale
  const lang = tui.detectLanguageFromUrl(url) || tui.detectLanguage();

  const ledgerBefore = loadLedger();
  const sendArgs = [join(__dirname, 'generate-message.js'), url];
  if (name) sendArgs.push(name);
  sendArgs.push(`--${lang}`, '--copy');

  execFileSync('node', sendArgs, { stdio: 'inherit' });

  // Link to campaign
  const ledgerAfter = loadLedger();
  if (ledgerAfter.length > ledgerBefore.length) {
    const newEntry = ledgerAfter[ledgerAfter.length - 1];
    const campaign = loadActiveCampaign();
    if (campaign && campaign.status === 'active') {
      campaign.tokens.push(newEntry.token);
      saveActiveCampaign(campaign);
      console.log(`  Linked to campaign: "${campaign.name}"\n`);
    }
  }
}

async function cmdOfferInteractive(tui) {
  const drives = getAllDrives();
  if (drives.length === 0) {
    console.log('\n  No reports received yet.\n');
    return;
  }

  const choices = drives.map((d, i) => ({
    label: `${d.driveReport.drive?.model || '?'} (${d.entry.seller || '?'}) — ${d.score.total}%`,
    value: i,
  }));

  const idx = await tui.select('Which drive to make an offer for?', choices);
  // Temporarily set args for cmdOffer
  args[0] = String(idx + 1);
  return cmdOffer();
}

async function cmdCampaignMenu(tui) {
  const campaign = loadActiveCampaign();
  const choices = campaign
    ? [
        { label: 'View status', value: 'status' },
        { label: 'Close campaign', value: 'close' },
      ]
    : [
        { label: 'Start new campaign', value: 'start' },
      ];

  const sub = await tui.select('Campaign', choices);
  if (sub === 'start') {
    const name = await tui.input('Campaign name');
    if (!name) return;
    const countStr = await tui.input('Target drive count (optional)');
    args.splice(0, args.length, 'start', name);
    if (countStr) args.push('--count', countStr);
    return cmdCampaignStart();
  }
  if (sub === 'status') return cmdCampaignStatus();
  if (sub === 'close') return cmdCampaignClose();
}

// ============================================================================
// PICK — multi-select drives to buy, generate offer with serial numbers
// ============================================================================
async function cmdPick() {
  const tui = await loadTui();
  if (!tui) { console.log('  Interactive mode required for pick.\n'); return; }

  const config = loadConfig();
  const drives = getAllDrives();

  if (drives.length === 0) {
    console.log('\n  No reports received yet. Run "drive-buy inbox" first.\n');
    return;
  }

  // Group by seller
  const sellers = {};
  for (const d of drives) {
    const key = d.entry.seller || d.entry.token;
    if (!sellers[key]) sellers[key] = [];
    sellers[key].push(d);
  }

  // Select seller (if multiple)
  let sellerDrives;
  const sellerNames = Object.keys(sellers);
  if (sellerNames.length === 1) {
    sellerDrives = sellers[sellerNames[0]];
  } else {
    const sellerChoice = await tui.select('Which seller?',
      sellerNames.map(s => ({ label: `${s} (${sellers[s].length} drives)`, value: s })));
    sellerDrives = sellers[sellerChoice];
  }

  // Multi-select drives from that seller
  const choices = sellerDrives.map(d => {
    const mark = d.meetsReq ? '\x1b[32m\u2713\x1b[0m' : '\x1b[31m\u2717\x1b[0m';
    return {
      label: `${mark} ${d.driveReport.drive?.model || '?'} (${d.driveReport.drive?.serial?.slice(-8) || '?'}) \u2014 ${d.score.total}% \u2014 ${d.driveReport.verdict?.overall || '?'}`,
      value: d,
    };
  });

  const selected = await tui.multiSelect('Pick drives to buy', choices, { preselectAll: false });
  if (selected.length === 0) {
    console.log('\n  No drives selected.\n');
    return;
  }

  // Generate offer with serial numbers
  const pricing = config.pricing || {};
  const NEW_PRICE = pricing.new_reference_price_eur || 70;
  const lifeMult = pricing.life_multiplier || 0.7;
  const negMargin = pricing.negotiation_margin || 0.15;
  const lang = sellerDrives[0]?.entry.language || config.defaults?.language || 'en';
  const name = sellerDrives[0]?.entry.seller || '';

  const driveLines = [];
  let totalOffer = 0;

  for (const d of selected) {
    const fairPrice = Math.max(5, Math.round(NEW_PRICE * (d.score.total / 100) * lifeMult));
    const offerPrice = Math.max(5, Math.round(fairPrice * (1 - negMargin)));
    totalOffer += offerPrice;
    driveLines.push(`  - ${d.driveReport.drive?.model || '?'} (serial: ${d.driveReport.drive?.serial || '?'}) \u2014 ${offerPrice}\u20AC`);
  }

  const messages = {
    en: `Hi${name ? ' ' + name : ''}! Based on the health reports, I'd like to buy these drives:\n\n${driveLines.join('\n')}\n\nTotal offer: ${totalOffer}\u20AC for ${selected.length} drive(s).\n\nHappy to discuss!`,
    es: `\u00A1Hola${name ? ' ' + name : ''}! Seg\u00FAn los informes, me interesan estos discos:\n\n${driveLines.join('\n')}\n\nOferta total: ${totalOffer}\u20AC por ${selected.length} disco(s).\n\n\u00A1Abierto a conversaci\u00F3n!`,
  };

  const msg = messages[lang] || messages.en;

  console.log('\n' + '='.repeat(60));
  console.log(msg);
  console.log('='.repeat(60));

  if (process.platform === 'darwin') {
    try {
      execFileSync('pbcopy', [], { input: msg });
      console.log('\n  Copied to clipboard.\n');
    } catch { /* best-effort */ }
  }
}

// ============================================================================
// HELPERS — get all received drives (handles v1.1 + v1.2 reports)
// ============================================================================
function getAllDrives() {
  const config = loadConfig();
  const ledger = loadLedger();
  const received = ledger.filter(e => e.status === 'received');
  const drives = [];

  for (const entry of received) {
    const report = loadReport(entry.token);
    if (!report) continue;

    if (report.version === '1.2' && report.drives) {
      // Multi-drive report: expand each drive
      for (let i = 0; i < report.drives.length; i++) {
        const dr = report.drives[i];
        const score = computeLifeScore(dr);
        const reqCheck = checkRequirements(dr, config);
        drives.push({ entry, driveIndex: i, driveReport: dr, score, meetsReq: reqCheck.meets, reqIssues: reqCheck.issues });
      }
    } else {
      // Single drive (v1.1): wrap in same shape
      const dr = { drive: report.drive, health: report.health, self_tests: report.self_tests, error_log_count: report.error_log_count, verdict: report.verdict };
      const score = computeLifeScore(report);
      const reqCheck = checkRequirements(report, config);
      drives.push({ entry, driveIndex: 0, driveReport: dr, score, meetsReq: reqCheck.meets, reqIssues: reqCheck.issues });
    }
  }

  return drives;
}

async function loadTui() {
  if (!process.stdin.isTTY) return null;
  try {
    return await import('../src/tui.js');
  } catch {
    return null;
  }
}

// ============================================================================
// INIT — create ~/.drive-buy/ with default config
// ============================================================================
function cmdInit() {
  if (existsSync(CONFIG_PATH)) {
    console.log('\n  Config already exists at ~/.drive-buy/config.json');
    console.log('  Use "drive-buy config" to view or "drive-buy config set" to modify.\n');
    return;
  }

  saveConfig(DEFAULT_CONFIG);
  console.log('\n  Initialized ~/.drive-buy/');
  console.log('  Created config.json with default settings.');
  console.log('\n  Edit requirements to match your search:');
  console.log('    drive-buy config set requirements.max_power_on_hours 40000');
  console.log('    drive-buy config set requirements.max_price_eur 35');
  console.log('\n  Start a campaign:');
  console.log('    drive-buy campaign start "3TB drives for ZFS pool" --count 8\n');
}

// ============================================================================
// CONFIG — show/set configuration
// ============================================================================
function cmdConfig() {
  const config = loadConfig();
  console.log('\n  ~/.drive-buy/config.json\n');
  console.log(JSON.stringify(config, null, 2));
  console.log('');
}

function cmdConfigSet() {
  // args = ['set', 'path.to.key', 'value']
  const keyPath = args[1];
  const value = args.slice(2).join(' ');

  if (!keyPath || !value) {
    console.log('\n  Usage: drive-buy config set <path> <value>');
    console.log('  Example: drive-buy config set pricing.new_reference_price_eur 70\n');
    return;
  }

  const config = loadConfig();
  if (setNestedValue(config, keyPath, value)) {
    saveConfig(config);
    console.log(`\n  Set ${keyPath} = ${JSON.stringify(getNestedValue(config, keyPath))}\n`);
  }
}

// ============================================================================
// SEND — wraps generate-message.js + duplicate detection + campaign linking
// ============================================================================
function cmdSend() {
  const positional = args.filter(a => !a.startsWith('--'));
  const url = positional[0];

  // Validate URL format
  if (url) {
    try {
      new URL(url);
    } catch {
      console.log('\n  Warning: URL appears malformed. Proceeding anyway.');
    }

    // Duplicate listing detection
    const ledger = loadLedger();
    const existing = ledger.find(e => e.listing_url === url);
    if (existing) {
      const status = existing.status.toUpperCase();
      console.log(`\n  Warning: This listing is already tracked (${status}, seller: ${existing.seller || '-'})`);
      console.log(`  Token: ${existing.token}`);
      console.log('  Proceeding with new token...');
    }
  }

  // Capture ledger length before
  const ledgerBefore = loadLedger();

  const sendArgs = [join(__dirname, 'generate-message.js'), ...args, '--copy'];
  execFileSync('node', sendArgs, { stdio: 'inherit' });

  // Link new token to active campaign
  const ledgerAfter = loadLedger();
  if (ledgerAfter.length > ledgerBefore.length) {
    const newEntry = ledgerAfter[ledgerAfter.length - 1];
    const campaign = loadActiveCampaign();
    if (campaign && campaign.status === 'active') {
      campaign.tokens.push(newEntry.token);
      saveActiveCampaign(campaign);
      const progress = campaign.target_count
        ? `${campaign.tokens.length}/${campaign.target_count}`
        : `${campaign.tokens.length}`;
      console.log(`  Linked to campaign: "${campaign.name}" (${progress})\n`);
    }
  }
}

// ============================================================================
// INBOX — poll ntfy.sh with retry, expiry skip, requirements check
// ============================================================================
async function cmdInbox() {
  const isQuiet = args.includes('--quiet');
  const config = loadConfig();
  const ledger = loadLedger();
  const pending = ledger.filter(e => e.status === 'pending');

  if (pending.length === 0) {
    if (!isQuiet) console.log('\n  No pending checks. Use "drive-buy send <url> <name>" first.\n');
    return;
  }

  // Skip expired tokens
  const now = Date.now();
  const active = [];
  let expiredCount = 0;

  for (const entry of pending) {
    if (isTokenExpired(entry)) {
      entry.status = 'expired';
      expiredCount++;
    } else {
      active.push(entry);
    }
  }

  if (expiredCount > 0) {
    if (!isQuiet) console.log(`\n  Skipped ${expiredCount} expired token(s).`);
  }

  if (active.length === 0) {
    saveLedger(ledger);
    if (!isQuiet) console.log('  No active pending checks remaining.\n');
    return;
  }

  if (!isQuiet) console.log(`\n  Checking ${active.length} pending topic(s)...\n`);

  let received = 0;
  for (const entry of active) {
    if (!isQuiet) process.stdout.write(`  ${entry.seller || entry.token.slice(0, 20)}... `);

    try {
      const reportData = await fetchReport(entry);

      if (reportData) {
        // Save full report
        const reportPath = join(REPORTS_DIR, `${entry.token}.json`);
        writeFileSync(reportPath, JSON.stringify(reportData, null, 2));

        // Handle multi-drive (v1.2) and single-drive (v1.1)
        entry.status = 'received';
        entry.received_at = new Date().toISOString();
        let entryMeetsReq = false;

        if (reportData.version === '1.2' && reportData.drives) {
          // Multi-drive report
          entry.multi_drive = true;
          entry.drive_count = reportData.drive_count;
          const verdicts = reportData.drives.map(d => d.verdict?.overall);
          entry.verdict = verdicts.join(', ');
          entry.drive_model = reportData.drives.map(d => d.drive?.model).join(', ');

          const allReqChecks = reportData.drives.map(d => checkRequirements(d, config));
          entryMeetsReq = allReqChecks.some(r => r.meets);
          entry.meets_requirements = entryMeetsReq;

          if (!isQuiet) {
            console.log(`RECEIVED \u2014 ${entry.drive_count} drives from ${entry.seller || 'seller'}:`);
            for (let di = 0; di < reportData.drives.length; di++) {
              const d = reportData.drives[di];
              const reqTag = allReqChecks[di].meets ? '\x1b[32mMATCH\x1b[0m' : '\x1b[33mFAIL\x1b[0m';
              console.log(`  ${d.drive?.model || '?'} \u2014 ${d.verdict?.overall} \u2014 ${reqTag}`);
            }
          }
          received += reportData.drive_count;
        } else {
          // Single-drive report
          const reqCheck = checkRequirements(reportData, config);
          entry.verdict = reportData.verdict?.overall ?? '?';
          entry.drive_model = reportData.drive?.model ?? '?';
          entry.drive_serial = reportData.drive?.serial ?? '?';
          entry.power_on_hours = reportData.health?.power_on_hours ?? 0;
          entryMeetsReq = reqCheck.meets;
          entry.meets_requirements = reqCheck.meets;
          if (!reqCheck.meets) entry.requirement_issues = reqCheck.issues;

          if (!isQuiet) {
            const reqTag = reqCheck.meets
              ? '\x1b[32mMEETS REQ\x1b[0m'
              : '\x1b[33mFAILS REQ\x1b[0m';
            console.log(`RECEIVED \u2014 ${entry.verdict} \u2014 ${entry.drive_model} \u2014 ${reqTag}`);
            if (!reqCheck.meets) {
              console.log(`           Issues: ${reqCheck.issues.join(', ')}`);
            }
          }
          received++;
        }

        // macOS notification (sanitize inputs to prevent shell injection)
        if (process.platform === 'darwin') {
          const ntfTitle = entryMeetsReq ? 'MATCH' : (entry.verdict || '?');
          const ntfBody = `${(entry.drive_model || '?')} from ${entry.seller || 'seller'}`;
          try {
            execFileSync('osascript', ['-e',
              `display notification "${ntfBody.replace(/["\\]/g, '')}" with title "drive-buy: ${ntfTitle.replace(/["\\]/g, '')}"`]);
          } catch { /* notification is best-effort */ }
        }

        // Custom notify command from config
        if (config.polling?.notify_command) {
          try {
            execFileSync('/bin/sh', ['-c', config.polling.notify_command], {
              env: {
                ...process.env,
                DRIVE_MODEL: entry.drive_model || '',
                SELLER: entry.seller || '',
                VERDICT: entry.verdict || '',
                MEETS_REQ: String(entryMeetsReq),
              },
              timeout: 10000,
            });
          } catch { /* custom notification is best-effort */ }
        }
      } else {
        if (!isQuiet) console.log('no report yet');
      }
    } catch (err) {
      if (!isQuiet) console.log(`error: ${err.message}`);
    }
  }

  saveLedger(ledger);

  if (!isQuiet) {
    console.log(`\n  ${received} new report(s) received.\n`);
    if (received > 0) {
      console.log('  Run "drive-buy compare" to see all reports side by side.');
      console.log('  Run "drive-buy best" to rank drives by remaining life.\n');
    }
  } else if (received > 0) {
    // Quiet mode: only output when new reports arrive
    console.log(`${received} new report(s)`);
  }
}

// ============================================================================
// LIST — show all tracked sellers (with campaign context)
// ============================================================================
function cmdList() {
  const ledger = loadLedger();
  if (ledger.length === 0) {
    console.log('\n  No sellers tracked yet. Use "drive-buy send <url> <name>" to start.\n');
    return;
  }

  // Campaign context
  const campaign = loadActiveCampaign();
  if (campaign) {
    const progress = campaign.target_count
      ? `${campaign.tokens.length}/${campaign.target_count}`
      : `${campaign.tokens.length}`;
    console.log(`\n  Campaign: "${campaign.name}" (${progress} sent)`);
  }

  console.log('\n  # | Status   | Seller         | Platform    | Verdict  | Req | Model                  | Link');
  console.log('  ' + '-'.repeat(120));

  ledger.forEach((e, i) => {
    const statusMap = {
      received: '\x1b[32mRECEIVED\x1b[0m',
      pending: '\x1b[33mPENDING \x1b[0m',
      expired: '\x1b[90mEXPIRED \x1b[0m',
    };
    const status = statusMap[e.status] || e.status.toUpperCase().padEnd(8);
    const seller = (e.seller || '-').padEnd(14).slice(0, 14);
    const platform = (e.platform || '-').padEnd(11).slice(0, 11);
    const verdict = (e.verdict || '-').padEnd(8).slice(0, 8);
    const req = e.status !== 'received' ? ' - '
      : e.meets_requirements === true ? '\x1b[32m Y \x1b[0m'
      : e.meets_requirements === false ? '\x1b[31m N \x1b[0m'
      : ' ? ';
    const model = (e.drive_model || '-').padEnd(22).slice(0, 22);
    const link = (e.listing_url || '-').slice(0, 50);
    console.log(`  ${String(i + 1).padStart(2)} | ${status} | ${seller} | ${platform} | ${verdict} | ${req} | ${model} | ${link}`);
  });
  console.log('');
}

// ============================================================================
// COMPARE — side-by-side report comparison (handles v1.1 + v1.2)
// ============================================================================
function cmdCompare() {
  const drives = getAllDrives();

  if (drives.length === 0) {
    console.log('\n  No reports received yet. Run "drive-buy inbox" to check.\n');
    return;
  }

  console.log('\n  === DRIVE COMPARISON ===\n');
  console.log('  ' + 'Req'.padStart(3) + ' ' + '#'.padStart(3) + ' | ' +
    'Model'.padEnd(22) + ' | ' +
    'Serial'.padEnd(16) + ' | ' +
    'Hours'.padStart(7) + ' | ' +
    'Temp'.padStart(4) + ' | ' +
    'Pend'.padStart(5) + ' | ' +
    'Uncor'.padStart(5) + ' | ' +
    'Realloc'.padStart(7) + ' | ' +
    'Cycles'.padStart(8) + ' | ' +
    'Verdict'.padEnd(8) + ' | ' +
    'Score'.padStart(5) + ' | ' +
    'Seller');
  console.log('  ' + '-'.repeat(135));

  drives.forEach((d, i) => {
    const h = d.driveReport.health || {};
    const reqMark = d.meetsReq ? '\x1b[32m Y \x1b[0m' : '\x1b[31m N \x1b[0m';

    console.log('  ' +
      reqMark + ' ' +
      String(i + 1).padStart(3) + ' | ' +
      (d.driveReport.drive?.model || '?').padEnd(22).slice(0, 22) + ' | ' +
      (d.driveReport.drive?.serial || '?').slice(-16).padEnd(16) + ' | ' +
      String(h.power_on_hours || 0).padStart(7) + ' | ' +
      String(h.temperature_c || '?').padStart(4) + ' | ' +
      String(h.pending_sectors || 0).padStart(5) + ' | ' +
      String(h.uncorrectable_sectors || 0).padStart(5) + ' | ' +
      String(h.reallocated_sectors || 0).padStart(7) + ' | ' +
      String(h.load_cycles || 0).padStart(8) + ' | ' +
      (d.driveReport.verdict?.overall || '?').padEnd(8) + ' | ' +
      (d.score.total + '%').padStart(5) + ' | ' +
      (d.entry.seller || '-'));
  });

  console.log('\n  Score = estimated remaining life percentage (100% = brand new)');
  console.log('  Req: Y = meets requirements, N = fails requirements\n');
}

// ============================================================================
// BEST — rank by remaining life, filtered by requirements (default)
// ============================================================================
function cmdBest() {
  const showAll = args.includes('--all');

  let drives = getAllDrives().sort((a, b) => b.score.total - a.score.total);

  if (drives.length === 0) {
    console.log('\n  No reports received yet. Run "drive-buy inbox" to check.\n');
    return;
  }

  // Filter by requirements unless --all
  if (!showAll) {
    const total = drives.length;
    const filtered = drives.filter(d => d.meetsReq);
    if (filtered.length < total) {
      console.log(`\n  (${total - filtered.length} drive(s) hidden \u2014 don't meet requirements. Use --all to show)\n`);
    }
    drives = filtered;
  }

  if (drives.length === 0) {
    console.log('\n  No drives match requirements. Use "drive-buy best --all" to see all.\n');
    return;
  }

  console.log('\n  === DRIVE RANKING (best first) ===\n');

  drives.forEach((item, rank) => {
    const { entry, driveReport, score, meetsReq, reqIssues } = item;
    const h = driveReport.health || {};
    const verdict = driveReport.verdict?.overall;

    const verdictColor = verdict === 'HEALTHY' ? '\x1b[32m' : verdict === 'WARNING' ? '\x1b[33m' : '\x1b[31m';
    const reqTag = meetsReq ? '\x1b[32m[MATCH]\x1b[0m' : '\x1b[31m[FAIL]\x1b[0m';

    console.log(`  ${rank + 1}. ${driveReport.drive?.model} (${entry.seller || 'unnamed'}) ${reqTag}`);
    console.log(`     ${verdictColor}${verdict}\x1b[0m | Score: ${score.total}% | Est. remaining: ${score.years_remaining} years`);
    console.log(`     Hours: ${fmtNum(h.power_on_hours)} | Cycles: ${fmtNum(h.load_cycles || 0)} | Pending: ${h.pending_sectors || 0} | Temp: ${h.temperature_c}C`);
    console.log(`     ${score.breakdown}`);
    if (!meetsReq && reqIssues?.length) {
      console.log(`     \x1b[31mRequirement issues: ${reqIssues.join(', ')}\x1b[0m`);
    }
    if (entry.listing_url) console.log(`     Link: ${entry.listing_url}`);
    console.log('');
  });

  const matching = drives.filter(d => d.meetsReq);
  if (matching.length > 0 && matching[0].score.total > 30) {
    console.log(`  Recommendation: #1 (${matching[0].entry.seller || matching[0].driveReport.drive?.model}) is the best candidate.`);
    console.log(`  Run "drive-buy pick" to select drives to buy.\n`);
  } else if (drives.length > 0 && drives[0].score.total <= 30) {
    console.log('  Warning: All drives are in poor condition. Consider buying new instead.\n');
  }
}

// ============================================================================
// OFFER — generate offer using config pricing
// ============================================================================
function cmdOffer() {
  const idx = parseInt(args[0], 10) - 1;
  const config = loadConfig();
  const drives = getAllDrives();

  if (isNaN(idx) || idx < 0 || idx >= drives.length) {
    console.log(`\n  Usage: drive-buy offer <n>  (n from 1 to ${drives.length})\n`);
    return;
  }

  const { entry, driveReport, score } = drives[idx];
  const h = driveReport.health || {};
  const model = driveReport.drive?.model || 'the drive';
  const lang = entry.language || config.defaults?.language || 'en';
  const name = entry.seller || '';

  // Pricing from config
  const pricing = config.pricing || {};
  const NEW_PRICE = pricing.new_reference_price_eur || 70;
  const lifeMult = pricing.life_multiplier || 0.7;
  const negMargin = pricing.negotiation_margin || 0.15;
  const fairPrice = Math.max(5, Math.round(NEW_PRICE * (score.total / 100) * lifeMult));
  const offerPrice = Math.max(5, Math.round(fairPrice * (1 - negMargin)));

  const offers = {
    en: `Hi${name ? ' ' + name : ''}! Thanks for the drive health report.

Based on the diagnostics:
- Model: ${model}
- Power-on hours: ${fmtNum(h.power_on_hours)} (${(h.power_on_hours / 8760).toFixed(1)} years of use)
- Health score: ${score.total}% remaining life
- Estimated useful life: ~${score.years_remaining} more years
${h.pending_sectors > 0 ? `- Warning: ${h.pending_sectors} pending sectors detected\n` : ''}${h.load_cycles > 100000 ? `- Load cycles: ${fmtNum(h.load_cycles)} (wear on head mechanism)\n` : ''}
Given the drive's age and condition, I'd like to offer \u20AC${offerPrice}.

This reflects that a new equivalent drive costs ~\u20AC${NEW_PRICE}, and this one has used about ${100 - score.total}% of its expected lifetime. Happy to discuss!`,

    es: `\u00A1Hola${name ? ' ' + name : ''}! Gracias por el informe de salud del disco.

Seg\u00FAn el diagn\u00F3stico:
- Modelo: ${model}
- Horas de uso: ${fmtNum(h.power_on_hours)} (${(h.power_on_hours / 8760).toFixed(1)} a\u00F1os de uso)
- Puntuaci\u00F3n de salud: ${score.total}% de vida restante
- Vida \u00FAtil estimada: ~${score.years_remaining} a\u00F1os m\u00E1s
${h.pending_sectors > 0 ? `- Aviso: ${h.pending_sectors} sectores pendientes detectados\n` : ''}${h.load_cycles > 100000 ? `- Ciclos de carga: ${fmtNum(h.load_cycles)} (desgaste del mecanismo)\n` : ''}
Considerando la edad y el estado del disco, me gustar\u00EDa ofrecer ${offerPrice}\u20AC.

Esto refleja que un disco nuevo equivalente cuesta ~${NEW_PRICE}\u20AC, y este ha consumido aproximadamente el ${100 - score.total}% de su vida \u00FAtil esperada. \u00A1Abierto a conversaci\u00F3n!`,
  };

  const offer = offers[lang] || offers.en;

  console.log('\n' + '='.repeat(60));
  console.log(`  Drive: ${model} | Seller: ${name || '(unnamed)'}`);
  console.log(`  Score: ${score.total}% | Fair value: \u20AC${fairPrice} | Offer: \u20AC${offerPrice}`);
  console.log(`  Pricing: ref=\u20AC${NEW_PRICE} life_mult=${lifeMult} neg_margin=${negMargin}`);
  console.log('='.repeat(60));
  console.log('\n' + offer + '\n');
  console.log('='.repeat(60));

  // Copy to clipboard
  if (process.platform === 'darwin') {
    try {
      execFileSync('pbcopy', [], { input: offer });
      console.log('\n  Copied to clipboard.\n');
    } catch { /* clipboard is best-effort */ }
  }
}

// ============================================================================
// CAMPAIGN — start / status / close
// ============================================================================
function cmdCampaignStart() {
  // args = ['start', 'campaign name', '--count', '8']
  const existing = loadActiveCampaign();
  if (existing) {
    console.log(`\n  Active campaign already exists: "${existing.name}"`);
    console.log('  Close it first: drive-buy campaign close\n');
    return;
  }

  // Parse: name is first non-flag after 'start', --count value follows its flag
  const subArgs = args.slice(1); // skip 'start'
  const countIdx = subArgs.indexOf('--count');
  const count = countIdx >= 0 ? parseInt(subArgs[countIdx + 1], 10) : null;
  const name = subArgs.filter((a, i) => {
    if (a.startsWith('--')) return false;
    if (i > 0 && subArgs[i - 1] === '--count') return false;
    return true;
  })[0];

  if (!name) {
    console.log('\n  Usage: drive-buy campaign start "name" [--count N]\n');
    return;
  }

  const campaign = {
    name,
    target_count: count || null,
    created: new Date().toISOString(),
    status: 'active',
    tokens: [],
  };

  saveActiveCampaign(campaign);
  console.log(`\n  Campaign started: "${name}"`);
  if (count) console.log(`  Target: ${count} drives`);
  console.log('  New sends will automatically link to this campaign.\n');
}

function cmdCampaignStatus() {
  const campaign = loadActiveCampaign();
  if (!campaign) {
    console.log('\n  No active campaign. Start one: drive-buy campaign start "name" [--count N]\n');
    return;
  }

  const ledger = loadLedger();
  const tokens = new Set(campaign.tokens);
  const linked = ledger.filter(e => tokens.has(e.token));
  const received = linked.filter(e => e.status === 'received');
  const passing = linked.filter(e => e.meets_requirements === true);
  const pending = linked.filter(e => e.status === 'pending');
  const expired = linked.filter(e => e.status === 'expired');

  console.log(`\n  Campaign: "${campaign.name}"`);
  console.log(`  Created: ${campaign.created}`);
  if (campaign.target_count) console.log(`  Target: ${campaign.target_count} drives`);
  console.log('');
  console.log(`  Sent:     ${linked.length}`);
  console.log(`  Pending:  ${pending.length}`);
  console.log(`  Received: ${received.length}`);
  console.log(`  Passing:  ${passing.length}`);
  console.log(`  Expired:  ${expired.length}`);

  if (campaign.target_count) {
    const remaining = Math.max(0, campaign.target_count - passing.length);
    console.log(`\n  ${remaining} more matching drive(s) needed.`);
  }
  console.log('');
}

function cmdCampaignClose() {
  const campaign = loadActiveCampaign();
  if (!campaign) {
    console.log('\n  No active campaign to close.\n');
    return;
  }

  campaign.status = 'closed';
  campaign.closed_at = new Date().toISOString();

  // Archive
  const archiveName = `${campaign.created.slice(0, 10)}-${campaign.name.replace(/[^a-zA-Z0-9]/g, '-').slice(0, 40)}.json`;
  const archivePath = join(ARCHIVE_DIR, archiveName);
  writeFileSync(archivePath, JSON.stringify(campaign, null, 2));

  // Remove active
  const activePath = join(CAMPAIGNS_DIR, 'active.json');
  if (existsSync(activePath)) {
    unlinkSync(activePath);
  }

  // Stop polling if active
  try {
    const crontab = execSync('crontab -l 2>/dev/null', { encoding: 'utf8' });
    if (crontab.includes('# drive-buy-poll')) {
      cmdPollStop();
    }
  } catch { /* no crontab = no polling */ }

  console.log(`\n  Campaign closed: "${campaign.name}"`);
  console.log(`  Archived to: ~/.drive-buy/campaigns/archive/${archiveName}`);
  console.log('  All data preserved.\n');
}

// ============================================================================
// POLL — cron-based polling (no daemon)
// ============================================================================
function cmdPollStart() {
  const config = loadConfig();
  const interval = config.polling?.interval_hours || 4;
  const scriptPath = __filename;
  const cronLine = `0 */${interval} * * * /usr/bin/env node "${scriptPath}" inbox --quiet # drive-buy-poll`;

  try {
    let existing = '';
    try { existing = execSync('crontab -l 2>/dev/null', { encoding: 'utf8' }); } catch { /* empty crontab */ }

    // Remove existing drive-buy-poll line
    const lines = existing.split('\n').filter(l => !l.includes('# drive-buy-poll'));
    lines.push(cronLine);

    // Write back (filter empty trailing lines, ensure newline at end)
    const newCrontab = lines.filter((l, i, arr) => l !== '' || i < arr.length - 1).join('\n') + '\n';
    execSync('crontab -', { input: newCrontab, encoding: 'utf8' });

    // Update config
    config.polling.enabled = true;
    saveConfig(config);

    console.log(`\n  Polling started (every ${interval}h)`);
    console.log(`  Cron: ${cronLine}`);
    console.log('  Stop with: drive-buy poll stop\n');
  } catch (err) {
    console.error(`  Failed to create crontab entry: ${err.message}`);
  }
}

function cmdPollStop() {
  try {
    let existing = '';
    try { existing = execSync('crontab -l 2>/dev/null', { encoding: 'utf8' }); } catch {
      console.log('\n  Polling: already inactive (no crontab).\n');
      return;
    }

    const lines = existing.split('\n').filter(l => !l.includes('# drive-buy-poll'));
    const remaining = lines.filter(l => l.trim() !== '');

    if (remaining.length === 0) {
      try { execSync('crontab -r 2>/dev/null'); } catch { /* already empty */ }
    } else {
      execSync('crontab -', { input: lines.join('\n') + '\n', encoding: 'utf8' });
    }

    const config = loadConfig();
    config.polling.enabled = false;
    saveConfig(config);

    console.log('\n  Polling stopped. Cron entry removed.\n');
  } catch (err) {
    console.error(`  Failed to remove crontab entry: ${err.message}`);
  }
}

function cmdPollStatus() {
  try {
    const existing = execSync('crontab -l 2>/dev/null', { encoding: 'utf8' });
    const line = existing.split('\n').find(l => l.includes('# drive-buy-poll'));

    if (line) {
      console.log('\n  Polling: ACTIVE');
      console.log(`  Cron: ${line}`);
    } else {
      console.log('\n  Polling: INACTIVE');
    }
  } catch {
    console.log('\n  Polling: INACTIVE (no crontab)');
  }
  console.log('');
}

// Scoring, requirements, config helpers imported from ./lib/scoring.js

// ============================================================================
// NETWORK — fetch report with retry + HTML guard
// ============================================================================
async function fetchReport(entry) {
  const doFetch = async (url, opts, retries = 1) => {
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        return await fetch(url, opts);
      } catch (err) {
        if (attempt === retries) throw err;
        await new Promise(r => setTimeout(r, 2000));
      }
    }
  };

  const res = await doFetch(`https://ntfy.sh/${entry.token}/json?poll=1`, {
    signal: AbortSignal.timeout(10000),
  });

  const text = await res.text();

  // Guard against HTML error pages
  if (text.trimStart().startsWith('<')) {
    throw new Error('ntfy.sh returned HTML (server error)');
  }

  const messages = text.trim().split('\n').filter(Boolean).map(l => {
    try { return JSON.parse(l); } catch { return null; }
  }).filter(Boolean);

  const reports = messages.filter(m => {
    if (!m.message && !m.attachment) return false;
    try {
      const data = m.message ? JSON.parse(m.message) : null;
      return (data?.version === '1.1' && data?.drive) || (data?.version === '1.2' && data?.drives);
    } catch {
      return !!m.attachment;
    }
  });

  if (reports.length === 0) return null;

  const msg = reports[reports.length - 1]; // latest
  if (msg.attachment?.url) {
    const dlRes = await doFetch(msg.attachment.url, { signal: AbortSignal.timeout(15000) });
    return await dlRes.json();
  }
  return JSON.parse(msg.message);
}

// ============================================================================
// HELPERS — data access
// ============================================================================
function loadConfig() {
  try {
    return JSON.parse(readFileSync(CONFIG_PATH, 'utf8'));
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}

function saveConfig(config) {
  writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2), 'utf8');
}

function loadLedger() {
  try { return JSON.parse(readFileSync(LEDGER_PATH, 'utf8')); }
  catch { return []; }
}

function saveLedger(ledger) {
  writeFileSync(LEDGER_PATH, JSON.stringify(ledger, null, 2), 'utf8');
}

function loadReport(token) {
  const path = join(REPORTS_DIR, `${token}.json`);
  try { return JSON.parse(readFileSync(path, 'utf8')); }
  catch { return null; }
}

function loadActiveCampaign() {
  const path = join(CAMPAIGNS_DIR, 'active.json');
  try {
    const data = readFileSync(path, 'utf8').trim();
    if (!data) return null;
    return JSON.parse(data);
  } catch { return null; }
}

function saveActiveCampaign(campaign) {
  writeFileSync(join(CAMPAIGNS_DIR, 'active.json'), JSON.stringify(campaign, null, 2));
}

function fmtNum(n) {
  return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

// ============================================================================
// MIGRATION — move data from repo dir to ~/.drive-buy/
// ============================================================================
function ensureDataDirs() {
  [DATA_DIR, REPORTS_DIR, CAMPAIGNS_DIR, ARCHIVE_DIR].forEach(d => {
    mkdirSync(d, { recursive: true });
  });
}

function migrateIfNeeded() {
  let migrated = false;

  // Migrate ledger
  if (existsSync(LEGACY_LEDGER) && !existsSync(LEDGER_PATH)) {
    try {
      copyFileSync(LEGACY_LEDGER, LEDGER_PATH);
      console.log('  Migrated ledger → ~/.drive-buy/ledger.json');
      migrated = true;
    } catch { /* migration is best-effort */ }
  }

  // Migrate reports
  if (existsSync(LEGACY_REPORTS)) {
    try {
      const files = readdirSync(LEGACY_REPORTS).filter(f => f.endsWith('.json'));
      let count = 0;
      for (const f of files) {
        const dst = join(REPORTS_DIR, f);
        if (!existsSync(dst)) {
          copyFileSync(join(LEGACY_REPORTS, f), dst);
          count++;
        }
      }
      if (count > 0) {
        console.log(`  Migrated ${count} report(s) → ~/.drive-buy/reports/`);
        migrated = true;
      }
    } catch { /* migration is best-effort */ }
  }

  if (migrated) console.log('');
}

// ============================================================================
// ENTRY POINT
// ============================================================================
const isEntryPoint = process.argv[1] === __filename ||
  process.argv[1]?.endsWith('drive-buy.js');

if (isEntryPoint) {
  ensureDataDirs();
  migrateIfNeeded();
  main().catch(e => { console.error(`Error: ${e.message}`); process.exit(1); });
}

// Re-export from lib for CLI use (no separate test exports needed)
export { computeLifeScore, checkRequirements, DEFAULT_CONFIG, isTokenExpired, setNestedValue, getNestedValue };
