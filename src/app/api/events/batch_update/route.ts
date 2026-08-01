import { NextResponse } from 'next/server';
import { listCoveringDrivers, requireUser } from '@/lib/auth';
import { emailFooter, escapeHtml, notify } from '@/lib/notify';
import { serverError } from '@/lib/http';
import { applyShiftAction, isShiftAction, parseEventId, type ShiftAction } from '@/lib/events';
import { isUncovered } from '@/lib/coverage';

export async function PUT(request: Request) {
  const session = await requireUser();
  if (!session.ok) return session.response;
  // The submitting driver is taken from the session, never from the request
  // body, so a caller cannot submit choices on someone else's behalf.
  const driverName = session.user.displayName;
  const actor = { userId: session.user.userId, displayName: driverName };

  try {
    const { updates } = await request.json();

    if (!updates || !Array.isArray(updates) || updates.length === 0) {
      return NextResponse.json({ error: 'No updates provided' }, { status: 400 });
    }

    const parsed: { id: number; action: ShiftAction }[] = [];
    for (const update of updates) {
      const id = parseEventId(update?.id);
      const action = update?.action;
      if (id === null || !isShiftAction(action)) {
        return NextResponse.json(
          { error: "Each update needs an id and an action of 'drive', 'borrow' or 'decline'" },
          { status: 400 },
        );
      }
      parsed.push({ id, action });
    }

    const updatedEvents = [];
    const urgentEmails = [];
    // Shifts another driver claimed first. The rest of the batch still applies;
    // these are reported back so the submitter learns what did not take.
    const conflicts: { id: number; date: string; startTime: string; claimed_by: string }[] = [];
    // `claimed_by` is what made the claim conflict, so it is set; fall back
    // rather than surfacing a bare "null" if the row is ever inconsistent.

    const summaryItems: string[] = [];

    // Resolved once for the whole batch rather than per shift.
    const coveringDrivers = await listCoveringDrivers();

    for (const { id, action } of parsed) {
      const result = await applyShiftAction(id, action, actor);

      if (result.outcome === 'not_found') continue;

      if (result.outcome === 'conflict') {
        conflicts.push({
          id,
          date: result.event.date,
          startTime: result.event.startTime,
          claimed_by: result.event.claimed_by ?? 'another driver',
        });
        continue;
      }

      const event = result.event;
      updatedEvents.push(event);

      // Add to summary email
      let actionStr = '';
      if (action === 'decline') {
        actionStr = 'declined the shift';
      } else {
        actionStr = action === 'borrow' ? 'offered their car' : 'is driving (you are riding with them)';
      }
      summaryItems.push(`<li><strong>${escapeHtml(event.date)}</strong> at <strong>${escapeHtml(event.startTime)}</strong>: ${actionStr}</li>`);

      // Nobody left who could drive this one.
      if (isUncovered(event, coveringDrivers)) {
        urgentEmails.push({
          date: event.date,
          startTime: event.startTime,
          declined_by: event.declined_by ?? []
        });
      }
    }

    let summaryHtml = `<p><strong>${escapeHtml(driverName)}</strong> submitted choices for ${updatedEvents.length} shift(s):</p><ul>`;
    summaryHtml += summaryItems.join('');
    summaryHtml += '</ul>';
    if (conflicts.length > 0) {
      summaryHtml += `<p>${conflicts.length} shift(s) were already claimed by someone else and were left unchanged.</p>`;
    }
    summaryHtml += emailFooter();

    // 1. The batched summary goes to whoever manages the schedule. Skipped when
    // the whole batch lost a race, so nobody hears about changes that did not
    // happen.
    if (updatedEvents.length > 0) {
      await notify('admins', {
        title: 'Schedule Updated',
        body: `${driverName} submitted choices for ${updatedEvents.length} shift(s).`,
        subject: `Schedule Update: ${driverName} submitted choices`,
        html: summaryHtml,
        actorId: session.user.userId,
      });
    }

    // 2. A shift both drivers declined has nobody covering it. That is worth
    // interrupting the admins about, per shift.
    for (const urgent of urgentEmails) {
      await notify('admins', {
        title: '🚨 No Coverage for Shift',
        body: `Shift on ${urgent.date} at ${urgent.startTime} was declined by ${urgent.declined_by.join(', ')}.`,
        subject: 'URGENT: No Coverage for Shift',
        html: `<p>The shift on <strong>${escapeHtml(urgent.date)}</strong> at <strong>${escapeHtml(urgent.startTime)}</strong> has been declined by ${urgent.declined_by.map(escapeHtml).join(' and ')}.</p><p>You will need to arrange alternate transportation.</p>`,
      });
    }

    return NextResponse.json({ success: true, events: updatedEvents, conflicts });
  } catch (error) {
    return serverError('Batch update failed', error);
  }
}
