import { NextResponse } from 'next/server';
import { sql } from '@vercel/postgres';
import { Resend } from 'resend';
import { sendPushNotification } from '@/lib/push';

const resend = new Resend(process.env.RESEND_API_KEY || 're_dummy_key_for_build');

export async function POST(request: Request) {
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
    
    try {
      await resend.emails.send({
        from: 'Commute Calendar <onboarding@resend.dev>',
        to: ['travis.riddlexx@gmail.com'], 
        subject: `Travis published ${events.length} new shifts!`,
        html: `<p>Travis has published <strong>${events.length}</strong> new shifts to the schedule.</p><p>Please check the <a href="https://schedule.triddle.dev">Commute Calendar</a> to submit your availability.</p>`
      });
      
      await sendPushNotification('Austin', {
        title: 'New Shifts Available',
        body: `Travis has published ${events.length} new shifts.`
      });
      await sendPushNotification('Karey', {
        title: 'New Shifts Available',
        body: `Travis has published ${events.length} new shifts.`
      });
    } catch (e) {
      console.error('Failed to send email:', e);
    }
    
    return NextResponse.json({ success: true, events: createdEvents });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
