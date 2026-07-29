import { redirect } from 'next/navigation';
import Dashboard from '../../components/Dashboard';
import { getSessionUser } from '@/lib/auth';

/**
 * The schedule itself, which only exists for a signed-in user.
 *
 * Auth is resolved here rather than in the browser: `privateMetadata` is never
 * sent to the client, and the client's own name fallback disagreed with the one
 * the API records actions under.
 */
export default async function CalendarPage() {
  const session = await getSessionUser();
  if (!session) redirect('/');

  return (
    <Dashboard
      isAdmin={session.isAdmin}
      driverName={session.displayName}
      userGroup={session.group}
    />
  );
}
