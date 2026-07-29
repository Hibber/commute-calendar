import { NextResponse } from 'next/server';
import { sql } from '@vercel/postgres';
import { requireAdmin } from '@/lib/auth';
import { notify } from '@/lib/notify';

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
      const { rows } = await sql`
        INSERT INTO events (type, date, "startTime", "endTime", notes, is_all_day, is_recurring, status)
        VALUES (${type}, ${date}, ${startTime}, ${endTime}, ${notes}, ${is_all_day}, ${is_recurring}, ${status})
        RETURNING *
      `;
      createdEvents.push(rows[0]);
    }
    
    const publisher = session.user.displayName;
    await notify('members', {
      title: 'New Shifts Available',
      body: `${publisher} published ${events.length} new shift(s).`,
      subject: `${publisher} published ${events.length} new shift(s)`,
      html: `<p><strong>${publisher}</strong> has published <strong>${events.length}</strong> new shift(s) to the schedule.</p><p>Please check the <a href="https://schedule.triddle.dev">Commute Calendar</a> to submit your availability.</p>`,
      actor: publisher,
    });
    
    return NextResponse.json({ success: true, events: createdEvents });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
