const { createClient } = require('@vercel/postgres');
require('dotenv').config({ path: '.env.local' });

async function migrate() {
  const client = createClient();
  await client.connect();
  
  try {
    console.log('Adding new columns to events table...');
    // We use IF NOT EXISTS workaround by catching the error if it exists, or just adding them.
    try {
      await client.sql`ALTER TABLE events ADD COLUMN claim_type VARCHAR(255);`;
    } catch (e) { console.log('claim_type already exists', e.message); }
    
    try {
      await client.sql`ALTER TABLE events ADD COLUMN declined_by_austin BOOLEAN DEFAULT FALSE;`;
    } catch (e) { console.log('declined_by_austin already exists', e.message); }
    
    try {
      await client.sql`ALTER TABLE events ADD COLUMN declined_by_karey BOOLEAN DEFAULT FALSE;`;
    } catch (e) { console.log('declined_by_karey already exists', e.message); }

    console.log('Creating comments table...');
    await client.sql`
      CREATE TABLE IF NOT EXISTS comments (
        id SERIAL PRIMARY KEY,
        event_id INTEGER REFERENCES events(id) ON DELETE CASCADE,
        author_name VARCHAR(255) NOT NULL,
        content TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `;
    
    console.log('Migration complete!');
  } catch (error) {
    console.error('Migration failed:', error);
  } finally {
    await client.end();
  }
}

migrate();
