/**
 * OS-specific smartmontools installation instructions.
 */

const GUIDES = {
  linux: `
  Install smartmontools:
    Ubuntu/Debian:  sudo apt install smartmontools
    Fedora/RHEL:    sudo dnf install smartmontools
    Arch:           sudo pacman -S smartmontools

  Then re-run this tool.`,

  darwin: `
  Install smartmontools:
    brew install smartmontools

  (Install Homebrew first if needed: https://brew.sh)
  Then re-run this tool.`,

  win32: `
  Install smartmontools:
    winget install smartmontools

  Or download from: https://www.smartmontools.org/wiki/Download#InstalltheWindowspackage
  After install, re-run this tool (you may need to restart your terminal).`,
};

export function getInstallGuide() {
  return GUIDES[process.platform] ?? GUIDES.linux;
}
