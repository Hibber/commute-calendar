import { SCHEDULE_TIME_ZONE } from './schedule-dates';
import { SITE_URL } from './site';

/**
 * iCalendar (RFC 5545) generation for the shift feed.
 *
 * The stored columns make this simpler than it usually is: `date` is
 * `YYYY-MM-DD` and `"startTime"` is `HH:MM`, both already meaning wall-clock
 * time in `SCHEDULE_TIME_ZONE`. That is exactly what `DTSTART;TZID=` wants, so
 * no timezone conversion happens anywhere in this file -- the strings are
 * reformatted, not recomputed.
 */

export interface IcsEvent {
  id: number;
  date: string;
  startTime: string;
  endTime: string;
  notes: string | null;
  claimed_by: string | null;
  claim_type?: 'drive' | 'borrow' | null;
  declined_by?: string[] | null;
}

/** Escape a text value: RFC 5545 gives `\` `;` `,` and newlines meaning. */
function escapeText(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n');
}

/**
 * Fold a content line to 75 octets, per RFC 5545 section 3.1.
 *
 * Measured in octets rather than characters because a multi-byte character
 * must not be split across the fold; continuation lines begin with a space.
 */
function foldLine(line: string): string {
  const bytes = Buffer.from(line, 'utf8');
  if (bytes.length <= 75) return line;

  const parts: string[] = [];
  let start = 0;
  let limit = 75;
  while (start < bytes.length) {
    let end = Math.min(start + limit, bytes.length);
    // Back off until the slice ends on a character boundary.
    while (end > start && end < bytes.length && (bytes[end] & 0xc0) === 0x80) {
      end -= 1;
    }
    parts.push(bytes.subarray(start, end).toString('utf8'));
    start = end;
    // Continuations lose one octet to the leading space.
    limit = 74;
  }
  return parts.join('\r\n ');
}

/** `YYYY-MM-DD` + `HH:MM` -> the RFC 5545 local date-time form. */
function toIcsLocal(date: string, time: string): string {
  return `${date.replace(/-/g, '')}T${time.replace(/:/g, '')}00`;
}

/** `HH:MM` as minutes past midnight, or null if it is not a time. */
function minutesOf(time: string): number | null {
  const match = /^(\d{2}):(\d{2})$/.exec(time ?? '');
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2]);
}

/** `HH:MM` an hour after the given one, clamped inside the day. */
function oneHourAfter(time: string): string {
  const start = minutesOf(time) ?? 0;
  const end = Math.min(start + 60, 23 * 60 + 59);
  return `${String(Math.floor(end / 60)).padStart(2, '0')}:${String(end % 60).padStart(2, '0')}`;
}

/**
 * A VTIMEZONE block for the schedule's zone.
 *
 * RFC 5545 wants any referenced TZID defined in the file. Most clients resolve
 * IANA names on their own, but Apple Calendar is happier with the definition
 * present. Only the default zone is described -- generating these for arbitrary
 * zones would mean shipping a rules database, and a client that has been given
 * an unknown TZID still falls back to resolving the name itself.
 */
function timezoneBlock(): string[] {
  if (SCHEDULE_TIME_ZONE !== 'America/Los_Angeles') return [];
  return [
    'BEGIN:VTIMEZONE',
    'TZID:America/Los_Angeles',
    'X-LIC-LOCATION:America/Los_Angeles',
    'BEGIN:DAYLIGHT',
    'TZOFFSETFROM:-0800',
    'TZOFFSETTO:-0700',
    'TZNAME:PDT',
    'DTSTART:20070311T020000',
    'RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=2SU',
    'END:DAYLIGHT',
    'BEGIN:STANDARD',
    'TZOFFSETFROM:-0700',
    'TZOFFSETTO:-0800',
    'TZNAME:PST',
    'DTSTART:20071104T020000',
    'RRULE:FREQ=YEARLY;BYMONTH=11;BYDAY=1SU',
    'END:STANDARD',
    'END:VTIMEZONE',
  ];
}

/** How a shift reads in a calendar client's day view. */
function summaryFor(event: IcsEvent): string {
  const label = event.notes?.trim() || 'Commute shift';
  if (!event.claimed_by) return `${label} — needs driver`;
  const verb = event.claim_type === 'borrow' ? 'lending car' : 'driving';
  return `${label} — ${event.claimed_by} ${verb}`;
}

function descriptionFor(event: IcsEvent): string {
  const lines: string[] = [];
  lines.push(
    event.claimed_by
      ? `Claimed by ${event.claimed_by} (${event.claim_type === 'borrow' ? 'lending their car' : 'driving'}).`
      : 'Nobody has claimed this shift yet.',
  );
  const declined = event.declined_by ?? [];
  if (declined.length > 0) {
    lines.push(`Declined by ${declined.join(', ')}.`);
  }
  return lines.join('\n');
}

/**
 * Build the whole calendar document.
 *
 * `stamp` is injectable so the output is deterministic under test; DTSTAMP is
 * the only part that would otherwise change between calls.
 */
export function buildCalendar(events: IcsEvent[], stamp: Date = new Date()): string {
  const dtstamp = `${stamp.toISOString().replace(/[-:]/g, '').slice(0, 15)}Z`;

  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//commute-calendar//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'X-WR-CALNAME:Commute Calendar',
    `X-WR-TIMEZONE:${SCHEDULE_TIME_ZONE}`,
    ...timezoneBlock(),
  ];

  for (const event of events) {
    const start = minutesOf(event.startTime);
    // A row with an unparseable start time has nothing to place on a calendar.
    if (start === null) continue;

    const end = minutesOf(event.endTime);
    // Legacy rows exist with an end at or before the start, which is not a valid
    // VEVENT; give those an hour so the shift still shows up.
    const endTime = end !== null && end > start ? event.endTime : oneHourAfter(event.startTime);

    lines.push(
      'BEGIN:VEVENT',
      `UID:event-${event.id}@schedule.triddle.dev`,
      `DTSTAMP:${dtstamp}`,
      `DTSTART;TZID=${SCHEDULE_TIME_ZONE}:${toIcsLocal(event.date, event.startTime)}`,
      `DTEND;TZID=${SCHEDULE_TIME_ZONE}:${toIcsLocal(event.date, endTime)}`,
      `SUMMARY:${escapeText(summaryFor(event))}`,
      `DESCRIPTION:${escapeText(descriptionFor(event))}`,
      `URL:${SITE_URL}`,
      'END:VEVENT',
    );
  }

  lines.push('END:VCALENDAR');

  // CRLF line endings are required, not stylistic.
  return lines.map(foldLine).join('\r\n') + '\r\n';
}
