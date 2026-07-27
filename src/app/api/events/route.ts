import { NextResponse } from 'next/server';
import { sql } from '@vercel/postgres';
import { Resend } from 'resend';

// Vercel build will crash if this is undefined during static analysis, so we provide a fallback
const resend = new Resend(process.env.RESEND_API_KEY || 're_dummy_key_for_build');

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const { rows } = await sql`
      SELECT e.*, 
        COALESCE(
          (
            SELECT json_agg(json_build_object(
              'id', c.id, 
              'author_name', c.author_name, 
              'content', c.content, 
              'created_at', c.created_at
            ) ORDER BY c.created_at ASC)
            FROM comments c
            WHERE c.event_id = e.id
          ), 
          '[]'::json
        ) as comments
      FROM events e
    `;
    return NextResponse.json({ events: rows });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    // Default status is now 'open' for shifts. 
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
          from: 'Commute Calendar <notifications@triddle.dev>',
          to: ['austin.m.rosner@gmail.com', 'klriddle70@gmail.com'], 
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
