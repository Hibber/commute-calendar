import { sql } from '@vercel/postgres';

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

export type EventRow = Record<string, any>;

export async function applyShiftAction(
  id: number,
  action: ShiftAction,
  displayName: string,
): Promise<ShiftActionResult> {
  if (action === 'decline') {
    const { rows } = await sql`
      UPDATE events
      SET declined_by = CASE
        WHEN ${displayName} = ANY(COALESCE(declined_by, '{}'::text[])) THEN declined_by
        ELSE array_append(COALESCE(declined_by, '{}'::text[]), ${displayName})
      END
      WHERE id = ${id}
      RETURNING *
    `;
    return rows[0] ? { outcome: 'applied', event: rows[0] } : { outcome: 'not_found' };
  }

  // Claiming is guarded so two drivers racing on the same shift cannot silently
  // overwrite each other -- the second one is told it was already taken. A
  // driver may still re-claim a shift that is already theirs, which is how
  // switching between "drive" and "borrow" works.
  const { rows } = await sql`
    UPDATE events
    SET claimed_by = ${displayName},
        claim_type = ${action},
        status = 'claimed'
    WHERE id = ${id}
      AND (
        status IS DISTINCT FROM 'claimed'
        OR claimed_by IS NOT DISTINCT FROM ${displayName}
      )
    RETURNING *
  `;

  if (rows[0]) return { outcome: 'applied', event: rows[0] };

  // The update matched nothing: either the shift is gone, or someone else holds it.
  const { rows: existing } = await sql`SELECT * FROM events WHERE id = ${id}`;
  return existing[0]
    ? { outcome: 'conflict', event: existing[0] }
    : { outcome: 'not_found' };
}
