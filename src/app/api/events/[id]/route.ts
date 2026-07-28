import { NextResponse } from 'next/server';
import { sql } from '@vercel/postgres';
import { Resend } from 'resend';

// Vercel build will crash if this is undefined during static analysis, so we provide a fallback
const resend = new Resend(process.env.RESEND_API_KEY || 're_dummy_key_for_build');

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const resolvedParams = await params;
    const id = resolvedParams.id;
    await sql`DELETE FROM events WHERE id = ${id}`;
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const resolvedParams = await params;
    const id = resolvedParams.id;
    const body = await request.json();
    
    // Support the new fields
    const { claimed_by, status, claim_type, declined_by } = body;
    
    // We expect declined_by to be an array of strings if provided
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
    
    try {
      const event = rows[0];
      if (status === 'claimed') {
        const actionText = claim_type === 'borrow' ? 'offered their car for' : 'claimed';
        await resend.emails.send({
          from: 'Commute Calendar <notifications@triddle.dev>',
          to: ['travis.riddlexx@gmail.com'],
          subject: `Shift ${actionText} by ${claimed_by}`,
          html: `<p><strong>${claimed_by}</strong> has ${actionText} the shift on <strong>${event.date}</strong> at <strong>${event.startTime}</strong>.</p><p>Check the <a href="https://schedule.triddle.dev">Commute Calendar</a> for details.</p>`
        });
      } else if (event.declined_by && event.declined_by.length >= 2) {
        await resend.emails.send({
          from: 'Commute Calendar <notifications@triddle.dev>',
          to: ['travis.riddlexx@gmail.com'],
          subject: `URGENT: No Coverage for Shift`,
          html: `<p>The shift on <strong>${event.date}</strong> at <strong>${event.startTime}</strong> has been declined by ${event.declined_by.join(' and ')}.</p><p>You will need to arrange alternate transportation.</p>`
        });
      }
    } catch (e) {
      console.error('Failed to send email:', e);
    }

    return NextResponse.json(rows[0]);
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
