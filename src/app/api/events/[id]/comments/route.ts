import { NextResponse } from 'next/server';
import { sql } from '@vercel/postgres';
import { requireUser } from '@/lib/auth';
import { parseEventId } from '@/lib/events';

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireUser();
  if (!session.ok) return session.response;
  // Authorship comes from the session, so a caller cannot post as someone else.
  const authorName = session.user.displayName;

  try {
    const event_id = parseEventId((await params).id);
    if (event_id === null) {
      return NextResponse.json({ error: 'Invalid event id' }, { status: 400 });
    }

    const body = await request.json();
    const content = typeof body?.content === 'string' ? body.content.trim() : '';

    if (!content) {
      return NextResponse.json({ error: 'Missing content' }, { status: 400 });
    }

    const { rows } = await sql`
      INSERT INTO comments (event_id, author_name, content)
      VALUES (${event_id}, ${authorName}, ${content})
      RETURNING *
    `;

    return NextResponse.json(rows[0]);
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
