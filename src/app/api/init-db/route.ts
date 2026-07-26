import { NextResponse } from 'next/server';
import { sql } from '@vercel/postgres';

export async function GET() {
  try {
    await sql`DROP TABLE IF EXISTS events;`;
    await sql`
      CREATE TABLE events (
        id SERIAL PRIMARY KEY,
        type VARCHAR(50) NOT NULL,
        date VARCHAR(50) NOT NULL,
        "startTime" VARCHAR(50) NOT NULL,
        "endTime" VARCHAR(50) NOT NULL,
        notes TEXT,
        is_all_day BOOLEAN DEFAULT false,
        is_recurring BOOLEAN DEFAULT false,
        claimed_by VARCHAR(50),
        status VARCHAR(50) DEFAULT 'open'
      );
    `;
    return NextResponse.json({ message: 'Table created successfully in Vercel Postgres!' });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
