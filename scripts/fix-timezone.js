const { sql } = require('@vercel/postgres');
require('dotenv').config({ path: '.env.local' });

async function fixTimezone() {
  try {
    console.log('Fixing comments table created_at timezone...');
    await sql`ALTER TABLE comments ALTER COLUMN created_at TYPE TIMESTAMPTZ USING created_at AT TIME ZONE 'UTC';`;
    await sql`ALTER TABLE comments ALTER COLUMN created_at SET DEFAULT CURRENT_TIMESTAMP;`;
    console.log('Timezone fixed!');
  } catch (err) {
    console.error('Error:', err);
  }
}

fixTimezone();
