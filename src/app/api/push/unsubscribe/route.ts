import { NextResponse } from 'next/server';
import { sql } from '@vercel/postgres';
import { requireUser } from '@/lib/auth';
import { serverError } from '@/lib/http';

export async function POST(request: Request) {
  const session = await requireUser();
  if (!session.ok) return session.response;

  try {
    const { endpoint } = await request.json();

    if (!endpoint) {
      return NextResponse.json({ error: 'Missing endpoint' }, { status: 400 });
    }

    // Scoped to the caller's own subscriptions, so knowing an endpoint string is
    // not enough to silence somebody else's notifications.
    await sql`
      DELETE FROM subscriptions
      WHERE endpoint = ${endpoint} AND user_name = ${session.user.displayName}
    `;

    return NextResponse.json({ success: true });
  } catch (error) {
    return serverError('Push unsubscribe failed', error);
  }
}
