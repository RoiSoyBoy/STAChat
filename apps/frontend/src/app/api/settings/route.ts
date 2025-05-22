import { NextResponse } from 'next/server';

export async function GET() {
  // In a real application, you would fetch settings from a database or configuration file.
  // For now, we'll return some mock data.
  const settings = {
    theme: 'dark',
    notifications: true,
    language: 'en',
  };

  return NextResponse.json(settings);
}
