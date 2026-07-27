require('dotenv').config({ path: '.env.local' });
const { sql } = require('@vercel/postgres');

async function migrate() {
  try {
    console.log('Creating subscriptions table...');
    
    await sql`
      CREATE TABLE IF NOT EXISTS subscriptions (
        id SERIAL PRIMARY KEY,
        user_name VARCHAR(255) NOT NULL,
        endpoint TEXT NOT NULL,
        p256dh TEXT NOT NULL,
        auth TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `;
    
    // We can also create a unique constraint on endpoint so we don't save duplicates
    await sql`
      ALTER TABLE subscriptions 
      ADD CONSTRAINT unique_endpoint UNIQUE (endpoint);
    `.catch(e => console.log('Unique constraint may already exist.'));
    
    console.log('Migration completed successfully!');
  } catch (error) {
    console.error('Migration failed:', error);
  }
}

migrate();
