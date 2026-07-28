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
export async function applyShiftAction(
  id: number,
  action: ShiftAction,
  displayName: string,
) {
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
    return rows[0] ?? null;
  }

  const { rows } = await sql`
    UPDATE events
    SET claimed_by = ${displayName},
        claim_type = ${action},
        status = 'claimed'
    WHERE id = ${id}
    RETURNING *
  `;
  return rows[0] ?? null;
}
