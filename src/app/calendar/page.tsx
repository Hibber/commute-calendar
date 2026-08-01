import { redirect } from 'next/navigation';
import Dashboard from '../../components/Dashboard';
import { getSessionUser, listCoveringDriverNames } from '@/lib/auth';
import { feedUrlFor } from '@/lib/calendar-feed';
import { SITE_URL } from '@/lib/site';

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

  // Signed in but not in the carpool. Deliberately a message rather than a
  // redirect to `/`, which offers to sign in again and so reads as a failed
  // login rather than as the answer it is.
  if (!session.isMember) {
    return (
      <main
        style={{
          minHeight: '100dvh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '2rem',
          textAlign: 'center',
          fontFamily: 'var(--font-geist-sans), system-ui, sans-serif',
        }}
      >
        <div style={{ maxWidth: '28rem' }}>
          <h1 style={{ fontSize: '1.5rem', marginBottom: '0.75rem' }}>You are not in this carpool yet</h1>
          <p style={{ color: '#666', lineHeight: 1.6 }}>
            You are signed in as {session.displayName}, but this account has not been added to the
            schedule. Ask an admin to add you, then reload this page.
          </p>
        </div>
      </main>
    );
  }

  // The drivers coverage is judged against, resolved from the same source the
  // API uses so the dashboard and the alerts cannot disagree about whether a
  // shift still has someone who could take it.
  const coveringDrivers = await listCoveringDriverNames();

  // Null when `CALENDAR_FEED_SECRET` is unset; the dashboard then hides the
  // subscribe control rather than offering a URL that would 401.
  const feedUrl = feedUrlFor(session.displayName, SITE_URL);

  return (
    <Dashboard
      isAdmin={session.isAdmin}
      driverName={session.displayName}
      userGroup={session.group}
      coveringDrivers={coveringDrivers}
      feedUrl={feedUrl}
    />
  );
}
