import { sql } from '@vercel/postgres';
import { config } from 'dotenv';
config({ path: '.env.local' });

async function migrate() {
  try {
    // Add new column
    await sql`ALTER TABLE events ADD COLUMN IF NOT EXISTS declined_by TEXT[] DEFAULT '{}';`;
    
    // Migrate old data
    // Use true to check and array functions correctly
    await sql`UPDATE events SET declined_by = array_append(declined_by, 'Austin') WHERE declined_by_austin = true AND 'Austin' != ALL(declined_by);`;
    await sql`UPDATE events SET declined_by = array_append(declined_by, 'Karey') WHERE declined_by_karey = true AND 'Karey' != ALL(declined_by);`;
    
    // Drop old columns
    await sql`ALTER TABLE events DROP COLUMN IF EXISTS declined_by_austin;`;
    await sql`ALTER TABLE events DROP COLUMN IF EXISTS declined_by_karey;`;
    
    console.log("Migration successful!");
  } catch (err) {
    console.error("Migration failed:", err);
  }
}

migrate();
