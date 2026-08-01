/**
 * Who a stored row belongs to, during the move off display-name identity.
 *
 * Rows used to record only a first name, which meant renaming yourself in Clerk
 * detached your claims and orphaned your push subscriptions, and two members
 * sharing a name were indistinguishable. The id columns added in
 * `migrate-v5-identity.js` fix that going forward, but rows written before it --
 * and rows whose name the backfill could not resolve to a current Clerk account
 * -- still carry only a name.
 *
 * So every read matches on the id and falls back to the name. This file holds
 * that rule in one place, free of server-only imports so the client can apply
 * the same one.
 */

/** A person, by both keys: the durable one and the legacy one. */
export interface PersonRef {
  /** The Clerk user id. Stable across renames. */
  userId: string;
  /** The name their older rows are recorded under. */
  displayName: string;
}

/** What a row records about who owns it. Either half may be missing. */
export interface OwnedRow {
  ownerId?: string | null;
  ownerName?: string | null;
}

/**
 * Whether this row belongs to this person.
 *
 * The id wins when the row has one: a row that was backfilled is authoritative,
 * and a name that has since been reused by somebody else must not match it. The
 * name is consulted only for rows with no id at all.
 */
export function rowBelongsTo(row: OwnedRow, person: PersonRef): boolean {
  if (row.ownerId) return row.ownerId === person.userId;
  return row.ownerName != null && row.ownerName === person.displayName;
}

/**
 * Whether this person appears in a pair of parallel id/name lists.
 *
 * Used for `declined_by_ids` / `declined_by`, which the migration keeps in step
 * rather than collapsing, so a decline recorded under either key still counts.
 */
export function personInList(
  ids: readonly string[] | null | undefined,
  names: readonly string[] | null | undefined,
  person: PersonRef,
): boolean {
  if (ids?.includes(person.userId)) return true;
  return names?.includes(person.displayName) ?? false;
}
