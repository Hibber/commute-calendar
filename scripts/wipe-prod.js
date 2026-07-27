const { sql } = require('@vercel/postgres');
require('dotenv').config({ path: '.env.local' });

async function clearDB() {
  try {
    console.log('Clearing events table...');
    await sql`TRUNCATE TABLE events CASCADE;`;
    
    // Optional: await sql`TRUNCATE TABLE subscriptions;`;
    console.log('Database cleared for production!');
  } catch (err) {
    console.error('Error clearing database:', err);
  }
}

clearDB();
