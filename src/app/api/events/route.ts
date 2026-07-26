import { NextResponse } from 'next/server';
import { sql } from '@vercel/postgres';
import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const { rows } = await sql`SELECT * FROM events`;
    return NextResponse.json({ events: rows });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { type, date, startTime, endTime, notes = '', is_all_day = false, is_recurring = false, claimed_by = null, status = 'open' } = body;
    
    if (!type || !date || !startTime || !endTime) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const { rows } = await sql`
      INSERT INTO events (type, date, "startTime", "endTime", notes, is_all_day, is_recurring, claimed_by, status)
      VALUES (${type}, ${date}, ${startTime}, ${endTime}, ${notes}, ${is_all_day}, ${is_recurring}, ${claimed_by}, ${status})
      RETURNING *
    `;
    
    if (type === 'shift') {
      try {
        await resend.emails.send({
          from: 'Commute Calendar <onboarding@resend.dev>',
          to: ['travis@triddle.dev'], // Replace with verified recipient or domain
          subject: 'New Commute Shift Scheduled',
          html: `<p>A new commute shift has been scheduled for <strong>${date}</strong> from <strong>${startTime}</strong> to <strong>${endTime}</strong>.</p><p>Please check the <a href="https://schedule.triddle.dev">Commute Calendar</a>.</p>`
        });
      } catch (e) {
        console.error('Failed to send email:', e);
      }
    }
    
    return NextResponse.json(rows[0]);
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
