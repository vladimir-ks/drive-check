#!/usr/bin/env node

/**
 * Generate a seller message with fresh token.
 * Usage: node tools/generate-message.js [--es] [--copy]
 */

import { execSync } from 'node:child_process';

const lang = process.argv.includes('--es') ? 'es' : 'en';
const shouldCopy = process.argv.includes('--copy');

// Generate timed token
const id = crypto.randomUUID().replace(/-/g, '').slice(0, 12);
const ts = Math.floor(Date.now() / 1000).toString(16);
const token = `dc-${id}-t${ts}`;

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

console.log('\n' + '='.repeat(60));
console.log(`Token: ${token}`);
console.log(`Subscribe: https://ntfy.sh/${token}`);
console.log(`Expires: ${new Date((Math.floor(Date.now()/1000) + 48*3600) * 1000).toLocaleString()}`);
console.log('='.repeat(60));
console.log('\n' + message + '\n');
console.log('='.repeat(60));

if (shouldCopy) {
  try {
    if (process.platform === 'darwin') {
      execSync('pbcopy', { input: message });
      console.log('\n✓ Message copied to clipboard');
    } else {
      console.log('\n(auto-copy: macOS only — copy manually)');
    }
  } catch {
    console.log('\n(could not copy to clipboard — copy manually)');
  }
} else {
  console.log('\nTip: add --copy to auto-copy to clipboard');
}
