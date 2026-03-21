# Privacy Policy

## Data Collected

Only SMART health data from the specific drive you select:

- Drive model name and serial number
- Firmware version
- Capacity and form factor
- Power-on hours and temperature
- Error counts (reallocated sectors, pending sectors, etc.)
- Self-test history

## Data NOT Collected

- Your name, username, or email
- Your IP address or MAC address
- Your hostname or OS version
- File names, directory listings, or file contents on any drive
- Information about any drive you did not select
- Environment variables or system configuration

## Data Transmission

The report is sent to a single ntfy.sh topic specified by the buyer's token.
ntfy.sh is an open-source push notification service. The report is sent as a
single HTTPS POST. No other network requests are made.

## Data Retention

The tool saves one local JSON file in your current directory. You can delete
it at any time. The tool retains no data after it exits.

## Your Rights

- You see the full report before it is sent
- You can cancel at any point
- You can decline to send and keep only the local copy
- You can delete the local copy at any time
