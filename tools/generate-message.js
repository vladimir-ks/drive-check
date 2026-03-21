#!/usr/bin/env node

/**
 * Generate seller message with fresh token linked to a listing.
 *
 * Usage:
 *   drive-msg <URL> [seller-name] [--es] [--copy]
 *   drive-msg "https://wallapop.com/item/disco-duro-3tb-1234" "Carlos"
 *   drive-msg "https://wallapop.com/item/disco-duro-3tb-1234" "Carlos" --es --copy
 *   drive-msg --go   (interactive: prompts for URL and name)
 *
 * Alias (add to ~/.zshrc):
 *   alias drive-msg='node ~/homelab-setup/drive-check/tools/generate-message.js'
 */

import { execSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createInterface } from 'node:readline';

const __dirname = dirname(fileURLToPath(import.meta.url));
const LEDGER_PATH = join(__dirname, '..', '.drive-checks.json');

// Parse args
const args = process.argv.slice(2).filter(a => !a.startsWith('--'));
const flags = process.argv.slice(2).filter(a => a.startsWith('--'));
const lang = flags.includes('--es') ? 'es' : 'en';
const shouldCopy = flags.includes('--copy') || flags.includes('--go');
const interactive = flags.includes('--go') || args.length === 0;

// Interactive or from args
let listingUrl = args[0] || '';
let sellerName = args[1] || '';

async function main() {
  if (interactive && !listingUrl) {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    const ask = (q) => new Promise(r => rl.question(q, r));

    listingUrl = await ask('Listing URL (paste link): ');
    sellerName = await ask('Seller name (optional): ');
    rl.close();
  }

  // Extract listing ID from URL for short reference
  const listingId = extractListingId(listingUrl);
  const platform = detectPlatform(listingUrl);

  // Generate timed token
  const id = crypto.randomUUID().replace(/-/g, '').slice(0, 12);
  const ts = Math.floor(Date.now() / 1000).toString(16);
  const token = `dc-${id}-t${ts}`;
  const ntfyUrl = `https://ntfy.sh/${token}`;
  const expires = new Date((Math.floor(Date.now() / 1000) + 48 * 3600) * 1000);

  // Build message
  const message = buildMessage(lang, token, sellerName);

  // Save to ledger
  saveLedger({
    token,
    listing_url: listingUrl,
    listing_id: listingId,
    platform,
    seller: sellerName || null,
    language: lang,
    created: new Date().toISOString(),
    expires: expires.toISOString(),
    status: 'pending',
  });

  // Output
  console.log('\n' + '='.repeat(60));
  console.log(`Token:     ${token}`);
  console.log(`Seller:    ${sellerName || '(unnamed)'}`);
  console.log(`Platform:  ${platform}`);
  console.log(`Listing:   ${listingUrl || '(none)'}`);
  console.log(`Subscribe: ${ntfyUrl}`);
  console.log(`Expires:   ${expires.toLocaleString()}`);
  console.log('='.repeat(60));
  console.log('\n' + message + '\n');
  console.log('='.repeat(60));

  // Copy to clipboard
  if (shouldCopy && process.platform === 'darwin') {
    try {
      execSync('pbcopy', { input: message });
      console.log('\n✓ Message copied to clipboard');
    } catch { /* ignore */ }
  }

  // Auto-subscribe
  if (process.platform === 'darwin') {
    try {
      execSync(`open "${ntfyUrl}"`, { stdio: 'ignore' });
      console.log('✓ Opened ntfy topic in browser');
    } catch { /* ignore */ }

    // Send activation ping
    try {
      const title = sellerName
        ? `Waiting: ${sellerName} (${platform})`
        : `Waiting: ${platform} listing`;
      execSync(`curl -s -o /dev/null -H "Title: ${title}" -H "Priority: 1" -H "Tags: hourglass" -d "${listingUrl || 'no URL'}" "${ntfyUrl}"`, { timeout: 5000 });
      console.log('✓ Topic activated');
    } catch { /* ignore */ }
  }

  // Show ledger summary
  const ledger = loadLedger();
  const pending = ledger.filter(e => e.status === 'pending').length;
  console.log(`\n${pending} pending check(s) in ledger. Run with --list to view all.`);

  // List mode
  if (flags.includes('--list')) {
    console.log('\n--- Ledger ---');
    for (const entry of ledger) {
      const age = Math.floor((Date.now() - new Date(entry.created).getTime()) / 3600000);
      const expired = new Date(entry.expires) < new Date();
      const status = expired ? 'EXPIRED' : entry.status.toUpperCase();
      console.log(`  ${entry.token.slice(0, 20)}  ${status.padEnd(8)}  ${age}h ago  ${entry.seller || '-'}  ${entry.platform}  ${entry.listing_url?.slice(0, 50) || '-'}`);
    }
  }

  console.log('');
}

