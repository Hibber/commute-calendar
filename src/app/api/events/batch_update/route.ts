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
      const { id, claimed_by, status, claim_type, declined_by_austin, declined_by_karey } = update;
      
      const { rows } = await sql`
        UPDATE events 
        SET 
          claimed_by = COALESCE(${claimed_by !== undefined ? claimed_by : null}, claimed_by), 
          status = COALESCE(${status !== undefined ? status : null}, status),
          claim_type = COALESCE(${claim_type !== undefined ? claim_type : null}, claim_type),
          declined_by_austin = COALESCE(${declined_by_austin !== undefined ? declined_by_austin : null}, declined_by_austin),
          declined_by_karey = COALESCE(${declined_by_karey !== undefined ? declined_by_karey : null}, declined_by_karey)
        WHERE id = ${id} 
        RETURNING *
      `;
      
      const event = rows[0];
      updatedEvents.push(event);

      // Add to summary email
      let actionStr = '';
      if (status === 'claimed') {
        actionStr = claim_type === 'borrow' ? 'offered their car' : 'claimed the shift (driving)';
      } else {
        actionStr = 'declined the shift';
      }
      summaryHtml += `<li><strong>${event.date}</strong> at <strong>${event.startTime}</strong>: ${actionStr}</li>`;

      // Check for urgent double-decline
      if (event.declined_by_austin && event.declined_by_karey) {
        urgentEmails.push({
          date: event.date,
          startTime: event.startTime
        });
      }
    }

    summaryHtml += '</ul><p>Check the <a href="https://schedule.triddle.dev">Commute Calendar</a> for full details.</p>';

    try {
      // 1. Send the batched summary email
      await resend.emails.send({
        from: 'Commute Calendar <onboarding@resend.dev>',
        to: ['travis.riddlexx@gmail.com'],
        subject: `Schedule Update: ${driver_name} submitted choices`,
        html: summaryHtml
      });

      // Send standard push notification to Travis
      await sendPushNotification('Travis', {
        title: 'Schedule Updated',
        body: `${driver_name} submitted choices for ${updates.length} shift(s).`
      });

      // 2. Send urgent double-decline emails/pushes if any occurred
      for (const urgent of urgentEmails) {
        await resend.emails.send({
          from: 'Commute Calendar <onboarding@resend.dev>',
          to: ['travis.riddlexx@gmail.com'],
          subject: `URGENT: No Coverage for Shift`,
          html: `<p>Both Austin and Karey have declined the shift on <strong>${urgent.date}</strong> at <strong>${urgent.startTime}</strong>.</p><p>You will need to arrange alternate transportation.</p>`
        });
        
        await sendPushNotification('Travis', {
          title: '🚨 No Coverage for Shift',
          body: `Austin and Karey both declined ${urgent.date} at ${urgent.startTime}.`
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
