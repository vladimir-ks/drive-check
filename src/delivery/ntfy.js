/**
 * Deliver report via ntfy.sh push notification.
 * Sends as file attachment to avoid 4096-byte body limit.
 * Handles both v1.1 (single drive) and v1.2 (multi-drive) reports.
 */

export async function sendToNtfy(topic, report, signature) {
  const payload = JSON.stringify({ ...report, signature }, null, 2);
  const url = `https://ntfy.sh/${topic}`;

  let title, priority;

  if (report.version === '1.2' && report.drives) {
    // Multi-drive report
    const verdicts = report.drives.map(d => d.verdict?.overall);
    const worst = verdicts.includes('FAILING') ? 'FAILING'
      : verdicts.includes('WARNING') ? 'WARNING' : 'HEALTHY';
    const healthyCount = verdicts.filter(v => v === 'HEALTHY').length;

    title = `drive-check: ${report.drive_count} drives (${healthyCount} healthy)`;
    priority = worst === 'FAILING' ? '5' : worst === 'WARNING' ? '4' : '3';
  } else {
    // Single-drive report (v1.1)
    const verdict = report.verdict?.overall ?? '?';
    const model = report.drive?.model ?? 'Unknown';
    title = `drive-check: ${model} - ${verdict}`;
    priority = verdict === 'FAILING' ? '5' : verdict === 'WARNING' ? '4' : '3';
  }

  const response = await fetch(url, {
    method: 'PUT',
    headers: {
      'Title': title,
      'Priority': priority,
      'Tags': 'hard_drive',
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
