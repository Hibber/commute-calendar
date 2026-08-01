/**
 * Coverage rules, shared by the API and the dashboard.
 *
 * Deliberately free of server-only imports so the client can use the same
 * function the server does: when these two disagree about whether a shift is
 * covered, the UI contradicts the alert emails, and neither is obviously wrong.
 */

import { personInList, type PersonRef } from './identity';

/** The parts of a shift that determine whether anyone is covering it. */
export interface CoverageState {
  status: string;
  declined_by?: string[] | null;
  declined_by_ids?: string[] | null;
}

/**
 * Whether a shift has run out of people who could drive it.
 *
 * This used to be `declined_by.length >= 2`, which silently assumed the carpool
 * had exactly two drivers: with three it fired while somebody could still say
 * yes, and with one it could never fire at all. Coverage is now judged against
 * the drivers who actually exist -- every one of them has to have declined.
 *
 * People are matched rather than counted, so a decline left behind by someone
 * who has since left the carpool cannot stand in for a current driver's. Each
 * driver is looked for by Clerk id first and by name only as a fallback, so
 * declines recorded before the identity migration still count -- and so a
 * driver who has since renamed themselves does not appear to have gone quiet.
 */
export function isUncovered(event: CoverageState, drivers: PersonRef[]): boolean {
  if (event.status === 'claimed') return false;
  if (drivers.length === 0) return false;
  return drivers.every((driver) =>
    personInList(event.declined_by_ids, event.declined_by, driver),
  );
}
