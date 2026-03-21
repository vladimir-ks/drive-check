/**
 * Deliver report via ntfy.sh push notification.
 * Single HTTPS POST, no dependencies.
 */

export async function sendToNtfy(topic, report, signature) {
  const payload = JSON.stringify({ ...report, signature });
  const url = `https://ntfy.sh/${topic}`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Title': `Drive Check: ${report.drive?.model ?? 'Unknown'} — ${report.verdict?.overall ?? '?'}`,
      'Priority': report.verdict?.overall === 'FAILING' ? '4' : '3',
      'Tags': `hard_drive,${(report.verdict?.overall ?? 'unknown').toLowerCase()}`,
      'Content-Type': 'application/json',
    },
    body: payload,
    signal: AbortSignal.timeout(15000),
  });

  if (!response.ok) {
    throw new Error(`ntfy.sh returned ${response.status}: ${response.statusText}`);
  }

  return true;
}
