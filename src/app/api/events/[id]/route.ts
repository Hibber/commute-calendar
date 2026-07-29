import { NextResponse } from 'next/server';
import { sql } from '@vercel/postgres';
import { Resend } from 'resend';
import { requireAdmin, requireUser } from '@/lib/auth';
import { applyShiftAction, isShiftAction, parseEventId } from '@/lib/events';

// Vercel build will crash if this is undefined during static analysis, so we provide a fallback
const resend = new Resend(process.env.RESEND_API_KEY || 're_dummy_key_for_build');

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireAdmin();
  if (!session.ok) return session.response;

  try {
    const id = parseEventId((await params).id);
    if (id === null) {
      return NextResponse.json({ error: 'Invalid event id' }, { status: 400 });
    }

    await sql`DELETE FROM events WHERE id = ${id}`;
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireUser();
  if (!session.ok) return session.response;
  const { displayName, isAdmin } = session.user;

  try {
    const id = parseEventId((await params).id);
    if (id === null) {
      return NextResponse.json({ error: 'Invalid event id' }, { status: 400 });
    }

    const body = await request.json();
    const { action, startTime, endTime } = body;

    // Admin path: reschedule the shift.
    if (startTime !== undefined || endTime !== undefined) {
      if (!isAdmin) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }
      if (!startTime || !endTime) {
        return NextResponse.json({ error: 'Both startTime and endTime are required' }, { status: 400 });
      }

      const { rows } = await sql`
        UPDATE events
        SET "startTime" = ${startTime}, "endTime" = ${endTime}
        WHERE id = ${id}
        RETURNING *
      `;
      if (!rows[0]) {
        return NextResponse.json({ error: 'Event not found' }, { status: 404 });
      }
      return NextResponse.json(rows[0]);
    }

    // Driver path: claim, offer a car, or decline -- always as the signed-in user.
    if (!isShiftAction(action)) {
      return NextResponse.json(
        { error: "action must be one of 'drive', 'borrow', 'decline'" },
        { status: 400 },
      );
    }

    const result = await applyShiftAction(id, action, displayName);
    if (result.outcome === 'not_found') {
      return NextResponse.json({ error: 'Event not found' }, { status: 404 });
    }
    if (result.outcome === 'conflict') {
      return NextResponse.json(
        {
          error: `This shift was already claimed by ${result.event.claimed_by}.`,
          claimed_by: result.event.claimed_by,
        },
        { status: 409 },
      );
    }
    const event = result.event;

    try {
      if (action === 'decline') {
        if (event.declined_by && event.declined_by.length >= 2) {
          await resend.emails.send({
            from: 'Commute Calendar <notifications@triddle.dev>',
            to: ['travis.riddlexx@gmail.com'],
            subject: `URGENT: No Coverage for Shift`,
            html: `<p>The shift on <strong>${event.date}</strong> at <strong>${event.startTime}</strong> has been declined by ${event.declined_by.join(' and ')}.</p><p>You will need to arrange alternate transportation.</p>`
          });
        }
      } else {
        const subjectText = action === 'borrow'
          ? `${displayName} offered their car for a shift`
          : `Riding with ${displayName} for a shift`;

        const bodyText = action === 'borrow'
          ? 'has offered their car for'
          : 'is driving for';

        await resend.emails.send({
          from: 'Commute Calendar <notifications@triddle.dev>',
          to: ['travis.riddlexx@gmail.com'],
          subject: subjectText,
          html: `<p><strong>${displayName}</strong> ${bodyText} the shift on <strong>${event.date}</strong> at <strong>${event.startTime}</strong>.</p><p>Check the <a href="https://schedule.triddle.dev">Commute Calendar</a> for details.</p>`
        });
      }
    } catch (e) {
      console.error('Failed to send email:', e);
    }

    return NextResponse.json(event);
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
