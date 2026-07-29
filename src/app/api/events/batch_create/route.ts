import { NextResponse } from 'next/server';
import { sql } from '@vercel/postgres';
import { requireAdmin } from '@/lib/auth';
import { notify } from '@/lib/notify';
import { addDaysToDateString } from '@/lib/schedule-dates';

/**
 * How many weeks a recurring shift covers, counting the one being created.
 *
 * Recurrences are materialised as ordinary independent rows rather than being
 * stored as a rule and expanded on read. That is what makes deleting a single
 * day behave the way it should: the row is simply gone, and no series
 * definition survives to resurrect it or to make the gap need modelling.
 */
const RECURRENCE_WEEKS = 3;

export async function POST(request: Request) {
  const session = await requireAdmin();
  if (!session.ok) return session.response;

  try {
    const { events } = await request.json();
    
    if (!events || !Array.isArray(events) || events.length === 0) {
      return NextResponse.json({ error: 'No events provided' }, { status: 400 });
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
      html: `<p><strong>${publisher}</strong> has published <strong>${created}</strong> new shift(s) to the schedule.</p><p>Please check the <a href="https://schedule.triddle.dev">Commute Calendar</a> to submit your availability.</p>`,
      actor: publisher,
    });

    return NextResponse.json({ success: true, events: createdEvents });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
