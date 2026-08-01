import { NextResponse } from 'next/server';
import { sql } from '@vercel/postgres';
import { listDrivers } from '@/lib/auth';
import { isValidFeedToken } from '@/lib/calendar-feed';
import { buildCalendar, type IcsEvent } from '@/lib/ics';
import { serverError } from '@/lib/http';
import { addDaysToDateString, todayInScheduleZone } from '@/lib/schedule-dates';

export const dynamic = 'force-dynamic';

/**
 * How far back the feed reaches.
 *
 * Calendar clients replace their whole copy on each fetch, so anything dropped
 * here vanishes from the subscriber's history. A couple of months keeps the
 * recent past visible without the document growing forever.
 */
const HISTORY_DAYS = 60;

/**
 * The subscribable shift feed, as iCalendar.
 *
 * Authenticated by a signed token in the URL rather than by session, because
 * the caller is Google's or Apple's fetcher and not a browser -- see
 * `lib/calendar-feed.ts`.
 */
export async function GET(request: Request) {
  try {
    const params = new URL(request.url).searchParams;
    const user = params.get('user');
    const token = params.get('token');
    const onlyMine = params.get('only') === 'mine';

    if (!user || !token || !isValidFeedToken(user, token)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // A valid signature for someone who has since left the carpool should stop
    // working, and the roster is the same one the rest of the app trusts.
    const subscriber = (await listDrivers()).find((driver) => driver.displayName === user);
    if (!subscriber) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const since = addDaysToDateString(todayInScheduleZone(), -HISTORY_DAYS);

    const { rows } = onlyMine
      ? await sql<IcsEvent>`
          SELECT id, date, "startTime", "endTime", notes, claimed_by, claim_type, declined_by
          FROM events
          WHERE type = 'shift' AND date >= ${since}
            AND (
              claimed_by_id = ${subscriber.userId}
              OR (claimed_by_id IS NULL AND claimed_by = ${subscriber.displayName})
            )
          ORDER BY date ASC, "startTime" ASC
        `
      : await sql<IcsEvent>`
          SELECT id, date, "startTime", "endTime", notes, claimed_by, claim_type, declined_by
          FROM events
          WHERE type = 'shift' AND date >= ${since}
          ORDER BY date ASC, "startTime" ASC
        `;

    return new Response(buildCalendar(rows), {
      headers: {
        'Content-Type': 'text/calendar; charset=utf-8',
        'Content-Disposition': 'inline; filename="commute-calendar.ics"',
        // The schedule is not public, so no shared cache may hold it.
        'Cache-Control': 'private, max-age=300',
      },
    });
  } catch (error) {
    return serverError('iCal feed failed', error);
  }
}
