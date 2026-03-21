/**
 * tui.js — Zero-dependency interactive terminal prompts.
 *
 * select()       Single choice with arrow keys
 * multiSelect()  Multi choice with space toggle
 * confirm()      Y/n prompt
 * input()        Text input
 * detectLanguage()  System locale detection
 */

// ANSI escape codes
const ESC = '\x1b';
const HIDE_CURSOR = `${ESC}[?25l`;
const SHOW_CURSOR = `${ESC}[?25h`;
const BOLD = `${ESC}[1m`;
const DIM = `${ESC}[2m`;
const RESET = `${ESC}[0m`;
const CYAN = `${ESC}[36m`;
const GREEN = `${ESC}[32m`;

const noColor = !!process.env.NO_COLOR;
const c = (code, text) => noColor ? text : `${code}${text}${RESET}`;

// ============================================================================
// SELECT — single choice, arrow keys + enter
// ============================================================================
export async function select(message, choices) {
  const items = normalize(choices);
  if (items.length === 0) return undefined;
  if (!process.stdin.isTTY) return items[0].value;
  if (items.length === 1) {
    write(`${c(CYAN, '?')} ${c(BOLD, message)} ${c(GREEN, items[0].label)}\n`);
    return items[0].value;
  }

  return new Promise((resolve) => {
    let cursor = 0;

    write(`${c(CYAN, '?')} ${c(BOLD, message)} ${c(DIM, '(↑↓ enter)')}\n`);
    renderSelect(items, cursor);

    const { cleanup, listen } = rawMode((key) => {
      if (key === 'up' && cursor > 0) { cursor--; clearUp(items.length); renderSelect(items, cursor); }
      else if (key === 'down' && cursor < items.length - 1) { cursor++; clearUp(items.length); renderSelect(items, cursor); }
      else if (key === 'enter') {
        clearUp(items.length + 1);
        write(`${c(CYAN, '?')} ${c(BOLD, message)} ${c(GREEN, items[cursor].label)}\n`);
        cleanup();
        resolve(items[cursor].value);
      }
    });
    listen();
  });
}

function renderSelect(items, cursor) {
  const lines = items.map((item, i) => {
    const ptr = i === cursor ? c(CYAN, '❯') : ' ';
    const label = i === cursor ? item.label : c(DIM, item.label);
    return `  ${ptr} ${label}`;
  });
  write(lines.join('\n') + '\n');
}

// ============================================================================
// MULTISELECT — multi choice, space toggle + enter confirm
// ============================================================================
export async function multiSelect(message, choices, opts = {}) {
  const items = normalize(choices);
  if (items.length === 0) return [];
  if (!process.stdin.isTTY) return items.map(i => i.value);

  // Pre-select all by default (opt-out is faster than opt-in for sellers)
  const preselect = opts.preselectAll !== false;

  return new Promise((resolve) => {
    let cursor = 0;
    const checked = new Set(preselect ? items.map((_, i) => i) : []);

    write(`${c(CYAN, '?')} ${c(BOLD, message)} ${c(DIM, '(space toggle, enter confirm)')}\n`);
    renderMulti(items, cursor, checked);

    const { cleanup, listen } = rawMode((key) => {
      if (key === 'up' && cursor > 0) { cursor--; clearUp(items.length); renderMulti(items, cursor, checked); }
      else if (key === 'down' && cursor < items.length - 1) { cursor++; clearUp(items.length); renderMulti(items, cursor, checked); }
      else if (key === 'space') {
        if (checked.has(cursor)) checked.delete(cursor);
        else checked.add(cursor);
        clearUp(items.length);
        renderMulti(items, cursor, checked);
      }
      else if (key === 'enter') {
        const selected = [...checked].sort().map(i => items[i]);
        clearUp(items.length + 1);
        const summary = selected.length === 0
          ? c(DIM, '(none)')
          : selected.length <= 3
            ? c(GREEN, selected.map(s => s.label).join(', '))
            : c(GREEN, `${selected.length} selected`);
        write(`${c(CYAN, '?')} ${c(BOLD, message)} ${summary}\n`);
        cleanup();
        resolve(selected.map(s => s.value));
      }
    });
    listen();
  });
}

function renderMulti(items, cursor, checked) {
  const lines = items.map((item, i) => {
    const ptr = i === cursor ? c(CYAN, '❯') : ' ';
    const box = checked.has(i) ? c(GREEN, '◉') : '◯';
    const label = i === cursor ? item.label : c(DIM, item.label);
    return `  ${ptr} ${box} ${label}`;
  });
  write(lines.join('\n') + '\n');
}

