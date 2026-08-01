import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth';
import { serverError } from '@/lib/http';
import { getCommuteTraffic } from '@/lib/traffic';

export const dynamic = 'force-dynamic';

export async function GET() {
  // Home and work addresses, and the live commute time between them, are not
  // public information.
  const session = await requireUser();
  if (!session.ok) return session.response;

  try {
    const traffic = await getCommuteTraffic();
    if (!traffic) {
      return NextResponse.json({ error: 'Traffic is unavailable right now' }, { status: 503 });
    }

    return NextResponse.json({ success: true, ...traffic });
  } catch (error) {
    return serverError('Traffic lookup failed', error);
  }
}
