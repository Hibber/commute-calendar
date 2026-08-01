import { createHmac, timingSafeEqual } from 'crypto';

/**
 * Access control for the iCal feed.
 *
 * A calendar client cannot sign in -- Google and Apple fetch the URL on their
 * own schedule with no cookies and no chance to complete an OAuth flow -- so the
 * feed cannot use the session the rest of the app runs on. The URL itself has to
 * carry the proof.
 *
 * The token is an HMAC of the subscriber's display name under a server secret.
 * That gives per-person URLs, and revocation by rotating the secret, without
 * needing a table to store tokens in -- there is no user table here, identity is
 * a display-name string (see `displayNameFor`).
 */

/** The signed token for a subscriber, or null when the feed is not configured. */
export function feedTokenFor(displayName: string): string | null {
  const secret = process.env.CALENDAR_FEED_SECRET;
  if (!secret) return null;
  return createHmac('sha256', secret).update(displayName).digest('hex');
}

/**
 * Whether `token` is the valid token for `displayName`.
 *
 * Refuses everything when the secret is unset, rather than defaulting to open --
 * the same posture as the cron routes: a misconfiguration should stop the feed
 * working, not publish the schedule.
 */
export function isValidFeedToken(displayName: string, token: string): boolean {
  const expected = feedTokenFor(displayName);
  if (!expected) return false;

  const a = Buffer.from(token, 'utf8');
  const b = Buffer.from(expected, 'utf8');
  // `timingSafeEqual` throws on a length mismatch, which would itself leak the
  // expected length.
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/** The full subscribe URL for a person, or null when the feed is not configured. */
export function feedUrlFor(displayName: string, siteUrl: string): string | null {
  const token = feedTokenFor(displayName);
  if (!token) return null;
  const params = new URLSearchParams({ user: displayName, token });
  return `${siteUrl}/api/ical?${params.toString()}`;
}