// ============================================================================
// CONFIRM — Y/n prompt
// ============================================================================
export async function confirm(message, defaultYes = true) {
  if (!process.stdin.isTTY) return defaultYes;

  const hint = defaultYes ? 'Y/n' : 'y/N';
  write(`${c(CYAN, '?')} ${c(BOLD, message)} ${c(DIM, `[${hint}]`)} `);

  return new Promise((resolve) => {
    const { cleanup, listen } = rawMode((key) => {
      if (key === 'enter') {
        write(c(GREEN, defaultYes ? 'Yes' : 'No') + '\n');
        cleanup();
        resolve(defaultYes);
      } else if (key === 'y') {
        write(c(GREEN, 'Yes') + '\n');
        cleanup();
        resolve(true);
      } else if (key === 'n') {
        write(c(GREEN, 'No') + '\n');
        cleanup();
        resolve(false);
      }
    }, { confirmMode: true });
    listen();
  });
}

// ============================================================================
// INPUT — text prompt
// ============================================================================
export async function input(message, defaultVal = '') {
  if (!process.stdin.isTTY) return defaultVal;

  const hint = defaultVal ? c(DIM, ` (${defaultVal})`) : '';
  write(`${c(CYAN, '?')} ${c(BOLD, message)}${hint} `);

  return new Promise((resolve) => {
    let buf = '';

    const { cleanup, listen } = rawMode((key, raw) => {
      if (key === 'enter') {
        write('\n');
        cleanup();
        resolve(buf || defaultVal);
      } else if (key === 'backspace') {
        if (buf.length > 0) {
          buf = buf.slice(0, -1);
          write('\b \b');
        }
      } else if (key === 'char') {
        buf += raw;
        write(raw);
      }
    });
    listen();
  });
}

// ============================================================================
// LANGUAGE DETECTION
// ============================================================================
export function detectLanguage() {
  const envLang = process.env.LANG || process.env.LC_ALL || process.env.LC_MESSAGES || '';
  let locale = envLang;

  if (!locale) {
    try { locale = Intl.DateTimeFormat().resolvedOptions().locale; }
    catch { locale = ''; }
  }

  const lang = locale.split(/[-_.]/)[0].toLowerCase();

  if (['es', 'ca', 'gl'].includes(lang)) return 'es';
  if (['de'].includes(lang)) return 'de';
  if (['fr'].includes(lang)) return 'fr';
  return 'en';
}

/**
 * Detect language from listing URL (platform-based override).
 * wallapop.com, milanuncios.com → es
 * kleinanzeigen.de → de
 * leboncoin.fr → fr
 */
export function detectLanguageFromUrl(url) {
  if (!url) return null;
  if (/wallapop|milanuncios/i.test(url)) return 'es';
  if (/kleinanzeigen/i.test(url)) return 'de';
  if (/leboncoin/i.test(url)) return 'fr';
  return null;
}

// ============================================================================
// INTERNALS
// ============================================================================
function normalize(choices) {
  return choices.map(c => typeof c === 'string' ? { label: c, value: c } : c);
}

function write(str) {
  process.stdout.write(str);
}

function clearUp(n) {
  for (let i = 0; i < n; i++) {
    write(`${ESC}[1A${ESC}[2K`);
  }
}

/**
 * @param {Function} handler - key event handler
 * @param {Object} opts
 * @param {boolean} opts.confirmMode - when true, y/n dispatched as special events; otherwise as 'char'
 */
function rawMode(handler, opts = {}) {
  let active = true;

  const onData = (buf) => {
    if (!active) return;
    const s = buf.toString();

    if (s === '\x03') { // Ctrl+C
      cleanup();
      write(SHOW_CURSOR + '\n');
      process.exit(130);
    }

    // Map key sequences
    if (s === `${ESC}[A`) return handler('up');
    if (s === `${ESC}[B`) return handler('down');
    if (s === `${ESC}[C`) return handler('right');
    if (s === `${ESC}[D`) return handler('left');
    if (s === '\r' || s === '\n') return handler('enter');
    if (s === ' ') return handler('space');
    if (s === '\x7f' || s === '\b') return handler('backspace');

    // y/n only special in confirm mode; otherwise fall through to char
    if (opts.confirmMode) {
      if (s === 'y' || s === 'Y') return handler('y');
      if (s === 'n' || s === 'N') return handler('n');
    }

    // Printable ASCII (including y, n in non-confirm mode)
    if (s.length === 1 && s.charCodeAt(0) >= 32 && s.charCodeAt(0) < 127) {
      return handler('char', s);
    }
  };

  const cleanup = () => {
    active = false;
    process.stdin.removeListener('data', onData);
    try { process.stdin.setRawMode(false); } catch {}
    process.stdin.pause();
    write(SHOW_CURSOR);
  };

  const listen = () => {
    write(HIDE_CURSOR);
    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', onData);
  };

  return { cleanup, listen };
}

// Ensure terminal is restored on unexpected exit (SIGTERM, crash, etc.)
const _restoreTerminal = () => {
  try { process.stdin.setRawMode(false); } catch {}
  try { process.stdout.write(SHOW_CURSOR); } catch {}
};
process.on('exit', _restoreTerminal);
if (process.platform !== 'win32') {
  process.on('SIGTERM', () => { _restoreTerminal(); process.exit(143); });
  process.on('SIGHUP', () => { _restoreTerminal(); process.exit(129); });
}
