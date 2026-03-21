# drive-check

Independent HDD/SSD health verification for used drive sales.

Seller runs one command. Buyer gets a verified SMART health report. No trust required — the tool is open-source, has zero dependencies, and shows everything before sending.

## For Sellers

**What it does:**
- Reads SMART health data (hours, errors, temperature) from the drive you pick
- Shows you the full report before sending anything
- You can cancel at any point

**What it does NOT do:**
- Access, read, or list any files on any drive
- Collect your IP, hostname, username, or any personal info
- Install anything or modify your system

**How to run:**

```bash
npx drive-check <TOKEN>
```

The buyer will give you the token. You need:
- [Node.js](https://nodejs.org) (v18+)
- [smartmontools](https://www.smartmontools.org/wiki/Download) (the tool will guide you)

On Linux/macOS you may need `sudo`:
```bash
sudo npx drive-check <TOKEN>
```

**Read every line of code:** This package is ~500 lines with zero dependencies. Browse `src/` in this repo.

## For Buyers

### Generate a Check Token

```bash
# Subscribe to a topic (install ntfy app or use browser)
# Topic format: dc-<random>
# Example: dc-a8f3b2c9d1e4

# Open in browser or ntfy app:
https://ntfy.sh/dc-a8f3b2c9d1e4
```

### Send to Seller

```
Could you run a quick SMART health check on the drive?
Takes 2 min: npx drive-check dc-a8f3b2c9d1e4
Open-source, read-only, shows you everything before sending.
Code: https://github.com/vladimir-ks/drive-check
```

### Receive and Verify

The report arrives as a push notification with JSON attachment containing:
- Drive model, serial, capacity
- Power-on hours, temperature
- All critical SMART attributes
- Automated verdict (HEALTHY / WARNING / FAILING)
- HMAC signature for tamper detection

### Verify Signature

```javascript
import { createHmac } from 'node:crypto';
const key = createHash('sha256').update(token + version + 'drive-check').digest();
const sig = createHmac('sha256', key).update(canonicalJson).digest('hex');
// Compare with report.signature
```

## Security

- **Zero runtime dependencies** — nothing hidden, nothing transitive
- **Open source** (MIT) — read every line
- **npm provenance** — package signed and linked to this commit
- See [SECURITY.md](SECURITY.md) and [PRIVACY.md](PRIVACY.md)

## License

MIT
