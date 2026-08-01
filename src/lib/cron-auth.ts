import { timingSafeEqual } from 'crypto';

/**
 * Whether this request really came from the scheduler.
 *
 * Vercel Cron sends `Authorization: Bearer $CRON_SECRET`. Without the check
 * these routes are open endpoints anyone could hit to spam the carpool with
 * pushes. If `CRON_SECRET` is unset the check refuses rather than defaulting to
 * open -- a misconfiguration should stop the job, not expose it.
 */
export function isAuthorizedCron(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;

  const provided = request.headers.get('authorization') ?? '';
  const expected = `Bearer ${secret}`;

  const a = Buffer.from(provided, 'utf8');
  const b = Buffer.from(expected, 'utf8');
  // `timingSafeEqual` requires equal lengths and throws otherwise.
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
