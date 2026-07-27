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
    const { claimed_by, status, claim_type, declined_by_austin, declined_by_karey } = body;
    
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
    
    try {
      const event = rows[0];
      if (status === 'claimed') {
        const actionText = claim_type === 'borrow' ? 'offered their car for' : 'claimed';
        await resend.emails.send({
          from: 'Commute Calendar <onboarding@resend.dev>',
          to: ['travis@triddle.dev'],
          subject: `Shift ${actionText} by ${claimed_by}`,
          html: `<p><strong>${claimed_by}</strong> has ${actionText} the shift on <strong>${event.date}</strong> at <strong>${event.startTime}</strong>.</p><p>Check the <a href="https://schedule.triddle.dev">Commute Calendar</a> for details.</p>`
        });
      } else if (declined_by_austin && declined_by_karey) {
        await resend.emails.send({
          from: 'Commute Calendar <onboarding@resend.dev>',
          to: ['travis@triddle.dev'],
          subject: `URGENT: No Coverage for Shift`,
          html: `<p>Both Austin and Karey have declined the shift on <strong>${event.date}</strong> at <strong>${event.startTime}</strong>.</p><p>You will need to arrange alternate transportation.</p>`
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
