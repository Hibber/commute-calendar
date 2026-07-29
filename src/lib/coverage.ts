/**
 * Coverage rules, shared by the API and the dashboard.
 *
 * Deliberately free of server-only imports so the client can use the same
 * function the server does: when these two disagree about whether a shift is
 * covered, the UI contradicts the alert emails, and neither is obviously wrong.
 */

/** The parts of a shift that determine whether anyone is covering it. */
export interface CoverageState {
  status: string;
  declined_by?: string[] | null;
}

/**
 * Whether a shift has run out of people who could drive it.
 *
 * This used to be `declined_by.length >= 2`, which silently assumed the carpool
 * had exactly two drivers: with three it fired while somebody could still say
 * yes, and with one it could never fire at all. Coverage is now judged against
 * the drivers who actually exist -- every one of them has to have declined.
 *
 * Names are compared rather than counted, so a decline left behind by someone
 * who has since left the carpool cannot stand in for a current driver's.
 */
export function isUncovered(event: CoverageState, driverNames: string[]): boolean {
  if (event.status === 'claimed') return false;
  if (driverNames.length === 0) return false;
  const declined = new Set(event.declined_by ?? []);
  return driverNames.every((name) => declined.has(name));
}
