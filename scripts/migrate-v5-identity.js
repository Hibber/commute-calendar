require('dotenv').config({ path: '.env.local' });
const { sql } = require('@vercel/postgres');

/**
 * Adds Clerk user id columns alongside the existing display-name columns.
 *
 * Identity in this schema has always been a first name string, which means a
 * driver who renames themselves in Clerk orphans their push subscriptions and
 * detaches every claim and decline they have ever made, and two members sharing
 * a first name are the same person as far as the app is concerned.
 *
 * This is the expand half of an expand/backfill/contract migration: nothing is
 * dropped or rewritten here, so it is safe to run against live data and safe to
 * leave half-done. The name columns stay authoritative until
 * `backfill-identity.js` has populated the ids, and the app reads ids with a
 * name fallback so rows this misses keep working.
 */
async function migrate() {
  try {
    console.log('Adding identity columns...');

    await sql`ALTER TABLE events ADD COLUMN IF NOT EXISTS claimed_by_id VARCHAR(255);`;
    await sql`ALTER TABLE events ADD COLUMN IF NOT EXISTS declined_by_ids TEXT[] DEFAULT '{}';`;
    await sql`ALTER TABLE comments ADD COLUMN IF NOT EXISTS author_id VARCHAR(255);`;
    await sql`ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS user_id VARCHAR(255);`;

    // Push delivery looks subscriptions up by id on every notification.
    await sql`CREATE INDEX IF NOT EXISTS subscriptions_user_id_idx ON subscriptions (user_id);`;

    console.log('Migration completed successfully!');
    console.log('Next: node scripts/backfill-identity.js');
  } catch (error) {
    console.error('Migration failed:', error);
    process.exitCode = 1;
  }
}

migrate();
