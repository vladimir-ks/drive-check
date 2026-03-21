/**
 * Deliver report via ntfy.sh push notification.
 * Sends as file attachment to avoid 4096-byte body limit.
 */

export async function sendToNtfy(topic, report, signature) {
  const payload = JSON.stringify({ ...report, signature }, null, 2);
  const url = `https://ntfy.sh/${topic}`;
  const verdict = report.verdict?.overall ?? '?';
  const model = report.drive?.model ?? 'Unknown';

  // Build summary for notification body (short, within limits)
  const hours = report.health?.power_on_hours ?? '?';
  const temp = report.health?.temperature_c ?? '?';
  const pending = report.health?.pending_sectors ?? 0;
  const summary = [
    `${model}`,
    `${hours} hours, ${temp}C`,
    pending > 0 ? `${pending} pending sectors!` : 'No bad sectors',
    `Verdict: ${verdict}`,
  ].join('\n');

  const response = await fetch(url, {
    method: 'PUT',
    headers: {
      'Title': `drive-check: ${model} - ${verdict}`,
      'Priority': verdict === 'FAILING' ? '5' : verdict === 'WARNING' ? '4' : '3',
      'Tags': `hard_drive,${verdict.toLowerCase()}`,
      'Filename': `drive-report-${report.token}.json`,
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
