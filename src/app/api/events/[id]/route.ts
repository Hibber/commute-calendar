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
    const { claimed_by, status } = body;
    
    const { rows } = await sql`
      UPDATE events 
      SET claimed_by = ${claimed_by}, status = ${status} 
      WHERE id = ${id} 
      RETURNING *
    `;
    
    try {
      const event = rows[0];
      const actionText = status === 'swap_requested' ? 'requested a swap for' : 'claimed';
      await resend.emails.send({
        from: 'Commute Calendar <onboarding@resend.dev>',
        to: ['travis@triddle.dev'],
        subject: `Shift ${actionText} by ${claimed_by}`,
        html: `<p><strong>${claimed_by}</strong> has ${actionText} the shift on <strong>${event.date}</strong> at <strong>${event.startTime}</strong>.</p><p>Check the <a href="https://schedule.triddle.dev">Commute Calendar</a> for details.</p>`
      });
    } catch (e) {
      console.error('Failed to send email:', e);
    }

    return NextResponse.json(rows[0]);
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
