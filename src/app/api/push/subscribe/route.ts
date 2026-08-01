import { NextResponse } from 'next/server';
import { sql } from '@vercel/postgres';
import { requireUser } from '@/lib/auth';
import { serverError } from '@/lib/http';

export async function POST(request: Request) {
  const session = await requireUser();
  if (!session.ok) return session.response;
  // Taken from the session, not the body: otherwise anyone could register their
  // own device under another person's name and receive their notifications.
  const userName = session.user.displayName;

  try {
    const { subscription } = await request.json();

    if (!subscription?.endpoint || !subscription?.keys?.p256dh || !subscription?.keys?.auth) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const { endpoint, keys } = subscription;

    // The id is what delivery matches on, so re-registering a device is also how
    // a subscription made before the identity migration acquires one.
    await sql`
      INSERT INTO subscriptions (user_name, user_id, endpoint, p256dh, auth)
      VALUES (${userName}, ${session.user.userId}, ${endpoint}, ${keys.p256dh}, ${keys.auth})
      ON CONFLICT (endpoint) DO UPDATE
      SET user_name = EXCLUDED.user_name,
          user_id = EXCLUDED.user_id,
          p256dh = EXCLUDED.p256dh,
          auth = EXCLUDED.auth
    `;

    return NextResponse.json({ success: true });
  } catch (error) {
    return serverError('Push subscribe failed', error);
  }
}
