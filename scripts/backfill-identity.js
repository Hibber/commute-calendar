require('dotenv').config({ path: '.env.local' });
const { sql } = require('@vercel/postgres');
const { createClerkClient } = require('@clerk/backend');

/**
 * Fills in the Clerk user ids that `migrate-v5-identity.js` added columns for,
 * by matching the stored display names against Clerk.
 *
 * Name matching is the only bridge available -- the ids were never recorded, so
 * the names are all the old rows carry. That makes this migration exactly as
 * ambiguous as the scheme it is replacing: if two members share a first name,
 * their history cannot be told apart, and this refuses to guess. Those names are
 * reported and skipped, leaving the rows on the name fallback.
 *
 * Safe to re-run: every statement only touches rows whose id is still null.
 */

/** The same name the app records actions under -- mirrors `displayNameFor`. */
function displayNameFor(user) {
  return (
    user.firstName ||
    user.username ||
    user.emailAddresses[0]?.emailAddress ||
    'Unknown'
  );
}

async function buildNameMap() {
  const secret = process.env.CLERK_SECRET_KEY;
  if (!secret) throw new Error('CLERK_SECRET_KEY is not set');

  const clerk = createClerkClient({ secretKey: secret });
  const { data } = await clerk.users.getUserList({ limit: 100 });

  const byName = new Map();
  const ambiguous = new Set();
  for (const user of data) {
    const name = displayNameFor(user);
    if (byName.has(name)) ambiguous.add(name);
    byName.set(name, user.id);
  }
  // A name shared by two accounts cannot be resolved to one of them.
  for (const name of ambiguous) byName.delete(name);

  return { byName, ambiguous, total: data.length };
}

async function backfill() {
  try {
    const { byName, ambiguous, total } = await buildNameMap();
    console.log(`Resolved ${byName.size} unique names from ${total} Clerk users.`);
    if (ambiguous.size > 0) {
      console.warn(
        `Skipping ${ambiguous.size} ambiguous name(s) shared by multiple accounts: ${[...ambiguous].join(', ')}`,
      );
      console.warn('Rows for those names keep using the name fallback.');
    }

    for (const [name, userId] of byName) {
      const claimed = await sql`
        UPDATE events SET claimed_by_id = ${userId}
        WHERE claimed_by = ${name} AND claimed_by_id IS NULL
      `;

      // Swap this name for the id inside the decline array, leaving any other
      // entries -- and any name this run could not resolve -- untouched.
      const declined = await sql`
        UPDATE events
        SET declined_by_ids = array_append(COALESCE(declined_by_ids, '{}'::text[]), ${userId})
        WHERE ${name} = ANY(COALESCE(declined_by, '{}'::text[]))
          AND NOT (${userId} = ANY(COALESCE(declined_by_ids, '{}'::text[])))
      `;

      const comments = await sql`
        UPDATE comments SET author_id = ${userId}
        WHERE author_name = ${name} AND author_id IS NULL
      `;

      const subs = await sql`
        UPDATE subscriptions SET user_id = ${userId}
        WHERE user_name = ${name} AND user_id IS NULL
      `;

      console.log(
        `${name}: ${claimed.rowCount} claims, ${declined.rowCount} declines, ` +
          `${comments.rowCount} comments, ${subs.rowCount} subscriptions`,
      );
    }

    // What is left is history belonging to nobody Clerk currently knows -- a
    // member who has left, or a name that changed before this ran.
    const { rows: orphans } = await sql`
      SELECT DISTINCT claimed_by AS name FROM events
      WHERE claimed_by IS NOT NULL AND claimed_by_id IS NULL
    `;
    if (orphans.length > 0) {
      console.warn(
        `\n${orphans.length} claimed name(s) matched no current Clerk user: ` +
          orphans.map((o) => o.name).join(', '),
      );
      console.warn('Those rows keep working via the name fallback.');
    }

    console.log('\nBackfill completed successfully!');
  } catch (error) {
    console.error('Backfill failed:', error);
    process.exitCode = 1;
  }
}

backfill();
