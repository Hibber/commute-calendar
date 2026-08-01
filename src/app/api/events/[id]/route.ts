import { NextResponse } from 'next/server';
import { sql } from '@vercel/postgres';
import { listCoveringDrivers, listDrivers, requireAdmin, requireUser, resolveOwner } from '@/lib/auth';
import type { PersonRef } from '@/lib/identity';
import { emailFooter, escapeHtml, notify } from '@/lib/notify';
import { applyShiftAction, isShiftAction, parseEventId } from '@/lib/events';
import { isUncovered } from '@/lib/coverage';
import { serverError } from '@/lib/http';
import { formatDateString, formatTimeString, todayInScheduleZone } from '@/lib/schedule-dates';

interface EventRow {
  id: number;
  type: string;
  date: string;
  startTime: string;
  endTime: string;
  claimed_by: string | null;
  claimed_by_id: string | null;
}

/**
 * Whether a change to this row is worth telling anyone about.
 *
 * Only shifts, and only ones that have not already happened -- pruning last
 * month's schedule should not notify the carpool about each row.
 */
function isNoteworthy(row: Pick<EventRow, 'type' | 'date'>): boolean {
  return row.type === 'shift' && row.date >= todayInScheduleZone();
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireAdmin();
  if (!session.ok) return session.response;

  try {
    const id = parseEventId((await params).id);
    if (id === null) {
      return NextResponse.json({ error: 'Invalid event id' }, { status: 400 });
    }

    // Returned rather than discarded: the row is needed to say what was
    // cancelled, and who had claimed it.
    const { rows } = await sql<EventRow>`DELETE FROM events WHERE id = ${id} RETURNING *`;
    const deleted = rows[0];

    if (deleted && isNoteworthy(deleted)) {
      const when = `${formatDateString(deleted.date)} at ${formatTimeString(deleted.startTime)}`;
      const claimer = await resolveOwner({
        ownerId: deleted.claimed_by_id,
        ownerName: deleted.claimed_by,
      });

      if (claimer) {
        // Someone had committed to this one, so it is their plan that changed.
        await notify(
          { userIds: [claimer.userId] },
          {
            title: 'Shift cancelled',
            body: `The shift you claimed on ${when} was cancelled.`,
            subject: 'A shift you claimed was cancelled',
            html: `<p>The shift on <strong>${escapeHtml(when)}</strong>, which you had claimed, was cancelled by ${escapeHtml(session.user.displayName)}.</p>${emailFooter()}`,
            actorId: session.user.userId,
          },
        );
      } else {
        // Unclaimed, or claimed by someone who has since left the carpool.
        // Nobody is counting on it; a buzz is enough, an email is not.
        await notify('members', {
          title: 'Shift removed',
          body: `The unclaimed shift on ${when} was removed.`,
          actorId: session.user.userId,
        });
      }
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    return serverError('Deleting event failed', error);
  }
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireUser();
  if (!session.ok) return session.response;
  const { userId, displayName, isAdmin } = session.user;

  try {
    const id = parseEventId((await params).id);
    if (id === null) {
      return NextResponse.json({ error: 'Invalid event id' }, { status: 400 });
    }

    const body = await request.json();
    const { action, startTime, endTime, onBehalfOf, override } = body;

    // Admin path: reschedule the shift.
    if (startTime !== undefined || endTime !== undefined) {
      if (!isAdmin) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }
      if (!startTime || !endTime) {
        return NextResponse.json({ error: 'Both startTime and endTime are required' }, { status: 400 });
      }

      // Read first so the notification can say what the times were, not just
      // what they now are -- "moved to 7:30" is not actionable on its own.
      const { rows: before } = await sql<EventRow>`SELECT * FROM events WHERE id = ${id}`;
      const previous = before[0];
      if (!previous) {
        return NextResponse.json({ error: 'Event not found' }, { status: 404 });
      }

      const { rows } = await sql<EventRow>`
        UPDATE events
        SET "startTime" = ${startTime}, "endTime" = ${endTime}
        WHERE id = ${id}
        RETURNING *
      `;
      if (!rows[0]) {
        return NextResponse.json({ error: 'Event not found' }, { status: 404 });
      }

      const moved = previous.startTime !== startTime || previous.endTime !== endTime;
      if (moved && isNoteworthy(previous)) {
        const day = formatDateString(previous.date);
        const wasRange = `${formatTimeString(previous.startTime)}–${formatTimeString(previous.endTime)}`;
        const nowRange = `${formatTimeString(startTime)}–${formatTimeString(endTime)}`;

        const claimer = await resolveOwner({
          ownerId: previous.claimed_by_id,
          ownerName: previous.claimed_by,
        });

        if (claimer) {
          await notify(
            { userIds: [claimer.userId] },
            {
              title: 'Shift time changed',
              body: `Your shift on ${day} moved to ${nowRange} (was ${wasRange}).`,
              subject: 'A shift you claimed was rescheduled',
              html: `<p>The shift you claimed on <strong>${escapeHtml(day)}</strong> now runs <strong>${escapeHtml(nowRange)}</strong>, moved from ${escapeHtml(wasRange)} by ${escapeHtml(displayName)}.</p>${emailFooter()}`,
              actorId: userId,
            },
          );
        } else {
          // Unclaimed, but the new time is exactly what people decide on.
          await notify('members', {
            title: 'Shift time changed',
            body: `The open shift on ${day} moved to ${nowRange} (was ${wasRange}).`,
            subject: 'An open shift was rescheduled',
            html: `<p>The open shift on <strong>${escapeHtml(day)}</strong> now runs <strong>${escapeHtml(nowRange)}</strong>, moved from ${escapeHtml(wasRange)} by ${escapeHtml(displayName)}.</p>${emailFooter()}`,
            actorId: userId,
          });
        }
      }

      return NextResponse.json(rows[0]);
    }

    // Driver path: claim, offer a car, or decline.
    if (!isShiftAction(action)) {
      return NextResponse.json(
        { error: "action must be one of 'drive', 'borrow', 'decline'" },
        { status: 400 },
      );
    }

    // Normally the action is attributed to the signed-in user and nobody else.
    // An admin may file one for another driver, but only for someone on the
    // roster -- never an arbitrary string from the request body.
    let actor: PersonRef = { userId, displayName };
    const onBehalf = onBehalfOf !== undefined && onBehalfOf !== null && onBehalfOf !== displayName;
    if (onBehalf) {
      if (!isAdmin) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }
      // Resolved to a real member so the claim is recorded against their id,
      // not just the name the client happened to send.
      const roster = await listDrivers();
      const target =
        typeof onBehalfOf === 'string'
          ? roster.find((driver) => driver.displayName === onBehalfOf)
          : undefined;
      if (!target) {
        return NextResponse.json({ error: 'Unknown driver' }, { status: 400 });
      }
      actor = target;
    }
    const actingAs = actor.displayName;

    const result = await applyShiftAction(id, action, actor, {
      // Overriding an existing claim is an admin-only act of reassignment.
      override: isAdmin && override === true,
    });
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

    if (action === 'decline') {
      if (isUncovered(event, await listCoveringDrivers())) {
        const declined = event.declined_by ?? [];
        await notify('admins', {
          title: '🚨 No Coverage for Shift',
          body: `Shift on ${event.date} at ${event.startTime} was declined by ${declined.join(', ')}.`,
          subject: 'URGENT: No Coverage for Shift',
          html: `<p>The shift on <strong>${escapeHtml(event.date)}</strong> at <strong>${escapeHtml(event.startTime)}</strong> has been declined by ${declined.map(escapeHtml).join(' and ')}.</p><p>You will need to arrange alternate transportation.</p>`,
        });
      }
    } else {
      const subjectText = action === 'borrow'
        ? `${actingAs} offered their car for a shift`
        : `Riding with ${actingAs} for a shift`;

      const bodyText = action === 'borrow'
        ? 'has offered their car for'
        : 'is driving for';

      // Say so when this was filed by an admin rather than by the driver, so
      // the notification is not mistaken for the driver's own choice.
      const attribution = onBehalf
        ? `<p style="color:#666;font-size:0.9em">Recorded by ${escapeHtml(displayName)}.</p>`
        : '';

      await notify('admins', {
        title: subjectText,
        body: `${actingAs} ${bodyText} the shift on ${event.date} at ${event.startTime}.`,
        html: `<p><strong>${escapeHtml(actingAs)}</strong> ${bodyText} the shift on <strong>${escapeHtml(event.date)}</strong> at <strong>${escapeHtml(event.startTime)}</strong>.</p>${attribution}${emailFooter()}`,
        // The admin filing an act-as is the actor; the driver it is filed for
        // still hears about it if they are an admin themselves.
        actorId: userId,
      });
    }

    return NextResponse.json(event);
  } catch (error) {
    return serverError('Updating event failed', error);
  }
}
