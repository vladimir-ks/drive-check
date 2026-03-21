#!/usr/bin/env node

/**
 * Generate seller message with fresh token + auto-subscribe.
 *
 * Usage:
 *   node tools/generate-message.js           # English, print only
 *   node tools/generate-message.js --es      # Spanish
 *   node tools/generate-message.js --copy    # + copy to clipboard (macOS)
 *   node tools/generate-message.js --go      # copy + open ntfy in browser + subscribe in app
 *
 * Alias (add to ~/.zshrc):
 *   alias drive-msg='node ~/homelab-setup/drive-check/tools/generate-message.js --go'
 *   alias drive-msg-es='node ~/homelab-setup/drive-check/tools/generate-message.js --es --go'
 */

import { execSync } from 'node:child_process';

const lang = process.argv.includes('--es') ? 'es' : 'en';
const go = process.argv.includes('--go');
const shouldCopy = go || process.argv.includes('--copy');

// Generate timed token
const id = crypto.randomUUID().replace(/-/g, '').slice(0, 12);
const ts = Math.floor(Date.now() / 1000).toString(16);
const token = `dc-${id}-t${ts}`;
const ntfyUrl = `https://ntfy.sh/${token}`;

const messages = {
  en: `Hi! I'm interested in your drive.

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

  es: `¡Hola! Me interesa tu disco.

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

const message = messages[lang];
const expires = new Date((Math.floor(Date.now() / 1000) + 48 * 3600) * 1000).toLocaleString();

// Output
console.log('\n' + '='.repeat(60));
console.log(`Token:     ${token}`);
console.log(`Subscribe: ${ntfyUrl}`);
console.log(`Expires:   ${expires}`);
console.log('='.repeat(60));
console.log('\n' + message + '\n');
console.log('='.repeat(60));

// Actions
if (shouldCopy && process.platform === 'darwin') {
  try {
    execSync('pbcopy', { input: message });
    console.log('\n✓ Message copied to clipboard');
  } catch { /* ignore */ }
}

if (go && process.platform === 'darwin') {
  try {
    // Subscribe in ntfy app (iOS/macOS universal link)
    execSync(`open "ntfy://${token}"`, { stdio: 'ignore' });
    console.log('✓ Subscribing in ntfy app...');
  } catch {
    // Fallback: open in browser
    try {
      execSync(`open "${ntfyUrl}"`, { stdio: 'ignore' });
      console.log('✓ Opened in browser');
    } catch { /* ignore */ }
  }

  // Send a silent marker to the topic so we know it's active
  try {
    execSync(`curl -s -o /dev/null -H "Title: Listening..." -H "Priority: 1" -H "Tags: ear" -d "Waiting for seller report on ${token}" "${ntfyUrl}"`, { timeout: 5000 });
    console.log('✓ Topic activated (test notification sent)');
  } catch { /* network issue, fine */ }
}

if (!shouldCopy && !go) {
  console.log('\nUsage:');
  console.log('  --copy   Copy message to clipboard');
  console.log('  --go     Copy + subscribe + activate (full workflow)');
  console.log('  --es     Spanish message');
}

console.log('');
