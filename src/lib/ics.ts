export interface IcsEventInput {
  uid: string;
  title: string;
  description?: string;
  location?: string;
  url?: string;
  start: Date;
  end?: Date;
  now?: Date;
}

const CRLF = '\r\n';

function pad(n: number): string {
  return n.toString().padStart(2, '0');
}

function formatUtc(d: Date): string {
  return (
    `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}` +
    `T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`
  );
}

function escapeText(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/\n/g, '\\n')
    .replace(/,/g, '\\,')
    .replace(/;/g, '\\;');
}

/**
 * RFC 5545 §3.1: content lines longer than 75 octets must be folded by
 * inserting CRLF + a single space at each fold point. We fold by octet
 * length (UTF-8) so multi-byte characters split safely.
 */
function foldLine(line: string): string {
  const bytes = Buffer.from(line, 'utf8');
  if (bytes.length <= 75) return line;
  const parts: string[] = [];
  let offset = 0;
  // First chunk: 75 octets. Continuations: 74 octets (reserve 1 for the leading space).
  let chunkSize = 75;
  while (offset < bytes.length) {
    let end = Math.min(offset + chunkSize, bytes.length);
    // Avoid splitting in the middle of a multi-byte UTF-8 sequence: a
    // continuation byte is 10xxxxxx (0x80–0xBF). Walk back to a leading byte.
    while (end < bytes.length && ((bytes[end] ?? 0) & 0xc0) === 0x80) end--;
    parts.push(bytes.subarray(offset, end).toString('utf8'));
    offset = end;
    chunkSize = 74;
  }
  return parts.join(`${CRLF} `);
}

export function buildIcs(input: IcsEventInput): string {
  const start = input.start;
  const end = input.end ?? new Date(start.getTime() + 60 * 60 * 1000);
  const now = input.now ?? new Date();

  const rawLines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//OpenSignup//opensignup.org//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${input.uid}`,
    `DTSTAMP:${formatUtc(now)}`,
    `DTSTART:${formatUtc(start)}`,
    `DTEND:${formatUtc(end)}`,
    `SUMMARY:${escapeText(input.title)}`,
  ];
  if (input.description) rawLines.push(`DESCRIPTION:${escapeText(input.description)}`);
  if (input.location) rawLines.push(`LOCATION:${escapeText(input.location)}`);
  if (input.url) rawLines.push(`URL:${input.url}`);
  rawLines.push('END:VEVENT', 'END:VCALENDAR');

  return rawLines.map(foldLine).join(CRLF) + CRLF;
}
