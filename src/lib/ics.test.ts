import { describe, expect, it } from 'vitest';
import { buildCalendar, type IcsEvent } from './ics';

const stamp = new Date('2026-08-01T12:00:00Z');

function shift(overrides: Partial<IcsEvent> = {}): IcsEvent {
  return {
    id: 1,
    date: '2026-08-04',
    startTime: '07:30',
    endTime: '08:15',
    notes: null,
    claimed_by: null,
    claim_type: null,
    declined_by: null,
    ...overrides,
  };
}

describe('buildCalendar', () => {
  it('wraps events in a VCALENDAR with the schedule timezone', () => {
    const ics = buildCalendar([shift()], stamp);
    expect(ics.startsWith('BEGIN:VCALENDAR')).toBe(true);
    expect(ics.trimEnd().endsWith('END:VCALENDAR')).toBe(true);
    expect(ics).toContain('X-WR-TIMEZONE:America/Los_Angeles');
    expect(ics).toContain('BEGIN:VTIMEZONE');
  });

  it('uses CRLF line endings, which the spec requires', () => {
    const ics = buildCalendar([shift()], stamp);
    expect(/(?<!\r)\n/.test(ics)).toBe(false);
  });

  it('emits local times against the zone rather than converting them', () => {
    // The stored columns are already wall-clock in the schedule's zone, so the
    // digits must survive untouched -- a UTC conversion here would silently
    // move every shift by 7 or 8 hours.
    const ics = buildCalendar([shift()], stamp);
    expect(ics).toContain('DTSTART;TZID=America/Los_Angeles:20260804T073000');
    expect(ics).toContain('DTEND;TZID=America/Los_Angeles:20260804T081500');
  });

  it('gives a zero-length shift an hour so the event stays valid', () => {
    const ics = buildCalendar([shift({ startTime: '09:00', endTime: '09:00' })], stamp);
    expect(ics).toContain('DTEND;TZID=America/Los_Angeles:20260804T100000');
  });

  it('skips a row whose start time cannot be parsed', () => {
    const ics = buildCalendar([shift({ startTime: '' })], stamp);
    expect(ics).not.toContain('BEGIN:VEVENT');
  });

  it('escapes the characters that are syntax in iCalendar', () => {
    const ics = buildCalendar([shift({ notes: 'Early; big car, please' })], stamp);
    expect(ics).toContain('Early\\; big car\\, please');
  });

  it('says who is driving, and how', () => {
    expect(buildCalendar([shift({ claimed_by: 'Austin', claim_type: 'drive' })], stamp)).toContain(
      'Austin driving',
    );
    expect(buildCalendar([shift({ claimed_by: 'Karey', claim_type: 'borrow' })], stamp)).toContain(
      'Karey lending car',
    );
    expect(buildCalendar([shift()], stamp)).toContain('needs driver');
  });

  it('folds long lines to 75 octets without splitting a character', () => {
    const ics = buildCalendar([shift({ notes: 'é'.repeat(200) })], stamp);
    for (const line of ics.split('\r\n')) {
      expect(Buffer.from(line, 'utf8').length).toBeLessThanOrEqual(75);
    }
    // Folding must be reversible: unfolding restores the original text.
    const unfolded = ics.replace(/\r\n /g, '');
    expect(unfolded).toContain('é'.repeat(200));
  });

  it('gives each event a stable unique id', () => {
    const ics = buildCalendar([shift({ id: 7 }), shift({ id: 8 })], stamp);
    expect(ics).toContain('UID:event-7@schedule.triddle.dev');
    expect(ics).toContain('UID:event-8@schedule.triddle.dev');
  });

  it('produces a valid empty calendar', () => {
    const ics = buildCalendar([], stamp);
    expect(ics).toContain('BEGIN:VCALENDAR');
    expect(ics).not.toContain('BEGIN:VEVENT');
  });
});
