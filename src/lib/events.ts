import { sql } from '@vercel/postgres';
import type { PersonRef } from './identity';

/**
 * The only shift mutations a non-admin driver can request. The client sends one
 * of these verbs; it never sends `claimed_by`, `status`, `claim_type` or
 * `declined_by` directly, so it cannot act as another driver or forge a state.
 */
export type ShiftAction = 'drive' | 'borrow' | 'decline';

export function isShiftAction(value: unknown): value is ShiftAction {
  return value === 'drive' || value === 'borrow' || value === 'decline';
}

/** Event ids are serial integers; reject anything else before it reaches SQL. */
export function parseEventId(value: unknown): number | null {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

/**
 * Applies a driver's action to a shift, attributing it to `displayName`.
 *
 * Declines are appended in SQL against the current row rather than written from
 * an array supplied by the caller, so a driver can only ever add themselves and
 * cannot clobber or fabricate another driver's decline.
 */
export type ShiftActionResult =
  /** The action was applied; `event` is the updated row. */
  | { outcome: 'applied'; event: EventRow }
  /** No such shift. */
  | { outcome: 'not_found' }
  /** Another driver already claimed this shift; `event` is the current row. */
  | { outcome: 'conflict'; event: EventRow };

/** The columns of `events` that the API and notifications actually read. */
export interface EventRow {
  id: number;
  date: string;
  startTime: string;
  endTime: string;
  /** Display name of the claimer. Kept in step with `claimed_by_id`. */
  claimed_by: string | null;
  /** Clerk id of the claimer. Null on rows written before the migration. */
  claimed_by_id: string | null;
  claim_type: ShiftAction | null;
  status: string;
  declined_by: string[] | null;
  declined_by_ids: string[] | null;
  [column: string]: unknown;
}

export interface ApplyShiftActionOptions {
  /**
   * Bypass the "already claimed by someone else" guard.
   *
   * Only ever set on the admin act-as path, where reassigning a shift that
   * someone else holds is the whole point. Regular drivers keep the guard, so
   * two of them racing on the same shift still cannot silently overwrite each
   * other.
   */
  override?: boolean;
}

export async function applyShiftAction(
  id: number,
  action: ShiftAction,
  actor: PersonRef,
  options: ApplyShiftActionOptions = {},
): Promise<ShiftActionResult> {
  const { userId, displayName } = actor;

  if (action === 'decline') {
    // Both keys are appended, and both are checked for an existing entry, so a
    // driver who declined before the identity migration cannot add a second
    // decline under their id.
    const { rows } = await sql<EventRow>`
      UPDATE events
      SET declined_by = CASE
            WHEN ${displayName} = ANY(COALESCE(declined_by, '{}'::text[])) THEN declined_by
            ELSE array_append(COALESCE(declined_by, '{}'::text[]), ${displayName})
          END,
          declined_by_ids = CASE
            WHEN ${userId} = ANY(COALESCE(declined_by_ids, '{}'::text[])) THEN declined_by_ids
            ELSE array_append(COALESCE(declined_by_ids, '{}'::text[]), ${userId})
          END
      WHERE id = ${id}
      RETURNING *
    `;
    return rows[0] ? { outcome: 'applied', event: rows[0] } : { outcome: 'not_found' };
  }

  // An admin reassigning a shift writes the claim unconditionally -- they are
  // resolving the schedule, so the current holder is exactly what they mean to
  // replace.
  if (options.override) {
    const { rows } = await sql<EventRow>`
      UPDATE events
      SET claimed_by = ${displayName},
          claimed_by_id = ${userId},
          claim_type = ${action},
          status = 'claimed'
      WHERE id = ${id}
      RETURNING *
    `;
    return rows[0] ? { outcome: 'applied', event: rows[0] } : { outcome: 'not_found' };
  }

  // Claiming is guarded so two drivers racing on the same shift cannot silently
  // overwrite each other -- the second one is told it was already taken. A
  // driver may still re-claim a shift that is already theirs, which is how
  // switching between "drive" and "borrow" works.
  //
  // "Already theirs" is judged by id, falling back to the name only when the row
  // has no id -- otherwise a driver who renamed themselves would be locked out
  // of a shift they hold, and a newcomer inheriting an old name could take it
  // over.
  const { rows } = await sql<EventRow>`
    UPDATE events
    SET claimed_by = ${displayName},
        claimed_by_id = ${userId},
        claim_type = ${action},
        status = 'claimed'
    WHERE id = ${id}
      AND (
        status IS DISTINCT FROM 'claimed'
        OR (claimed_by_id IS NOT NULL AND claimed_by_id = ${userId})
        OR (claimed_by_id IS NULL AND claimed_by IS NOT DISTINCT FROM ${displayName})
      )
    RETURNING *
  `;

  if (rows[0]) return { outcome: 'applied', event: rows[0] };

  // The update matched nothing: either the shift is gone, or someone else holds it.
  const { rows: existing } = await sql<EventRow>`SELECT * FROM events WHERE id = ${id}`;
  return existing[0]
    ? { outcome: 'conflict', event: existing[0] }
    : { outcome: 'not_found' };
}
