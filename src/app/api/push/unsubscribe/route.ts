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
    // not enough to silence somebody else's notifications. Matched by id, with
    // the name only for rows that predate the identity migration.
    await sql`
      DELETE FROM subscriptions
      WHERE endpoint = ${endpoint}
        AND (
          user_id = ${session.user.userId}
          OR (user_id IS NULL AND user_name = ${session.user.displayName})
        )
    `;

    return NextResponse.json({ success: true });
  } catch (error) {
    return serverError('Push unsubscribe failed', error);
  }
}
