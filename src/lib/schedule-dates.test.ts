import { describe, expect, it } from 'vitest';
import {
  addDaysToDateString,
  formatDateString,
  formatTimeString,
  todayInScheduleZone,
} from './schedule-dates';

describe('todayInScheduleZone', () => {
  it('reports the Pacific day, not the UTC one', () => {
    // 01:00 UTC on the 2nd is still the evening of the 1st in California. This
    // is the exact case the cron sweep gets wrong if it asks the server.
    expect(todayInScheduleZone(new Date('2026-08-02T01:00:00Z'))).toBe('2026-08-01');
  });

  it('rolls over at Pacific midnight', () => {
    expect(todayInScheduleZone(new Date('2026-08-02T07:00:00Z'))).toBe('2026-08-02');
  });
});

describe('addDaysToDateString', () => {
  it('adds and subtracts days', () => {
    expect(addDaysToDateString('2026-08-01', 3)).toBe('2026-08-04');
    expect(addDaysToDateString('2026-08-01', -1)).toBe('2026-07-31');
    expect(addDaysToDateString('2026-08-01', 0)).toBe('2026-08-01');
  });

  it('crosses month and year boundaries', () => {
    expect(addDaysToDateString('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDaysToDateString('2028-02-28', 1)).toBe('2028-02-29');
  });

  it('does not slip a day across a daylight-saving change', () => {
    // The noon-UTC anchor exists for this: both US DST transitions land here.
    expect(addDaysToDateString('2026-03-07', 1)).toBe('2026-03-08');
    expect(addDaysToDateString('2026-11-01', 1)).toBe('2026-11-02');
  });
});

describe('formatTimeString', () => {
  it('formats a stored HH:MM as a 12-hour time', () => {
    expect(formatTimeString('07:30')).toBe('7:30 AM');
    expect(formatTimeString('13:05')).toBe('1:05 PM');
  });

  it('handles both ends of the day', () => {
    expect(formatTimeString('00:00')).toBe('12:00 AM');
    expect(formatTimeString('12:00')).toBe('12:00 PM');
    expect(formatTimeString('23:59')).toBe('11:59 PM');
  });

  it('hands back anything that is not a time instead of throwing', () => {
    // The dashboard renders rows the server may have deleted underneath it, so
    // this used to be a crash: '' produced `undefined.toString()`.
    expect(formatTimeString('')).toBe('');
    expect(formatTimeString('nonsense')).toBe('nonsense');
    expect(formatTimeString(undefined as unknown as string)).toBe('');
  });
});

describe('formatDateString', () => {
  it('reads as a weekday and date', () => {
    expect(formatDateString('2026-08-04')).toBe('Tuesday, Aug 4');
  });

  it('is not shifted by the zone the server happens to be in', () => {
    expect(formatDateString('2026-01-01')).toBe('Thursday, Jan 1');
  });
});
