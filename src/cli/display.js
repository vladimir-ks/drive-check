/**
 * Terminal display helpers — raw ANSI codes, zero dependencies.
 * Respects NO_COLOR env var and non-TTY output.
 */

const ESC = '\x1b[';
const useColor = process.stdout.isTTY && !process.env.NO_COLOR;
const isWin = process.platform === 'win32';

function wrap(code, s) { return useColor ? `${ESC}${code}m${s}${ESC}0m` : s; }

export const color = {
  bold: s => wrap('1', s),
  dim: s => wrap('2', s),
  red: s => wrap('31', s),
  green: s => wrap('32', s),
  yellow: s => wrap('33', s),
  cyan: s => wrap('36', s),
};

export function banner(version) {
  const v = `v${version}`;
  return `
${color.cyan('============================================')}
     ${color.bold('drive-check')} ${v}
  Independent Drive Health Verification
${color.cyan('============================================')}

Source: ${color.dim('https://github.com/vladimir-ks/drive-check')}
`;
}

export function transparencyPledge() {
  return `
${color.bold('WHAT THIS TOOL DOES:')}
  ${color.green('+')} Reads SMART health data from the drive you select
  ${color.green('+')} Sends drive serial, model, hours, errors to buyer
  ${color.green('+')} Shows you EVERYTHING before sending

${color.bold('WHAT THIS TOOL DOES NOT DO:')}
  ${color.red('-')} Read, access, or list ANY files on ANY drive
  ${color.red('-')} Collect your IP address, hostname, or username
  ${color.red('-')} Write to any drive or modify any system setting
  ${color.red('-')} Install software or leave anything behind
`;
}

export function driveList(drives) {
  let out = `\n${color.bold('Found drives:')}\n\n`;
  drives.forEach((d, i) => {
    const model = d.model ? ` - ${d.model}` : '';
    const size = d.size ? ` (${d.size})` : '';
    out += `  ${color.cyan(String(i + 1) + '.')} ${d.path}${model}${size}\n`;
  });
  return out;
}

export function verdictBadge(verdict) {
  const mark = isWin ? '*' : '■';
  switch (verdict) {
    case 'HEALTHY': return color.green(`${mark} HEALTHY`);
    case 'WARNING': return color.yellow(`${mark} WARNING`);
    case 'FAILING': return color.red(`${mark} FAILING`);
    default: return verdict;
  }
}

export function spinner(msg) {
  if (!process.stdout.isTTY) {
    process.stdout.write(`  ${msg}\n`);
    return { stop: (final) => process.stdout.write(`  ${final}\n`) };
  }
  const frames = isWin ? ['-', '\\', '|', '/'] : ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
  let i = 0;
  const id = setInterval(() => {
    process.stdout.write(`\r  ${color.cyan(frames[i++ % frames.length])} ${msg}`);
  }, 80);
  return {
    stop: (final) => {
      clearInterval(id);
      process.stdout.write(`\r  ${final}${' '.repeat(20)}\n`);
    },
  };
}
