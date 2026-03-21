# Security Model

## What This Tool Does

1. Runs `smartctl --scan` to list connected drives
2. Runs `smartctl -j -a /dev/sdX` on the drive YOU select
3. Extracts SMART health data (hours, temperature, errors)
4. Shows you the full report before sending
5. Sends report to buyer's notification topic (ntfy.sh)
6. Saves a local copy in your current directory

## What This Tool Does NOT Do

- **Does NOT read, list, or access any files on any drive**
- **Does NOT collect your IP address, hostname, username, or OS version**
- **Does NOT install anything or modify any system setting**
- **Does NOT write to any drive**
- **Does NOT run in the background after you close it**
- **Does NOT phone home or send telemetry**

## Zero Dependencies

This package has **zero runtime dependencies**. Every line of code is in this
repository. There are no hidden packages, no transitive dependencies, no supply
chain risk beyond Node.js itself.

## How to Verify

1. Read the source: it's ~500 lines total in `src/`
2. Check npm provenance: package is signed and linked to this exact GitHub commit
3. Run `npm pack` and inspect the tarball before installing
4. Search the entire codebase for `fs.read`, `os.hostname`, `process.env` — you won't find them

## Reporting Vulnerabilities

Open an issue on GitHub or email the author directly.
