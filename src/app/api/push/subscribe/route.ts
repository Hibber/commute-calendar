import { NextResponse } from 'next/server';
import { sql } from '@vercel/postgres';

export async function POST(request: Request) {
  try {
    const { subscription, user_name } = await request.json();
    
    if (!subscription || !subscription.endpoint || !user_name) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const { endpoint, keys } = subscription;
    const p256dh = keys.p256dh;
    const auth = keys.auth;

    await sql`
      INSERT INTO subscriptions (user_name, endpoint, p256dh, auth)
      VALUES (${user_name}, ${endpoint}, ${p256dh}, ${auth})
      ON CONFLICT (endpoint) DO UPDATE 
      SET user_name = EXCLUDED.user_name, p256dh = EXCLUDED.p256dh, auth = EXCLUDED.auth
    `;

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Subscription error:', error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
