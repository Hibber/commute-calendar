import { auth, clerkClient, type User } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';

export interface SessionUser {
  userId: string;
  /**
   * The name this user is recorded as in `events.claimed_by`, `events.declined_by`,
   * `comments.author_name` and `subscriptions.user_name`.
   *
   * This mirrors the name the client used to send for those fields, so existing
   * rows keep matching. It is derived here, server side, and never read from the
   * request body.
   */
  displayName: string;
  isAdmin: boolean;
}

type AuthSuccess = { ok: true; user: SessionUser };
type AuthFailure = { ok: false; response: NextResponse };
export type AuthResult = AuthSuccess | AuthFailure;

function displayNameFor(user: User): string {
  return (
    user.firstName ||
    user.username ||
    user.emailAddresses[0]?.emailAddress ||
    'Unknown'
  );
}

export async function getSessionUser(): Promise<SessionUser | null> {
  const { userId } = await auth();
  if (!userId) return null;

  // Read the role from Clerk's backend API rather than from `sessionClaims`, so
  // this works without a custom session token claim being configured.
  const client = await clerkClient();
  const user = await client.users.getUser(userId);

  return {
    userId,
    displayName: displayNameFor(user),
    isAdmin: user.publicMetadata?.role === 'admin',
  };
}

/** Requires a signed-in user. Every route that touches carpool data uses this. */
export async function requireUser(): Promise<AuthResult> {
  const user = await getSessionUser();
  if (!user) {
    return {
      ok: false,
      response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
    };
  }
  return { ok: true, user };
}

/** Requires a signed-in user whose Clerk `publicMetadata.role` is `admin`. */
export async function requireAdmin(): Promise<AuthResult> {
  const result = await requireUser();
  if (!result.ok) return result;
  if (!result.user.isAdmin) {
    return {
      ok: false,
      response: NextResponse.json({ error: 'Forbidden' }, { status: 403 }),
    };
  }
  return result;
}
