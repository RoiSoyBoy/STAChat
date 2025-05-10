import { NextResponse } from 'next/server';

export async function GET() {
  // Dummy endpoint to silence 404s
  return NextResponse.json({ status: 'ok' });
} 