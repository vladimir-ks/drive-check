# drive-check — Context for AI Agents

## What This Is
Two tools in one repo:
- **Seller** (`npx drive-check <token>`): npm package, published, zero-dep. Seller runs it, selects drives, sends health report.
- **Buyer** (`drive-buy`): private CLI in `~/homelab-setup/drive-check-tool/tools/drive-buy.js`. Interactive TUI, manages sellers/campaigns/offers.

## Quick Reference

```bash
# Buyer CLI (interactive menu — no flags needed)
node tools/drive-buy.js

# Or with subcommands
node tools/drive-buy.js send <url> [name]    # Generate seller message → clipboard
node tools/drive-buy.js inbox                # Fetch all pending reports
node tools/drive-buy.js best                 # Rank drives by profile match + life
node tools/drive-buy.js compare              # Side-by-side table
node tools/drive-buy.js pick                 # Multi-select drives to buy → offer → clipboard
node tools/drive-buy.js list                 # All sellers + status
node tools/drive-buy.js campaign status      # Campaign progress
node tools/drive-buy.js config               # Show config + profiles
```

## Architecture

```
Seller: npx drive-check <token>
  → multi-select drives (TUI)
  → SMART check each
  → send v1.2 report via ntfy.sh

Buyer: drive-buy inbox
  → fetch ALL messages per token (idempotent)
  → deduplicate by drive serial
  → check against profiles (3TB ZFS / 2TB Synology)
  → store in ~/.drive-buy/
```

## Data Locations
- **Buyer data**: `~/.drive-buy/` (config.json, ledger.json, reports/, campaigns/)
- **Seller package**: `src/` + `bin/` (published to npm)
- **Buyer tools**: `tools/` (NOT published)
- **TUI module**: `src/tui.js` (shared, published)
- **Scoring lib**: `tools/lib/scoring.js` (pure functions, tested cross-platform)

## Key Rules
1. **One token per seller** — seller selects all drives in one run
2. **Seller can re-run same token** — inbox deduplicates by serial number
3. **No accented chars in Wallapop messages** — chat corrupts UTF-8 on split
4. **Messages must be SHORT** — Wallapop has ~300 char limit per bubble
5. **CrystalDiskInfo is option A** — most sellers know it, zero install
6. **Spanish is default language** — auto-detected from URL/locale
7. **Profiles**: config supports named requirement profiles with capacity ranges

## Publishing
```bash
# Bump version in package.json, then:
npm publish --otp <code>
# No automation tokens — manual OTP is the auth
```

## Testing
```bash
npx vitest run              # 117 tests, 9 files
# CI: GitHub Actions on Ubuntu/macOS/Windows x Node 18+22
```

## Current Config (in ~/.drive-buy/config.json)
- **3TB ZFS** profile: 2.5GB+, max 50K hours, 0 pending sectors, max 40 EUR
- **2TB Synology** profile: 1.5-2.5GB, max 50K hours, 0 pending sectors, max 30 EUR

## Seller Message Template
Short Spanish, 2 options (CrystalDiskInfo screenshot OR npx command).
Template in `tools/generate-message.js` → `buildMessage()`.
