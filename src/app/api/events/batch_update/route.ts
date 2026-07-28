import { NextResponse } from 'next/server';
import { sql } from '@vercel/postgres';
import { Resend } from 'resend';
import { sendPushNotification } from '@/lib/push';

const resend = new Resend(process.env.RESEND_API_KEY || 're_dummy_key_for_build');

export async function PUT(request: Request) {
  try {
    const { updates, driver_name } = await request.json();
    
    if (!updates || !Array.isArray(updates) || updates.length === 0) {
      return NextResponse.json({ error: 'No updates provided' }, { status: 400 });
    }

    const updatedEvents = [];
    const urgentEmails = [];
    
    let summaryHtml = `<p><strong>${driver_name}</strong> submitted choices for ${updates.length} shift(s):</p><ul>`;

    for (const update of updates) {
      const { id, claimed_by, status, claim_type, declined_by } = update;
      
      let declineArrayStr: string | null = null;
      if (declined_by !== undefined) {
        const arr = Array.isArray(declined_by) ? declined_by : [declined_by];
        declineArrayStr = `{${arr.map(n => `"${n.replace(/"/g, '""')}"`).join(',')}}`;
      }
      
      const { rows } = await sql`
        UPDATE events 
        SET 
          claimed_by = CASE WHEN ${claimed_by === undefined}::boolean THEN claimed_by ELSE ${claimed_by} END, 
          status = CASE WHEN ${status === undefined}::boolean THEN status ELSE ${status} END,
          claim_type = CASE WHEN ${claim_type === undefined}::boolean THEN claim_type ELSE ${claim_type} END,
          declined_by = CASE WHEN ${declineArrayStr === null}::boolean THEN declined_by ELSE ${declineArrayStr}::text[] END
        WHERE id = ${id} 
        RETURNING *
      `;
      
      const event = rows[0];
      updatedEvents.push(event);

      // Add to summary email
      let actionStr = '';
      if (status === 'claimed') {
        actionStr = claim_type === 'borrow' ? 'offered their car' : 'is driving (you are riding with them)';
      } else {
        actionStr = 'declined the shift';
      }
      summaryHtml += `<li><strong>${event.date}</strong> at <strong>${event.startTime}</strong>: ${actionStr}</li>`;

      // Check for urgent double-decline
      if (event.declined_by && event.declined_by.length >= 2) {
        urgentEmails.push({
          date: event.date,
          startTime: event.startTime,
          declined_by: event.declined_by
        });
      }
    }

    summaryHtml += '</ul><p>Check the <a href="https://schedule.triddle.dev">Commute Calendar</a> for full details.</p>';

    try {
      // 1. Send the batched summary email
      const { error: summaryError } = await resend.emails.send({
        from: 'Commute Calendar <notifications@triddle.dev>',
        to: ['travis.riddlexx@gmail.com'],
        subject: `Schedule Update: ${driver_name} submitted choices`,
        html: summaryHtml
      });
      if (summaryError) console.error('Resend API Error (Summary):', summaryError);

      // Send standard push notification to Travis
      await sendPushNotification('Travis', {
        title: 'Schedule Updated',
        body: `${driver_name} submitted choices for ${updates.length} shift(s).`
      });

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

    return NextResponse.json({ success: true, events: updatedEvents });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
