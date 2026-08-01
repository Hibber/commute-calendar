import { NextResponse } from 'next/server';
import { sql } from '@vercel/postgres';
import { listDrivers } from '@/lib/auth';
import { isAuthorizedCron } from '@/lib/cron-auth';
import { rowBelongsTo } from '@/lib/identity';
import { serverError } from '@/lib/http';
import { sendPushNotification } from '@/lib/push';
import { getCommuteTraffic } from '@/lib/traffic';
import {
  SCHEDULE_TIME_ZONE,
  formatTimeString,
  todayInScheduleZone,
} from '@/lib/schedule-dates';
import { SITE_URL } from '@/lib/site';

export const dynamic = 'force-dynamic';

/**
 * "Time to leave" alerts.
 *
 * A claimed shift has a start time, and the drive to it takes however long
 * traffic says it takes today. The difference is when the driver has to leave,
 * which is the thing worth a push -- the shift time itself they already know.
 *
 * Meant to be pinged every 15 minutes through the morning, which is why the
 * schedule lives in `.github/workflows/departure-ping.yml` and not in
 * `vercel.json`: Vercel's Hobby plan allows daily crons only, and a
 * sub-daily entry there does not degrade -- it fails the deployment outright.
 * On Pro the entry can move back into `vercel.json` and the workflow be
 * dropped. The route does not care who calls it, only that the bearer secret
 * matches.
 */

/** Minutes of slack between the alert and actually needing to be moving. */
const DEFAULT_BUFFER_MINUTES = 10;

interface ClaimedShift {
  id: number;
  date: string;
  startTime: string;
  claimed_by: string | null;
  claimed_by_id: string | null;
}

/**
 * Minutes past midnight right now, in the schedule's own zone.
 *
 * `hourCycle: 'h23'` rather than `hour12: false`, which is the spelling that
 * reports midnight as hour 24 on some runtimes -- that would put "now" a full
 * day ahead and skip every alert.
 */
function nowInMinutes(now: Date = new Date()): number {
  const [hour, minute] = new Intl.DateTimeFormat('en-GB', {
    timeZone: SCHEDULE_TIME_ZONE,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  })
    .format(now)
    .split(':')
    .map(Number);
  return hour * 60 + minute;
}

/** `HH:MM` as minutes past midnight, or null if it is not a time. */
function minutesOf(time: string): number | null {
  const match = /^(\d{2}):(\d{2})$/.exec(time ?? '');
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2]);
}

/** Minutes past midnight back to `HH:MM`. */
function toClockString(minutes: number): string {
  const clamped = Math.max(0, minutes);
  return `${String(Math.floor(clamped / 60)).padStart(2, '0')}:${String(clamped % 60).padStart(2, '0')}`;
}

export async function GET(request: Request) {
  if (!isAuthorizedCron(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const today = todayInScheduleZone();
    const now = nowInMinutes();

    // Only today's claimed shifts that have not started and have not already
    // been alerted. Fetched before touching TomTom so the many pings that have
    // nothing to do cost one cheap query and no API quota.
    const { rows: shifts } = await sql<ClaimedShift>`
      SELECT id, date, "startTime", claimed_by, claimed_by_id
      FROM events
      WHERE type = 'shift'
        AND date = ${today}
        AND status = 'claimed'
        AND claimed_by IS NOT NULL
        AND departure_notified_at IS NULL
      ORDER BY "startTime" ASC
    `;

    if (shifts.length === 0) {
      return NextResponse.json({ ok: true, checked: 0, notified: 0 });
    }

    const traffic = await getCommuteTraffic();
    if (!traffic) {
      // Nothing is marked, so the next ping tries again rather than the alert
      // being lost to a momentary TomTom failure.
      console.warn('Departure sweep: traffic unavailable, skipping this run.');
      return NextResponse.json({ ok: true, checked: shifts.length, notified: 0, traffic: false });
    }

    const buffer = Number(process.env.DEPARTURE_BUFFER_MINUTES ?? DEFAULT_BUFFER_MINUTES);
    // Resolved once rather than per shift: matching happens locally, so a
    // morning's worth of shifts still costs a single Clerk lookup.
    const drivers = await listDrivers();
    let notified = 0;

    for (const shift of shifts) {
      const start = minutesOf(shift.startTime);
      if (start === null || start <= now) continue;

      const departure = start - traffic.totalMinutes - buffer;
      // Fires on the first ping at or after the departure moment, so with a
      // 15-minute cadence an alert can be up to a ping late -- which is what
      // the buffer is for.
      if (now < departure) continue;

      // Marking first means a second ping racing this one finds nothing to
      // claim, so nobody gets the same alert twice. A shift reassigned after
      // its alert went out will not re-alert; the new driver hears about the
      // claim itself instead. The row is marked even when the claimer cannot be
      // resolved -- they have left the carpool, so there is nobody to tell and
      // no reason to reconsider the shift on every later ping.
      const { rows: claimed } = await sql`
        UPDATE events
        SET departure_notified_at = NOW()
        WHERE id = ${shift.id} AND departure_notified_at IS NULL
        RETURNING id
      `;
      if (claimed.length === 0) continue;

      const claimer = drivers.find((driver) =>
        rowBelongsTo({ ownerId: shift.claimed_by_id, ownerName: shift.claimed_by }, driver),
      );
      if (!claimer) continue;

      await sendPushNotification([claimer], {
        title: '🚗 Time to leave',
        body: `Leave by ${formatTimeString(toClockString(departure))} for the ${formatTimeString(shift.startTime)} shift — ${traffic.totalMinutes} min drive (${traffic.trafficCondition}).`,
        url: SITE_URL,
      });
      notified += 1;
    }

    return NextResponse.json({ ok: true, checked: shifts.length, notified });
  } catch (error) {
    return serverError('Departure sweep failed', error);
  }
}