function buildMessage(lang, token, seller) {
  const greeting = seller
    ? (lang === 'es' ? `¡Hola${seller ? ' ' + seller : ''}!` : `Hi${seller ? ' ' + seller : ''}!`)
    : (lang === 'es' ? '¡Hola!' : 'Hi!');

  const messages = {
    en: `${greeting} I'm interested in your drive.

Could you tell me a bit about its history?
- What kind of system was it in?
- Roughly how was the system used — always on, or turned on/off?
- Where was the system kept?
- Was the system ever relocated or moved around?
- Any reason in particular you're letting it go?

I'd also appreciate a quick health check if possible (2 minutes):

  npx drive-check ${token}

Open-source, read-only, shows you everything before sending:
https://github.com/vladimir-ks/drive-check

A CrystalDiskInfo screenshot also works. Thanks!`,

    es: `${greeting} Me interesa tu disco.

¿Podrías contarme un poco sobre su historia?
- ¿En qué tipo de sistema estuvo?
- ¿Cómo se usaba el sistema — siempre encendido, o se apagaba?
- ¿Dónde se encontraba el sistema?
- ¿Alguna vez se trasladó o se movió el equipo?
- ¿Algún motivo en particular por el que lo vendes?

También agradecería un diagnóstico rápido si es posible (2 minutos):

  npx drive-check ${token}

Código abierto, solo lectura, ves todo antes de enviar:
https://github.com/vladimir-ks/drive-check

Una captura de CrystalDiskInfo también sirve. ¡Gracias!`,
  };

  return messages[lang];
}

function extractListingId(url) {
  if (!url) return null;
  // Wallapop: /item/slug-123456789
  const wallapop = url.match(/item\/[\w-]+-(\d+)/);
  if (wallapop) return wallapop[1];
  // eBay: /itm/123456789
  const ebay = url.match(/itm\/(\d+)/);
  if (ebay) return ebay[1];
  // Generic: last path segment
  const last = url.split('/').filter(Boolean).pop();
  return last || null;
}

function detectPlatform(url) {
  if (!url) return 'direct';
  if (url.includes('wallapop')) return 'wallapop';
  if (url.includes('ebay')) return 'ebay';
  if (url.includes('kleinanzeigen') || url.includes('ebay-kleinanzeigen')) return 'kleinanzeigen';
  if (url.includes('milanuncios')) return 'milanuncios';
  if (url.includes('facebook') || url.includes('fb.com')) return 'facebook';
  if (url.includes('avito')) return 'avito';
  return 'other';
}

function loadLedger() {
  try {
    return JSON.parse(readFileSync(LEDGER_PATH, 'utf8'));
  } catch {
    return [];
  }
}

function saveLedger(entry) {
  const ledger = loadLedger();
  ledger.push(entry);
  writeFileSync(LEDGER_PATH, JSON.stringify(ledger, null, 2), 'utf8');
}

main().catch(e => { console.error(e.message); process.exit(1); });
