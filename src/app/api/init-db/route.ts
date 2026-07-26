import { NextResponse } from 'next/server';
import { sql } from '@vercel/postgres';

export async function GET() {
  try {
    await sql`
      CREATE TABLE IF NOT EXISTS events (
        id SERIAL PRIMARY KEY,
        type VARCHAR(50) NOT NULL,
        date VARCHAR(50) NOT NULL,
        "startTime" VARCHAR(50) NOT NULL,
        "endTime" VARCHAR(50) NOT NULL,
        notes TEXT
      );
    `;
    return NextResponse.json({ message: 'Table created successfully in Vercel Postgres!' });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
