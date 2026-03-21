/**
 * Terminal display helpers — raw ANSI codes, zero dependencies.
 */

const ESC = '\x1b[';
const RESET = `${ESC}0m`;
const BOLD = `${ESC}1m`;
const DIM = `${ESC}2m`;
const RED = `${ESC}31m`;
const GREEN = `${ESC}32m`;
const YELLOW = `${ESC}33m`;
const CYAN = `${ESC}36m`;

export const color = {
  bold: s => `${BOLD}${s}${RESET}`,
  dim: s => `${DIM}${s}${RESET}`,
  red: s => `${RED}${s}${RESET}`,
  green: s => `${GREEN}${s}${RESET}`,
  yellow: s => `${YELLOW}${s}${RESET}`,
  cyan: s => `${CYAN}${s}${RESET}`,
};

export function banner(version) {
  return `
${color.cyan('╔══════════════════════════════════════════╗')}
${color.cyan('║')}     ${color.bold('drive-check')} v${version}                ${color.cyan('║')}
${color.cyan('║')}  Independent Drive Health Verification   ${color.cyan('║')}
${color.cyan('╚══════════════════════════════════════════╝')}

Source: ${color.dim('https://github.com/vladimir-ks/drive-check')}
`;
}

export function transparencyPledge() {
  return `
${color.bold('WHAT THIS TOOL DOES:')}
  ${color.green('✓')} Reads SMART health data from the drive you select
  ${color.green('✓')} Sends drive serial, model, hours, errors to buyer
  ${color.green('✓')} Shows you EVERYTHING before sending

${color.bold('WHAT THIS TOOL DOES NOT DO:')}
  ${color.red('✗')} Read, access, or list ANY files on ANY drive
  ${color.red('✗')} Collect your IP address, hostname, or username
  ${color.red('✗')} Write to any drive or modify any system setting
  ${color.red('✗')} Install software or leave anything behind
`;
}

export function driveList(drives) {
  let out = `\n${color.bold('Found drives:')}\n\n`;
  drives.forEach((d, i) => {
    out += `  ${color.cyan(String(i + 1) + '.')} ${d.path} — ${d.type ?? 'unknown'}\n`;
  });
  return out;
}

export function verdictBadge(verdict) {
  switch (verdict) {
    case 'HEALTHY': return color.green('■ HEALTHY');
    case 'WARNING': return color.yellow('■ WARNING');
    case 'FAILING': return color.red('■ FAILING');
    default: return verdict;
  }
}

export function spinner(msg) {
  const frames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
  let i = 0;
  const id = setInterval(() => {
    process.stdout.write(`\r${color.cyan(frames[i++ % frames.length])} ${msg}`);
  }, 80);
  return { stop: (final) => { clearInterval(id); process.stdout.write(`\r${final}\n`); } };
}
