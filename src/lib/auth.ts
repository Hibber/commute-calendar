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
  /**
   * Which permission group this driver belongs to. Only affects how shift
   * actions are worded in the UI; `members` is the default for anyone who has
   * not been put in a group.
   */
  group: string;
}

type AuthSuccess = { ok: true; user: SessionUser };
type AuthFailure = { ok: false; response: NextResponse };
export type AuthResult = AuthSuccess | AuthFailure;

export function displayNameFor(user: User): string {
  return (
    user.firstName ||
    user.username ||
    user.emailAddresses[0]?.emailAddress ||
    'Unknown'
  );
}

/**
 * Whether this user is an admin.
 *
 * The role is read from `publicMetadata` first, falling back to
 * `privateMetadata`. Both are checked because either is a valid place to set it
 * in the Clerk dashboard, and a role stored in `privateMetadata` is invisible
 * to the browser -- so the client cannot make this determination itself. That
 * is why `isAdmin` is resolved here and handed to the UI rather than being
 * recomputed from `useUser()`.
 */
export function isAdminUser(user: User): boolean {
  return (
    user.publicMetadata?.role === 'admin' || user.privateMetadata?.role === 'admin'
  );
}

/**
 * A person notifications can be delivered to. `displayName` is the key push
 * subscriptions are stored under; `email` is the Clerk primary address, or
 * null when the account somehow has none.
 */
export interface Recipient {
  displayName: string;
  email: string | null;
  isAdmin: boolean;
}

/**
 * Everyone in the carpool, resolved from Clerk at send time.
 *
 * This is what replaced the hardcoded names and addresses that used to live in
 * the API routes: recipients follow whoever is actually signed up, so renaming
 * someone in Clerk or adding a new member cannot silently detach them from
 * notifications.
 */
export async function listRecipients(): Promise<Recipient[]> {
  const client = await clerkClient();
  const { data } = await client.users.getUserList({ limit: 100 });
  return data.map((user) => {
    const primary =
      user.emailAddresses.find((e) => e.id === user.primaryEmailAddressId) ??
      user.emailAddresses[0];
    return {
      displayName: displayNameFor(user),
      email: primary?.emailAddress ?? null,
      isAdmin: isAdminUser(user),
    };
  });
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
    isAdmin: isAdminUser(user),
    group: (user.publicMetadata?.group as string) || 'members',
  };
}

/**
 * Every known driver, by the name their actions are recorded under.
 *
 * This is the allow-list for admin act-as: an admin may only file an action for
 * a name returned here, so `claimed_by` can never be set to an arbitrary string
 * supplied by the client.
 */
export async function listDriverNames(): Promise<string[]> {
  const recipients = await listRecipients();
  return [...new Set(recipients.map((r) => r.displayName))].sort((a, b) => a.localeCompare(b));
}

/**
 * The drivers a shift can actually be covered by -- everyone who is not an
 * admin. This is the set coverage is judged against: an admin schedules shifts,
 * they do not drive them, so their silence should never read as a decline.
 */
export async function listCoveringDriverNames(): Promise<string[]> {
  const recipients = await listRecipients();
  return [...new Set(recipients.filter((r) => !r.isAdmin).map((r) => r.displayName))].sort(
    (a, b) => a.localeCompare(b),
  );
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
