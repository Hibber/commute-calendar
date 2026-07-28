import { NextResponse } from 'next/server';
import { Resend } from 'resend';
import { sendPushNotification } from '@/lib/push';
import { requireUser } from '@/lib/auth';
import { applyShiftAction, isShiftAction, parseEventId, type ShiftAction } from '@/lib/events';

const resend = new Resend(process.env.RESEND_API_KEY || 're_dummy_key_for_build');

export async function PUT(request: Request) {
  const session = await requireUser();
  if (!session.ok) return session.response;
  // The submitting driver is taken from the session, never from the request
  // body, so a caller cannot submit choices on someone else's behalf.
  const driverName = session.user.displayName;

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

    for (const { id, action } of parsed) {
      const result = await applyShiftAction(id, action, driverName);

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
        actionStr = action === 'borrow' ? 'offered their car' : 'claimed the shift (driving)';
      }
      summaryItems.push(`<li><strong>${event.date}</strong> at <strong>${event.startTime}</strong>: ${actionStr}</li>`);

      // Check for urgent double-decline
      if (event.declined_by && event.declined_by.length >= 2) {
        urgentEmails.push({
          date: event.date,
          startTime: event.startTime,
          declined_by: event.declined_by
        });
      }
    }

    let summaryHtml = `<p><strong>${driverName}</strong> submitted choices for ${updatedEvents.length} shift(s):</p><ul>`;
    summaryHtml += summaryItems.join('');
    summaryHtml += '</ul>';
    if (conflicts.length > 0) {
      summaryHtml += `<p>${conflicts.length} shift(s) were already claimed by someone else and were left unchanged.</p>`;
    }
    summaryHtml += '<p>Check the <a href="https://schedule.triddle.dev">Commute Calendar</a> for full details.</p>';

    try {
      // 1. Send the batched summary email. Skipped when the whole batch lost a
      // race, so nobody is notified about changes that did not happen.
      if (updatedEvents.length > 0) {
        const { error: summaryError } = await resend.emails.send({
          from: 'Commute Calendar <notifications@triddle.dev>',
          to: ['travis.riddlexx@gmail.com'],
          subject: `Schedule Update: ${driverName} submitted choices`,
          html: summaryHtml
        });
        if (summaryError) console.error('Resend API Error (Summary):', summaryError);

        // Send standard push notification to Travis
        await sendPushNotification('Travis', {
          title: 'Schedule Updated',
          body: `${driverName} submitted choices for ${updatedEvents.length} shift(s).`
        });
      }

      // 2. Send urgent double-decline emails/pushes if any occurred
      for (const urgent of urgentEmails) {
        const { error: urgentError } = await resend.emails.send({
          from: 'Commute Calendar <notifications@triddle.dev>',
          to: ['travis.riddlexx@gmail.com'],
          subject: `URGENT: No Coverage for Shift`,
          html: `<p>The shift on <strong>${urgent.date}</strong> at <strong>${urgent.startTime}</strong> has been declined by ${urgent.declined_by.join(' and ')}.</p><p>You will need to arrange alternate transportation.</p>`
        });
        if (urgentError) console.error('Resend API Error (Urgent):', urgentError);

        await sendPushNotification('Travis', {
          title: '🚨 No Coverage for Shift',
          body: `Shift on ${urgent.date} at ${urgent.startTime} was declined by ${urgent.declined_by.join(', ')}.`
        });
      }
    } catch (e) {
      console.error('Failed to send emails:', e);
    }

    return NextResponse.json({ success: true, events: updatedEvents, conflicts });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
