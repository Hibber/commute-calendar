import { NextResponse } from 'next/server';
import { sql } from '@vercel/postgres';
import { listRecipients } from '@/lib/auth';
import { emailFooter, notify } from '@/lib/notify';
import { isUncovered } from '@/lib/coverage';
import {
  addDaysToDateString,
  formatDateString,
  formatTimeString,
  todayInScheduleZone,
} from '@/lib/schedule-dates';

export const dynamic = 'force-dynamic';

/**
 * Scheduled from `vercel.json` at `0 1 * * *`, which is UTC -- early evening in
 * the schedule's own zone. That is deliberate: it is late enough that the day's
 * shifts have played out, and early enough that somebody told "nobody is
 * driving tomorrow" can still do something about it. (JSON takes no comments,
 * hence the note living here.)
 */

/** How far ahead a driver is nudged about shifts they have not answered. */
const NUDGE_WINDOW_DAYS = 3;

interface ShiftRow {
  id: number;
  date: string;
  startTime: string;
  claimed_by: string | null;
  status: string;
  declined_by: string[] | null;
}

/**
 * Whether this request really came from the scheduler.
 *
 * Vercel Cron sends `Authorization: Bearer $CRON_SECRET`. Without the check the
 * route is an open endpoint anyone could hit to spam the carpool with pushes.
 * If `CRON_SECRET` is unset the route refuses to run rather than defaulting to
 * open -- a misconfiguration should stop reminders, not expose them.
 */
function isAuthorizedCron(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return request.headers.get('authorization') === `Bearer ${secret}`;
}

/**
 * The daily reminder sweep.
 *
 * Two things go out, and nothing goes out when there is nothing to say -- a
 * digest that arrives every day regardless is one people stop reading:
 *
 *  1. Each driver is nudged about shifts in the next few days they have neither
 *     claimed nor declined. Personal, so it names only their own outstanding
 *     ones.
 *  2. Admins are told about tomorrow's shifts that nobody is covering, which is
 *     the last moment arranging something else is still realistic.
 */
export async function GET(request: Request) {
  if (!isAuthorizedCron(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const today = todayInScheduleZone();
    const horizon = addDaysToDateString(today, NUDGE_WINDOW_DAYS);
    const tomorrow = addDaysToDateString(today, 1);

    const { rows: shifts } = await sql<ShiftRow>`
      SELECT id, date, "startTime", claimed_by, status, declined_by
      FROM events
      WHERE type = 'shift' AND date >= ${today} AND date <= ${horizon}
      ORDER BY date ASC, "startTime" ASC
    `;

    const recipients = await listRecipients();
    const drivers = recipients.filter((r) => !r.isAdmin);
    const driverNames = [...new Set(drivers.map((r) => r.displayName))];

    // 1. Per-driver nudges about shifts they have not answered either way.
    let nudged = 0;
    for (const driver of drivers) {
      const outstanding = shifts.filter(
        (s) => s.status !== 'claimed' && !(s.declined_by ?? []).includes(driver.displayName),
      );
      if (outstanding.length === 0) continue;

      const lines = outstanding
        .map((s) => `<li><strong>${formatDateString(s.date)}</strong> at ${formatTimeString(s.startTime)}</li>`)
        .join('');

      await notify(
        { names: [driver.displayName] },
        {
          title: `${outstanding.length} shift${outstanding.length === 1 ? '' : 's'} need an answer`,
          body:
            outstanding.length === 1
              ? `${formatDateString(outstanding[0].date)} at ${formatTimeString(outstanding[0].startTime)} still needs a driver.`
              : `${outstanding.length} shifts in the next ${NUDGE_WINDOW_DAYS} days still need an answer.`,
          subject: `You have ${outstanding.length} shift${outstanding.length === 1 ? '' : 's'} to answer`,
          html: `<p>These shifts in the next ${NUDGE_WINDOW_DAYS} days are still waiting on you:</p><ul>${lines}</ul>${emailFooter()}`,
        },
      );
      nudged += 1;
    }

    // 2. Tomorrow with nobody covering it.
    const uncoveredTomorrow = shifts.filter(
      (s) => s.date === tomorrow && isUncovered(s, driverNames),
    );

    for (const shift of uncoveredTomorrow) {
      await notify('admins', {
        title: '🚨 Tomorrow has no driver',
        body: `${formatDateString(shift.date)} at ${formatTimeString(shift.startTime)} is uncovered.`,
        subject: 'No coverage for tomorrow',
        html: `<p>The shift on <strong>${formatDateString(shift.date)}</strong> at <strong>${formatTimeString(shift.startTime)}</strong> has no driver, and every driver has declined it.</p><p>You will need to arrange alternate transportation.</p>${emailFooter()}`,
      });
    }

    return NextResponse.json({
      ok: true,
      today,
      shiftsInWindow: shifts.length,
      driversNudged: nudged,
      uncoveredTomorrow: uncoveredTomorrow.length,
    });
  } catch (error) {
    console.error('Reminder sweep failed:', error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
