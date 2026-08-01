import { NextResponse } from 'next/server';
import { sql } from '@vercel/postgres';
import { requireAdmin, requireUser } from '@/lib/auth';
import { emailFooter, escapeHtml, notify } from '@/lib/notify';
import { serverError } from '@/lib/http';

export const dynamic = 'force-dynamic';

export async function GET() {
  const session = await requireUser();
  if (!session.ok) return session.response;

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
    return serverError('Listing events failed', error);
  }
}

export async function POST(request: Request) {
  const session = await requireAdmin();
  if (!session.ok) return session.response;

  try {
    const body = await request.json();
    // Default status is now 'open' for shifts.
    const { type, date, startTime, endTime, notes = '', is_all_day = false, is_recurring = false, status = 'open' } = body;

    if (!type || !date || !startTime || !endTime) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // A new shift always starts unclaimed. `claimed_by` is no longer accepted
    // from the request body -- it is only ever set by a driver claiming a shift
    // as themselves, via the shift action routes.
    const { rows } = await sql`
      INSERT INTO events (type, date, "startTime", "endTime", notes, is_all_day, is_recurring, claimed_by, status)
      VALUES (${type}, ${date}, ${startTime}, ${endTime}, ${notes}, ${is_all_day}, ${is_recurring}, ${null}, ${status})
      RETURNING *
    `;

    if (type === 'shift') {
      await notify('members', {
        title: 'New Shift Scheduled',
        body: `A shift was added on ${date} from ${startTime} to ${endTime}.`,
        subject: 'New Commute Shift Scheduled',
        html: `<p>A new commute shift has been scheduled for <strong>${escapeHtml(date)}</strong> from <strong>${escapeHtml(startTime)}</strong> to <strong>${escapeHtml(endTime)}</strong>.</p>${emailFooter()}`,
        actorId: session.user.userId,
      });
    }

    return NextResponse.json(rows[0]);
  } catch (error) {
    return serverError('Creating event failed', error);
  }
}
