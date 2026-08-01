/**
 * Date handling for the schedule.
 *
 * `events.date` is a plain `YYYY-MM-DD` string with no timezone attached -- it
 * means "that calendar day where the carpool lives". Cron runs on Vercel in
 * UTC, so asking the server what day it is gets the wrong answer for part of
 * every evening: at 18:00 Pacific it is already tomorrow in UTC, and a reminder
 * about "tomorrow" would silently skip a day.
 *
 * Everything here therefore resolves days in one fixed zone.
 */

/** The zone the carpool's calendar days are expressed in. */
export const SCHEDULE_TIME_ZONE = process.env.SCHEDULE_TIME_ZONE || 'America/Los_Angeles';

/** Today in the schedule's zone, as `YYYY-MM-DD`. */
export function todayInScheduleZone(now: Date = new Date()): string {
  // `en-CA` formats as YYYY-MM-DD, which is exactly the stored shape.
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: SCHEDULE_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

/** `YYYY-MM-DD` for `days` after the given day. */
export function addDaysToDateString(date: string, days: number): string {
  // Anchored at noon UTC so a daylight-saving shift cannot roll the date.
  const anchored = new Date(`${date}T12:00:00Z`);
  anchored.setUTCDate(anchored.getUTCDate() + days);
  return anchored.toISOString().slice(0, 10);
}

/** e.g. "Tuesday, Aug 4" -- how dates read in notifications. */
export function formatDateString(date: string): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'UTC',
    weekday: 'long',
    month: 'short',
    day: 'numeric',
  }).format(new Date(`${date}T12:00:00Z`));
}

/**
 * e.g. "7:30 AM" from a stored `HH:MM`.
 *
 * Anything that is not a time is handed back untouched. Callers include the
 * dashboard, which renders rows the server may have deleted underneath it, so
 * this has to survive an empty or absent value rather than throwing.
 */
export function formatTimeString(time: string): string {
  const match = /^(\d{1,2}):(\d{2})/.exec(time ?? '');
  if (!match) return time ?? '';
  const h = Number(match[1]);
  const suffix = h >= 12 ? 'PM' : 'AM';
  const hour12 = h % 12 || 12;
  return `${hour12}:${match[2]} ${suffix}`;
}
