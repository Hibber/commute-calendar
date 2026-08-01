require('dotenv').config({ path: '.env.local' });
const { sql } = require('@vercel/postgres');

/**
 * Adds the marker the "time to leave" alerts use to stay idempotent.
 *
 * The cron pings every few minutes; this column is what stops a shift from
 * being alerted on every one of them. Nullable with no default, so existing
 * rows simply read as "not yet alerted".
 */
async function migrate() {
  try {
    console.log('Adding departure_notified_at to events...');

    await sql`
      ALTER TABLE events
      ADD COLUMN IF NOT EXISTS departure_notified_at TIMESTAMPTZ;
    `;

    console.log('Migration completed successfully!');
  } catch (error) {
    console.error('Migration failed:', error);
    process.exitCode = 1;
  }
}

migrate();
