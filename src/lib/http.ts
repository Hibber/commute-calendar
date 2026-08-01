import { NextResponse } from 'next/server';

/**
 * The response for an unexpected failure.
 *
 * The real error goes to the server log; the client gets a fixed string. Routes
 * used to return `String(error)`, which handed the browser whatever Postgres
 * said -- table names, column names and constraint details included.
 */
export function serverError(context: string, error: unknown): NextResponse {
  console.error(`${context}:`, error);
  return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
}
