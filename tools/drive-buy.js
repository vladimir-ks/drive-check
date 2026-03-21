#!/usr/bin/env node

/**
 * drive-buy — Buyer-side CLI for used drive purchasing workflow.
 *
 * Commands:
 *   drive-buy send <url> <name> [--es]   Generate seller message (wraps generate-message.js)
 *   drive-buy inbox                       Poll ntfy.sh for received reports
 *   drive-buy list                        Show all tracked sellers + status
 *   drive-buy compare                     Compare all received reports side by side
 *   drive-buy offer <index>               Generate offer message with pricing rationale
 *   drive-buy best                        AI-scored ranking of all received drives
 *
 * Alias: alias drive-buy='node ~/homelab-setup/drive-check/tools/drive-buy.js'
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const LEDGER_PATH = join(__dirname, '..', '.drive-checks.json');
const REPORTS_DIR = join(__dirname, '..', '.drive-reports');

// Ensure reports dir exists
import { mkdirSync } from 'node:fs';
try { mkdirSync(REPORTS_DIR, { recursive: true }); } catch {}

const cmd = process.argv[2];
const args = process.argv.slice(3);

const HELP = `
  drive-buy — Used drive purchasing workflow

  Commands:
    send <url> [name] [--es]   Send seller message (generates token, copies to clipboard)
    inbox                       Check for received reports from sellers
    list                        Show all tracked sellers and their status
    compare                     Compare all received drive reports
    offer <n>                   Generate offer for drive #n (from compare list)
    best                        Rank all drives by remaining life + value

  Setup:
    alias drive-buy='node ~/homelab-setup/drive-check/tools/drive-buy.js'
`;

async function main() {
  switch (cmd) {
    case 'send': return cmdSend();
    case 'inbox': return cmdInbox();
    case 'list': return cmdList();
    case 'compare': return cmdCompare();
    case 'offer': return cmdOffer();
    case 'best': return cmdBest();
    default:
      console.log(HELP);
      if (cmd && cmd !== '--help' && cmd !== '-h') console.log(`  Unknown command: ${cmd}\n`);
  }
}

// ============================================================================
// SEND — wraps generate-message.js
// ============================================================================
function cmdSend() {
  const sendArgs = [join(__dirname, 'generate-message.js'), ...args, '--copy'];
  execFileSync('node', sendArgs, { stdio: 'inherit' });
}

// ============================================================================
// INBOX — poll ntfy.sh for all pending tokens
// ============================================================================
async function cmdInbox() {
  const ledger = loadLedger();
  const pending = ledger.filter(e => e.status === 'pending');

  if (pending.length === 0) {
    console.log('\n  No pending checks. Use "drive-buy send <url> <name>" first.\n');
    return;
  }

  console.log(`\n  Checking ${pending.length} pending topic(s)...\n`);

  let received = 0;
  for (const entry of pending) {
    process.stdout.write(`  ${entry.seller || entry.token.slice(0, 20)}... `);

    try {
      const res = await fetch(`https://ntfy.sh/${entry.token}/json?poll=1`, {
        signal: AbortSignal.timeout(10000),
      });
      const text = await res.text();
      const messages = text.trim().split('\n').filter(Boolean).map(l => {
        try { return JSON.parse(l); } catch { return null; }
      }).filter(Boolean);

      // Find messages with drive-check report data
      const reports = messages.filter(m => {
        if (!m.message && !m.attachment) return false;
        try {
          const data = m.message ? JSON.parse(m.message) : null;
          return data?.version === '1.1' && data?.drive;
        } catch {
          return !!m.attachment; // Has file attachment
        }
      });

      if (reports.length > 0) {
        // Download attachment if present, otherwise use message body
        let reportData;
        const msg = reports[reports.length - 1]; // latest

        if (msg.attachment?.url) {
          const dlRes = await fetch(msg.attachment.url, { signal: AbortSignal.timeout(15000) });
          reportData = await dlRes.json();
        } else {
          reportData = JSON.parse(msg.message);
        }

        // Save report
        const reportPath = join(REPORTS_DIR, `${entry.token}.json`);
        writeFileSync(reportPath, JSON.stringify(reportData, null, 2));

        // Update ledger
        entry.status = 'received';
        entry.received_at = new Date().toISOString();
        entry.verdict = reportData.verdict?.overall ?? '?';
        entry.drive_model = reportData.drive?.model ?? '?';
        entry.drive_serial = reportData.drive?.serial ?? '?';
        entry.power_on_hours = reportData.health?.power_on_hours ?? 0;

        console.log(`RECEIVED — ${entry.verdict} — ${entry.drive_model}`);
        received++;
      } else {
        console.log('no report yet');
      }
    } catch (err) {
      console.log(`error: ${err.message}`);
    }
  }

  saveLedger(ledger);
  console.log(`\n  ${received} new report(s) received.\n`);

  if (received > 0) {
    console.log('  Run "drive-buy compare" to see all reports side by side.');
    console.log('  Run "drive-buy best" to rank drives by remaining life.\n');
  }
}

// ============================================================================
// LIST — show all tracked sellers
// ============================================================================
function cmdList() {
  const ledger = loadLedger();
  if (ledger.length === 0) {
    console.log('\n  No sellers tracked yet. Use "drive-buy send <url> <name>" to start.\n');
    return;
  }

  console.log('\n  # | Status   | Seller         | Platform    | Verdict  | Model                  | Link');
  console.log('  ' + '-'.repeat(110));

  ledger.forEach((e, i) => {
    const status = e.status === 'received' ? '\x1b[32mRECEIVED\x1b[0m' : '\x1b[33mPENDING \x1b[0m';
    const seller = (e.seller || '-').padEnd(14).slice(0, 14);
    const platform = (e.platform || '-').padEnd(11).slice(0, 11);
    const verdict = (e.verdict || '-').padEnd(8).slice(0, 8);
    const model = (e.drive_model || '-').padEnd(22).slice(0, 22);
    const link = (e.listing_url || '-').slice(0, 50);
    console.log(`  ${String(i + 1).padStart(2)} | ${status} | ${seller} | ${platform} | ${verdict} | ${model} | ${link}`);
  });
  console.log('');
}

// ============================================================================
// COMPARE — show all received reports side by side
// ============================================================================
function cmdCompare() {
  const ledger = loadLedger();
  const received = ledger.filter(e => e.status === 'received');

  if (received.length === 0) {
    console.log('\n  No reports received yet. Run "drive-buy inbox" to check.\n');
    return;
  }

  console.log('\n  === DRIVE COMPARISON ===\n');
  console.log('  ' + '#'.padStart(3) + ' | ' +
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
  console.log('  ' + '-'.repeat(130));

  received.forEach((e, i) => {
    const report = loadReport(e.token);
    if (!report) { console.log(`  ${i + 1} | (report file missing)`); return; }

    const h = report.health || {};
    const score = computeLifeScore(report);

    console.log('  ' +
      String(i + 1).padStart(3) + ' | ' +
      (report.drive?.model || '?').padEnd(22).slice(0, 22) + ' | ' +
      (report.drive?.serial || '?').slice(-16).padEnd(16) + ' | ' +
      String(h.power_on_hours || 0).padStart(7) + ' | ' +
      String(h.temperature_c || '?').padStart(4) + ' | ' +
      String(h.pending_sectors || 0).padStart(5) + ' | ' +
      String(h.uncorrectable_sectors || 0).padStart(5) + ' | ' +
      String(h.reallocated_sectors || 0).padStart(7) + ' | ' +
      String(h.load_cycles || 0).padStart(8) + ' | ' +
      (report.verdict?.overall || '?').padEnd(8) + ' | ' +
      (score.total + '%').padStart(5) + ' | ' +
      (e.seller || '-'));
  });

  console.log('\n  Score = estimated remaining life percentage (100% = brand new)\n');
}

// ============================================================================
// BEST — rank drives by remaining life score
// ============================================================================
function cmdBest() {
  const ledger = loadLedger();
  const received = ledger.filter(e => e.status === 'received');

  if (received.length === 0) {
    console.log('\n  No reports received yet. Run "drive-buy inbox" to check.\n');
    return;
  }

  const scored = received.map((e, i) => {
    const report = loadReport(e.token);
    if (!report) return null;
    const score = computeLifeScore(report);
    return { index: i, entry: e, report, score };
  }).filter(Boolean).sort((a, b) => b.score.total - a.score.total);

  console.log('\n  === DRIVE RANKING (best first) ===\n');

  scored.forEach((item, rank) => {
    const { entry, report, score } = item;
    const h = report.health || {};
    const verdict = report.verdict?.overall;

    const verdictColor = verdict === 'HEALTHY' ? '\x1b[32m' : verdict === 'WARNING' ? '\x1b[33m' : '\x1b[31m';

    console.log(`  ${rank + 1}. ${report.drive?.model} (${entry.seller || 'unnamed'})`);
    console.log(`     ${verdictColor}${verdict}\x1b[0m | Score: ${score.total}% | Est. remaining: ${score.years_remaining} years`);
    console.log(`     Hours: ${fmtNum(h.power_on_hours)} | Cycles: ${fmtNum(h.load_cycles || 0)} | Pending: ${h.pending_sectors || 0} | Temp: ${h.temperature_c}C`);
    console.log(`     ${score.breakdown}`);
    if (entry.listing_url) console.log(`     Link: ${entry.listing_url}`);

    // Seller responses
    if (report.seller_responses) {
      console.log('     Seller says:');
      for (const [q, a] of Object.entries(report.seller_responses)) {
        const shortQ = q.split('?')[0].split(' ').slice(-3).join(' ');
        console.log(`       ${shortQ}: ${a}`);
      }
    }
    console.log('');
  });

  if (scored.length > 0 && scored[0].score.total > 30) {
    console.log(`  Recommendation: Drive #1 (${scored[0].entry.seller || scored[0].report.drive?.model}) is the best candidate.`);
    console.log(`  Run "drive-buy offer 1" to generate an offer message.\n`);
  } else if (scored.length > 0) {
    console.log('  Warning: All drives are in poor condition. Consider buying new instead.\n');
  }
}

// ============================================================================
// OFFER — generate offer message with pricing rationale
// ============================================================================
function cmdOffer() {
  const idx = parseInt(args[0], 10) - 1;
  const ledger = loadLedger();
  const received = ledger.filter(e => e.status === 'received');

  if (isNaN(idx) || idx < 0 || idx >= received.length) {
    console.log(`\n  Usage: drive-buy offer <n>  (n from 1 to ${received.length})\n`);
    return;
  }

  const entry = received[idx];
  const report = loadReport(entry.token);
  if (!report) { console.log('  Report file not found.'); return; }

  const score = computeLifeScore(report);
  const h = report.health || {};
  const model = report.drive?.model || 'the drive';
  const lang = entry.language || 'en';
  const name = entry.seller || '';

  // Price suggestion based on remaining life
  // New 3TB WD Red ≈ €70. Used price scales with remaining life.
  const NEW_PRICE = 70;
  const fairPrice = Math.max(5, Math.round(NEW_PRICE * (score.total / 100) * 0.7));
  const offerPrice = Math.max(5, Math.round(fairPrice * 0.85)); // 15% negotiation margin

  const offers = {
    en: `Hi${name ? ' ' + name : ''}! Thanks for the drive health report.

Based on the diagnostics:
- Model: ${model}
- Power-on hours: ${fmtNum(h.power_on_hours)} (${(h.power_on_hours / 8760).toFixed(1)} years of use)
- Health score: ${score.total}% remaining life
- Estimated useful life: ~${score.years_remaining} more years
${h.pending_sectors > 0 ? `- Warning: ${h.pending_sectors} pending sectors detected\n` : ''}${h.load_cycles > 100000 ? `- Load cycles: ${fmtNum(h.load_cycles)} (wear on head mechanism)\n` : ''}
Given the drive's age and condition, I'd like to offer €${offerPrice}.

This reflects that a new equivalent drive costs ~€${NEW_PRICE}, and this one has used about ${100 - score.total}% of its expected lifetime. Happy to discuss!`,

    es: `¡Hola${name ? ' ' + name : ''}! Gracias por el informe de salud del disco.

Según el diagnóstico:
- Modelo: ${model}
- Horas de uso: ${fmtNum(h.power_on_hours)} (${(h.power_on_hours / 8760).toFixed(1)} años de uso)
- Puntuación de salud: ${score.total}% de vida restante
- Vida útil estimada: ~${score.years_remaining} años más
${h.pending_sectors > 0 ? `- Aviso: ${h.pending_sectors} sectores pendientes detectados\n` : ''}${h.load_cycles > 100000 ? `- Ciclos de carga: ${fmtNum(h.load_cycles)} (desgaste del mecanismo)\n` : ''}
Considerando la edad y el estado del disco, me gustaría ofrecer ${offerPrice}€.

Esto refleja que un disco nuevo equivalente cuesta ~${NEW_PRICE}€, y este ha consumido aproximadamente el ${100 - score.total}% de su vida útil esperada. ¡Abierto a conversación!`,
  };

  const offer = offers[lang] || offers.en;

  console.log('\n' + '='.repeat(60));
  console.log(`  Drive: ${model} | Seller: ${name || '(unnamed)'}`);
  console.log(`  Score: ${score.total}% | Fair value: €${fairPrice} | Offer: €${offerPrice}`);
  console.log('='.repeat(60));
  console.log('\n' + offer + '\n');
  console.log('='.repeat(60));

  // Copy to clipboard
  if (process.platform === 'darwin') {
    try {
      execFileSync('pbcopy', [], { input: offer });
      console.log('\n  Copied to clipboard.\n');
    } catch {}
  }
}

// ============================================================================
// SCORING ENGINE — estimate remaining drive life
// ============================================================================
function computeLifeScore(report) {
  const h = report.health || {};
  const isNvme = h.type === 'nvme';
  let score = 100;
  const notes = [];

  if (isNvme) {
    // NVMe: percentage_used is the direct wear indicator
    const used = h.percentage_used ?? 0;
    score -= used;
    if (used > 0) notes.push(`${used}% worn`);

    if (h.media_errors > 0) { score -= 50; notes.push(`${h.media_errors} media errors`); }
    if (h.critical_warning > 0) { score = 0; notes.push('critical warning'); }
    if ((h.available_spare ?? 100) < 20) { score -= 30; notes.push(`spare ${h.available_spare}%`); }
  } else {
    // ATA: multi-factor scoring

    // Hours: 0-40K = fine, 40K-60K = aging, 60K+ = old
    const hours = h.power_on_hours ?? 0;
    if (hours > 60000) { score -= 40; notes.push(`${fmtNum(hours)}h (very old)`); }
    else if (hours > 40000) { score -= 25; notes.push(`${fmtNum(hours)}h (aging)`); }
    else if (hours > 20000) { score -= 10; notes.push(`${fmtNum(hours)}h`); }

    // Load cycles: 300K rated
    const cycles = h.load_cycles ?? 0;
    if (cycles > 200000) { score -= 30; notes.push(`${fmtNum(cycles)} cycles (>66% consumed)`); }
    else if (cycles > 100000) { score -= 15; notes.push(`${fmtNum(cycles)} cycles`); }

    // Bad sectors = catastrophic
    if ((h.pending_sectors ?? 0) > 0) { score -= 60; notes.push(`${h.pending_sectors} pending sectors`); }
    if ((h.uncorrectable_sectors ?? 0) > 0) { score -= 60; notes.push(`${h.uncorrectable_sectors} uncorrectable`); }
    if ((h.reallocated_sectors ?? 0) > 10) { score -= 30; notes.push(`${h.reallocated_sectors} reallocated`); }
    else if ((h.reallocated_sectors ?? 0) > 0) { score -= 10; notes.push(`${h.reallocated_sectors} reallocated`); }

    // CRC errors suggest cable/connector issues
    if ((h.crc_errors ?? 0) > 10) { score -= 5; notes.push('CRC errors (cable)'); }
  }

  // SMART failed = instant zero
  if (h.smart_passed === false) { score = 0; notes.push('SMART FAILED'); }

  score = Math.max(0, Math.min(100, score));

  // Estimate years remaining (rough)
  const bearingHoursLeft = Math.max(0, 50000 - (h.power_on_hours ?? 0));
  const cyclesLeft = Math.max(0, 300000 - (h.load_cycles ?? 0));
  const hoursPerYear = 365; // 1h/day in our cold storage
  const yearsFromHours = bearingHoursLeft / hoursPerYear;
  const yearsFromCycles = cyclesLeft / 365;
  const yearsRemaining = Math.min(yearsFromHours, yearsFromCycles, 30);

  return {
    total: score,
    years_remaining: Math.max(0, yearsRemaining).toFixed(0),
    breakdown: notes.length > 0 ? notes.join(', ') : 'no issues detected',
  };
}

// ============================================================================
// HELPERS
// ============================================================================
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

function fmtNum(n) {
  return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

main().catch(e => { console.error(`Error: ${e.message}`); process.exit(1); });
