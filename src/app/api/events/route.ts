import { NextResponse } from 'next/server';
import { sql } from '@vercel/postgres';

export async function GET() {
  try {
    const { rows } = await sql`SELECT * FROM events`;
    return NextResponse.json({ events: rows });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { type, date, startTime, endTime, notes = '' } = body;
    
    if (!type || !date || !startTime || !endTime) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const { rows } = await sql`
      INSERT INTO events (type, date, "startTime", "endTime", notes)
      VALUES (${type}, ${date}, ${startTime}, ${endTime}, ${notes})
      RETURNING *
    `;
    
    return NextResponse.json(rows[0]);
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
