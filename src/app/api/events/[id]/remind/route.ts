import { NextResponse } from 'next/server';
import { sql } from '@vercel/postgres';
import { listRecipients, requireAdmin } from '@/lib/auth';
import { emailFooter, notify } from '@/lib/notify';
import { parseEventId } from '@/lib/events';
import { formatDateString, formatTimeString } from '@/lib/schedule-dates';
import { serverError } from '@/lib/http';
import { personInList } from '@/lib/identity';

export const dynamic = 'force-dynamic';

interface ShiftRow {
  id: number;
  date: string;
  startTime: string;
  claimed_by: string | null;
  status: string;
  declined_by: string[] | null;
  declined_by_ids: string[] | null;
}

/**
 * Chase the drivers who have not answered one specific shift.
 *
 * Admin only. This is a notification anyone can trigger on demand, so leaving
 * it open to drivers would let any of them repeatedly buzz the others.
 *
 * "Has not answered" means exactly that: a driver who claimed the shift or
 * declined it has already said what they intend to do, and reminding them is
 * how a reminder becomes noise people learn to ignore. Admins are excluded too
 * -- they schedule shifts rather than drive them.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireAdmin();
  if (!session.ok) return session.response;

  try {
    const id = parseEventId((await params).id);
    if (id === null) {
      return NextResponse.json({ error: 'Invalid event id' }, { status: 400 });
    }

    const { rows } = await sql<ShiftRow>`
      SELECT id, date, "startTime", claimed_by, status, declined_by, declined_by_ids
      FROM events WHERE id = ${id}
    `;
    const shift = rows[0];
    if (!shift) {
      return NextResponse.json({ error: 'Event not found' }, { status: 404 });
    }

    // Somebody is already driving. There is nothing left to chase, and saying
    // so is more useful than sending nothing without explanation.
    if (shift.status === 'claimed') {
      return NextResponse.json({
        notified: 0,
        reason: 'covered',
        claimed_by: shift.claimed_by,
      });
    }

    // Matched by id with a name fallback, so a driver who declined before the
    // identity migration -- or who has renamed themselves since -- is not
    // chased about a shift they already answered.
    const outstanding = (await listRecipients()).filter(
      (r) => !r.isAdmin && !personInList(shift.declined_by_ids, shift.declined_by, r),
    );

    if (outstanding.length === 0) {
      return NextResponse.json({ notified: 0, reason: 'everyone_responded' });
    }

    const when = `${formatDateString(shift.date)} at ${formatTimeString(shift.startTime)}`;
    await notify(
      { userIds: outstanding.map((r) => r.userId) },
      {
        title: 'Can you take this shift?',
        body: `${when} still needs a driver.`,
        subject: `Reminder: ${when} still needs a driver`,
        html: `<p>The shift on <strong>${when}</strong> is still waiting on an answer from you.</p>${emailFooter()}`,
      },
    );

    return NextResponse.json({
      notified: outstanding.length,
      drivers: outstanding.map((r) => r.displayName),
    });
  } catch (error) {
    return serverError('Reminder failed', error);
  }
}
