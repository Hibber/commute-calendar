import { NextResponse } from 'next/server';
import { listDriverNames, requireAdmin } from '@/lib/auth';

export const dynamic = 'force-dynamic';

/**
 * The roster an admin picks from when filing a shift action on someone's
 * behalf. Admin-only: the list of who is in the carpool is not something a
 * regular driver needs, and it is the allow-list that bounds act-as.
 */
export async function GET() {
  const session = await requireAdmin();
  if (!session.ok) return session.response;

  try {
    return NextResponse.json({ drivers: await listDriverNames() });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
