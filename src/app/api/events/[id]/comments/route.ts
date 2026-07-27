import { NextResponse } from 'next/server';
import { sql } from '@vercel/postgres';

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const resolvedParams = await params;
    const event_id = resolvedParams.id;
    const body = await request.json();
    const { author_name, content } = body;
    
    if (!author_name || !content) {
      return NextResponse.json({ error: 'Missing author or content' }, { status: 400 });
    }

    const { rows } = await sql`
      INSERT INTO comments (event_id, author_name, content)
      VALUES (${event_id}, ${author_name}, ${content})
      RETURNING *
    `;
    
    return NextResponse.json(rows[0]);
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
