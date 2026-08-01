import { NextResponse } from 'next/server';
import { sql } from '@vercel/postgres';
import { requireAdmin } from '@/lib/auth';
import { escapeHtml, notify } from '@/lib/notify';
import { serverError } from '@/lib/http';
import { addDaysToDateString } from '@/lib/schedule-dates';
import { SITE_URL } from '@/lib/site';

/**
 * How many weeks a recurring shift covers, counting the one being created.
 *
 * Recurrences are materialised as ordinary independent rows rather than being
 * stored as a rule and expanded on read. That is what makes deleting a single
 * day behave the way it should: the row is simply gone, and no series
 * definition survives to resurrect it or to make the gap need modelling.
 */
const RECURRENCE_WEEKS = 3;

/**
 * How many shifts one request may create, before recurrence expansion.
 *
 * Each one costs a round trip, and a recurring entry costs `RECURRENCE_WEEKS`
 * of them, so an unbounded array is an unbounded request.
 */
const MAX_BATCH = 20;

/** The stored shapes: `YYYY-MM-DD` and `HH:MM`. */
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const TIME_PATTERN = /^\d{2}:\d{2}$/;

/** What is wrong with this entry, or null if nothing is. */
function validationErrorFor(ev: unknown, index: number): string | null {
  if (typeof ev !== 'object' || ev === null) return `Event ${index + 1} is not an object`;
  const { date, startTime, endTime } = ev as Record<string, unknown>;

  if (!date || !startTime || !endTime) {
    return `Event ${index + 1} is missing date, startTime or endTime`;
  }
  // Checked for shape as well as presence: a malformed date reaches
  // `addDaysToDateString`, which turns it into an invalid Date and throws.
  if (typeof date !== 'string' || !DATE_PATTERN.test(date)) {
    return `Event ${index + 1} has an invalid date (expected YYYY-MM-DD)`;
  }
  if (typeof startTime !== 'string' || !TIME_PATTERN.test(startTime)) {
    return `Event ${index + 1} has an invalid startTime (expected HH:MM)`;
  }
  if (typeof endTime !== 'string' || !TIME_PATTERN.test(endTime)) {
    return `Event ${index + 1} has an invalid endTime (expected HH:MM)`;
  }
  return null;
}

export async function POST(request: Request) {
  const session = await requireAdmin();
  if (!session.ok) return session.response;

  try {
    const { events } = await request.json();
    
    if (!events || !Array.isArray(events) || events.length === 0) {
      return NextResponse.json({ error: 'No events provided' }, { status: 400 });
    }

    if (events.length > MAX_BATCH) {
      return NextResponse.json(
        { error: `Too many events in one request (max ${MAX_BATCH})` },
        { status: 400 },
      );
    }

    // The whole batch is validated before anything is inserted, so a bad entry
    // at the end cannot leave the earlier ones half-created.
    for (const [index, ev] of events.entries()) {
      const problem = validationErrorFor(ev, index);
      if (problem) {
        return NextResponse.json({ error: problem }, { status: 400 });
      }
    }

    const createdEvents = [];

    // Note: Vercel Postgres doesn't easily support bulk inserts with dynamic arrays in the template literal,
    // so we will loop them. For small batches (<20), this is perfectly fine.
    for (const ev of events) {
      const { type = 'shift', date, startTime, endTime, notes = '', is_all_day = false, is_recurring = false, status = 'open' } = ev;

      // A recurring shift becomes one row per week, on the same weekday.
      const dates = is_recurring
        ? Array.from({ length: RECURRENCE_WEEKS }, (_, week) => addDaysToDateString(date, week * 7))
        : [date];

      for (const occurrence of dates) {
        const { rows } = await sql`
          INSERT INTO events (type, date, "startTime", "endTime", notes, is_all_day, is_recurring, status)
          VALUES (${type}, ${occurrence}, ${startTime}, ${endTime}, ${notes}, ${is_all_day}, ${is_recurring}, ${status})
          RETURNING *
        `;
        createdEvents.push(rows[0]);
      }
    }

    // Count what was actually created, not what was asked for: one recurring
    // request becomes several shifts, and the drivers care about the shifts.
    const created = createdEvents.length;
    const publisher = session.user.displayName;
    await notify('members', {
      title: 'New Shifts Available',
      body: `${publisher} published ${created} new shift(s).`,
      subject: `${publisher} published ${created} new shift(s)`,
      html: `<p><strong>${escapeHtml(publisher)}</strong> has published <strong>${created}</strong> new shift(s) to the schedule.</p><p>Please check the <a href="${SITE_URL}">Commute Calendar</a> to submit your availability.</p>`,
      actorId: session.user.userId,
    });

    return NextResponse.json({ success: true, events: createdEvents });
  } catch (error) {
    return serverError('Batch create failed', error);
  }
}
